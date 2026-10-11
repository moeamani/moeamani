import * as THREE from 'three';
import { discMaterial, setDisc } from './disc-material.js';
import { plasticMaterial } from './plastic-material.js';

// A standard jewel case, in millimetres: 142 wide, 125 tall, 10.4 deep, centred on the origin.
// Its lid hinges on the left edge.
export const W = 142;
export const H = 125;
const D = 10.4;
const HINGE_Z = 2.2;
const DISC_Z = -0.7;

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

// A rounded slab `t` thick from z = 0 up, its edges softened by a small bevel. With `inner` it's a
// frame: a wall of that inside size.
function slab(w, h, r, t, inner = null, bevel = 0.3) {
  const b = bevel;
  const shape = roundedRect(new THREE.Shape(), w - 2 * b, h - 2 * b, Math.max(r - b, 0.2));
  if (inner) shape.holes.push(roundedRect(new THREE.Path(), inner[0] + 2 * b, inner[1] + 2 * b, inner[2]));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(t - 2 * b, 0.01),
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments: 10,
  });
  g.translate(0, 0, b);
  return g;
}

function lathe(points, segments = 96) {
  const g = new THREE.LatheGeometry(points.map(([r, z]) => new THREE.Vector2(r, z)), segments);
  g.rotateX(Math.PI / 2); // lathe round Z, not Y
  return g;
}

const TRAYS = {
  black: () =>
    new THREE.MeshPhysicalMaterial({ color: 0x0c0c0e, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }),
  clear: () => plasticMaterial(),
  smoke: () => plasticMaterial({ tint: [0.05, 0.05, 0.06], density: 0.22 }),
  rose: () => plasticMaterial({ tint: [0.95, 0.42, 0.55], density: 0.16 }),
};

