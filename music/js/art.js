// Everything printed in the case is drawn here on 2D canvases: the cover (generated when a
// release has no image), the booklet's inside page, the tray card behind the tray and its spine,
// the print on the disc and the little discs in the dock.

const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif';
const SERIF = 'ui-serif, "New York", "Iowan Old Style", Georgia, serif';

// A disc is 120mm across; its print is drawn 1024px across.
export const DISC_PX = 1024;
const MM = DISC_PX / 120;

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// The cover: the release's image if it loads, otherwise one drawn from its palette.
export async function loadCover(release, artist) {
  if (release.cover) {
    try {
      const img = new Image();
      img.decoding = 'async';
      // a cover on another site has to allow it, or WebGL can't use it: fall back to a drawn one
      img.crossOrigin = 'anonymous';
      img.src = release.cover;
      await img.decode();
      const c = canvas(1024);
      const ctx = c.getContext('2d');
      // crop to a centred square, whatever shape the file is
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 1024, 1024);
      c.generated = false;
      return c;
    } catch {
      console.warn(`Couldn't load the cover "${release.cover}" for "${release.title}", drawing one instead.`);
    }
  }
  const c = generateCover(release, artist);
  c.generated = true;
  return c;
}

// --- generated covers -------------------------------------------------------------------------

