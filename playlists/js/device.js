import * as THREE from '/music/js/three.js';
import { studioEnvironment } from '/music/js/studio.js';
import { H, JACK, PLUG_CORD_START, WHEEL, buildPlayer } from './model.js';

const FOV = 24;
// at rest it's turned a little, top towards you so the socket on top shows
const REST = { pitch: 0.16, yaw: -0.24, roll: 0.035 };
const STEP = (2 * Math.PI) / 24; // the wheel scrolls one step every 15 degrees
const SCROLL_START = THREE.MathUtils.degToRad(9); // turned less than this, it was a press
const LONG_PRESS = 450; // ms: holding back or next seeks

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const easeOut = (t, p = 5) => 1 - Math.pow(1 - clamp(t, 0, 1), p);
const easeIn = (t, p = 3) => Math.pow(clamp(t, 0, 1), p);
const smooth = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
const bezier = (a, b, c, t, out) =>
  out.set(0, 0, 0).addScaledVector(a, (1 - t) * (1 - t)).addScaledVector(b, 2 * (1 - t) * t).addScaledVector(c, t * t);

// The plug's journey, in the player's own space (so it follows the player as it moves): from away
// up to the right, slowing as it nears, hovering over the socket, then in.
const UP = new THREE.Vector3(0, 1, 0);
const AWAY = JACK.clone().add(new THREE.Vector3(60, 230, 90));
const NEAR = JACK.clone().add(new THREE.Vector3(14, 80, 34));
const HOVER = JACK.clone().add(new THREE.Vector3(0, 18, 0)); // its tip 4mm above the socket
const TIP = 14; // how far the steel goes in
const TILT_AWAY = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.4, 0, -0.5));
const UPRIGHT = new THREE.Quaternion();
const CORD_END = JACK.clone().add(new THREE.Vector3(80, 520, 30)); // off the top of the page
const T = { come: 1.5, hover: 1.1, insert: 0.17, pull: 0.15, leave: 0.85 };

export class Device {
  constructor(container, { screen, reducedMotion = false } = {}) {
    this.container = container;
    this.reducedMotion = reducedMotion;
    // what the page hears
    this.onScroll = null; // (steps) round the wheel: + clockwise
    this.onPress = null; // ('menu' | 'prev' | 'next' | 'play' | 'select')
    this.onLongPress = null; // ('prev' | 'next', down) held to seek
    this.onHoldSwitch = null;
    this.onInteract = null; // anything at all: wakes the backlight
    this.onPlugSound = null; // ('scrape' | 'snap' | 'pop')

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
    scene.environmentIntensity = 1.55; // white plastic needs more light than clear plastic
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 10, 4000);

