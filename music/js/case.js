import * as THREE from 'three';
import { discMaterial, setDisc } from './disc-material.js';
import { plasticMaterial } from './plastic-material.js';
import { sparkleGeometry, sparkleMaterial } from './sparkles.js';

// A clear jewel case, in millimetres: square, 145 a side and 10.4 deep, centred on the origin, with
// a hand's width of clear plastic round the 120mm disc.
// Nothing printed in it, only plastic: the walls, the tray's rails and clips, the hub, and the disc.
// Its lid hinges on the left edge.
export const W = 145;
export const H = 145;
const D = 10.4;
const HINGE_Z = 1.9;
const DISC_Z = -0.7;
const FLOOR = -3.1; // top of the tray floor

// --- shapes ------------------------------------------------------------------------------

function roundedRect(path, w, h, r, x = 0, y = 0) {
  const l = x - w / 2;
  const b = y - h / 2;
  path.moveTo(l + r, b);
  path.lineTo(l + w - r, b);
  path.quadraticCurveTo(l + w, b, l + w, b + r);
  path.lineTo(l + w, b + h - r);
  path.quadraticCurveTo(l + w, b + h, l + w - r, b + h);
  path.lineTo(l + r, b + h);
  path.quadraticCurveTo(l, b + h, l, b + h - r);
  path.lineTo(l, b + r);
  path.quadraticCurveTo(l, b, l + r, b);
  return path;
}

// Extrude a shape `t` thick from z = 0 up, with its edges rounded over by `bevel`: the rounding is
// what catches the room's light and draws each edge as a line of chrome.
function extrude(shape, t, bevel) {
  const b = Math.min(bevel, t / 2 - 0.01);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(t - 2 * b, 0.01),
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: 3,
    curveSegments: 12,
  });
  g.translate(0, 0, b);
  return g;
}

const slab = (w, h, r, t, bevel = 0.4) => extrude(roundedRect(new THREE.Shape(), w, h, r), t, bevel);

// A rounded-rectangle ring: outer w x h, walls `wall` thick.
function frame(w, h, r, wall, t, bevel = 0.5) {
  const shape = roundedRect(new THREE.Shape(), w, h, r);
  shape.holes.push(roundedRect(new THREE.Path(), w - 2 * wall, h - 2 * wall, Math.max(r - wall, 0.6)));
  return extrude(shape, t, bevel);
}

// An L-shaped rail in the top right corner of a box reaching to (X, Y), arms `ax` and `ay` long,
// `w` wide. sx and sy mirror it into the other corners.
function rail(X, Y, ax, ay, w, sx, sy) {
  const r = 3.5;
  const ri = 1.2;
  const pts = [
    [X - ax, Y],
    [X - r, Y, X, Y, X, Y - r],
    [X, Y - ay],
    [X - w, Y - ay],
    [X - w, Y - w - ri, X - w, Y - w, X - w - ri, Y - w],
    [X - ax, Y - w],
  ];
  const shape = new THREE.Shape();
  const m = (x, y) => [x * sx, y * sy];
  shape.moveTo(...m(...pts[0]));
  for (const p of pts.slice(1)) {
    if (p.length === 2) shape.lineTo(...m(...p));
    else {
      shape.lineTo(...m(p[0], p[1]));
      shape.quadraticCurveTo(...m(p[2], p[3]), ...m(p[4], p[5]));
    }
  }
  shape.closePath();
  return extrude(shape, 1.8, 0.6);
}

function lathe(points, segments = 96) {
  const g = new THREE.LatheGeometry(points.map(([r, z]) => new THREE.Vector2(r, z)), segments);
  g.rotateX(Math.PI / 2); // lathe round Z, not Y
  return g;
}

function ring(radius, tube) {
  return new THREE.TorusGeometry(radius, tube, 12, Math.max(24, Math.round(radius * 6)));
}

// --- the parts every case shares -----------------------------------------------------------

let parts = null;