function generateCover(release, artist) {
  const S = 1024;
  const c = canvas(S);
  const ctx = c.getContext('2d');
  const [bg, mid, accent] = release.palette || ['#111114', '#55565c', '#f4f4f5'];
  const style = release.art || ['waves', 'sun', 'bloom', 'swirl'][hash(release.id || release.title) % 4];
  const rand = seeded(hash(release.id || release.title));

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);

  if (style === 'waves') {
    const sky = ctx.createLinearGradient(0, 0, 0, S);
    sky.addColorStop(0, bg);
    sky.addColorStop(0.55, mid);
    sky.addColorStop(0.56, bg);
    sky.addColorStop(1, mix(bg, mid, 0.35));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, S, S);
    glow(ctx, 700, 300, 260, accent, 0.35);
    ctx.fillStyle = accent;
    circle(ctx, 700, 300, 96);
    ctx.fill();
    // the moon broken up on the water
    for (let i = 0; i < 26; i++) {
      const y = 590 + i * 16 + i * i * 0.4;
      const w = (140 - i * 3) * (0.6 + rand() * 0.8);
      ctx.globalAlpha = 0.75 - i * 0.025;
      ctx.fillRect(700 - w / 2 + (rand() - 0.5) * 40, y, w, 3 + i * 0.25);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = rgba(accent, 0.18);
    ctx.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      const y = 600 + i * 24;
      ctx.beginPath();
      for (let x = 0; x <= S; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.012 + i * 1.7) * (4 + i * 0.6));
      ctx.stroke();
    }
  } else if (style === 'sun') {
    const g = ctx.createRadialGradient(512, 560, 40, 512, 560, 760);
    g.addColorStop(0, mix(mid, accent, 0.4));
    g.addColorStop(0.5, mid);
    g.addColorStop(1, bg);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    glow(ctx, 512, 520, 420, accent, 0.4);
    const sun = ctx.createLinearGradient(0, 280, 0, 760);
    sun.addColorStop(0, '#fff6dc');
    sun.addColorStop(1, accent);
    ctx.fillStyle = sun;
    circle(ctx, 512, 520, 240);
    ctx.fill();
    // a retro sunset: bands cut through the lower half, widening as they fall
    ctx.fillStyle = mix(bg, mid, 0.55);
    for (let i = 0; i < 8; i++) {
      const y = 540 + i * 30 + i * i * 2.2;
      ctx.fillRect(0, y, S, 3 + i * 3.2);
    }
  } else if (style === 'bloom') {
    for (let i = 0; i < 9; i++) {
      const x = 180 + rand() * 660;
      const y = 140 + rand() * 600;
      glow(ctx, x, y, 200 + rand() * 260, i % 3 === 0 ? accent : mid, 0.55 + rand() * 0.3);
    }
    // petals round a centre
    ctx.save();
    ctx.translate(512, 450);
    for (let i = 0; i < 12; i++) {
      ctx.rotate((Math.PI * 2) / 12);
      ctx.beginPath();
      ctx.ellipse(0, -120, 46, 120, 0, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(accent, 0.55);
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = rgba(accent, 0.9);
    circle(ctx, 512, 450, 22);
    ctx.fill();
  } else {
    // holographic foil: layered sweeps of the spectrum, then fine ridges
    const hues = [0, 40, 70, 140, 190, 230, 280, 320, 360];
    for (let k = 0; k < 3; k++) {
      const g = ctx.createConicGradient(rand() * Math.PI * 2, 200 + rand() * 600, 200 + rand() * 600);
      hues.forEach((h, i) => g.addColorStop(i / (hues.length - 1), `hsla(${h + k * 25}, 90%, 72%, ${0.55 - k * 0.12})`));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    }
    glow(ctx, 512, 512, 520, accent, 0.35);
    glow(ctx, 300, 760, 360, mid, 0.6);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let r = 20; r < 900; r += 14) {
      ctx.beginPath();
      ctx.ellipse(512, 512, r, r * 0.62, 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  grain(ctx, S, S, 14, rand);

  // the type
  const ink = style === 'swirl' ? bg : accent;
  ctx.fillStyle = ink;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 30px ${SANS}`;
  spaced(ctx, artist.name.toUpperCase(), 64, 96, 6);
  const title = release.title;
  const size = fitFont(ctx, title, S - 128, 132, (s) => `800 ${s}px ${SANS}`);
  ctx.font = `800 ${size}px ${SANS}`;
  ctx.fillText(title, 60, S - 70);
  ctx.font = `500 26px ${SANS}`;
  ctx.textAlign = 'right';
  ctx.globalAlpha = 0.8;
  ctx.fillText(`${release.type || ''} ${release.year || ''}`.trim(), S - 64, 96);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
  return c;
}

// --- the booklet's inside page ---------------------------------------------------------------

export function bookletInside(release, artist) {
  const S = 1024;
  const c = canvas(S);
  const ctx = c.getContext('2d');
  const [bg, mid, accent] = release.palette || ['#111114', '#55565c', '#f4f4f5'];
  const rand = seeded(hash(release.title) + 7);
  ctx.fillStyle = '#f7f5f0';
  ctx.fillRect(0, 0, S, S);
  // a band of the release's colour down the fold
  const band = ctx.createLinearGradient(0, 0, 0, S);
  band.addColorStop(0, bg);
  band.addColorStop(1, mid);
  ctx.fillStyle = band;
  ctx.fillRect(S - 56, 0, 56, S);

  const ink = '#16161a';
  const left = 84;
  const right = S - 140;
  ctx.fillStyle = ink;
  ctx.font = `600 22px ${SANS}`;
  ctx.globalAlpha = 0.5;
  spaced(ctx, `${artist.name}`.toUpperCase(), left, 112, 5);
  ctx.globalAlpha = 1;
  const tsize = fitFont(ctx, release.title, right - left, 86, (s) => `italic 400 ${s}px ${SERIF}`);
  ctx.font = `italic 400 ${tsize}px ${SERIF}`;
  ctx.fillText(release.title, left - 4, 200);

  const tracks = release.tracks || [];
  const rowH = Math.min(64, 520 / Math.max(tracks.length, 1));
  const fs = Math.round(Math.min(34, rowH * 0.56));
  let y = 300;
  ctx.strokeStyle = 'rgba(22,22,26,0.14)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left, y - rowH * 0.62);
  ctx.lineTo(right, y - rowH * 0.62);
  ctx.stroke();
  tracks.forEach(([name, len], i) => {
    const yy = y + i * rowH;
    ctx.font = `500 ${fs * 0.7}px ${SANS}`;
    ctx.fillStyle = mix(mid, ink, 0.25);
    ctx.fillText(String(i + 1).padStart(2, '0'), left, yy);
    ctx.font = `500 ${fs}px ${SANS}`;
    ctx.fillStyle = ink;
    const nameX = left + 64;
    ctx.fillText(ellipsize(ctx, name, right - nameX - 110), nameX, yy);
    if (len) {
      ctx.textAlign = 'right';
      ctx.globalAlpha = 0.55;
      ctx.fillText(len, right, yy);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }
    ctx.beginPath();
    ctx.moveTo(left, yy + rowH * 0.38);
    ctx.lineTo(right, yy + rowH * 0.38);
    ctx.stroke();
  });

  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.6;
  ctx.font = `400 22px ${SANS}`;
  const credits = [release.credits, `℗ ${release.year || ''} ${artist.name}`.replace(/\s+/g, ' ').trim()].filter(Boolean);
  wrap(ctx, credits.join('  ·  '), left, S - 120, right - left, 32);
  ctx.globalAlpha = 1;
  grain(ctx, S, S, 6, rand);
  return c;
}

// --- the tray card: the back, and the spine ------------------------------------------------

// The back is 138 x 118mm, drawn 1024px wide.
export function trayBack(release, artist, cover) {
  const W = 1024;
  const H = Math.round((W * 118) / 138);
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const [bg, mid, accent] = release.palette || ['#111114', '#55565c', '#f4f4f5'];
  const rand = seeded(hash(release.title) + 13);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // the cover, blown up and faded, as a backdrop
  ctx.globalAlpha = 0.28;
  ctx.drawImage(cover, -W * 0.25, -H * 0.4, W * 1.5, W * 1.5);
  ctx.globalAlpha = 1;
  const shade = ctx.createLinearGradient(0, 0, W, 0);
  shade.addColorStop(0, rgba(bg, 0.92));
  shade.addColorStop(1, rgba(bg, 0.55));
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  const left = 96;
  ctx.fillStyle = accent;
  ctx.font = `600 22px ${SANS}`;
  spaced(ctx, artist.name.toUpperCase(), left, 104, 5);
  ctx.font = `800 54px ${SANS}`;
  ctx.fillText(ellipsize(ctx, release.title, W - 2 * left), left, 168);

  const tracks = release.tracks || [];
  const rowH = Math.min(46, 440 / Math.max(tracks.length, 1));
  ctx.font = `500 ${Math.round(rowH * 0.56)}px ${SANS}`;
  tracks.forEach(([name, len], i) => {
    const y = 250 + i * rowH;
    ctx.globalAlpha = 0.55;
    ctx.fillText(String(i + 1).padStart(2, '0'), left, y);
    ctx.globalAlpha = 0.95;
    ctx.fillText(ellipsize(ctx, name, 520), left + 54, y);
    if (len) {
      ctx.globalAlpha = 0.55;
      ctx.fillText(len, left + 600, y);
    }
  });
  ctx.globalAlpha = 1;

  // a barcode and the small print
  const bx = W - 300;
  const by = H - 170;
  ctx.fillStyle = '#fff';
  ctx.fillRect(bx - 18, by - 18, 236, 120);
  ctx.fillStyle = '#111';
  let x = bx;
  while (x < bx + 200) {
    const w = 1 + Math.floor(rand() * 4);
    if (rand() > 0.4) ctx.fillRect(x, by, w, 70);
    x += w + 1;
  }
  ctx.font = `500 15px ${SANS}`;
  ctx.fillText('0 ' + String(hash(release.title)).padStart(11, '0').slice(0, 11), bx, by + 92);
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.6;
  ctx.font = `400 17px ${SANS}`;
  ctx.fillText(`℗ & © ${release.year || ''} ${artist.name}. All rights reserved.`, left, H - 72);
  ctx.globalAlpha = 1;
  grain(ctx, W, H, 8, rand);
  return c;
}

// The spine reads along its length; drawn 1024 x 56 for a 118 x 6.5mm strip.
export function spine(release, artist) {
  const W = 1024;
  const H = 56;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const [bg, mid, accent] = release.palette || ['#111114', '#55565c', '#f4f4f5'];
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent;
  ctx.textBaseline = 'middle';
  ctx.font = `700 28px ${SANS}`;
  ctx.fillText(artist.name.toUpperCase(), 40, H / 2 + 1);
  const aw = ctx.measureText(artist.name.toUpperCase()).width;
  ctx.font = `400 28px ${SANS}`;
  ctx.globalAlpha = 0.85;
  ctx.fillText(release.title, 40 + aw + 24, H / 2 + 1);
  ctx.textAlign = 'right';
  ctx.globalAlpha = 0.6;
  ctx.font = `500 22px ${SANS}`;
  ctx.fillText(String(release.year || ''), W - 40, H / 2 + 1);
  return c;
}

// --- the disc ------------------------------------------------------------------------------

// What's printed on the disc's label side; transparent where the bare disc shows.
export function discPrint(release, artist, cover) {
  const c = canvas(DISC_PX);
  const ctx = c.getContext('2d');
  const C = DISC_PX / 2;
  const [bg, mid, accent] = release.palette || ['#111114', '#55565c', '#f4f4f5'];
  const metal = release.disc || 'silver';
  const ink = metal === 'black' ? accent : metal === 'gold' ? mix(bg, '#000', 0.4) : bg;
  const mode = release.print || 'label';

  if (mode === 'picture' || mode === 'ring') {
    const outer = mode === 'picture' ? 58.4 : 39;
    ctx.save();
    ctx.beginPath();
    ctx.arc(C, C, outer * MM, 0, Math.PI * 2);
    ctx.arc(C, C, 17.2 * MM, 0, Math.PI * 2, true);
    ctx.clip();
    // the cover, sized so its square just covers the printed circle
    const d = outer * 2 * MM;
    ctx.drawImage(cover, C - d / 2, C - d / 2, d, d);
    ctx.restore();
    if (mode === 'ring') {
      ctx.strokeStyle = ink;
      ctx.lineWidth = 0.5 * MM;
      ctx.beginPath();
      ctx.arc(C, C, outer * MM, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.font = `700 ${3.4 * MM}px ${SANS}`;
      arcText(ctx, `${artist.name.toUpperCase()}  ·  ${release.title.toUpperCase()}`, C, C, 43.5 * MM, -Math.PI / 2, 0.6 * MM);
      ctx.font = `400 ${2.2 * MM}px ${SANS}`;
      arcText(ctx, `℗ ${release.year || ''} ${artist.name}`, C, C, 45 * MM, Math.PI / 2, 0.3 * MM, true);
    }
    return c;
  }

  // a label disc: type only, the bare disc all round it
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const tsize = fitFont(ctx, release.title, 64 * MM, 10 * MM, (s) => `800 ${s}px ${SANS}`);
  ctx.font = `800 ${tsize}px ${SANS}`;
  ctx.fillText(release.title, C, C - 28 * MM);
  ctx.font = `600 ${3.6 * MM}px ${SANS}`;
  spaced(ctx, artist.name.toUpperCase(), C, C - 22 * MM, 0.9 * MM, true);
  ctx.font = `500 ${3 * MM}px ${SANS}`;
  ctx.globalAlpha = 0.85;
  ctx.fillText(`${release.type || ''}  ${release.year || ''}`.trim(), C, C + 31 * MM);
  ctx.globalAlpha = 1;
  ctx.font = `400 ${2.1 * MM}px ${SANS}`;
  arcText(ctx, `℗ & © ${release.year || ''} ${artist.name.toUpperCase()}  ·  ALL RIGHTS RESERVED  ·  UNAUTHORISED COPYING PROHIBITED`, C, C, 54.5 * MM, Math.PI / 2, 0.25 * MM, true);
  ctx.lineWidth = 0.35 * MM;
  ctx.strokeStyle = ink;
  ctx.beginPath();
  ctx.arc(C, C, 57.2 * MM, 0, Math.PI * 2);
  ctx.stroke();
  return c;
}

// A small disc for the dock.
export function discThumb(release, print) {
  const S = 128;
  const c = canvas(S);
  const ctx = c.getContext('2d');
  const C = S / 2;
  const R = S / 2 - 2;
  const metal = release.disc || 'silver';
  const base = { silver: ['#f4f5f7', '#a9adb5'], gold: ['#ffe7a8', '#b9791f'], black: ['#3a3b40', '#08080a'] }[metal] || ['#eee', '#999'];
  const g = ctx.createRadialGradient(C * 0.7, C * 0.6, 4, C, C, R);
  g.addColorStop(0, base[0]);
  g.addColorStop(1, base[1]);
  ctx.fillStyle = g;
  circle(ctx, C, C, R);
  ctx.fill();
  // the rainbow
  const rb = ctx.createConicGradient(-0.6, C, C);
  const spokes = ['#0000', '#ff4d6d55', '#ffd16655', '#5cf2a655', '#4dabff55', '#b06bff55', '#0000', '#0000', '#4dabff44', '#5cf2a644', '#ffd16644', '#0000', '#0000'];
  spokes.forEach((s, i) => rb.addColorStop(i / (spokes.length - 1), s));
  ctx.fillStyle = rb;
  circle(ctx, C, C, R);
  ctx.fill();
  ctx.drawImage(print, 2, 2, S - 4, S - 4);
  // the clear middle and the hole
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

// Film grain, so flat gradients look printed.
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

function fitFont(ctx, text, maxWidth, size, font) {
  ctx.font = font(size);
  const w = ctx.measureText(text).width;
  return w > maxWidth ? Math.floor((size * maxWidth) / w) : size;
}

function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

function wrap(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const next = line ? line + ' ' + word : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else line = next;
  }
  if (line) ctx.fillText(line, x, y);
}

// Letter-spaced text (canvas letterSpacing isn't everywhere yet).
function spaced(ctx, text, x, y, spacing, centred = false) {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  const align = ctx.textAlign;
  ctx.textAlign = 'left';
  let cx = centred ? x - total / 2 : x;
  chars.forEach((ch, i) => {
    ctx.fillText(ch, cx, y);
    cx += widths[i] + spacing;
  });
  ctx.textAlign = align;
}

// Text round an arc, centred on `at` (radians). Across the top it reads clockwise; with `under`
// it runs along the bottom, still left to right and upright.
function arcText(ctx, text, cx, cy, r, at, spacing = 0, under = false) {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0) / r;
  const align = ctx.textAlign;
  const base = ctx.textBaseline;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let run = 0;
  chars.forEach((ch, i) => {
    const mid = (run + widths[i] / 2) / r;
    const a = under ? at + total / 2 - mid : at - total / 2 + mid;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.rotate(under ? a - Math.PI / 2 : a + Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    run += widths[i];
  });
  ctx.textAlign = align;
  ctx.textBaseline = base;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
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
