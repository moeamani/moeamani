import * as THREE from 'three';
import { CASE, HALF, HINGE, discGeometry, lidGeometry, trayGeometry } from './case-geometry.js';
import {
  BACKDROP_FRAG,
  BACKDROP_VERT,
  BRIGHT_FRAG,
  COPY_FRAG,
  DISC_FRAG,
  DISC_VERT,
  FINAL_FRAG,
  ROD_FRAG,
  ROD_VERT,
  ROOM_BAKE_FRAG,
  SCREEN_VERT,
  SHEET_FRAG,
  SHEET_VERT,
  STREAK_FRAG,
} from './shaders.js';

// The scene, its light and how the case moves are Ann Nguyen's CD Case
// (https://github.com/annnguyentt/vibe-coding/tree/main/cd-case, CaseStage.js), taken out of React.
// Added for the music: a second case, so one song's case can make way for the next; a disc printed
// with each song's artwork; and a switch that stops everything moving on its own.

const FOV = 28;
const IOR = 1.59;
const ABSORB = [0.0042, 0.003, 0.0026];
const DEPTH = 14;
const BACKDROP_Z = -70;
const LIGHT = new THREE.Vector3(-0.3, 0.48, 1).normalize();
const SPIN = THREE.MathUtils.degToRad(18);
const SPIN_EASE = 0.9;
const FIT = 0.6;
const DOCK_CLEAR = 84;
const MSAA = 4;
const ROOM_SIZE = 512;
const STARS = 1.6;
const STAR_THRESHOLD = 2.0;

// the show: how long the case rests before it opens on its own, the first time and after that, and
// how long it stays open (seconds)
const REST = 4;
const AGAIN = 10;
const OPEN_HOLD = 3;

const GRAB_RATE = 0.008;
const GRAB_YAW = 0.9;
const GRAB_TILT = 0.45;
const GRAB_K = 16;
const GRAB_C = 5.5;
const TAP_SLOP = 6;

// where the print starts and stops on the disc, in millimetres from the middle
const ART_IN = 16.2;
const PRINT_OUT = 59.1;
const SLIDE = 1.0; // seconds for one case to make way for the next

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const clamp01 = (x) => clamp(x, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;
const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
// how far through [a, b] the time t is, 0 to 1
const span = (t, a, b) => clamp01((t - a) / (b - a));

function curve(frames) {
  const n = frames.length;
  const ts = frames.map((f) => f[0]);
  const vs = frames.map((f) => f[1]);
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((vs[i + 1] - vs[i]) / (ts[i + 1] - ts[i]));
  const m = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      m[i] = k * a * d[i];
      m[i + 1] = k * b * d[i];
    }
  }
  return (t) => {
    if (t <= ts[0]) return vs[0];
    if (t >= ts[n - 1]) return vs[n - 1];
    let i = 0;
    while (t > ts[i + 1]) i++;
    const h = ts[i + 1] - ts[i];
    const u = (t - ts[i]) / h;
    const u2 = u * u;
    const u3 = u2 * u;
    return (
      (2 * u3 - 3 * u2 + 1) * vs[i] +
      (u3 - 2 * u2 + u) * h * m[i] +
      (-2 * u3 + 3 * u2) * vs[i + 1] +
      (u3 - u2) * h * m[i + 1]
    );
  };
}

const OPEN_ANGLE = 3.05;
const OPEN_T = 2.3;
const OPEN = {
  yaw: curve([
    [0, 0],
    [0.55, 0.3],
    [1.0, 0.85],
    [1.2, 2.0],
    [1.41, 3.4],
    [1.63, 4.9],
    [1.85, 6.05],
    [2.05, 6.36],
    [2.3, 2 * Math.PI],
  ]),
  lid: curve([
    [0, 0],
    [0.97, 0],
    [1.2, 0.45],
    [1.41, 1.35],
    [1.63, 2.3],
    [1.85, 2.92],
    [2.05, 3.12],
    [2.3, OPEN_ANGLE],
  ]),
  spread: curve([
    [0, 0],
    [1.12, 0],
    [1.9, 0.9],
    [2.3, 1],
  ]),
  pitch: curve([
    [0, 0],
    [1.35, 0],
    [2.3, -0.1],
  ]),
};

