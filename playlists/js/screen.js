// The player's screen: a greyscale LCD, 320 by 256 dots. Everything is drawn in three tones (the
// background, a mid grey and ink) and then snapped to them, so text and icons come out with the
// hard pixel edges of a real LCD instead of soft anti-aliasing. `view` says what to show; see ui.js.

export const LCD_W = 320;
export const LCD_H = 256;
const SCALE = 2; // the texture: each dot drawn 2x2, no smoothing
const FONT = '"Pixelify Sans", "Silkscreen", ui-monospace, monospace';
// what the tones look like, lit
const PALETTE = {
  bg: [211, 216, 206],
  mid: [138, 143, 133],
  ink: [44, 47, 41],
};
const TITLE_H = 34;
const ROW_H = 36;
export const ROWS = 6;

export class Screen {
  constructor() {
    this.canvas = document.createElement('canvas'); // the texture
    this.canvas.width = LCD_W * SCALE;
    this.canvas.height = LCD_H * SCALE;
    this.out = this.canvas.getContext('2d');
    this.work = document.createElement('canvas'); // drawn here first, in greys
    this.work.width = LCD_W;
    this.work.height = LCD_H;
    this.g = this.work.getContext('2d', { willReadFrequently: true });
    this.arts = new WeakMap();
  }