    // a white wall behind, to catch the shadow
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.ShadowMaterial({ opacity: 0.08 }));
    wall.position.z = -38;
    wall.receiveShadow = true;
    scene.add(wall);
    // a soft fill from the front, so the white reads white
    const fill = new THREE.DirectionalLight(0xffffff, 0.9);
    fill.position.set(0.4, 0.2, 1).multiplyScalar(600);
    scene.add(fill);
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(-0.32, 0.5, 1).multiplyScalar(600);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -160, right: 160, top: 220, bottom: -160, near: 200, far: 1300 });
    sun.shadow.radius = 14;
    sun.shadow.blurSamples = 18;
    sun.shadow.bias = -0.0004;
    scene.add(sun, sun.target);

    this.texture = new THREE.CanvasTexture(screen);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.anisotropy = 4;
    this.player = buildPlayer(this.texture);
    this.turn = new THREE.Group();
    this.turn.add(this.player.root);
    scene.add(this.turn);

    this.state = {
      yaw: REST.yaw,
      pitch: REST.pitch,
      yawVel: 0,
      pitchVel: 0,
      dragging: false,
      idle: 0,
      kick: 0, // the jolt of a plug going in
      kickVel: 0,
      wheelTilt: new THREE.Vector2(),
      wheelTiltTo: new THREE.Vector2(),
      buttonDown: 0,
      buttonTo: 0,
    };
    this.plug = { phase: 'out', t: 0, sounded: false };
    this.time = 0;
    this.backlight = { value: 1, to: 1 };

    this.#pointer();
    this.resizer = new ResizeObserver(() => this.#resize());
    this.resizer.observe(container);
    this.#resize();
  }

  start(onReady) {
    let last = 0;
    let first = true;
    this.renderer.setAnimationLoop((now) => {
      const dt = last ? Math.max(0, Math.min((now - last) / 1000, 1 / 20)) : 1 / 60;
      last = now;
      this.#update(dt);
      this.renderer.render(this.scene, this.camera);
      if (first) {
        first = false;
        onReady?.();
      }
    });
  }

  // the screen's canvas has been drawn again
  screenChanged() {
    this.texture.needsUpdate = true;
  }

  // 1 lit, 0 dark: the LCD dims when the backlight goes off
  setBacklight(on) {
    this.backlight.to = on ? 1 : 0;
  }

  // where a point on the wheel is on the page (for tests): `r` mm out from its middle at angle `a`
  wheelPoint(r, a) {
    const v = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0.1);
    this.player.wheel.updateWorldMatrix(true, false);
    v.applyMatrix4(this.player.wheel.matrixWorld).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  setHold(on) {
    this.player.setHold(on);
  }

  get plugged() {
    return this.plug.phase === 'in' || this.plug.phase === 'coming' || this.plug.phase === 'hover' || this.plug.phase === 'inserting';
  }

  // The headphones come in: glide down, slow, hover over the socket, then in with a click.
  // `animate` false puts them straight in (already plugged in when the page opened, say).
  plugIn(animate = true) {
    if (this.plugged) return;
    const p = this.plug;
    p.sounded = false;
    p.t = 0;
    p.phase = animate && !this.reducedMotion ? 'coming' : 'in';
    if (p.phase === 'in') this.#placePlug(JACK, UPRIGHT);
    this.player.plug.visible = true;
    this.player.cord.visible = true;
  }

  unplug() {
    if (!this.plugged) return;
    const p = this.plug;
    if (p.phase !== 'in') {
      // still on its way in: just go
      p.phase = 'leaving';
      p.t = T.pull;
      p.from = this.player.plug.position.clone();
      return;
    }
    p.phase = 'leaving';
    p.t = 0;
    p.from = JACK.clone();
    this.onPlugSound?.('pop');
  }

  // --- each frame ---

  #update(dt) {
    const s = this.state;
    this.time += dt;

    // the backlight fades rather than switching
    const b = this.backlight;
    b.value += (b.to - b.value) * (1 - Math.exp(-dt * (b.to > b.value ? 14 : 3)));
    const lit = b.value;
    this.player.materials.lcd.color.setRGB(0.84 + 0.16 * lit, 0.86 + 0.14 * lit, 0.8 + 0.2 * lit);

    // the wheel tilts under a finger, the button sinks
    s.wheelTilt.lerp(s.wheelTiltTo, 1 - Math.exp(-dt * 30));
    this.player.wheel.rotation.set(s.wheelTilt.y, -s.wheelTilt.x, 0);
    s.buttonDown += (s.buttonTo - s.buttonDown) * (1 - Math.exp(-dt * 35));
    this.player.button.position.z = 0.04 - 0.35 * s.buttonDown;

    // let go, it swings back face on; left alone, it drifts a little
    s.idle = s.dragging ? 0 : s.idle + dt;
    if (!s.dragging) {
      const turn = Math.PI * 2;
      const front = REST.yaw + Math.round((s.yaw + s.yawVel * 0.15 - REST.yaw) / turn) * turn;
      s.yawVel += (26 * (front - s.yaw) - 7.4 * s.yawVel) * dt;
      s.yaw += s.yawVel * dt;
      s.pitchVel += (30 * (REST.pitch - s.pitch) - 9 * s.pitchVel) * dt;
      s.pitch += s.pitchVel * dt;
    }
    const sway = this.reducedMotion ? 0 : smooth((s.idle - 0.5) / 2.5);
    const swayYaw = Math.sin(this.time * 0.5) * 0.05 * sway;
    const swayPitch = Math.sin(this.time * 0.71 + 1.3) * 0.025 * sway;
    const bob = Math.sin(this.time * 0.9) * 1.2 * sway;
    s.kickVel += (-120 * s.kick - 14 * s.kickVel) * dt;
    s.kick += s.kickVel * dt;
    this.turn.rotation.set(s.pitch + swayPitch + s.kick * 0.02, s.yaw + swayYaw, REST.roll);
    this.turn.position.y = bob - s.kick * 1.4;

    this.#plugStep(dt);
  }

  #placePlug(position, quaternion) {
    const plug = this.player.plug;
    plug.position.copy(position);
    plug.quaternion.copy(quaternion);
    // the cord: out of the plug's end, carried on along it a way, then curving off the top
    const axis = UP.clone().applyQuaternion(quaternion);
    const start = position.clone().addScaledVector(axis, PLUG_CORD_START - 0.4);
    const a = start.clone().addScaledVector(axis, 26);
    const b = start.clone().addScaledVector(axis, 60).add(new THREE.Vector3(18, 40, 14));
    const curve = new THREE.CatmullRomCurve3([start, a, b, CORD_END], false, 'centripetal');
    this.player.cord.geometry.dispose();
    this.player.cord.geometry = new THREE.TubeGeometry(curve, 120, 1.05, 10, false);
  }

  #plugStep(dt) {
    const p = this.plug;
    if (p.phase === 'out' || p.phase === 'in') return;
    p.t += dt;
    const pos = (this._plugPos ||= new THREE.Vector3());
    const rot = (this._plugRot ||= new THREE.Quaternion());
    if (p.phase === 'coming') {
      // it decelerates the whole way, so it seems to slow as it comes close
      const u = easeOut(p.t / T.come, 4);
      bezier(AWAY, NEAR, HOVER, u, pos);
      rot.slerpQuaternions(TILT_AWAY, UPRIGHT, easeOut(p.t / (T.come * 0.85), 3));
      if (p.t >= T.come) (p.phase = 'hover'), (p.t = 0);
    } else if (p.phase === 'hover') {
      // floats over the socket for a moment, lining itself up
      const k = Math.sin((p.t / T.hover) * Math.PI * 2);
      pos.copy(HOVER);
      pos.y += 1.1 * k * (1 - p.t / T.hover);
      pos.x += 0.4 * Math.sin((p.t / T.hover) * Math.PI * 3) * (1 - p.t / T.hover);
      rot.setFromEuler(new THREE.Euler(0.03 * k * (1 - p.t / T.hover), 0, 0.04 * Math.sin((p.t / T.hover) * Math.PI * 2 + 1) * (1 - p.t / T.hover)));
      if (p.t >= T.hover) (p.phase = 'inserting'), (p.t = 0);
    } else if (p.phase === 'inserting') {
      // then in, quickly, speeding up into the click
      const u = easeIn(p.t / T.insert, 2.2);
      pos.lerpVectors(HOVER, JACK, u);
      rot.identity();
      // the tip meets the socket a fifth of the way down
      if (!p.sounded && pos.y - TIP <= JACK.y) {
        p.sounded = true;
        this.onPlugSound?.('scrape');
      }
      if (p.t >= T.insert) {
        p.phase = 'in';
        pos.copy(JACK);
        this.onPlugSound?.('snap');
        this.state.kickVel += 9; // and the player gives a little under it
      }
    } else if (p.phase === 'leaving') {
      if (p.t < T.pull) {
        pos.lerpVectors(p.from, JACK.clone().addScaledVector(UP, 16), easeOut(p.t / T.pull, 3));
        rot.identity();
      } else {
        const u = easeIn((p.t - T.pull) / T.leave, 3);
        bezier(JACK.clone().addScaledVector(UP, 16), NEAR, AWAY, u, pos);
        rot.slerpQuaternions(UPRIGHT, TILT_AWAY, u);
        if (p.t >= T.pull + T.leave) {
          p.phase = 'out';
          this.player.plug.visible = false;
          this.player.cord.visible = false;
          return;
        }
      }
    }
    this.#placePlug(pos, rot);
  }

  // --- framing ---

  #resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // the player in the space the page leaves it, with room above for the headphone cord
    const narrow = w < 720;
    const top = narrow ? 110 : 90;
    const bottom = narrow ? 70 : 84;
    const safeH = Math.max(h - top - bottom, 160);
    const safeW = Math.max(w - (narrow ? 32 : 128), 160);
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const compH = H * 1.12;
    const compW = 61.8 * (narrow ? 1.3 : 1.9);
    const dist = Math.max((compH * h) / (safeH * 2 * tan), (compW * h) / (safeW * 2 * tan), h / (2 * tan * 4.2));
    const mmPerPx = (2 * dist * tan) / h;
    this.camera.position.set(0, ((top - bottom) / 2 + 0.06 * safeH) * mmPerPx, dist);
    this.camera.lookAt(0, this.camera.position.y, 0);
    this.camera.updateProjectionMatrix();
  }

  // --- touching it ---

  #pointer() {
    const el = this.renderer.domElement;
    const s = this.state;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const { wheel: wheelFace, button, hold } = this.player.targets;
    const all = [];
    this.player.root.traverse((o) => o.isMesh && all.push(o));

    const aim = (e) => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
    };
    // where on the wheel's plane the pointer is, in the wheel's own coordinates
    const plane = new THREE.Plane();
    const hitPoint = new THREE.Vector3();
    const onWheel = (e) => {
      aim(e);
      const wheel = this.player.wheel;
      wheel.updateMatrixWorld();
      const normal = new THREE.Vector3(0, 0, 1).transformDirection(wheel.matrixWorld);
      plane.setFromNormalAndCoplanarPoint(normal, new THREE.Vector3().setFromMatrixPosition(wheel.matrixWorld));
      if (!ray.ray.intersectPlane(plane, hitPoint)) return null;
      const local = wheel.worldToLocal(hitPoint.clone());
      return { x: local.x, y: local.y, r: Math.hypot(local.x, local.y), a: Math.atan2(local.y, local.x) };
    };
    const zone = (a) => {
      const deg = THREE.MathUtils.radToDeg(a);
      if (deg > 45 && deg <= 135) return 'menu';
      if (deg > -135 && deg <= -45) return 'play';
      return Math.abs(deg) > 90 ? 'prev' : 'next';
    };

    let touch = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.onInteract?.();
      aim(e);
      const hit = ray.intersectObjects(all, false)[0];
      if (!hit) return;
      el.setPointerCapture(e.pointerId);
      const what = hit.object === hold ? 'hold' : hit.object === wheelFace || hit.object === button ? 'wheel' : 'body';
      if (what === 'hold') {
        this.onHoldSwitch?.();
        touch = { id: e.pointerId, kind: 'none' };
        return;
      }
      if (what === 'wheel') {
        const w = onWheel(e);
        if (w && w.r <= WHEEL.button + 0.35) {
          s.buttonTo = 1;
          this.onPress?.('select');
          touch = { id: e.pointerId, kind: 'button' };
          return;
        }
        if (w) {
          const z = zone(w.a);
          // a press tips the wheel down where it's pressed
          s.wheelTiltTo.set(Math.cos(w.a) * 0.045, Math.sin(w.a) * 0.045);
          touch = { id: e.pointerId, kind: 'wheel', last: w.a, turned: 0, acc: 0, zone: z, long: false };
          if (z === 'prev' || z === 'next') {
            touch.timer = setTimeout(() => {
              // held, and kept still: that's a hold, not the start of a turn
              if (touch?.kind !== 'wheel' || touch.scrolling || touch.turned > SCROLL_START / 3) return;
              touch.long = true;
              this.onLongPress?.(z, true);
            }, LONG_PRESS);
          }
          return;
        }
      }
      // anywhere else on it: turn it in your hand
      touch = { id: e.pointerId, kind: 'turn', x: e.clientX, y: e.clientY, trail: [] };
      s.dragging = true;
      s.yawVel = s.pitchVel = 0;
      el.style.cursor = 'grabbing';
    });

    el.addEventListener('pointermove', (e) => {
      if (!touch || e.pointerId !== touch.id) {
        if (e.pointerType === 'mouse') {
          aim(e);
          const hit = ray.intersectObjects(all, false)[0];
          el.style.cursor = !hit ? '' : hit.object === wheelFace || hit.object === button || hit.object === hold ? 'pointer' : 'grab';
        }
        return;
      }
      if (touch.kind === 'wheel') {
        const w = onWheel(e);
        if (!w || w.r < 2) return;
        let d = w.a - touch.last;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        touch.last = w.a;
        touch.turned += Math.abs(d);
        touch.acc -= d; // clockwise (the angle falling) moves down a list, turns the volume up
        if (!touch.scrolling && touch.turned > SCROLL_START) {
          touch.scrolling = true;
          clearTimeout(touch.timer);
          s.wheelTiltTo.set(0, 0);
          // it was being held to seek, and now it's turning: stop seeking, scroll
          if (touch.long) {
            touch.long = false;
            this.onLongPress?.(touch.zone, false);
          }
        }
        if (touch.scrolling) {
          // the whole turn counts, the bit before it was sure it was a turn too
          const steps = Math.trunc(touch.acc / STEP);
          if (steps) {
            touch.acc -= steps * STEP;
            this.onScroll?.(steps);
          }
        }
      } else if (touch.kind === 'turn') {
        const dx = e.clientX - touch.x;
        const dy = e.clientY - touch.y;
        touch.x = e.clientX;
        touch.y = e.clientY;
        s.yaw += dx * 0.0085;
        s.pitch = clamp(s.pitch + dy * 0.006, -0.6, 0.8);
        const now = performance.now();
        touch.trail.push({ t: now, x: e.clientX });
        while (touch.trail.length && now - touch.trail[0].t > 90) touch.trail.shift();
      }
    });

    const end = (e) => {
      if (!touch || e.pointerId !== touch.id) return;
      if (touch.kind === 'wheel') {
        clearTimeout(touch.timer);
        s.wheelTiltTo.set(0, 0);
        if (touch.long) this.onLongPress?.(touch.zone, false);
        else if (!touch.scrolling && e.type === 'pointerup') this.onPress?.(touch.zone);
      } else if (touch.kind === 'button') {
        s.buttonTo = 0;
      } else if (touch.kind === 'turn') {
        s.dragging = false;
        if (touch.trail.length > 1) {
          const a = touch.trail[0];
          const z = touch.trail[touch.trail.length - 1];
          s.yawVel = clamp((((z.x - a.x) / Math.max(z.t - a.t, 1)) * 1000 * 0.0085), -9, 9);
        }
        el.style.cursor = '';
      }
      touch = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);

    // a mouse wheel or trackpad scrolls the wheel too
    let wheelAcc = 0;
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.onInteract?.();
        wheelAcc += e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
        const steps = Math.trunc(wheelAcc / 48);
        if (steps) {
          wheelAcc -= steps * 48;
          this.onScroll?.(steps);
        }
      },
      { passive: false },
    );
  }
}