export class JewelCase {
  constructor() {
    this.group = new THREE.Group();
    this.clear = plasticMaterial();
    this.paper = () => new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0, envMapIntensity: 0.95 });
    this.trays = {};
    this.textures = [];

    this.#buildBase();
    this.#buildDisc();
    this.#buildLid();

    this.group.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
  }

  #mesh(geometry, material, parent) {
    const m = new THREE.Mesh(geometry, material);
    parent.add(m);
    return m;
  }

  #buildBase() {
    const base = new THREE.Group();
    this.group.add(base);
    const z0 = -D / 2;

    // the clear back and the walls round it
    this.#mesh(slab(W, H, 2.4, 1.1), this.clear, base).position.z = z0;
    this.#mesh(slab(W - 1, H - 1, 2.2, 7.2, [W - 3.6, H - 3.6, 1]), this.clear, base).position.z = z0;

    // the tray card: its back seen through the case's back, its inside behind a clear tray,
    // and its two spines folded up inside the side walls
    const card = new THREE.PlaneGeometry(W - 4, H - 6);
    this.cardBack = this.#mesh(card, this.paper(), base);
    this.cardBack.position.z = z0 + 1.2;
    this.cardBack.rotation.y = Math.PI;
    this.cardInside = this.#mesh(card, this.paper(), base);
    this.cardInside.position.z = z0 + 1.25;
    const spineGeo = new THREE.PlaneGeometry(H - 6, 6.5);
    this.spines = [-1, 1].map((side) => {
      const s = this.#mesh(spineGeo, this.paper(), base);
      s.position.set(side * (W / 2 - 1.9), 0, z0 + 1.2 + 3.25);
      // face outwards, reading top to bottom
      s.rotation.set(0, side * Math.PI / 2, -Math.PI / 2);
      return s;
    });

    // the tray: a plate with a lip round the disc, ribs in the corners and the hub in the middle
    this.trayParts = [];
    const tray = this.#mesh(slab(W - 4.2, H - 4.4, 1.2, 1.6), this.clear, base);
    tray.position.z = z0 + 1.5;
    this.trayParts.push(tray);
    const trayTop = z0 + 3.1;
    const lip = this.#mesh(lathe([[60.75, 0], [60.75, 0.7], [60.25, 0.7], [60.25, 0]], 128), this.clear, base);
    lip.position.z = trayTop;
    this.trayParts.push(lip);
    const rib = new THREE.BoxGeometry(1.1, 17, 1.4);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const v = this.#mesh(rib, this.clear, base);
        v.position.set(sx * 64.5, sy * 47, trayTop + 0.7);
        const h = this.#mesh(rib, this.clear, base);
        h.rotation.z = Math.PI / 2;
        h.position.set(sx * 56.5, sy * 55, trayTop + 0.7);
        this.trayParts.push(v, h);
      }
    }
    const hubTop = DISC_Z + 1.4;
    const hub = this.#mesh(
      lathe([
        [16.4, trayTop],
        [16.4, DISC_Z - 1.0],
        [15.6, DISC_Z - 0.6],
        [7.3, DISC_Z - 0.6],
        [7.3, hubTop - 1.2],
        [6.4, hubTop - 0.4],
        [5.4, hubTop],
        [0.01, hubTop],
      ]),
      this.clear,
      base,
    );
    this.trayParts.push(hub);
    // the teeth that grip the disc
    const tooth = new THREE.BoxGeometry(2.2, 1.1, hubTop - DISC_Z + 0.4);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const t = this.#mesh(tooth, this.clear, base);
      t.position.set(Math.cos(a) * 5.6, Math.sin(a) * 5.6, (hubTop + DISC_Z) / 2);
      t.rotation.z = a;
      this.trayParts.push(t);
    }

    // the hinge knuckles at the top and bottom of the left edge
    const knuckle = new THREE.CylinderGeometry(1.7, 1.7, 9, 24);
    for (const sy of [-1, 1]) {
      const k = this.#mesh(knuckle, this.clear, base);
      k.position.set(-W / 2 + 0.6, sy * (H / 2 - 6), HINGE_Z);
    }
  }

  #buildDisc() {
    const disc = new THREE.Group();
    disc.position.z = DISC_Z;
    this.group.add(disc);
    this.disc = disc;

    // metal from 16.5mm out; clear plastic inside it, round a 15mm hole
    const face = new THREE.RingGeometry(16.5, 60, 160, 1);
    this.labelSide = discMaterial(true);
    this.dataSide = discMaterial(false);
    this.#mesh(face, this.labelSide, disc).position.z = 0.6;
    const back = this.#mesh(face, this.dataSide, disc);
    back.position.z = -0.6;
    back.rotation.y = Math.PI;
    const edge = new THREE.CylinderGeometry(60, 60, 1.2, 160, 1, true);
    edge.rotateX(Math.PI / 2);
    this.#mesh(edge, new THREE.MeshStandardMaterial({ color: 0x9a9da3, metalness: 0.6, roughness: 0.25 }), disc);
    this.#mesh(lathe([[7.5, -0.6], [16.5, -0.6], [16.5, 0.6], [7.5, 0.6], [7.5, -0.6]], 96), this.clear, disc);
  }

  #buildLid() {
    // the pivot sits on the hinge line; the lid hangs off it to the right
    this.hinge = new THREE.Group();
    this.hinge.position.set(-W / 2, 0, HINGE_Z);
    this.group.add(this.hinge);
    const lid = new THREE.Group();
    lid.position.set(W / 2, 0, -HINGE_Z);
    this.hinge.add(lid);
    this.lid = lid;

    const top = D / 2;
    this.#mesh(slab(W, H, 2.6, 1.1), this.clear, lid).position.z = top - 1.1;
    this.#mesh(slab(W, H, 2.6, 2.4, [W - 2.6, H - 2.6, 1.4]), this.clear, lid).position.z = HINGE_Z;

    // the booklet, its cover up against the lid, held by four tabs
    const page = new THREE.PlaneGeometry(120.5, 120.5);
    this.cover = this.#mesh(page, this.paper(), lid);
    this.cover.position.set(0, 0, top - 1.2);
    this.inside = this.#mesh(page, this.paper(), lid);
    this.inside.position.set(0, 0, top - 1.35);
    this.inside.rotation.y = Math.PI;
    const tab = new THREE.BoxGeometry(7, 2.2, 1.2);
    for (const [x, y] of [[-50, 60.2], [52, 60.2], [-50, -60.2], [52, -60.2]]) {
      this.#mesh(tab, this.clear, lid).position.set(x, y, top - 1.95);
    }
  }

  // The lid's angle in radians: 0 shut, about PI lying open to the left.
  set openAngle(a) {
    this.hinge.rotation.y = -a;
  }

  set discAngle(a) {
    this.disc.rotation.z = a;
  }

  // Dress the case for a release: textures come from art.js canvases.
  dress(release, art) {
    for (const t of this.textures) t.dispose();
    this.textures = [];
    const made = new Map();
    const tex = (canvas) => {
      if (made.has(canvas)) return made.get(canvas);
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      this.textures.push(t);
      made.set(canvas, t);
      return t;
    };
    const paint = (mesh, canvas) => {
      mesh.material.map = tex(canvas);
      mesh.material.needsUpdate = true;
    };
    paint(this.cover, art.cover);
    paint(this.inside, art.inside);
    paint(this.cardBack, art.back);
    paint(this.cardInside, art.cover);
    const spine = tex(art.spine);
    for (const s of this.spines) {
      s.material.map = spine;
      s.material.needsUpdate = true;
    }

    const print = tex(art.print);
    setDisc(this.labelSide, release.disc, print);
    setDisc(this.dataSide, release.disc, null);

    const kind = TRAYS[release.tray] ? release.tray : 'black';
    this.trays[kind] ||= TRAYS[kind]();
    for (const part of this.trayParts) part.material = this.trays[kind];
  }
}
