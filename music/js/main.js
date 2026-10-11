import { artist, releases } from './releases.js';
import * as art from './art.js';

const root = document.querySelector('.mx');
const $ = (s) => root.querySelector(s);
const stageEl = $('.mx-stage');
const rail = $('.mx-rail');
const info = $('.mx-info');
const live = $('#mx-live');
const tool = {
  spin: $('[data-tool="spin"]'),
  open: $('[data-tool="open"]'),
  play: $('[data-tool="play"]'),
};
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(hover: none)').matches;

const LINK_NAMES = {
  spotify: 'Spotify',
  apple: 'Apple Music',
  youtube: 'YouTube',
  soundcloud: 'SoundCloud',
  bandcamp: 'Bandcamp',
  tidal: 'TIDAL',
  deezer: 'Deezer',
};
const CYCLE = 7; // seconds on each release while nobody's touched anything
const CYCLE_OPEN = 2.2; // when, in that, the case opens

document.title = `Music — ${artist.name}`;
$('.mx-name').textContent = artist.name;
$('.mx-name').href = artist.home || '../';
$('.mx-hint').textContent = `${touch ? 'Tap' : 'Click'} the case to open it · drag to turn it`;

boot();

async function boot() {
  if (!releases.length) {
    fail('No releases yet: add some to js/releases.js.');
    root.dataset.ready = '';
    return;
  }

  // each release's cover, disc print and dock thumbnail, drawn up front
  const looks = await Promise.all(
    releases.map(async (r) => {
      const cover = await art.loadCover(r, artist);
      const print = art.discPrint(r, artist, cover);
      return { cover, print, thumb: art.discThumb(r, print).toDataURL('image/png') };
    }),
  );
  // the rest of its printing, drawn the first time it's shown
  const printing = (i) =>
    (looks[i].full ||= {
      cover: looks[i].cover,
      print: looks[i].print,
      inside: art.bookletInside(releases[i], artist),
      back: art.trayBack(releases[i], artist, looks[i].cover),
      spine: art.spine(releases[i], artist),
    });

  let stage = null;
  try {
    const { Stage } = await import('./stage.js');
    stage = new Stage(stageEl, { reducedMotion });
  } catch (err) {
    console.error(err);
  }
  let flat = null;
  if (!stage) {
    // no WebGL (or three.js didn't load): show the covers flat
    flat = new Image();
    flat.className = 'mx-flat';
    flat.alt = '';
    stageEl.append(flat);
    tool.spin.hidden = true;
    tool.open.hidden = true;
    $('.mx-hint').hidden = true;
  }

  let current = -1;
  let cycling = releases.length > 1 && !reducedMotion && !!stage;
  let cycleT = 0;
  let cycleOpened = false;

  // --- the dock ---

  const tilts = [-4, 5, -3, 6, -5, 3];
  const thumbs = releases.map((r, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mx-thumb';
    b.setAttribute('aria-label', [r.title, r.type, r.year].filter(Boolean).join(', '));
    b.style.setProperty('--tilt', `${tilts[i % tilts.length]}deg`);
    const img = new Image();
    img.alt = '';
    img.draggable = false;
    img.src = looks[i].thumb;
    const bar = document.createElement('span');
    bar.className = 'mx-bar';
    b.append(img, bar);
    b.addEventListener('click', () => {
      stopCycle();
      select(i, true);
    });
    rail.append(b);
    return b;
  });

  // --- the preview ---

  const audio = new Audio();
  audio.preload = 'none';
  let playing = false;

  const setPlaying = (on) => {
    playing = on;
    stage?.setPlaying(on);
    tool.play.setAttribute('aria-pressed', String(on));
    tool.play.setAttribute('aria-label', on ? 'Pause the preview' : 'Play a preview');
  };
  audio.addEventListener('play', () => setPlaying(true));
  audio.addEventListener('pause', () => setPlaying(false));
  audio.addEventListener('ended', () => {
    audio.currentTime = 0;
    setPlaying(false);
  });
  audio.addEventListener('error', () => {
    if (!audio.getAttribute('src')) return;
    console.warn(`Couldn't load the preview "${audio.getAttribute('src')}".`);
    setPlaying(false);
  });

  function play() {
    const r = releases[current];
    if (!r.audio) return;
    if (audio.getAttribute('src') !== r.audio) audio.src = r.audio;
    stopCycle();
    setOpen(true);
    audio.play().catch((err) => console.warn(`Couldn't play "${r.audio}":`, err.message));
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: r.title,
        artist: artist.name,
        album: r.title,
        artwork: [{ src: r.cover || looks[current].thumb, sizes: '512x512' }],
      });
    }
  }

  function stopAudio() {
    audio.pause();
    if (audio.getAttribute('src')) {
      audio.removeAttribute('src');
      audio.load();
    }
  }

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', play);
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    navigator.mediaSession.setActionHandler('nexttrack', () => select(current + 1, true));
    navigator.mediaSession.setActionHandler('previoustrack', () => select(current - 1, true));
  }

  // --- what's showing ---

  function select(i, flip = false) {
    i = (i + releases.length) % releases.length;
    if (i === current) return;
    const resume = playing;
    stopAudio();
    current = i;
    const r = releases[i];
    cycleT = 0;
    cycleOpened = false;

    thumbs.forEach((t, k) => {
      t.setAttribute('aria-current', String(k === i));
      if (k !== i) delete t.dataset.progress;
    });
    const t = thumbs[i];
    rail.scrollTo({ left: t.offsetLeft - (rail.clientWidth - t.offsetWidth) / 2, behavior: reducedMotion ? 'auto' : 'smooth' });

    showInfo(r, flip && !reducedMotion);
    if (stage) stage.dress(r, printing(i), flip);
    else flat.src = looks[i].cover.toDataURL('image/jpeg', 0.9);

    tool.play.setAttribute('aria-disabled', String(!r.audio));
    tool.play.title = r.audio ? 'Play (P)' : 'No preview for this one yet';
    live.textContent = [r.title, r.type, r.year].filter(Boolean).join(', ');
    if (resume && r.audio) play();
    // draw the next one's printing while nothing's happening, so moving on doesn't stutter
    if (stage) (window.requestIdleCallback || setTimeout)(() => printing((i + 1) % releases.length));
  }

  function showInfo(r, animate) {
    const fill = () => {
      $('.mx-meta').textContent = [r.type, r.year].filter(Boolean).join(' · ');
      $('.mx-title').textContent = r.title;
      const links = $('.mx-links');
      links.replaceChildren(
        ...Object.entries(r.links || {})
          .filter(([, url]) => url)
          .map(([key, url]) => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = LINK_NAMES[key] || key[0].toUpperCase() + key.slice(1);
            li.append(a);
            return li;
          }),
      );
      $('.mx-tracks').replaceChildren(
        ...(r.tracks || []).map(([name, len]) => {
          const li = document.createElement('li');
          li.textContent = len ? `${name} (${len})` : name;
          return li;
        }),
      );
    };
    if (!animate) return fill();
    info.dataset.swap = '';
    setTimeout(() => {
      fill();
      delete info.dataset.swap;
    }, 300);
  }

  // --- the tools ---

  function setOpen(open) {
    stage?.setOpen(open);
    tool.open.setAttribute('aria-pressed', String(open));
    tool.open.setAttribute('aria-label', open ? 'Close the case' : 'Open the case');
  }

  function setSpin(spin) {
    stage?.setSpin(spin);
    tool.spin.setAttribute('aria-pressed', String(spin));
  }

  function stopCycle() {
    if (!cycling) return;
    cycling = false;
    if (!playing) delete thumbs[current].dataset.progress;
  }

  const toggleOpen = () => {
    stopCycle();
    setOpen(!stage.open);
  };
  const toggleSpin = () => setSpin(tool.spin.getAttribute('aria-pressed') !== 'true');
  const togglePlay = () => (playing ? audio.pause() : play());

  tool.open.addEventListener('click', toggleOpen);
  tool.spin.addEventListener('click', toggleSpin);
  tool.play.addEventListener('click', togglePlay);

  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const onControl = e.target.closest?.('button, a');
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowLeft':
        stopCycle();
        select(current + (e.key === 'ArrowRight' ? 1 : -1), true);
        break;
      case 'o':
      case 'O':
        if (stage) toggleOpen();
        break;
      case 's':
      case 'S':
        if (stage) toggleSpin();
        break;
      case 'p':
      case 'P':
        togglePlay();
        break;
      case ' ':
        if (onControl) return; // space presses the focused button
        togglePlay();
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  // --- go ---

  setSpin(!reducedMotion);
  setOpen(false);
  setPlaying(false);
  select(0);

  if (!stage) {
    root.dataset.ready = '';
    return;
  }

  stage.onTap = toggleOpen;
  stage.onInteract = stopCycle;
  stage.onFrame = (dt) => {
    const bar = thumbs[current];
    if (playing && audio.duration) {
      bar.dataset.progress = '';
      bar.style.setProperty('--p', (audio.currentTime / audio.duration).toFixed(4));
    } else if (cycling) {
      cycleT += dt;
      if (cycleT > CYCLE_OPEN && !cycleOpened) {
        cycleOpened = true;
        setOpen(true);
      }
      if (cycleT >= CYCLE) {
        setOpen(false);
        select(current + 1, true);
      }
      bar.dataset.progress = '';
      bar.style.setProperty('--p', Math.min(cycleT / CYCLE, 1).toFixed(4));
    } else {
      delete bar.dataset.progress;
    }
  };
  stage.start(() => (root.dataset.ready = ''));
}

function fail(message) {
  const p = document.createElement('p');
  p.className = 'mx-fail';
  p.textContent = message;
  stageEl.append(p);
}
