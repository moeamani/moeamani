import * as THREE from './three.js';
import { discMaterial, setDisc } from './disc-material.js';
import { plasticMaterial } from './plastic-material.js';
import { sparkleGeometry, sparkleMaterial } from './sparkles.js';

import { CASE, HINGE, lidGeometry, trayGeometry } from './case-geometry.js';

// A clear jewel case, in millimetres, centred on the origin. The case itself (tray, lid and hinge)
// is Ann Nguyen's model: rods and sheets of clear plastic, from case-geometry.js. Drawn here with
// this page's own plastic and lighting, and holding this page's disc.
export const W = CASE;
export const H = CASE;
const DISC_Z = -1.8; // the middle of the disc, where her tray holds it (its top at -1.2, 1.2mm thick)
const RAIL_TOP = 2.4; // the top of the tray's outer rail
const INNER_TOP = 1.4; // and of the rails round the disc
const LID_TOP = 5;

// --- the parts every case shares -----------------------------------------------------------

let parts = null;

function build() {
  const tray = trayGeometry();
  const lid = lidGeometry();
  // her rods (rails, ribs, clips, the hub, the knuckles) and sheets (the floor, the lid's face, the
  // clear middle of the disc), in this page's plastics
  const base = [
    { geometry: tray.rods, kind: 'rail', x: 0, y: 0, z: 0, rz: 0 },
    { geometry: tray.sheets, kind: 'clear', x: 0, y: 0, z: 0, rz: 0 },
  ];
  const lidParts = [
    { geometry: lid.rods, kind: 'wall', x: 0, y: 0, z: 0, rz: 0 },
    { geometry: lid.sheets, kind: 'clear', x: 0, y: 0, z: 0, rz: 0 },
  ];

  // where glints can catch: along the rails' tops, the lid's rim and the disc's edge
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
  perimeter(basePts, W / 2 - 3.3, H / 2 - 3.3, RAIL_TOP, 3.2);
  perimeter(lidPts, W / 2 - 1, H / 2 - 1, LID_TOP, 3.2);
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    basePts.push([Math.cos(a) * 59.6, Math.sin(a) * 59.6, DISC_Z + 0.6, Math.cos(a) * 0.4, Math.sin(a) * 0.4, 1]);
  }
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    for (let i = 0; i < 9; i++) basePts.push([sx * (36 + rand() * 27), sy * 63.4, INNER_TOP, 0, sy * 0.5, 1]);
    for (let i = 0; i < 9; i++) basePts.push([sx * 63.4, sy * (36 + rand() * 27), INNER_TOP, sx * 0.5, 0, 1]);
  }

  parts = {
    base,
    lid: lidParts,
    disc: {
      // her tray has the disc's clear middle as a sheet of its own; the disc is the ring round it
      face: new THREE.RingGeometry(15, 60, 160, 1),
      edge: new THREE.CylinderGeometry(60, 60, 1.2, 160, 1, true).rotateX(Math.PI / 2),
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
    for (const mesh of [label, data, new THREE.Mesh(parts.disc.edge, m.edge)]) {
      mesh.castShadow = true;
      disc.add(mesh);
    }

    // the pivot sits on her hinge line; the lid hangs off it to the right
    this.hinge = new THREE.Group();
    this.hinge.position.set(HINGE.x, 0, HINGE.z);
    this.group.add(this.hinge);
    const lid = new THREE.Group();
    lid.position.set(-HINGE.x, 0, -HINGE.z);
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
