import * as THREE from './three.js';
import { STUDIO_GLSL, studioUniforms } from './studio.js';

// The disc lies in its own XY plane, 120mm across, its label side facing +Z.

const vertex = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vViewPos;
  varying vec3 vNormal;
  varying vec3 vAxisX;
  varying vec3 vAxisY;

  void main() {
    vLocal = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    vNormal = normalize(normalMatrix * normal);
    // the disc's own axes in camera space, to rebuild radius and track direction per pixel
    vAxisX = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
    vAxisY = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  uniform sampler2D uPrint;
  uniform float uHasPrint;
  uniform vec3 uTint;     // colour of the metal
  uniform float uMirror;  // how much of the room the metal reflects
  uniform float uSatin;   // its soft, lit sheen
  uniform float uRainbow; // how strongly the track splits the light
  uniform float uVarnish; // how much of the rainbow shows through the print's gloss

  varying vec3 vLocal;
  varying vec3 vViewPos;
  varying vec3 vNormal;
  varying vec3 vAxisX;
  varying vec3 vAxisY;

  ${STUDIO_GLSL}

  float fresnel(float cosv, float f0) {
    return f0 + (1.0 - f0) * pow(1.0 - cosv, 5.0);
  }

  // a wavelength in nm as a colour: three overlapping humps, and a little red back in the violet
  float hump(float x, float c, float w) {
    float t = (x - c) / w;
    return max(1.0 - t * t, 0.0);
  }
  vec3 spectrum(float nm) {
    float x = (nm - 380.0) / 370.0;
    vec3 c = vec3(hump(x, 0.78, 0.25) + 0.4 * hump(x, 0.03, 0.1), hump(x, 0.5, 0.21), hump(x, 0.23, 0.19));
    return c * step(0.0, x) * step(x, 1.0);
  }

  // The track is a grating 1.6 microns a turn. Light from L reaches the eye at V when the part of
  // L + V across the track is a whole number of wavelengths over 1.6 microns; along the track there
  // is no grating, so only where that part is near zero. Each light draws a spoke through the centre.
  vec3 grating(vec3 L, vec3 V, vec3 radial, vec3 along, float spread) {
    vec3 S = L + V;
    float a = dot(S, along);
    float on = exp(-a * a / (spread * spread));
    float u = abs(dot(S, radial));
    vec3 c = spectrum(1600.0 * u) + 0.7 * spectrum(800.0 * u) + 0.45 * spectrum(533.3 * u);
    return c * on;
  }

  // the grooves tip the surface back and forth across the radius, so a light's highlight is
  // drawn out along the radius into a streak
  float streak(vec3 L, vec3 V, vec3 N, vec3 radial, vec3 along) {
    vec3 Hh = normalize(L + V);
    float a = dot(Hh, along) / 0.04;
    float r = dot(Hh, radial) / 0.45;
    return exp(-(a * a + r * r)) * step(0.0, dot(L, N));
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(-vViewPos);
    float cosv = clamp(dot(N, V), 0.0, 1.0);
    vec3 R = reflect(-V, N);
    vec2 p = vLocal.xy;
    float r = length(p);
    vec3 radial = normalize(vAxisX * p.x + vAxisY * p.y);
    vec3 along = normalize(vAxisY * p.x - vAxisX * p.y);

    vec3 room = min(studio(R), vec3(3.0));
    float lit = 0.62 + 0.38 * max(dot(N, uKey), 0.0);
    vec3 col = uTint * (room * uMirror + uSatin * lit);

    // the data only runs from 23mm to the outer edge
    float data = smoothstep(22.2, 23.2, r) * (1.0 - smoothstep(58.0, 58.6, r));
    vec3 rainbow = grating(uKey, V, radial, along, 0.07) * 1.5 +
      grating(uStrip, V, radial, along, 0.05) * 1.3 +
      grating(uTop, V, radial, along, 0.08) * 0.8 +
      grating(uBounce, V, radial, along, 0.18) * 0.3;
    col += rainbow * data * uRainbow * mix(vec3(1.0), uTint, 0.35);
    float sheen = streak(uKey, V, N, radial, along) * 0.9 + streak(uStrip, V, N, radial, along) * 0.7 +
      streak(uTop, V, N, radial, along) * 0.4;
    col += uTint * sheen * (uMirror + 0.1) * smoothstep(16.5, 18.5, r);

    // the stacking ring, moulded into the clear plastic just inside the metal
    col *= 1.0 - 0.4 * (1.0 - smoothstep(0.2, 0.55, abs(r - 18.0)));

    // the print: ink, lit by the room, under a lacquer that reflects it
    if (uHasPrint > 0.5) {
      vec4 ink = texture2D(uPrint, p / 120.0 + 0.5);
      float printed = ink.a;
      vec3 diffuse = vec3(0.5) + 0.55 * max(dot(N, uKey), 0.0) + 0.25 * max(dot(N, uStrip), 0.0) +
        0.15 * max(dot(N, uTop), 0.0);
      col = mix(col, ink.rgb * diffuse, printed);
      col += room * fresnel(cosv, 0.04) * printed * 0.7;
      // a glossy print still lets a little of the rainbow through
      col += rainbow * data * printed * uVarnish;
    }

    // the last millimetre is bare plastic over the metal's edge
    float rim = smoothstep(58.4, 59.2, r);
    col = mix(col, vec3(0.62, 0.64, 0.67) * 0.6 + room * 0.25, rim * 0.8);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const METALS = {
  silver: { tint: [0.92, 0.94, 0.97], mirror: 0.42, satin: 0.42, rainbow: 1.0 },
  gold: { tint: [1.0, 0.72, 0.3], mirror: 0.5, satin: 0.36, rainbow: 0.75 },
  black: { tint: [1.0, 1.0, 1.0], mirror: 0.06, satin: 0.01, rainbow: 0.7 },
};

// `printed`: the label side, which carries the print; otherwise the bare data side.
export function discMaterial(printed) {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      ...studioUniforms(),
      uPrint: { value: null },
      uHasPrint: { value: 0 },
      uTint: { value: new THREE.Color(...METALS.silver.tint) },
      uMirror: { value: METALS.silver.mirror },
      uSatin: { value: METALS.silver.satin },
      uRainbow: { value: METALS.silver.rainbow },
      uVarnish: { value: 0.22 },
    },
    userData: { printed },
  });
}

export function setDisc(material, metal, print) {
  const m = METALS[metal] || METALS.silver;
  const u = material.uniforms;
  u.uTint.value.setRGB(...m.tint);
  u.uMirror.value = m.mirror;
  u.uSatin.value = m.satin;
  u.uRainbow.value = m.rainbow;
  u.uPrint.value = material.userData.printed ? print : null;
  u.uHasPrint.value = material.userData.printed && print ? 1 : 0;
}
