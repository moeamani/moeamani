import * as THREE from './three.js';
import { JewelCase, W, H } from './case.js';
import { studioEnvironment } from './studio.js';

const FOV = 24;
const OPEN = THREE.MathUtils.degToRad(176); // a lid lies back a little short of flat
// at rest it's turned a little: right side nearer, top leaning away, tipped anticlockwise
const REST_YAW = -0.1;
const REST_PITCH = -0.1;
const REST_ROLL = 0.06;
const SPIN = 0.12; // radians a second: the disc barely turns, about 7 degrees a second
const SLIDE = 1.0; // seconds for one case to make way for the next
const DRAG_YAW = 0.0085; // radians per pixel
const DRAG_PITCH = 0.006;

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;
const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
// how far through [a, b] the time t is, 0 to 1
const span = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

// A critically damped spring towards `target`, time constant `tau` seconds.
function follow(state, target, tau, dt) {
  const w = 1 / tau;
  state.vel += (w * w * (target - state.value) - 2 * w * state.vel) * dt;
  state.value += state.vel * dt;
}

// The 3D scene: a jewel case, turned by dragging (it always comes back face on), opened by
// tapping. Moving to another song, the next case drops in from above and waits at the top while
// this one falls away backwards, then slides down into its place.
export class Stage {
  constructor(container, { reducedMotion = false } = {}) {
    this.container = container;
    this.reducedMotion = reducedMotion;
    this.onTap = null; // the case was tapped
    this.onInteract = null; // any pointer down on the stage
    this.onFrame = null; // (dt) once a frame

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor(0xffffff, 1);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    renderer.domElement.className = 'mx-canvas';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.environment = studioEnvironment(renderer);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 10, 6000);

