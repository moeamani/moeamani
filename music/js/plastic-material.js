import * as THREE from './three.js';
import { STUDIO_GLSL, studioUniforms } from './studio.js';

// Clear polystyrene, drawn over what's behind it rather than refracting it, so the cover under
// the lid stays sharp. Face on, a sheet takes almost nothing away; at a slant it turns to a mirror
// of the room, which is what draws the case's edges.

const vertex = /* glsl */ `
  varying vec3 vViewPos;
  varying vec3 vNormal;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uTint;      // the colour it takes on where it's thick
  uniform float uDensity;  // how much it absorbs, per millimetre
  uniform float uOpacity;
  uniform float uChrome;   // thick plastic mirrors the room even face on, like chrome
  uniform float uEdge;     // how far round a curved edge the mirroring reaches: lower is wider

  varying vec3 vViewPos;
  varying vec3 vNormal;

  ${STUDIO_GLSL}

  float fresnel(float cosv) {
    return 0.04 + 0.96 * pow(1.0 - cosv, uEdge);
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(-vViewPos);
    if (!gl_FrontFacing) N = -N;
    float cosv = clamp(abs(dot(N, V)), 0.0, 1.0);

    // a sheet has two faces, and the far one reflects too, seen once through the near
    float F = fresnel(cosv);
    float F2 = F + (1.0 - F) * (1.0 - F) * F;
    float slant = max(F2 - 0.0769, 0.0); // 0.0769: the same, face on

    vec3 room = studio(reflect(-V, N));
    // the room shows at a slant; face on, only the bright lights do
    float shine = max(slant, uChrome);
    vec3 mirror = room * shine + max(room - vec3(0.8), 0.0) * 0.075;

    // what it absorbs on the way through, more at a slant where the path is longer
    float cosT = sqrt(1.0 - (1.0 - cosv * cosv) / 2.25);
    float absorbed = 1.0 - exp(-uDensity * 1.4 / max(cosT, 0.2));

    float takes = clamp(shine * 0.92 + 0.004 + absorbed, 0.0, 1.0) * uOpacity;
    vec3 col = (mirror + uTint * absorbed) * uOpacity;

    // Written as is, not converted to sRGB: this is light added over what's already on screen,
    // and converting would lift every faint reflection into a haze across the whole case.
    gl_FragColor = vec4(col, takes);
  }
`;

export function plasticMaterial({ tint = [0.9, 0.93, 0.96], density = 0.006, chrome = 0, edge = 5 } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      ...studioUniforms(),
      uTint: { value: new THREE.Color(...tint) },
      uDensity: { value: density },
      uOpacity: { value: 1 },
      uChrome: { value: chrome },
      uEdge: { value: edge },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    // premultiplied: the plastic adds its reflections and takes away what it absorbs
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
}
