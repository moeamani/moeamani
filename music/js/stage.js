import * as THREE from 'three';
import { JewelCase, W, H } from './case.js';
import { studioEnvironment } from './studio.js';

const FOV = 24;
const OPEN = THREE.MathUtils.degToRad(176); // a lid lies back a little short of flat
const REST_YAW = 0.12;
const REST_PITCH = -0.1;
const REST_ROLL = -0.035;
const SPIN = 1.1; // radians a second: the disc turns slowly
const SPACING = H + 22; // between cases as they slide past each other
const DRAG_YAW = 0.0085; // radians per pixel
const DRAG_PITCH = 0.006;

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// The 3D scene: a jewel case, turned by dragging, opened by tapping. Moving to another song slides
// the next case in from above (or below, going back) while this one slides away.
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
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.ShadowMaterial({ opacity: 0.09 }));
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
      if (first) {
        first = false;
        onReady?.();
      }
    });
  }

  get open() {
    return this.state.open;
  }

  setOpen(open) {
    this.state.open = open;
  }

  // Stop everything moving on its own: the disc, the drift. Dragging still turns it.
  setStill(still) {
    this.state.still = still;
  }

  // Put a disc in the case. `direction` 1 slides the next case down from above, -1 brings the
  // previous one up from below, 0 just swaps it.
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
    from.group.position.y = 0;
    to.group.position.y = 0;
    this.state.slide = null;
  }

  #update(dt) {
    const s = this.state;
    this.time += dt;
    this.onFrame?.(dt);

    // each lid swings on a spring, past where it stops and back; shut, it bounces off the base
    const k = this.reducedMotion ? 120 : 64;
    const damping = 2 * Math.sqrt(k) * (this.reducedMotion ? 1 : 0.6);
    for (const c of this.cases) {
      if (!c.group.visible) continue;
      const target = c === this.current && s.open ? OPEN : 0;
      c.lidVel += (k * (target - c.lidAngle) - damping * c.lidVel) * dt;
      c.lidAngle += c.lidVel * dt;
      if (c.lidAngle < 0) {
        c.lidAngle = 0;
        c.lidVel *= -0.25;
      }
      c.openAngle = c.lidAngle;
    }
    const spread = Math.max(0, -Math.cos(this.current.lidAngle)); // 0 shut, 1 lying open
    this.frame.position.x = (W / 2) * spread;
    this.#fit(spread);

    // the disc winds up and down rather than jumping
    const want = s.still ? 0 : SPIN;
    s.spinSpeed += (want - s.spinSpeed) * (1 - Math.exp(-dt * 1.6));
    s.disc -= s.spinSpeed * dt;
    for (const c of this.cases) c.discAngle = s.disc;

    // sliding to another case
    if (s.slide) {
      s.slide.t = Math.min(s.slide.t + dt / 0.85, 1);
      const p = ease(s.slide.t);
      s.slide.from.group.position.y = -s.slide.dir * SPACING * p;
      s.slide.to.group.position.y = s.slide.dir * SPACING * (1 - p);
      if (s.slide.t >= 1) this.#endSlide();
    }

    // let go, it coasts, then settles face on: the front, or the back if it was turned that way
    s.idle = s.dragging ? 0 : s.idle + dt;
    if (!s.dragging) {
      const face = REST_YAW + Math.round((s.yaw - REST_YAW) / Math.PI) * Math.PI;
      const slow = THREE.MathUtils.smoothstep(3 - Math.abs(s.yawVel), 0, 2.5);
      s.yawVel += (16 * slow * (face - s.yaw) - THREE.MathUtils.lerp(1.4, 6.5, slow) * s.yawVel) * dt;
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
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) {
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
        s.yawVel = clamp(v * 1000 * DRAG_YAW, -14, 14);
      }
      s.dragging = false;
      drag = null;
      if (e.pointerType === 'mouse') el.style.cursor = this.#hit(e) ? 'pointer' : 'grab';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
}
