import * as THREE from '/music/js/three.js';

// A pocket music player of the mid-2000s, in millimetres: 61.8 wide, 103.5 tall, 14.5 deep, centred
// on the origin, its face towards +z and its top towards +y. A white plastic front that wraps round
// the sides, a mirror-polished steel back, a greyscale screen in the top half and a touch wheel
// with a button in the middle below it. No names or marks on it anywhere.

export const W = 61.8;
export const H = 103.5;
export const D = 14.5;
const R = 9; // the corners, seen from the front
const FRONT = D / 2;
const BACK = -D / 2;
const SEAM = -2.6; // where the white meets the steel
const FRONT_ROUND = 2.8; // how far the front edge rounds over
const BACK_ROUND = 2.2;

export const SCREEN = { y: 24.5, w: 39.6, h: 31.7 }; // the LCD itself, 5:4
export const WHEEL = { y: -23.5, r: 20.25, button: 7.8 };
export const JACK = new THREE.Vector3(-18, H / 2, 0.9); // the headphone socket, on top
const HOLD_X = 18;

// --- shapes ----------------------------------------------------------------------------------

// A rounded rectangle's outline, anticlockwise, with each point's outward normal.
function outline(w, h, r, perCorner = 16) {
  const pts = [];
  const corners = [
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, Math.PI / 2],
    [-w / 2 + r, -h / 2 + r, Math.PI],
    [w / 2 - r, -h / 2 + r, (3 * Math.PI) / 2],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= perCorner; i++) {
      const a = a0 + (i / perCorner) * (Math.PI / 2);
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), nx: Math.cos(a), ny: Math.sin(a) });
    }
  }
  return pts;
}

// The outline swept along a profile: [inset, z, radial normal, z normal] from one rim to the other.
function shell(profile) {
  const ring = outline(W, H, R);
  const pos = [];
  const nrm = [];
  for (const [inset, z, nr, nz] of profile) {
    for (const p of ring) {
      pos.push(p.x - p.nx * inset, p.y - p.ny * inset, z);
      const l = Math.hypot(nr, nz) || 1;
      nrm.push((p.nx * nr) / l, (p.ny * nr) / l, nz / l);
    }
  }
  const n = ring.length;
  const index = [];
  for (let j = 0; j < profile.length - 1; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * n + i;
      const b = j * n + ((i + 1) % n);
      index.push(a, b, a + n, b, b + n, a + n);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(index);
  return g;
}

// a quarter round from a side at `z0` over to a face, `round` across
function rounding(z0, round, dir, steps = 10) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    out.push([round - round * Math.cos(a), z0 + dir * round * Math.sin(a), Math.cos(a), dir * Math.sin(a)]);
  }
  return out;
}

function face(inset, z, facing) {
  const pts = outline(W - 2 * inset, H - 2 * inset, R - inset);
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y))), 1);
  if (facing < 0) g.rotateY(Math.PI);
  g.translate(0, 0, z);
  return g;
}

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const pts = outline(w, h, r, 8);
  s.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) s.lineTo(p.x, p.y);
  s.closePath();
  return s;
}

const plane = (w, h, r, z, material) => {
  const m = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(w, h, r), 2), material);
  m.position.z = z;
  return m;
};

// --- the wheel's face ------------------------------------------------------------------------