  // Draws `view`; returns true while something on it is moving (a long name scrolling), so the
  // page knows to draw it again soon.
  draw(view) {
    const g = this.g;
    this.moving = false;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, LCD_W, LCD_H);
    g.fillStyle = '#000';
    g.strokeStyle = '#000';
    this.#titleBar(view);
    if (view.kind === 'list') this.#list(view);
    else if (view.kind === 'now') this.#nowPlaying(view);
    else if (view.kind === 'art') this.#art(view);
    else this.#lines(view.lines || []);
    if (view.toast === 'hold') this.#holdToast();
    this.#snap();
    return this.moving;
  }

  // --- pieces ---

  #text(s, x, y, { size = 21, weight = 600, align = 'left', color = '#000', max = Infinity, scroll = 0 } = {}) {
    const g = this.g;
    g.font = `${weight} ${size}px ${FONT}`;
    g.textBaseline = 'middle';
    g.fillStyle = color;
    const w = g.measureText(s).width;
    if (w <= max) {
      g.textAlign = align;
      g.fillText(s, x, y);
      return;
    }
    // too long: on a selected row it scrolls along, otherwise it ends in "..."
    g.save();
    g.beginPath();
    const left = align === 'center' ? x - max / 2 : align === 'right' ? x - max : x;
    g.rect(left, y - size, max, size * 2);
    g.clip();
    g.textAlign = 'left';
    if (scroll > 0) {
      const gap = 40;
      const travel = w + gap;
      const t = Math.max(0, scroll - 1.2); // a pause before it starts
      const off = (t * 34) % travel;
      g.fillText(s, left - off, y);
      g.fillText(s, left - off + travel, y);
      this.moving = true;
    } else {
      let cut = s;
      while (cut.length > 1 && g.measureText(`${cut}...`).width > max) cut = cut.slice(0, -1);
      g.fillText(`${cut.trimEnd()}...`, left, y);
    }
    g.restore();
  }

  #titleBar(view) {
    const g = this.g;
    this.#text(view.title || '', LCD_W / 2, TITLE_H / 2 + 1, { align: 'center', max: 220 });
    // left: playing, paused or locked
    if (view.hold) this.#lock(14, 9, 0.8);
    else if (view.status === 'playing') this.#play(12, 10, 14);
    else if (view.status === 'paused') this.#pause(12, 10, 14);
    // right: the battery
    this.#battery(view.battery);
    g.fillRect(0, TITLE_H - 2, LCD_W, 2);
  }

  #play(x, y, s) {
    const g = this.g;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + s * 0.9, y + s / 2);
    g.lineTo(x, y + s);
    g.closePath();
    g.fill();
  }

  #pause(x, y, s) {
    this.g.fillRect(x, y, s * 0.32, s);
    this.g.fillRect(x + s * 0.58, y, s * 0.32, s);
  }

  #lock(x, y, k = 1) {
    const g = this.g;
    g.lineWidth = 3 * k;
    g.beginPath();
    g.arc(x + 8 * k, y + 8 * k, 5 * k, Math.PI, 0);
    g.stroke();
    g.fillRect(x, y + 8 * k, 16 * k, 12 * k);
  }

  #battery(b) {
    const g = this.g;
    const x = 274;
    const y = 10;
    g.fillRect(x, y, 32, 2);
    g.fillRect(x, y + 12, 32, 2);
    g.fillRect(x, y, 2, 14);
    g.fillRect(x + 30, y, 2, 14);
    g.fillRect(x + 32, y + 4, 3, 6);
    const level = b?.level ?? 1;
    g.fillRect(x + 4, y + 4, Math.round(24 * Math.max(0.08, Math.min(1, level))), 6);
    if (b?.charging) {
      // a little bolt beside it
      g.beginPath();
      g.moveTo(266, 8);
      g.lineTo(260, 18);
      g.lineTo(265, 18);
      g.lineTo(262, 26);
      g.lineTo(270, 14);
      g.lineTo(265, 14);
      g.closePath();
      g.fill();
    }
  }

  #chevron(x, y, color) {
    const g = this.g;
    g.strokeStyle = color;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x - 4, y - 7);
    g.lineTo(x + 3, y);
    g.lineTo(x - 4, y + 7);
    g.stroke();
  }

  #list(view) {
    const g = this.g;
    const { items, selected, top } = view.list;
    if (!items.length) {
      this.#text(view.list.empty || 'Nothing here', LCD_W / 2, 140, { align: 'center', color: '#808080' });
      return;
    }
    const bar = items.length > ROWS;
    const right = bar ? LCD_W - 18 : LCD_W;
    for (let r = 0; r < ROWS; r++) {
      const i = top + r;
      const item = items[i];
      if (!item) break;
      const y = TITLE_H + 2 + r * ROW_H;
      const on = i === selected;
      if (on) {
        g.fillStyle = '#000';
        g.fillRect(0, y, right, ROW_H);
      }
      const color = on ? '#fff' : item.dim ? '#808080' : '#000';
      const valueW = item.value ? this.#measure(item.value, 18) + 16 : 0;
      const tail = item.more ? 24 : 12;
      this.#text(item.label, 12, y + ROW_H / 2 + 1, { color, max: right - 12 - tail - valueW, scroll: on ? view.marquee : 0 });
      if (item.value) this.#text(item.value, right - tail, y + ROW_H / 2 + 1, { size: 18, align: 'right', color });
      if (item.more) this.#chevron(right - 12, y + ROW_H / 2, color);
    }
    if (bar) {
      // the scroll bar: a frame, and a block for where the screen is in the list
      const x = LCD_W - 14;
      const y0 = TITLE_H + 4;
      const h = ROWS * ROW_H - 6;
      g.fillStyle = '#000';
      g.fillRect(x, y0, 12, 2);
      g.fillRect(x, y0 + h - 2, 12, 2);
      g.fillRect(x, y0, 2, h);
      g.fillRect(x + 10, y0, 2, h);
      const thumbH = Math.max(14, Math.round(((h - 8) * ROWS) / items.length));
      const thumbY = y0 + 4 + Math.round(((h - 8 - thumbH) * top) / (items.length - ROWS));
      g.fillRect(x + 4, thumbY, 4, thumbH);
    }
  }

  #measure(s, size) {
    this.g.font = `600 ${size}px ${FONT}`;
    return this.g.measureText(s).width;
  }

  #nowPlaying(view) {
    const g = this.g;
    const n = view.now;
    this.#text(`${n.index} of ${n.total}`, 12, 52, { size: 17 });
    // shuffle and repeat, small, on the right
    let x = LCD_W - 14;
    g.fillStyle = '#000';
    if (n.repeat !== 'off') {
      g.lineWidth = 2;
      g.strokeStyle = '#000';
      g.strokeRect(x - 16, 46, 16, 10);
      g.beginPath();
      g.moveTo(x - 4, 42);
      g.lineTo(x + 1, 46);
      g.lineTo(x - 4, 50);
      g.fill();
      if (n.repeat === 'one') this.#text('1', x - 8, 51, { size: 12, align: 'center' });
      x -= 26;
    }
    if (n.shuffle) {
      // two crossing paths, each ending in an arrow
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x - 20, 46);
      g.bezierCurveTo(x - 12, 46, x - 10, 58, x - 3, 58);
      g.moveTo(x - 20, 58);
      g.bezierCurveTo(x - 12, 58, x - 10, 46, x - 3, 46);
      g.stroke();
      for (const y of [46, 58]) {
        g.beginPath();
        g.moveTo(x - 4, y - 4);
        g.lineTo(x + 1, y);
        g.lineTo(x - 4, y + 4);
        g.closePath();
        g.fill();
      }
    }
    const scroll = view.marquee;
    this.#text(n.title, LCD_W / 2, 92, { align: 'center', max: 292, scroll });
    this.#text(n.artist, LCD_W / 2, 122, { align: 'center', max: 292, scroll: n.artist ? scroll : 0 });
    this.#text(n.album, LCD_W / 2, 152, { align: 'center', max: 292, scroll: n.album ? scroll : 0 });

    const bx = 16;
    const bw = LCD_W - 32;
    const by = 184;
    if (n.mode === 'volume') {
      // a quiet speaker, the bar, a loud one
      this.#speaker(14, by + 7, 0);
      this.#speaker(LCD_W - 30, by + 7, 2);
      this.#bar(44, by, LCD_W - 88, n.volume, true);
      return;
    }
    const p = n.duration ? Math.min(1, n.elapsed / n.duration) : 0;
    this.#bar(bx, by, bw, p, false);
    if (n.mode === 'scrub') {
      // scrubbing: a diamond on the bar where it is
      const cx = bx + 3 + Math.round((bw - 6) * p);
      g.fillStyle = '#000';
      g.beginPath();
      g.moveTo(cx, by - 6);
      g.lineTo(cx + 9, by + 7);
      g.lineTo(cx, by + 20);
      g.lineTo(cx - 9, by + 7);
      g.closePath();
      g.fill();
    }
    this.#text(clock(n.elapsed), bx, 226, { size: 19 });
    this.#text(n.duration ? `-${clock(Math.max(0, n.duration - n.elapsed))}` : '', LCD_W - 16, 226, { size: 19, align: 'right' });
  }

  #bar(x, y, w, p, solid) {
    const g = this.g;
    const h = 14;
    g.fillStyle = '#000';
    g.fillRect(x + 2, y, w - 4, 2);
    g.fillRect(x + 2, y + h - 2, w - 4, 2);
    g.fillRect(x, y + 2, 2, h - 4);
    g.fillRect(x + w - 2, y + 2, 2, h - 4);
    const fill = Math.round((w - 6) * Math.max(0, Math.min(1, p)));
    g.fillStyle = solid ? '#000' : '#808080';
    g.fillRect(x + 3, y + 3, fill, h - 6);
  }

  #speaker(x, y, waves) {
    const g = this.g;
    g.fillStyle = '#000';
    g.fillRect(x, y - 3, 4, 6);
    g.beginPath();
    g.moveTo(x + 3, y - 3);
    g.lineTo(x + 9, y - 8);
    g.lineTo(x + 9, y + 8);
    g.lineTo(x + 3, y + 3);
    g.fill();
    g.lineWidth = 2;
    for (let k = 1; k <= waves; k++) {
      g.beginPath();
      g.arc(x + 9, y, 4 + k * 4, -0.8, 0.8);
      g.stroke();
    }
  }

  #art(view) {
    const g = this.g;
    const size = LCD_H - TITLE_H - 16;
    const x = (LCD_W - size) / 2;
    const y = TITLE_H + 8;
    const art = view.art && this.#dither(view.art, size);
    if (art) g.drawImage(art, x, y);
    else {
      g.fillStyle = '#808080';
      g.fillRect(x, y, size, size);
    }
    g.fillStyle = '#000';
    g.fillRect(x - 2, y - 2, size + 4, 2);
    g.fillRect(x - 2, y + size, size + 4, 2);
    g.fillRect(x - 2, y, 2, size);
    g.fillRect(x + size, y, 2, size);
  }

  // The artwork in the screen's three tones, Floyd-Steinberg dithered, drawn once per picture.
  #dither(image, size) {
    let cached = this.arts.get(image);
    if (cached?.width === size) return cached;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(image, 0, 0, size, size);
    const img = g.getImageData(0, 0, size, size);
    const d = img.data;
    const lum = new Float32Array(size * size);
    for (let i = 0; i < lum.length; i++) lum[i] = (0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]) / 255;
    // a little more contrast first: the screen has only three tones to work with
    for (let i = 0; i < lum.length; i++) lum[i] = Math.min(1, Math.max(0, (lum[i] - 0.5) * 1.25 + 0.52));
    const levels = [0, 0.5, 1];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const v = lum[i];
        const q = levels.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
        const err = v - q;
        lum[i] = q;
        if (x + 1 < size) lum[i + 1] += (err * 7) / 16;
        if (y + 1 < size) {
          if (x > 0) lum[i + size - 1] += (err * 3) / 16;
          lum[i + size] += (err * 5) / 16;
          if (x + 1 < size) lum[i + size + 1] += err / 16;
        }
      }
    }
    for (let i = 0; i < lum.length; i++) {
      const v = Math.round(lum[i] * 255);
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
      d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.arts.set(image, c);
    return c;
  }

  #lines(lines) {
    const y0 = 128 - ((lines.length - 1) * 30) / 2;
    lines.forEach((line, i) => this.#text(line, LCD_W / 2, y0 + i * 30, { align: 'center', max: 296, size: line.length > 22 ? 18 : 21 }));
  }

  #holdToast() {
    const g = this.g;
    g.fillStyle = '#fff';
    g.fillRect(90, 80, 140, 110);
    g.fillStyle = '#000';
    g.fillRect(90, 80, 140, 3);
    g.fillRect(90, 187, 140, 3);
    g.fillRect(90, 80, 3, 110);
    g.fillRect(227, 80, 3, 110);
    this.#lock(140, 98, 2.5);
    this.#text('Hold', 160, 172, { align: 'center' });
  }

  // Every dot to the nearest of the three tones, then onto the texture, each dot 2x2.
  #snap() {
    const img = this.g.getImageData(0, 0, LCD_W, LCD_H);
    const d = img.data;
    const { bg, mid, ink } = PALETTE;
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
      const c = v > 188 ? bg : v > 66 ? mid : ink;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }
    this.g.putImageData(img, 0, 0);
    this.out.imageSmoothingEnabled = false;
    this.out.drawImage(this.work, 0, 0, LCD_W * SCALE, LCD_H * SCALE);
  }
}

export function clock(s) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}