const CLOSE_T = 1.95;
const CLOSE = {
  lid: curve([
    [0, OPEN_ANGLE],
    [0.22, 1.75],
    [0.48, 1.55],
    [1.05, 1.08],
    [1.42, 0.6],
    [1.6, 0.26],
    [1.7, 0],
    [1.78, 0.07],
    [1.88, 0],
  ]),
  spread: curve([
    [0, 1],
    [0.3, 0.92],
    [1.2, 0.55],
    [1.72, 0],
  ]),
  yaw: curve([
    [0, 0],
    [0.5, 0.2],
    [1.3, 0.12],
    [1.88, 0],
  ]),
  pitch: curve([
    [0, -0.1],
    [1.6, -0.05],
    [1.7, 0.035],
    [1.82, -0.01],
    [1.95, 0],
  ]),
  roll: curve([
    [0, 0],
    [0.8, -0.05],
    [1.95, 0],
  ]),
};

function sway(t, motion) {
  return {
    y: 1.8 * Math.sin(t * 1.1) * motion,
    yaw: -0.2 + (0.1 * Math.sin(t * 0.9) + 0.03 * Math.sin(t * 2.1)) * motion,
    pitch: -0.12 + 0.045 * Math.sin(t * 0.7) * motion,
    roll: 0.03 + 0.018 * Math.sin(t * 0.5) * motion,
    lid: 0,
    spread: 0,
  };
}