    // a white wall a little behind the case, to catch its shadow
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.ShadowMaterial({ opacity: 0.07 }));
    wall.position.z = -42;
    wall.receiveShadow = true;
    scene.add(wall);
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(-0.32, 0.45, 1).multiplyScalar(700);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -300, right: 300, top: 300, bottom: -300, near: 200, far: 1500 });
    sun.shadow.radius = 16;
    sun.shadow.blurSamples = 20;
    sun.shadow.bias = -0.0004;
    scene.add(sun, sun.target);

    // turn: spun by dragging; frame: slid over as the lid opens, so the open case stays centred
    this.turn = new THREE.Group();
    this.frame = new THREE.Group();
    this.turn.add(this.frame);
    scene.add(this.turn);
    this.cases = [new JewelCase(pixelRatio), new JewelCase(pixelRatio)];
    for (const c of this.cases) this.frame.add(c.group);
    this.cases[1].group.visible = false;
    this.current = this.cases[0];

    this.state = {
      open: false,
      still: false,
      spinSpeed: 0,
      disc: 0,
      yaw: REST_YAW,
      pitch: REST_PITCH,
      yawVel: 0,
      pitchVel: 0,
      dragging: false,
      idle: 0,
      slide: null,
    };
    this.time = 0;
    this.size = { width: 1, height: 1 };

    this.#pointer();
    this.resizer = new ResizeObserver(() => this.#resize());
    this.resizer.observe(container);
    this.#resize();
  }

  start(onReady) {
    let last = performance.now();
    let first = true;
    this.renderer.setAnimationLoop((now) => {
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      this.#update(dt);
      this.renderer.render(this.scene, this.camera);
      this.frames = (this.frames || 0) + 1;
      if (first) {
        first = false;
        onReady?.();
      }
    });
  }

  get open() {
    return this.state.open;
  }

  // what this browser's WebGL is, for ?debug
  report() {
    const gl = this.renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    return {
      gpu: gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
      drawn: `${size.x}x${size.y} at ${this.renderer.getPixelRatio()}x`,
      frames: this.frames || 0,
    };
  }

  setOpen(open) {
    this.state.open = open;
  }

  // Stop everything moving on its own: the disc, the drift. Dragging still turns it.
  setStill(still) {
    this.state.still = still;
  }

  // Put a disc in the case. `direction` 1 brings the next case down from above, -1 brings the
  // previous one up from below, 0 just swaps the disc.
  show(print, direction = 0) {
    const s = this.state;
    if (s.slide) this.#endSlide();
    if (!direction || this.reducedMotion) {
      this.current.dress(print);
      return;
    }
    const next = this.cases.find((c) => c !== this.current);
    next.dress(print);
    next.lidAngle = 0;
    next.lidVel = 0;
    next.openAngle = 0;
    next.group.visible = true;
    s.slide = { t: 0, dir: direction, from: this.current, to: next };
    this.current = next;
  }

  #endSlide() {
    const { from, to } = this.state.slide;
    from.group.visible = false;
    for (const c of [from, to]) {
      c.group.position.set(0, 0, 0);
      c.group.rotation.set(0, 0, 0);
    }
    this.state.slide = null;
  }

  // Where each case is, t seconds into a change of song.
  #slide(t) {
    const { from, to, dir } = this.state.slide;
    // the new one drops in, waits with its lower part showing above, then settles into place
    // just in front, coming level as it lands
    const arrive = easeOutBack(span(t, 0.58, 0.95));
    to.group.position.set(
      0,
      dir * H * (1.5 - 0.6 * easeOut(span(t, 0, 0.2)) - 0.06 * span(t, 0.2, 0.6) - 0.84 * arrive),
      24 * (1 - span(t, 0.8, 1)),
    );
    to.group.rotation.set(dir * 0.28 * (1 - easeOut(span(t, 0.55, 0.98))), 0, dir * 0.05 * (1 - arrive));
    // the old one falls away backwards, top first, and out of sight
    const fall = ease(span(t, 0.05, 0.65));
    from.group.position.set(0, -dir * H * (0.85 * fall + 0.8 * easeIn(span(t, 0.65, 1))), -170 * ease(span(t, 0.05, 1)));
    from.group.rotation.set(-dir * 0.55 * ease(span(t, 0.05, 0.85)), 0.15 * fall, -dir * 0.06 * fall);
  }

  #update(dt) {
    const s = this.state;
    this.time += dt;
    this.onFrame?.(dt);

    // each lid snaps open or shut on a spring; shut, it bounces off the base and settles
    const k = this.reducedMotion ? 120 : 70;
    const damping = 2 * Math.sqrt(k) * (this.reducedMotion ? 1 : 0.62);
    for (const c of this.cases) {
      if (!c.group.visible) continue;
      const target = c === this.current && s.open ? OPEN : 0;
      c.lidVel += (k * (target - c.lidAngle) - damping * c.lidVel) * dt;
      c.lidAngle += c.lidVel * dt;
      if (c.lidAngle < 0) {
        c.lidAngle = 0;
        c.lidVel *= -0.4;
      }
      c.openAngle = c.lidAngle;
    }
    // the framing follows the lid, a little behind it: once the lid has shut, the case slides
    // back to the middle and comes closer
    const spread = Math.max(0, -Math.cos(this.current.lidAngle)); // 0 shut, 1 lying open
    this.view ??= { value: spread, vel: 0 };
    if (this.reducedMotion) this.view.value = spread;
    else follow(this.view, spread, spread > this.view.value ? 0.05 : 0.3, dt);
    const framed = clamp(this.view.value, 0, 1);
    this.frame.position.x = (W / 2) * framed;
    this.#fit(framed);

    // the disc winds up and down rather than jumping
    const want = s.still ? 0 : SPIN;
    s.spinSpeed += (want - s.spinSpeed) * (1 - Math.exp(-dt * 1.6));
    s.disc -= s.spinSpeed * dt;
    for (const c of this.cases) c.discAngle = s.disc;

    // changing song
    if (s.slide) {
      s.slide.t += dt;
      this.#slide(Math.min(s.slide.t, SLIDE));
      if (s.slide.t >= SLIDE) this.#endSlide();
    }

    // let go, it always swings back face on: back the way it came, or on round if it was
    // turned more than halfway; never left showing its back
    s.idle = s.dragging ? 0 : s.idle + dt;
    if (!s.dragging) {
      const turn = Math.PI * 2;
      const front = REST_YAW + Math.round((s.yaw + s.yawVel * 0.15 - REST_YAW) / turn) * turn;
      s.yawVel += (26 * (front - s.yaw) - 7.4 * s.yawVel) * dt;
      s.yaw += s.yawVel * dt;
      s.pitchVel += (30 * (REST_PITCH - s.pitch) - 9 * s.pitchVel) * dt;
      s.pitch += s.pitchVel * dt;
    }

    // and while it's left alone, it drifts a little
    this.sway ??= 0;
    const wantSway = this.reducedMotion || s.still ? 0 : THREE.MathUtils.smoothstep(s.idle, 0.5, 3);
    this.sway += (wantSway - this.sway) * (1 - Math.exp(-dt * 2));
    this.swayTime = (this.swayTime || 0) + dt * this.sway;
    const swayYaw = Math.sin(this.swayTime * 0.5) * 0.06 * this.sway;
    const swayPitch = Math.sin(this.swayTime * 0.73 + 1.3) * 0.03 * this.sway;

    this.turn.rotation.set(s.pitch + swayPitch, s.yaw + swayYaw, REST_ROLL);
  }

  // Frame the case in the space the page leaves it: below the corner text, above the dock.
  #fit(spread) {
    const { width: vw, height: vh } = this.size;
    const narrow = vw < 720;
    const top = narrow ? 112 : 92;
    const bottom = narrow ? 132 : 156;
    const side = narrow ? 16 : 64;
    const safeW = Math.max(vw - 2 * side, 120);
    const safeH = Math.max(vh - top - bottom, 120);
    const compW = W * (1 + spread) * 1.1;
    const compH = H * 1.08;
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    let dist = Math.max((compH * vh) / (safeH * 2 * tan), (compW * vh) / (safeW * 2 * tan));
    dist = Math.max(dist, vh / (2 * tan * 3.4)); // no bigger than 3.4px a millimetre
    // move the camera so the case sits in the middle of that space, not of the window
    const mmPerPx = (2 * dist * tan) / vh;
    this.camera.position.set(0, ((top - bottom) / 2) * mmPerPx, dist + 5);
  }

  #resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.size = { width: w, height: h };
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  #hit(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    return ray.intersectObject(this.current.group, true).some((hit) => hit.object.isMesh);
  }

  #pointer() {
    const el = this.renderer.domElement;
    const s = this.state;
    let drag = null;

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.onInteract?.();
      el.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false, trail: [] };
      s.yawVel = 0;
      s.pitchVel = 0;
    });

    el.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) {
        if (e.pointerType === 'mouse') el.style.cursor = this.#hit(e) ? 'pointer' : 'grab';
        return;
      }
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      // a fingertip wanders further than a mouse while it taps
      const slop = e.pointerType === 'mouse' ? 6 : 14;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > slop) {
        drag.moved = true;
        s.dragging = true;
        el.style.cursor = 'grabbing';
      }
      if (!drag.moved) return;
      s.yaw += dx * DRAG_YAW;
      s.pitch = clamp(s.pitch + dy * DRAG_PITCH, -0.75, 0.6);
      const now = performance.now();
      drag.trail.push({ t: now, x: e.clientX });
      while (drag.trail.length && now - drag.trail[0].t > 90) drag.trail.shift();
    });

    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved && e.type === 'pointerup' && performance.now() - drag.t0 < 600 && this.#hit(e)) {
        this.onTap?.();
      } else if (drag.moved && drag.trail.length > 1) {
        // fling: carry on at the speed it was let go
        const a = drag.trail[0];
        const b = drag.trail[drag.trail.length - 1];
        const v = (b.x - a.x) / Math.max(b.t - a.t, 1); // px per ms
        s.yawVel = clamp(v * 1000 * DRAG_YAW, -9, 9);
      }
      s.dragging = false;
      drag = null;
      if (e.pointerType === 'mouse') el.style.cursor = this.#hit(e) ? 'pointer' : 'grab';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
}