function wheelTexture() {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const C = S / 2;
  const grad = g.createRadialGradient(C, C * 0.8, S * 0.05, C, C, S * 0.5);
  grad.addColorStop(0, '#c3c4c7');
  grad.addColorStop(1, '#b6b7ba');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#fbfbfc';
  g.strokeStyle = '#fbfbfc';
  // MENU along the top
  g.font = `600 ${S * 0.052}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if ('letterSpacing' in g) g.letterSpacing = `${S * 0.004}px`;
  g.fillText('MENU', C, C - S * 0.39);
  const tri = (x, y, s, dir) => {
    g.beginPath();
    g.moveTo(x - dir * s * 0.5, y - s * 0.55);
    g.lineTo(x + dir * s * 0.5, y);
    g.lineTo(x - dir * s * 0.5, y + s * 0.55);
    g.closePath();
    g.fill();
  };
  const bar = (x, y, s) => g.fillRect(x - s * 0.09, y - s * 0.55, s * 0.18, s * 1.1);
  const s = S * 0.034;
  // previous and next: a bar and two triangles
  bar(C - S * 0.415, C, s);
  tri(C - S * 0.39, C, s, -1);
  tri(C - S * 0.355, C, s, -1);
  tri(C + S * 0.355, C, s, 1);
  tri(C + S * 0.39, C, s, 1);
  bar(C + S * 0.415, C, s);
  // play / pause
  tri(C - S * 0.025, C + S * 0.39, s, 1);
  bar(C + S * 0.017, C + S * 0.39, s);
  bar(C + S * 0.042, C + S * 0.39, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// --- the headphone plug ----------------------------------------------------------------------

// A 3.5mm plug on a white cord: steel tip, ring and sleeve, a white moulded housing, its strain
// relief and the cord. Its origin is the shoulder where the steel meets the housing, the tip
// pointing down -y.
function plug(materials) {
  const group = new THREE.Group();
  const steel = materials.steel;
  const add = (geometry, material, y) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.y = y;
    m.castShadow = true;
    group.add(m);
    return m;
  };
  const insulator = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.4 });
  // from the shoulder down: sleeve, a black ring, ring, a black ring, the tip
  add(new THREE.CylinderGeometry(1.75, 1.75, 6.2, 32), steel, -3.1);
  add(new THREE.CylinderGeometry(1.75, 1.75, 0.9, 32), insulator, -6.65);
  add(new THREE.CylinderGeometry(1.75, 1.75, 2.8, 32), steel, -8.5);
  add(new THREE.CylinderGeometry(1.75, 1.75, 0.9, 32), insulator, -10.35);
  add(new THREE.LatheGeometry([new THREE.Vector2(1.75, 0), new THREE.Vector2(1.6, -2.4), new THREE.Vector2(1.05, -3.0), new THREE.Vector2(0, -3.25)], 32), steel, -10.8);
  // the housing: a soft-edged white cylinder, then the strain relief tapering into the cord
  const housing = [
    [1.9, 0],
    [2.8, 0.3],
    [2.95, 1.0],
    [2.95, 13],
    [2.6, 15.2],
    [1.6, 16.2],
    [1.45, 22],
    [1.1, 24.5],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  add(new THREE.LatheGeometry(housing, 40), materials.cordWhite, 0);
  return group;
}

export const PLUG_CORD_START = 24.3; // where the cord leaves the plug, along its axis

// --- the whole player ------------------------------------------------------------------------

export function buildPlayer(screenTexture) {
  const materials = {
    white: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: 0.9,
    }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xeceef1, metalness: 1, roughness: 0.06, envMapIntensity: 1.25 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xe2e4e8, metalness: 1, roughness: 0.18, envMapIntensity: 1.2, side: THREE.DoubleSide }),
    cordWhite: new THREE.MeshPhysicalMaterial({ color: 0xf4f4f1, roughness: 0.4, clearcoat: 0.5, side: THREE.DoubleSide }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.55 }),
    window: new THREE.MeshStandardMaterial({ color: 0xe0e1df, roughness: 0.5 }),
    bezel: new THREE.MeshStandardMaterial({ color: 0x5c5d60, roughness: 0.6 }),
    lcd: new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.04,
      metalness: 0,
      transparent: true,
      opacity: 0.16,
      envMapIntensity: 1.4,
      depthWrite: false,
    }),
    wheel: new THREE.MeshStandardMaterial({ map: wheelTexture(), roughness: 0.62 }),
    button: new THREE.MeshPhysicalMaterial({ color: 0xf8f8f6, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.1, side: THREE.DoubleSide }),
    gap: new THREE.MeshStandardMaterial({ color: 0xb9babd, roughness: 0.7 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xff8a1c, roughness: 0.5 }),
  };

  const root = new THREE.Group();
  const mesh = (geometry, material, cast = true) => {
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = cast;
    m.receiveShadow = false;
    return m;
  };

  // the body: white from the seam up round the front edge; steel from the seam round the back
  const whiteProfile = [[0, SEAM, 1, 0], [0, FRONT - FRONT_ROUND, 1, 0], ...rounding(FRONT - FRONT_ROUND, FRONT_ROUND, 1).slice(1)];
  const steelProfile = [...rounding(BACK + BACK_ROUND, BACK_ROUND, -1).reverse(), [0.12, SEAM, 1, 0]];
  steelProfile[steelProfile.length - 2][0] = Math.max(steelProfile[steelProfile.length - 2][0], 0.12);
  const body = new THREE.Group();
  body.add(mesh(shell(whiteProfile), materials.white));
  body.add(mesh(face(FRONT_ROUND, FRONT, 1), materials.white));
  body.add(mesh(shell(steelProfile), materials.chrome));
  body.add(mesh(face(BACK_ROUND, BACK, -1), materials.chrome));
  root.add(body);

  // the screen: a recessed window, the dark frame of the LCD, the LCD, and glass over it all
  const screen = new THREE.Group();
  screen.position.y = SCREEN.y;
  screen.add(plane(SCREEN.w + 6.4, SCREEN.h + 6.4, 2.4, FRONT + 0.01, materials.window));
  screen.add(plane(SCREEN.w + 2.6, SCREEN.h + 2.6, 0.9, FRONT + 0.03, materials.bezel));
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), materials.lcd);
  lcd.position.z = FRONT + 0.05;
  screen.add(lcd);
  const glass = plane(SCREEN.w + 6.4, SCREEN.h + 6.4, 2.4, FRONT + 0.25, materials.glass);
  glass.renderOrder = 2;
  screen.add(glass);
  root.add(screen);

  // the wheel, and the button in it; each tilts or sinks a little when pressed
  const wheel = new THREE.Group();
  wheel.position.set(0, WHEEL.y, FRONT);
  const wheelFace = new THREE.Mesh(new THREE.CircleGeometry(WHEEL.r, 128), materials.wheel);
  wheelFace.position.z = 0.04;
  wheel.add(wheelFace);
  const gap = new THREE.Mesh(new THREE.CircleGeometry(WHEEL.button + 0.35, 96), materials.gap);
  gap.position.z = 0.06;
  wheel.add(gap);
  const button = mesh(
    new THREE.LatheGeometry(
      [[0, 0.55], [WHEEL.button - 0.6, 0.55], [WHEEL.button - 0.15, 0.42], [WHEEL.button, 0.15], [WHEEL.button, 0]].map(([r, z]) => new THREE.Vector2(r, z)),
      96,
    ).rotateX(Math.PI / 2),
    materials.button,
    false,
  );
  button.position.z = 0.04;
  wheel.add(button);
  root.add(wheel);

  // on top: the headphone socket, the accessory contacts beside it, and the hold switch
  const top = new THREE.Group();
  const facingUp = (m, x, z = JACK.z) => {
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, H / 2 + 0.02, z);
    top.add(m);
    return m;
  };
  facingUp(new THREE.Mesh(new THREE.CircleGeometry(1.9, 32), materials.dark), JACK.x);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.45, 40), materials.steel);
  facingUp(ring, JACK.x);
  facingUp(plane(4.2, 1.5, 0.6, 0, materials.dark), JACK.x + 6.5);
  facingUp(plane(9.4, 2.7, 1.2, 0, materials.dark), HOLD_X);
  const holdOrange = facingUp(plane(3.6, 2.0, 0.8, 0.01, materials.orange), HOLD_X - 2.4);
  holdOrange.visible = false;
  const holdKnob = mesh(new THREE.BoxGeometry(4.0, 1.4, 2.2), materials.white, false);
  holdKnob.position.set(HOLD_X - 2.4, H / 2 + 0.5, JACK.z); // off: covering the orange
  top.add(holdKnob);
  root.add(top);
  // and the dock connector underneath
  const dock = plane(22, 2.4, 1.1, 0, materials.dark);
  dock.rotation.x = Math.PI / 2;
  dock.position.set(0, -H / 2 - 0.02, 0.6);
  root.add(dock);

  // the headphone plug and its cord, away until something's plugged in
  const headphones = plug(materials);
  headphones.visible = false;
  root.add(headphones);
  const cord = new THREE.Mesh(new THREE.BufferGeometry(), materials.cordWhite);
  cord.castShadow = true;
  cord.visible = false;
  root.add(cord);

  return {
    root,
    wheel,
    wheelFace,
    button,
    lcd,
    materials,
    plug: headphones,
    cord,
    setHold(on) {
      holdOrange.visible = on;
      holdKnob.position.x = HOLD_X + (on ? 2.4 : -2.4);
    },
    // what a pointer can touch
    targets: { wheel: wheelFace, button, hold: holdKnob, body },
  };
}