function build() {
  const z0 = -D / 2;
  const top = D / 2;
  const base = [];
  const lid = [];
  const add = (list, geometry, kind, x = 0, y = 0, z = 0, rz = 0) => list.push({ geometry, kind, x, y, z, rz });

  // the base: a clear back and the wall round it
  add(base, slab(W - 0.6, H - 0.6, 3.6, 1.1, 0.45), 'clear', 0, 0, z0);
  add(base, frame(W - 0.6, H - 0.6, 3.6, 1.9, 7.0, 0.4), 'wall', 0, 0, z0);
  // and a lip just inside it, a step lower: each edge of each wall catches the light as its own line
  add(base, frame(W - 5.2, H - 5.2, 2.2, 1.1, 5.4, 0.3), 'wall', 0, 0, z0);
  // the tray floor, and everything moulded on it
  add(base, slab(W - 4.6, H - 4.6, 1.6, 0.9, 0.3), 'clear', 0, 0, FLOOR - 0.9);
  // L-shaped rails in the corners, broken where the disc comes close
  // (on the hinge side they reach further, to the latch)
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) add(base, rail(63.8, 63.8, 28, sx < 0 ? 40 : 28, 3.4, sx, sy), 'rail', 0, 0, FLOOR);
  // two posts under the bottom of the disc
  for (const sx of [-1, 1]) add(base, slab(2.6, 12, 1.1, 1.8, 0.4), 'rail', sx * 39, -55, FLOOR);
  // the latch on the hinge side: a loop within a loop
  add(base, frame(18.5, 40, 3.2, 2.2, 1.8, 0.4), 'rail', -W / 2 + 1.9 + 9.25, 0, FLOOR);
  add(base, frame(9, 24, 1.8, 1.7, 1.8, 0.4), 'rail', -W / 2 + 1.9 + 8, 0, FLOOR);
  // four clips that hold the disc's edge
  for (const deg of [60, 120, 240, 300]) {
    const a = THREE.MathUtils.degToRad(deg);
    add(base, slab(6.5, 2.4, 0.9, 2.3, 0.35), 'rail', Math.cos(a) * 60.6, Math.sin(a) * 60.6, DISC_Z - 1.2, a);
  }
  // the hub: a post through the disc's hole, a ring under the disc, four holes in the floor
  add(base, lathe([[7.2, FLOOR], [7.2, 0.15], [6.6, 0.6], [0.01, 0.6]]), 'clear');
  add(base, ring(4.6, 0.45), 'rail', 0, 0, 0.62);
  add(base, ring(16.0, 0.6), 'rail', 0, 0, DISC_Z - 0.6 - 0.6);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    add(base, ring(1.5, 0.42), 'rail', Math.cos(a) * 12.2, Math.sin(a) * 12.2, FLOOR + 0.1);
  }
  // hinge knuckles at the top and bottom of the left edge
  const knuckle = new THREE.CylinderGeometry(1.7, 1.7, 9, 24);
  for (const sy of [-1, 1]) add(base, knuckle, 'rail', -W / 2 + 0.6, sy * (H / 2 - 6), HINGE_Z);

  // the lid: a clear face and a shallow wall, with tabs that would hold a booklet
  add(lid, slab(W, H, 3.8, 1.0, 0.45), 'clear', 0, 0, top - 1.0);
  add(lid, frame(W, H, 3.8, 1.4, top - HINGE_Z - 0.1, 0.35), 'wall', 0, 0, HINGE_Z + 0.1);
  add(lid, frame(W - 4.4, H - 4.4, 2.4, 0.9, 2.0, 0.3), 'wall', 0, 0, top - 1.0 - 2.0);
  const tab = new THREE.Shape();
  tab.moveTo(4.2, 0);
  tab.absarc(0, 0, 4.2, 0, Math.PI, false);
  tab.lineTo(4.2, 0);
  const tabGeo = extrude(tab, 1.0, 0.35);
  for (const [x, sy] of [[-44, 1], [44, 1], [-44, -1], [44, -1]]) add(lid, tabGeo, 'clear', x, sy * (H / 2 - 1.4), top - 2.1, sy > 0 ? Math.PI : 0);

  // where glints can catch: along the walls' rounded edges, the rails and the disc's rim
  const rand = mulberry(7);
  const basePts = [];
  const lidPts = [];
  const perimeter = (list, hw, hh, z, step) => {
    const len = 4 * (hw + hh);
    for (let d = 0; d < len; d += step * (0.6 + rand() * 0.8)) {
      let x;
      let y;
      let nx = 0;
      let ny = 0;
      if (d < 2 * hw) (x = -hw + d), (y = hh), (ny = 1);
      else if (d < 2 * hw + 2 * hh) (x = hw), (y = hh - (d - 2 * hw)), (nx = 1);
      else if (d < 4 * hw + 2 * hh) (x = hw - (d - 2 * hw - 2 * hh)), (y = -hh), (ny = -1);
      else (x = -hw), (y = -hh + (d - 4 * hw - 2 * hh)), (nx = -1);
      list.push([x, y, z, nx * 0.6, ny * 0.6, 1]);
    }
  };
  perimeter(basePts, (W - 0.6) / 2 - 0.4, (H - 0.6) / 2 - 0.4, z0 + 6.9, 3.2);
  perimeter(basePts, (W - 0.6) / 2 - 1.7, (H - 0.6) / 2 - 1.7, z0 + 6.9, 4.5);
  perimeter(lidPts, W / 2 - 0.4, H / 2 - 0.4, top - 0.05, 3.2);
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    basePts.push([Math.cos(a) * 59.6, Math.sin(a) * 59.6, DISC_Z + 0.6, Math.cos(a) * 0.4, Math.sin(a) * 0.4, 1]);
  }
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    for (let i = 0; i < 9; i++) basePts.push([sx * (36 + rand() * 27), sy * 63, FLOOR + 1.8, 0, sy * 0.5, 1]);
    for (let i = 0; i < 9; i++) basePts.push([sx * 63, sy * (36 + rand() * 27), FLOOR + 1.8, sx * 0.5, 0, 1]);
  }

  parts = {
    base,
    lid,
    disc: {
      face: new THREE.RingGeometry(16.5, 60, 160, 1),
      edge: new THREE.CylinderGeometry(60, 60, 1.2, 160, 1, true).rotateX(Math.PI / 2),
      middle: lathe([[7.5, -0.6], [16.5, -0.6], [16.5, 0.6], [7.5, 0.6], [7.5, -0.6]]),
      stacking: ring(15.6, 0.85),
    },
    glints: { base: sparkleGeometry(basePts, rand), lid: sparkleGeometry(lidPts, rand) },
    materials: {
      clear: plasticMaterial({ tint: [0.86, 0.9, 0.95], density: 0.002 }),
      // thick plastic seen end on goes grey, like the case's walls and the tray's rails
      wall: plasticMaterial({ tint: [0.5, 0.52, 0.56], density: 0.03, chrome: 0.12, edge: 3 }),
      rail: plasticMaterial({ tint: [0.42, 0.44, 0.48], density: 0.04, chrome: 0.3, edge: 3 }),
      edge: new THREE.MeshStandardMaterial({ color: 0xe6e9ee, metalness: 1, roughness: 0.16, envMapIntensity: 1.5 }),
      glints: null,
    },
  };
}

