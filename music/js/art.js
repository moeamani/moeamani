// The pictures: each song's artwork (from its tags, or drawn when it has none), the print it
// makes on the disc, and the little discs in the dock.

const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif';

// A disc is 120mm across; its print is drawn 1024px across.
export const DISC_PX = 1024;
const MM = DISC_PX / 120;
export const COVER_PX = 1000;

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Square artwork from any image: the middle of it, scaled to `size`.
export function squareFrom(image, size = COVER_PX) {
  const c = canvas(size);
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  const s = Math.min(w, h);
  c.getContext('2d').drawImage(image, (w - s) / 2, (h - s) / 2, s, s, 0, 0, size, size);
  return c;
}

// Artwork embedded in a song file, as a square JPEG ready to upload. Null if it won't decode.
export async function artworkBlob(picture) {
  try {
    const bitmap = await createImageBitmap(new Blob([picture.data], { type: picture.mime }));
    const c = squareFrom(bitmap, Math.min(COVER_PX, bitmap.width, bitmap.height));
    bitmap.close?.();
    return await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.9));
  } catch {
    return null;
  }
}

// A published song's artwork, as a canvas WebGL may read. Blob storage should allow that; if it
// doesn't, the same image comes through the site's own /api/art. Null if neither works.
export async function loadArtwork(url) {
  if (!url) return null;
  for (const src of [url, `/api/art?u=${encodeURIComponent(url)}`]) {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.src = src;
      await img.decode();
      return squareFrom(img, 1024);
    } catch {}
  }
  console.warn(`Couldn't load the artwork ${url}; drawing one instead.`);
  return null;
}

// --- artwork for songs that have none ------------------------------------------------------

const PALETTES = [
  ['#0b1730', '#2b4c8c', '#f2d7a1'],
  ['#2a1606', '#c47a1c', '#ffe3a3'],
  ['#3a0612', '#d23a55', '#ffd1da'],
  ['#120c2e', '#7b5cff', '#7ef0d8'],
  ['#0d2620', '#2f8f6b', '#e4f7a8'],
  ['#1c1c22', '#6b6f7a', '#f4f4f5'],
];

export function drawnArtwork(title, artist) {
  const S = 1024;
  const c = canvas(S);
  const ctx = c.getContext('2d');
  const seed = hash(title || 'untitled');
  const rand = seeded(seed);
  const [bg, mid, accent] = PALETTES[seed % PALETTES.length];
  const style = (seed >> 3) % 3;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);
  if (style === 0) {
    // holographic foil
    const hues = [0, 40, 70, 140, 190, 230, 280, 320, 360];
    for (let k = 0; k < 3; k++) {
      const g = ctx.createConicGradient(rand() * Math.PI * 2, 200 + rand() * 600, 200 + rand() * 600);
      hues.forEach((h, i) => g.addColorStop(i / (hues.length - 1), `hsla(${h + k * 25}, 90%, 72%, ${0.55 - k * 0.12})`));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    }
    glow(ctx, 512, 512, 520, accent, 0.35);
  } else if (style === 1) {
    // soft blooms
    for (let i = 0; i < 9; i++) glow(ctx, 160 + rand() * 700, 140 + rand() * 700, 200 + rand() * 260, i % 3 ? mid : accent, 0.6);
  } else {
    // a low sun over bands
    const g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, bg);
    g.addColorStop(1, mid);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    glow(ctx, 512, 560, 420, accent, 0.45);
    ctx.fillStyle = accent;
    circle(ctx, 512, 560, 210);
    ctx.fill();
    ctx.fillStyle = bg;
    for (let i = 0; i < 8; i++) ctx.fillRect(0, 590 + i * 30 + i * i * 2.2, S, 3 + i * 3);
  }
  grain(ctx, S, S, 12, rand);

  ctx.fillStyle = style === 0 ? bg : accent;
  ctx.font = `600 30px ${SANS}`;
  ctx.fillText(String(artist || '').toUpperCase(), 64, 100);
  const name = title || 'Untitled';
  ctx.font = `800 120px ${SANS}`;
  const w = ctx.measureText(name).width;
  const size = w > S - 128 ? Math.floor((120 * (S - 128)) / w) : 120;
  ctx.font = `800 ${size}px ${SANS}`;
  ctx.fillText(name, 60, S - 72);
  return c;
}

// --- the disc ------------------------------------------------------------------------------

// The artwork printed over the disc, from the clear middle to just inside the edge. The disc's
// shader trims it to 16.2-59.1mm from the middle; the print reaches a little past both, so the
// shader draws the edges.
export function discPrint(artwork) {
  const c = canvas(DISC_PX);
  if (!artwork) return c;
  const ctx = c.getContext('2d');
  const C = DISC_PX / 2;
  ctx.beginPath();
  ctx.arc(C, C, 59.7 * MM, 0, Math.PI * 2);
  ctx.arc(C, C, 15.8 * MM, 0, Math.PI * 2, true);
  ctx.clip();
  const d = 59.7 * 2 * MM;
  ctx.drawImage(artwork, C - d / 2, C - d / 2, d, d);
  return c;
}

// A small disc for the dock.
export function discThumb(print) {
  const S = 128;
  const c = canvas(S);
  const ctx = c.getContext('2d');
  const C = S / 2;
  const R = S / 2 - 2;
  const g = ctx.createRadialGradient(C * 0.7, C * 0.6, 4, C, C, R);
  g.addColorStop(0, '#f4f5f7');
  g.addColorStop(1, '#a9adb5');
  ctx.fillStyle = g;
  circle(ctx, C, C, R);
  ctx.fill();
  const rb = ctx.createConicGradient(-0.6, C, C);
  const spokes = ['#0000', '#ff4d6d55', '#ffd16655', '#5cf2a655', '#4dabff55', '#b06bff55', '#0000', '#0000', '#4dabff44', '#5cf2a644', '#ffd16644', '#0000', '#0000'];
  spokes.forEach((s, i) => rb.addColorStop(i / (spokes.length - 1), s));
  ctx.fillStyle = rb;
  circle(ctx, C, C, R);
  ctx.fill();
  if (print) ctx.drawImage(print, 2, 2, S - 4, S - 4);
  ctx.fillStyle = 'rgba(205,210,218,0.9)';
  circle(ctx, C, C, R * 0.28);
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  circle(ctx, C, C, R * 0.125);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(17,17,20,0.18)';
  ctx.lineWidth = 1;
  circle(ctx, C, C, R - 0.5);
  ctx.stroke();
  return c;
}

// --- helpers -------------------------------------------------------------------------------

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function glow(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function grain(ctx, w, h, amount, rand) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function seeded(seed) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
