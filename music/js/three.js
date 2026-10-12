// three.js, from one place. Imported by its full address rather than through an import map, so
// browsers without import maps (Safari before 16.4) can load it; and 0.170, the last release that
// older Safari can still read (later ones use static class blocks, Safari 16.4+). The case's
// shaders are all its own, so it draws exactly as it does with the release its author used.
export * from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';