export class JewelCase {
  constructor(pixelRatio = 1) {
    if (!parts) build();
    parts.materials.glints ||= sparkleMaterial(pixelRatio);
    const m = parts.materials;
    this.group = new THREE.Group();
    this.lidAngle = 0;
    this.lidVel = 0;
    this.textures = [];

    const place = (list, parent) => {
      for (const p of list) {
        const mesh = new THREE.Mesh(p.geometry, m[p.kind]);
        mesh.position.set(p.x, p.y, p.z);
        mesh.rotation.z = p.rz;
        mesh.castShadow = true;
        parent.add(mesh);
      }
    };
    this.base = new THREE.Group();
    this.group.add(this.base);
    place(parts.base, this.base);
    this.base.add(new THREE.Points(parts.glints.base, m.glints));

    // the disc, label side up
    const disc = new THREE.Group();
    disc.position.z = DISC_Z;
    this.group.add(disc);
    this.disc = disc;
    this.labelSide = discMaterial(true);
    this.dataSide = discMaterial(false);
    const label = new THREE.Mesh(parts.disc.face, this.labelSide);
    label.position.z = 0.6;
    const data = new THREE.Mesh(parts.disc.face, this.dataSide);
    data.position.z = -0.6;
    data.rotation.y = Math.PI;
    const stacking = new THREE.Mesh(parts.disc.stacking, m.rail);
    stacking.position.z = 0.6;
    for (const mesh of [label, data, new THREE.Mesh(parts.disc.edge, m.edge), new THREE.Mesh(parts.disc.middle, m.clear), stacking]) {
      mesh.castShadow = true;
      disc.add(mesh);
    }

    // the pivot sits on the hinge line; the lid hangs off it to the right
    this.hinge = new THREE.Group();
    this.hinge.position.set(-W / 2, 0, HINGE_Z);
    this.group.add(this.hinge);
    const lid = new THREE.Group();
    lid.position.set(W / 2, 0, -HINGE_Z);
    this.hinge.add(lid);
    place(parts.lid, lid);
    lid.add(new THREE.Points(parts.glints.lid, m.glints));

    this.dress(null);
  }

  // The lid's angle in radians: 0 shut, about PI lying open to the left.
  set openAngle(a) {
    this.hinge.rotation.y = -a;
  }

  set discAngle(a) {
    this.disc.rotation.z = a;
  }

  // Print a song's disc. `print` is a canvas from art.js, or null for a bare disc.
  dress(print) {
    for (const t of this.textures) t.dispose();
    this.textures = [];
    let texture = null;
    if (print) {
      texture = new THREE.CanvasTexture(print);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      this.textures.push(texture);
    }
    setDisc(this.labelSide, 'silver', texture);
    setDisc(this.dataSide, 'silver', null);
  }
}

function mulberry(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