// Throws when WebGL won't start, so the page can show the artwork flat instead.
export function createStage(container, { reducedMotion = false } = {}) {
  const motion = reducedMotion ? 0.35 : 1;
  // what the page hears from the stage
  const api = {
    onTap: null, // the case was tapped
    onInteract: null, // any pointer down on the stage
    onFrame: null, // (dt) once a frame
    onOpen: null, // (open) the case started opening or closing
    onShown: null, // the case opened and closed again on its own
  };

  const canvas = document.createElement('canvas');
  canvas.className = 'mx-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'A clear CD jewel case with its disc spinning inside. Tap the case to open it, or drag it to turn it.',
  );
  container.appendChild(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
  } catch (err) {
    canvas.remove();
    throw err;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.autoClear = false;
  renderer.setClearColor(0xffffff, 0);
  const hdr =
    renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const target = (samples) =>
    new THREE.WebGLRenderTarget(1, 1, {
      type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
      samples,
      depthBuffer: samples > 0,
      stencilBuffer: false,
      resolveDepthBuffer: false,
    });
  const rtPage = target(0);
  const rt = [target(MSAA), target(MSAA)];
  const rtBright = target(0);
  const rtStarA = target(0);
  const rtStarB = target(0);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 10, 4000);
  const opaque = new THREE.Scene();
  const glass = new THREE.Scene();
  const hits = new THREE.Scene();

  const screenCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const screenQuad = new THREE.PlaneGeometry(2, 2);
  const pass = (frag, uniforms) => {
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: SCREEN_VERT,
      fragmentShader: frag,
      depthTest: false,
      depthWrite: false,
    });
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(screenQuad, material));
    return { scene, material };
  };
  const copyMat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: null } },
    vertexShader: SCREEN_VERT,
    fragmentShader: COPY_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const copyQuad = new THREE.Mesh(screenQuad, copyMat);
  copyQuad.frustumCulled = false;
  copyQuad.renderOrder = -10;
  const picked = {
    uTex: { value: rtPage.texture },
    uTexInside: { value: rtPage.texture },
    uRect: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
  const bright = pass(BRIGHT_FRAG, {
    ...picked,
    uTexel: { value: new THREE.Vector2() },
    uThreshold: { value: STAR_THRESHOLD },
  });
  const streak = pass(STREAK_FRAG, {
    uTex: { value: null },
    uStep: { value: new THREE.Vector2() },
    uFalloff: { value: 0.7 },
  });
  const final = pass(FINAL_FRAG, {
    ...picked,
    uStarA: { value: rtStarA.texture },
    uStarB: { value: rtStarB.texture },
    uStars: { value: STARS },
  });

  const roomRT = new THREE.WebGLCubeRenderTarget(ROOM_SIZE, {
    type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
  const bake = pass(ROOM_BAKE_FRAG, { uFace: { value: 0 }, uSize: { value: ROOM_SIZE } });
  const bakeRoom = () => {
    for (let face = 0; face < 6; face++) {
      bake.material.uniforms.uFace.value = face;
      renderer.setRenderTarget(roomRT, face);
      renderer.render(bake.scene, screenCam);
    }
    renderer.setRenderTarget(null);
  };
  bakeRoom();

  const shadowOf = {
    uLight: { value: LIGHT.clone() },
    uTrayInv: { value: [new THREE.Matrix4(), new THREE.Matrix4()] },
    uLidInv: { value: [new THREE.Matrix4(), new THREE.Matrix4()] },
    uScale: { value: [1, 1] },
    uOn: { value: [0, 0] },
  };
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(8000, 8000),
    new THREE.ShaderMaterial({ uniforms: shadowOf, vertexShader: BACKDROP_VERT, fragmentShader: BACKDROP_FRAG }),
  );
  backdrop.position.z = BACKDROP_Z;
  backdrop.renderOrder = -1; // the page has no depth buffer: the wall goes down first, the discs over it
  opaque.add(backdrop);
  const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
  glass.add(copyQuad);

  const samples = window.matchMedia('(pointer: coarse)').matches ? 1 : 2;

  const rodMaterial = () =>
    new THREE.ShaderMaterial({
      uniforms: {
        uBehind: { value: null },
        uRoom: { value: roomRT.texture },
        uRoomSize: { value: ROOM_SIZE },
        uProj: { value: camera.projectionMatrix },
        uDepth: { value: DEPTH },
        uIor: { value: IOR },
        uSamples: { value: samples },
        uAbsorb: { value: new THREE.Vector3(...ABSORB) },
      },
      vertexShader: ROD_VERT,
      fragmentShader: ROD_FRAG,
    });
  const sheetMaterial = () =>
    new THREE.ShaderMaterial({
      uniforms: {
        uIor: { value: IOR },
        uAbsorb: { value: new THREE.Vector3(...ABSORB) },
      },
      vertexShader: SHEET_VERT,
      fragmentShader: SHEET_FRAG,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 4,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    });

  const fixed = (mesh, scene) => {
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  };

  const hitPlane = new THREE.PlaneGeometry(CASE, CASE);
  const hitMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

  // a disc with nothing printed on it: bare silver
  const bare = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  bare.needsUpdate = true;

  const tray = trayGeometry();
  const lid = lidGeometry();
  const discGeo = discGeometry();

  function buildCase(slot) {
    const trayRodMat = rodMaterial();
    const lidRodMat = rodMaterial();
    const discMat = new THREE.ShaderMaterial({
      uniforms: {
        uArt: { value: bare },
        uArtIn: { value: ART_IN },
        uPrintOut: { value: PRINT_OUT },
      },
      vertexShader: DISC_VERT,
      fragmentShader: DISC_FRAG,
    });

    const item = {
      slot,
      trayRods: fixed(new THREE.Mesh(tray.rods, trayRodMat), glass),
      traySheets: fixed(new THREE.Mesh(tray.sheets, sheetMaterial()), glass),
      lidRods: fixed(new THREE.Mesh(lid.rods, lidRodMat), glass),
      lidSheets: fixed(new THREE.Mesh(lid.sheets, sheetMaterial()), glass),
      discMesh: fixed(new THREE.Mesh(discGeo, discMat), opaque),
      discDepth: fixed(new THREE.Mesh(discGeo, depthOnly), glass),
      hitTray: fixed(new THREE.Mesh(hitPlane, hitMat), hits),
      hitLid: fixed(new THREE.Mesh(hitPlane, hitMat), hits),
      trayRodMat,
      lidRodMat,
      discMat,
      art: null,
      shown: false,
      moved: new THREE.Matrix4(), // where a change of song has taken it
      mCase: new THREE.Matrix4(),
      mLid: new THREE.Matrix4(),
      depthTray: 0,
      depthLid: 0,
    };
    item.parts = [
      item.trayRods,
      item.traySheets,
      item.lidRods,
      item.lidSheets,
      item.discMesh,
      item.discDepth,
      item.hitTray,
      item.hitLid,
    ];
    item.traySheets.renderOrder = 1;
    item.lidSheets.renderOrder = 1;
    item.discDepth.renderOrder = -5;
    return item;
  }

  // Print a song's artwork on a case's disc: a square canvas whose half-width is the disc's 60mm
  // radius. Null leaves the disc bare.
  function dress(it, print) {
    it.art?.dispose();
    it.art = null;
    if (print) {
      it.art = new THREE.CanvasTexture(print);
      it.art.colorSpace = THREE.SRGBColorSpace;
      it.art.anisotropy = renderer.capabilities.getMaxAnisotropy();
    }
    it.discMat.uniforms.uArt.value = it.art || bare;
  }

  const hide = (it) => {
    it.shown = false;
    for (const o of it.parts) o.visible = false;
    shadowOf.uOn.value[it.slot] = 0;
  };

  const items = [buildCase(0), buildCase(1)];
  let item = items[0];
  item.shown = true;

  const pointer = { x: 0, y: 0, over: false };
  const lean = { x: 0, y: 0 };
  const grab = {
    active: false,
    start: null,
    last: null,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    flick: { x: 0, y: 0 },
    moved: 0,
    dist: 0,
  };
  const st = {
    t: 0,
    swayT: 0, // the sway's own clock, which stops when movement is stopped
    swayRate: 1,
    clock: 0,
    rest: REST,
    phase: 'rest',
    phaseAt: 0,
    auto: false,
    closeAfter: false,
    spin: 0,
    spinRate: SPIN,
    open: false,
    still: false,
    playing: false,
  };
  let slide = null; // { t, dir, from, pose }: the last song's case making way
  let pose = null; // the current case's pose last frame
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let raf = 0;
  let last = 0;
  let view = { w: 1, h: 1, openScale: 1 };

  const setOpenFlag = (on) => {
    if (st.open === on) return;
    st.open = on;
    api.onOpen?.(on);
  };

  function startOpen(auto) {
    if (st.phase !== 'rest') return;
    st.phase = 'opening';
    st.phaseAt = st.t;
    st.auto = auto;
    setOpenFlag(true);
  }
  function startClose() {
    if (st.phase === 'opening') {
      st.auto = true;
      st.closeAfter = true;
      return;
    }
    if (st.phase !== 'open') return;
    st.phase = 'closing';
    st.phaseAt = st.t;
    setOpenFlag(false);
  }
  function toggleOpen(on = !(st.phase === 'opening' || st.phase === 'open')) {
    if (on) startOpen(false);
    else startClose();
  }

  function showPose(t) {
    const w = st.swayT;
    const p = sway(w, motion);
    const since = t - st.phaseAt;
    if (st.phase === 'opening') {
      const q = Math.min(since, OPEN_T);
      p.yaw = lerp(p.yaw, 0, clamp01(q / 1.0)) + OPEN.yaw(q);
      p.lid = OPEN.lid(q);
      p.spread = OPEN.spread(q);
      p.pitch = lerp(p.pitch, OPEN.pitch(q), clamp01(q / 1.45));
      p.roll *= 1 - clamp01(q / 1.45);
    } else if (st.phase === 'open') {
      p.yaw = 0.06 * Math.sin(w * 0.6) * motion;
      p.pitch = -0.1 + 0.02 * Math.sin(w * 0.8) * motion;
      p.roll = 0;
      p.lid = OPEN_ANGLE + 0.025 * Math.sin(w * 1.3) * motion;
      p.spread = 1;
    } else if (st.phase === 'closing') {
      const q = Math.min(since, CLOSE_T);
      const back = clamp01((q - 0.9) / (CLOSE_T - 0.9));
      const rest = easeInOut(back);
      p.yaw = lerp(CLOSE.yaw(q), p.yaw, rest);
      p.pitch = lerp(CLOSE.pitch(q), p.pitch, rest);
      p.roll = lerp(CLOSE.roll(q), p.roll, rest);
      p.lid = CLOSE.lid(q);
      p.spread = CLOSE.spread(q);
    }
    p.pitch += lean.x + grab.x;
    p.yaw += lean.y + grab.y;
    return p;
  }

  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler(0, 0, 0, 'XYZ');
  const _v = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  const _h = new THREE.Matrix4();
  const _hi = new THREE.Matrix4();
  function place(it, p) {
    const s = lerp(1, view.openScale, p.spread);
    _e.set(p.pitch, p.yaw, p.roll);
    _q.setFromEuler(_e);
    _v.set(HALF * s * p.spread * 0.92, p.y, 0);
    it.mCase.compose(_v, _q, _s.setScalar(s)).premultiply(it.moved);
    _h.makeTranslation(HINGE.x, 0, HINGE.z);
    _hi.makeTranslation(-HINGE.x, 0, -HINGE.z);
    _m.makeRotationY(-p.lid);
    it.mLid.copy(it.mCase).multiply(_h).multiply(_m).multiply(_hi);

    it.trayRods.matrix.copy(it.mCase);
    it.traySheets.matrix.copy(it.mCase);
    it.lidRods.matrix.copy(it.mLid);
    it.lidSheets.matrix.copy(it.mLid);
    it.discMesh.matrix.copy(it.mCase).multiply(_m.makeRotationZ(-st.spin));
    it.discDepth.matrix.copy(it.discMesh.matrix);
    it.hitTray.matrix.copy(it.mCase);
    it.hitLid.matrix.copy(it.mLid).multiply(_m.makeTranslation(0, 0, 4));
    for (const o of it.parts) {
      o.matrixWorld.copy(o.matrix);
      o.visible = true;
    }
    _v.set(0, 0, -2).applyMatrix4(it.mCase).applyMatrix4(camera.matrixWorldInverse);
    it.depthTray = _v.z;
    _v.set(0, 0, 4).applyMatrix4(it.mLid).applyMatrix4(camera.matrixWorldInverse);
    it.depthLid = _v.z;

    shadowOf.uTrayInv.value[it.slot].copy(it.mCase).invert();
    shadowOf.uLidInv.value[it.slot].copy(it.mLid).invert();
    shadowOf.uScale.value[it.slot] = s;
    shadowOf.uOn.value[it.slot] = 1;
  }

  // Changing song, t seconds in: the new case drops in from above, waits with its lower part
  // showing, then settles into place, coming level as it lands; the old one falls away backwards,
  // top first, and out of sight. `dir` -1 runs it the other way.
  const _r = new THREE.Euler();
  function slideTo(t) {
    const { dir, from } = slide;
    const arrive = easeOutBack(span(t, 0.58, 0.95));
    _v.set(
      0,
      dir * CASE * (1.5 - 0.6 * easeOut(span(t, 0, 0.2)) - 0.06 * span(t, 0.2, 0.6) - 0.84 * arrive),
      24 * (1 - span(t, 0.8, 1)),
    );
    _r.set(dir * 0.28 * (1 - easeOut(span(t, 0.55, 0.98))), 0, dir * 0.05 * (1 - arrive));
    item.moved.compose(_v, _q.setFromEuler(_r), _s.setScalar(1));
    const fall = easeInOut(span(t, 0.05, 0.65));
    _v.set(0, -dir * CASE * (0.85 * fall + 0.8 * easeIn(span(t, 0.65, 1))), -170 * easeInOut(span(t, 0.05, 1)));
    _r.set(-dir * 0.55 * easeInOut(span(t, 0.05, 0.85)), 0.15 * fall, -dir * 0.06 * fall);
    from.moved.compose(_v, _q.setFromEuler(_r), _s.setScalar(1));
  }

  function endSlide() {
    hide(slide.from);
    slide.from.moved.identity();
    item.moved.identity();
    slide = null;
  }

  // Put a song's print in the case. `direction` 1 brings the next case down from above, -1 the
  // last one up from below, 0 just changes the disc.
  function show(print, direction = 0) {
    if (slide) endSlide();
    if (!direction || reducedMotion || !pose) {
      dress(item, print);
      return;
    }
    const from = item;
    item = items.find((it) => it !== from);
    dress(item, print);
    item.shown = true;
    slide = { t: 0, dir: direction, from, pose };
    slideTo(0);
    // the new case comes in shut, and starts its show over
    st.phase = 'rest';
    st.phaseAt = st.t;
    st.clock = 0;
    st.rest = REST;
    st.auto = false;
    st.closeAfter = false;
    setOpenFlag(false);
  }

  const caseAt = (x, y) => {
    ndc.set(x, y);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects([item.hitTray, item.hitLid], false).length > 0;
  };
  const hovering = () => pointer.over && !grab.active && caseAt(pointer.x, pointer.y);

  function frame(dt) {
    st.t += dt;
    const { t } = st;
    api.onFrame?.(dt);

    const want = getSpin() ? SPIN : 0;
    st.spinRate += (want - st.spinRate) * (1 - Math.exp(-dt * SPIN_EASE * 3));
    st.spin += st.spinRate * dt;
    st.swayRate += ((st.still ? 0 : 1) - st.swayRate) * (1 - Math.exp(-dt * SPIN_EASE * 3));
    st.swayT += st.swayRate * dt;

    const hover = pointer.over && !grab.active;
    const ax = hover ? pointer.y * 0.22 : 0;
    const ay = hover ? -pointer.x * 0.35 : 0;
    const k = 1 - Math.exp(-dt * 4);
    lean.x += (ax - lean.x) * k;
    lean.y += (ay - lean.y) * k;
    if (!grab.active) {
      grab.vx += (-GRAB_K * grab.x - GRAB_C * grab.vx) * dt;
      grab.vy += (-GRAB_K * grab.y - GRAB_C * grab.vy) * dt;
      grab.x += grab.vx * dt;
      grab.y += grab.vy * dt;
    }

    const since = t - st.phaseAt;
    if (st.phase === 'opening' && since >= OPEN_T) {
      st.phase = 'open';
      st.phaseAt = t;
    } else if (st.phase === 'closing' && since >= CLOSE_T) {
      st.phase = 'rest';
      st.phaseAt = t;
      st.clock = 0;
      st.rest = AGAIN;
      if (st.auto) api.onShown?.();
    }

    const held = grab.active || hovering() || (st.phase === 'open' && !st.auto);
    const showing = !getPaused() && !held;
    if (st.phase === 'open' && (st.closeAfter || (st.auto && showing && t - st.phaseAt >= OPEN_HOLD))) {
      st.closeAfter = false;
      startClose();
    }
    if (showing) {
      st.clock += dt;
      if (st.phase === 'rest' && st.clock >= st.rest) startOpen(true);
    }

    pose = showPose(t);
    if (slide) {
      slide.t += dt;
      slideTo(Math.min(slide.t, SLIDE));
      // the last case shuts as it goes
      const shut = 1 - easeInOut(span(slide.t, 0, 0.6));
      place(slide.from, { ...slide.pose, lid: slide.pose.lid * shut, spread: slide.pose.spread * shut });
    }
    place(item, pose);
    if (slide && slide.t >= SLIDE) endSlide();
    draw();
  }

  // movement stopped: the disc winds down, the case stops drifting and the show stops. While a
  // song plays, the show waits too: the lid stays as it is.
  const getSpin = () => !st.still;
  const getPaused = () => st.still || st.playing;

  const _c = new THREE.Vector3();
  function caseRect(w, h) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const it of items) {
      if (!it.shown) continue;
      for (const m of [it.mCase, it.mLid]) {
        for (let i = 0; i < 8; i++) {
          _c.set(i & 1 ? HALF + 3 : -HALF - 3, i & 2 ? HALF + 3 : -HALF - 3, i & 4 ? 7 : -7);
          _c.applyMatrix4(m).project(camera);
          x0 = Math.min(x0, _c.x);
          x1 = Math.max(x1, _c.x);
          y0 = Math.min(y0, _c.y);
          y1 = Math.max(y1, _c.y);
        }
      }
    }
    const pad = 0.04 * Math.max(x1 - x0, y1 - y0) + 0.02;
    const px = (v) => Math.round(((v + 1) / 2) * w);
    const py = (v) => Math.round(((v + 1) / 2) * h);
    const r = {
      x: clamp(px(x0 - pad), 0, w),
      y: clamp(py(y0 - pad), 0, h),
      x1: clamp(px(x1 + pad), 0, w),
      y1: clamp(py(y1 + pad), 0, h),
    };
    return r.x1 > r.x && r.y1 > r.y ? r : null;
  }

  const groups = [];
  function draw() {
    renderer.setRenderTarget(rtPage);
    renderer.clear();
    renderer.render(opaque, camera);

    groups.length = 0;
    for (const it of items) {
      if (!it.shown) continue;
      groups.push({ depth: it.depthTray, rods: it.trayRods, sheets: it.traySheets, mat: it.trayRodMat });
      groups.push({ depth: it.depthLid, rods: it.lidRods, sheets: it.lidSheets, mat: it.lidRodMat });
    }
    groups.sort((a, b) => a.depth - b.depth);
    const glassMeshes = groups.flatMap((g) => [g.rods, g.sheets]);
    const w = rtPage.width;
    const h = rtPage.height;
    const rect = caseRect(w, h);
    let from = rtPage;
    if (rect) {
      for (const r of rt) {
        r.scissor.set(rect.x, rect.y, rect.x1 - rect.x, rect.y1 - rect.y);
        r.scissorTest = true;
      }
      groups.forEach((g, i) => {
        const into = rt[i % 2];
        renderer.setRenderTarget(into);
        renderer.clear();
        copyMat.uniforms.uTex.value = from.texture;
        for (const m of glassMeshes) m.visible = m === g.rods || m === g.sheets;
        g.mat.uniforms.uBehind.value = from.texture;
        renderer.render(glass, camera);
        from = into;
      });
      for (const r of rt) r.scissorTest = false;
    }
    for (const m of glassMeshes) m.visible = true;
    picked.uTexInside.value = from.texture;
    if (rect) picked.uRect.value.set(rect.x / w, rect.y / h, rect.x1 / w, rect.y1 / h);
    else picked.uRect.value.set(0, 0, 0, 0);

    bright.material.uniforms.uTexel.value.set(1 / rtBright.width, 1 / rtBright.height);
    renderer.setRenderTarget(rtBright);
    renderer.render(bright.scene, screenCam);
    streak.material.uniforms.uTex.value = rtBright.texture;
    streak.material.uniforms.uStep.value.set(1.5 / rtBright.width, 0);
    renderer.setRenderTarget(rtStarA);
    renderer.render(streak.scene, screenCam);
    streak.material.uniforms.uStep.value.set(0, 1.5 / rtBright.height);
    renderer.setRenderTarget(rtStarB);
    renderer.render(streak.scene, screenCam);

    renderer.setRenderTarget(null);
    renderer.render(final.scene, screenCam);
  }

  function layout() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    rtPage.setSize(size.x, size.y);
    for (const r of rt) r.setSize(size.x, size.y);
    const hw = Math.max(1, Math.round(size.x / 2));
    const hh = Math.max(1, Math.round(size.y / 2));
    rtBright.setSize(hw, hh);
    rtStarA.setSize(hw, hh);
    rtStarB.setSize(hw, hh);
    camera.aspect = w / h;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const fitH = CASE / FIT / 2 / tanHalf;
    const fitW = (CASE * 1.3) / 2 / (tanHalf * camera.aspect);
    const dist = Math.max(fitH, fitW);
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    camera.setViewOffset(w, h, 0, DOCK_CLEAR / 2, w, h);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const across = 2 * dist * tanHalf * camera.aspect;
    view = { w, h, openScale: Math.min(1.04, across / (CASE * 2.25)) };
  }

  const ro = new ResizeObserver(() => layout());
  ro.observe(container);
  canvas.addEventListener('webglcontextrestored', bakeRoom);

  const toNdc = (e) => {
    const r = container.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2];
  };
  const onMove = (e) => {
    [pointer.x, pointer.y] = toNdc(e);
    pointer.over = true;
    if (grab.active) {
      const dx = e.clientX - grab.last.x;
      const dy = e.clientY - grab.last.y;
      grab.last = { x: e.clientX, y: e.clientY };
      grab.dist = Math.max(grab.dist, Math.hypot(e.clientX - grab.start.x, e.clientY - grab.start.y));
      grab.y = clamp(grab.y + dx * GRAB_RATE, -GRAB_YAW, GRAB_YAW);
      grab.x = clamp(grab.x + dy * GRAB_RATE, -GRAB_TILT, GRAB_TILT);
      grab.flick = { x: dy * GRAB_RATE * 60, y: dx * GRAB_RATE * 60 };
      grab.moved = performance.now();
    } else {
      container.style.cursor = caseAt(pointer.x, pointer.y) ? 'pointer' : '';
    }
  };
  const onLeave = () => {
    pointer.over = false;
  };
  const onDown = (e) => {
    if (e.button !== 0) return;
    api.onInteract?.();
    const [x, y] = toNdc(e);
    if (!caseAt(x, y)) return;
    grab.active = true;
    grab.start = { x: e.clientX, y: e.clientY };
    grab.last = { x: e.clientX, y: e.clientY };
    grab.dist = 0;
    grab.flick = { x: 0, y: 0 };
    container.setPointerCapture(e.pointerId);
    container.style.cursor = 'grabbing';
  };
  const onUp = (e) => {
    if (!grab.active) return;
    grab.active = false;
    const still = performance.now() - grab.moved > 90;
    grab.vx = still ? 0 : grab.flick.x;
    grab.vy = still ? 0 : grab.flick.y;
    if (container.hasPointerCapture(e.pointerId)) container.releasePointerCapture(e.pointerId);
    container.style.cursor = '';
    if (e.type === 'pointerup' && grab.dist < TAP_SLOP) (api.onTap ? api.onTap() : toggleOpen());
  };
  container.addEventListener('pointermove', onMove);
  container.addEventListener('pointerleave', onLeave);
  container.addEventListener('pointerdown', onDown);
  container.addEventListener('pointerup', onUp);
  container.addEventListener('pointercancel', onUp);

  const gaps = [];
  let probing = true;
  const probe = (gap) => {
    if (!probing || document.hidden || gap > 0.1) return;
    gaps.push(gap);
    if (gaps.length < 120) return;
    gaps.sort((a, b) => a - b);
    const typical = gaps[gaps.length >> 1];
    gaps.length = 0;
    const ratio = renderer.getPixelRatio();
    if (typical < 1 / 40 || ratio <= 1) {
      probing = false;
      return;
    }
    renderer.setPixelRatio(
      Math.max(1, Math.min(ratio - 0.25, Math.round(ratio * Math.sqrt(1 / 45 / typical) * 4) / 4)),
    );
    layout();
  };

  layout();

  api.start = (onReady) => {
    let first = true;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const gap = last ? (now - last) / 1000 : 1 / 60;
      last = now;
      frame(Math.min(gap, 1 / 20));
      probe(gap);
      if (first) {
        first = false;
        onReady?.();
      }
    };
    raf = requestAnimationFrame(tick);
  };
  api.show = show;
  api.setOpen = (on) => toggleOpen(on);
  // Stop everything moving on its own: the disc, the drift and the show. Dragging still turns it.
  api.setStill = (still) => {
    st.still = still;
  };
  api.setPlaying = (playing) => {
    st.playing = playing;
  };
  Object.defineProperty(api, 'open', { get: () => st.phase === 'opening' || st.phase === 'open' });
  return api;
}
