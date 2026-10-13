import * as THREE from './three.js';
import { studioUniforms } from './studio.js';

// Glints on the plastic: tiny facets that flash a four-pointed star when one of the studio's
// lights mirrors in them, so they twinkle as the case moves.

const vertex = /* glsl */ `
  attribute vec3 facet;
  uniform vec3 uKey;
  uniform vec3 uStrip;
  uniform vec3 uTop;
  uniform float uSize;
  varying float vGlint;

  float flash(vec3 L, vec3 n, vec3 V) {
    return pow(max(dot(reflect(-L, n), V), 0.0), 140.0);
  }

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * facet);
    vec3 V = normalize(-mv.xyz);
    float g = flash(uKey, n, V) + flash(uStrip, n, V) * 0.8 + flash(uTop, n, V) * 0.6;
    vGlint = min(g, 1.5);
    gl_PointSize = vGlint > 0.02 ? uSize * (0.35 + vGlint) : 0.0;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  varying float vGlint;

  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    // two thin rays crossing, and a soft core
    float rays = exp(-abs(c.x) * 26.0) * (1.0 - smoothstep(0.0, 1.0, abs(c.y))) +
      exp(-abs(c.y) * 26.0) * (1.0 - smoothstep(0.0, 1.0, abs(c.x)));
    float core = exp(-dot(c, c) * 14.0);
    float s = (rays * 0.9 + core) * vGlint;
    if (s < 0.01) discard;
    gl_FragColor = vec4(vec3(s), 1.0);
  }
`;

export function sparkleMaterial(pixelRatio) {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: { ...studioUniforms(), uSize: { value: 34 * pixelRatio } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// Points with a facet each, tipped at random up to `tilt` radians off `normal`.
export function sparkleGeometry(points, rand, tilt = 0.75) {
  const pos = new Float32Array(points.length * 3);
  const facets = new Float32Array(points.length * 3);
  const n = new THREE.Vector3();
  points.forEach(([x, y, z, nx = 0, ny = 0, nz = 1], i) => {
    pos.set([x, y, z], i * 3);
    n.set(nx + (rand() * 2 - 1) * tilt, ny + (rand() * 2 - 1) * tilt, nz + (rand() * 2 - 1) * tilt * 0.3).normalize();
    facets.set([n.x, n.y, n.z], i * 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('facet', new THREE.BufferAttribute(facets, 3));
  return g;
}
