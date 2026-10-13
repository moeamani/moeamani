import * as THREE from './three.js';
import { ROD_FRAG, ROD_VERT, ROOM_BAKE_FRAG, SCREEN_VERT, SHEET_FRAG, SHEET_VERT } from './shaders.js';

// Ann Nguyen's plastic, for the case's rods and sheets: her shaders (shaders.js) with her numbers.

const IOR = 1.59;
const ABSORB = [0.0042, 0.003, 0.0026];
const ROOM_SIZE = 512;

// her studio, baked once into a cube every rod looks into; shared by every material
const room = { value: null };

// Bake the studio. Needs the renderer, so the stage calls it before building any case.
export function bakeStudio(renderer) {
  if (room.value) return;
  const ext = renderer.extensions;
  const hdr = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
  const target = new THREE.WebGLCubeRenderTarget(ROOM_SIZE, {
    type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
  const material = new THREE.ShaderMaterial({
    uniforms: { uFace: { value: 0 }, uSize: { value: ROOM_SIZE } },
    vertexShader: SCREEN_VERT,
    fragmentShader: ROOM_BAKE_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene().add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const before = renderer.getRenderTarget();
  for (let face = 0; face < 6; face++) {
    material.uniforms.uFace.value = face;
    renderer.setRenderTarget(target, face);
    renderer.render(scene, camera);
  }
  renderer.setRenderTarget(before);
  material.dispose();
  quad.geometry.dispose();
  room.value = target.texture;
}

// A rod (rail, rib, clip, hinge knuckle): light refracted in, bounced about inside its profile and
// out again into the studio. Solid, so the page draws it with the disc, in order, every time.
export function rodMaterial({ samples = 2 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uRoom: room,
      uRoomSize: { value: ROOM_SIZE },
      uIor: { value: IOR },
      uSamples: { value: samples },
      uAbsorb: { value: new THREE.Vector3(...ABSORB) },
    },
    vertexShader: ROD_VERT,
    fragmentShader: ROD_FRAG,
  });
}

// A sheet (the tray's floor, the lid's face): almost nothing face on, the studio at a slant.
export function sheetMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uRoom: room,
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
}
