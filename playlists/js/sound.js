// The player's own little sounds, made on the spot with Web Audio: the clicker and the headphone
// plug. Browsers only let a page make sound after someone has touched it, so unlock() is called on
// the first touch; before that, these stay quiet.

let ctx = null;
let noise = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const len = ctx.sampleRate;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

export function unlock() {
  const a = audio();
  if (a && a.state !== 'running') a.resume().catch(() => {});
}

const ready = () => ctx && ctx.state === 'running';

// a burst of filtered noise
function burst(at, { dur, gain, type = 'bandpass', f0, f1 = f0, q = 1 }) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(f0, at);
  filter.frequency.exponentialRampToValueAtTime(f1, at + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + Math.min(0.002, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(filter).connect(g).connect(ctx.destination);
  src.start(at, Math.random() * 0.5);
  src.stop(at + dur + 0.02);
}

// a short decaying tone
function tone(at, { dur, gain, f0, f1 = f0, type = 'sine' }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, at);
  o.frequency.exponentialRampToValueAtTime(f1, at + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(ctx.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}

// The wheel's tick: tiny, dry, a little different each time.
export function click() {
  if (!ready()) return;
  const t = ctx.currentTime;
  burst(t, { dur: 0.012, gain: 0.09, f0: 3800 + Math.random() * 600, q: 2.5 });
  tone(t, { dur: 0.008, gain: 0.03, f0: 2100 });
}

// The plug's tip sliding through the socket's contacts: a short metallic scrape.
export function scrape(duration = 0.12) {
  if (!ready()) return;
  const t = ctx.currentTime;
  burst(t, { dur: duration, gain: 0.05, f0: 2400, f1: 5200, q: 3 });
  // the contacts' springs: two faint ticks on the way past
  burst(t + duration * 0.35, { dur: 0.01, gain: 0.08, type: 'highpass', f0: 3000 });
  burst(t + duration * 0.75, { dur: 0.01, gain: 0.08, type: 'highpass', f0: 3000 });
}

// Seated: a firm snap, a low knock through the body, a faint ring of metal.
export function snap() {
  if (!ready()) return;
  const t = ctx.currentTime;
  burst(t, { dur: 0.018, gain: 0.55, type: 'highpass', f0: 1800 });
  burst(t, { dur: 0.05, gain: 0.25, f0: 900, f1: 500, q: 1.5 });
  tone(t, { dur: 0.07, gain: 0.35, f0: 210, f1: 95 });
  tone(t + 0.004, { dur: 0.06, gain: 0.03, f0: 3400, f1: 3300 });
}

// Pulled out: a softer, duller pop.
export function pop() {
  if (!ready()) return;
  const t = ctx.currentTime;
  burst(t, { dur: 0.03, gain: 0.2, f0: 1400, f1: 700, q: 1.2 });
  tone(t, { dur: 0.06, gain: 0.22, f0: 160, f1: 80 });
  burst(t + 0.02, { dur: 0.06, gain: 0.03, f0: 4000, f1: 2500, q: 3 });
}
