import * as THREE from 'three';

// The studio the case is shot in. The camera never turns, so these directions hold in both world
// and camera space: the plastic sees them through the environment map, the disc's shader reads
// them directly to draw its rainbow.
export const LIGHTS = {
  key: new THREE.Vector3(-0.55, 0.6, 0.58).normalize(), // a big softbox up and to the left
  strip: new THREE.Vector3(0.9, 0.1, 0.42).normalize(), // a tall strip light on the right
  top: new THREE.Vector3(0.1, 0.95, 0.3).normalize(), // overhead
  bounce: new THREE.Vector3(0.05, -0.7, 0.7).normalize(), // a white card below the camera
};

// The same room as GLSL, for the disc: a grey room lighter overhead, and its lights.
export const STUDIO_GLSL = /* glsl */ `
  uniform vec3 uKey;
  uniform vec3 uStrip;
  uniform vec3 uTop;
  uniform vec3 uBounce;

  float softbox(vec3 R, vec3 dir, float size, float soft) {
    return smoothstep(cos(size + soft), cos(size), dot(R, dir));
  }

  // tall and narrow: tight from side to side, long up and down
  float striplight(vec3 R, vec3 dir) {
    vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), dir));
    float across = abs(dot(R, side));
    float up = abs(R.y - dir.y);
    return smoothstep(0.13, 0.06, across) * smoothstep(0.8, 0.55, up) * step(0.0, dot(R, dir));
  }

  vec3 studio(vec3 R) {
    vec3 c = mix(vec3(0.07, 0.075, 0.085), vec3(0.55, 0.57, 0.6), smoothstep(-0.6, 0.85, R.y));
    c += vec3(4.0) * softbox(R, uKey, 0.3, 0.14);
    c += vec3(3.2, 3.25, 3.4) * striplight(R, uStrip);
    c += vec3(1.8) * softbox(R, uTop, 0.32, 0.22);
    c += vec3(0.7) * softbox(R, uBounce, 0.5, 0.35);
    return c;
  }
`;

export function studioUniforms() {
  return {
    uKey: { value: LIGHTS.key },
    uStrip: { value: LIGHTS.strip },
    uTop: { value: LIGHTS.top },
    uBounce: { value: LIGHTS.bounce },
  };
}

// The room built for real and baked into an environment map, which is what the plastic,
// the tray and the paper reflect.
export function studioEnvironment(renderer) {
  const scene = new THREE.Scene();

  const room = new THREE.SphereGeometry(20, 48, 24);
  const colors = [];
  const pos = room.attributes.position;
  const low = new THREE.Color(0.07, 0.075, 0.085);
  const high = new THREE.Color(0.55, 0.57, 0.6);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 20;
    const t = THREE.MathUtils.smoothstep(y, -0.6, 0.85);
    c.copy(low).lerp(high, t);
    colors.push(c.r, c.g, c.b);
  }
  room.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  scene.add(new THREE.Mesh(room, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

  const panel = (dir, w, h, intensity) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(intensity), side: THREE.DoubleSide }),
    );
    m.position.copy(dir).multiplyScalar(12);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  panel(LIGHTS.key, 7, 7, 4);
  panel(LIGHTS.strip, 2, 14, 3.2);
  panel(LIGHTS.top, 8, 8, 1.8);
  panel(LIGHTS.bounce, 12, 8, 0.7);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();
  scene.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  return target.texture;
}
