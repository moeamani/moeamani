import { artist } from './config.js';
import * as art from './art.js';
import { loadTracks, savedKey } from './library.js';

const root = document.querySelector('.mx');
const $ = (s) => root.querySelector(s);
const stageEl = $('.mx-stage');
const rail = $('.mx-rail');
const live = $('#mx-live');
const tool = {
  still: $('[data-tool="still"]'),
  open: $('[data-tool="open"]'),
  play: $('[data-tool="play"]'),
  library: $('[data-tool="library"]'),
};
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(hover: none)').matches;

const CYCLE = 7; // seconds on each song while nobody's touched anything
const CYCLE_OPEN = 2.2; // when, in that, the case opens

document.title = `Music — ${artist.name}`;
$('.mx-name').textContent = artist.name;
$('.mx-name').href = artist.home || '../';
$('.mx-hint').textContent = `${touch ? 'Tap' : 'Click'} the case to open it · drag to turn it`;

const time = (s) => (Number.isFinite(s) && s >= 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');

boot();

async function boot() {
  let tracks = [];
  try {
    tracks = await loadTracks();
  } catch (err) {
    console.info(`No music library (${err.message}) The page needs the API on Vercel; see the README.`);
  }

  let stage = null;
  try {
    const { Stage } = await import('./stage.js');
    stage = new Stage(stageEl, { reducedMotion });
  } catch (err) {
    console.error(err);
  }
  let flat = null;
  if (!stage) {
    // no WebGL (or three.js didn't load): show the artwork flat
    flat = new Image();
    flat.className = 'mx-flat';
    flat.alt = '';
    stageEl.append(flat);
    tool.still.hidden = true;
    tool.open.hidden = true;
    $('.mx-hint').hidden = true;
  }

  // each song's artwork, the print it makes on the disc and its dock thumbnail, drawn once
  const looks = new Map();
  const look = (t) => {
    if (!looks.has(t.id)) {
      looks.set(
        t.id,
        (async () => {
          const artwork = (await art.loadArtwork(t.cover)) || art.drawnArtwork(t.title, artist.name);
          const print = art.discPrint(artwork);
          return { artwork, print, thumb: art.discThumb(print).toDataURL('image/png') };
        })(),
      );
    }
    return looks.get(t.id);
  };
  await Promise.all(tracks.map(look));

  let current = -1;
  let cycling = false;
  let cycleT = 0;
  let cycleOpened = false;
  let thumbs = [];

  // --- the dock ---

  const tilts = [-4, 5, -3, 6, -5, 3];
  function buildDock() {
    thumbs = tracks.map((t, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mx-thumb';
      b.setAttribute('aria-label', [t.title, t.album, t.year].filter(Boolean).join(', '));
      b.style.setProperty('--tilt', `${tilts[i % tilts.length]}deg`);
      const img = new Image();
      img.alt = '';
      img.draggable = false;
      look(t).then((l) => (img.src = l.thumb));
      const bar = document.createElement('span');
      bar.className = 'mx-bar';
      b.append(img, bar);
      b.addEventListener('click', () => {
        stopCycle();
        select(i, Math.sign(i - current) || 1);
      });
      return b;
    });
    rail.replaceChildren(...thumbs);
    root.toggleAttribute('data-empty', !tracks.length);
  }

  // --- playing ---

  const audio = new Audio();
  audio.preload = 'none';
  let playing = false;

  const setPlaying = (on) => {
    playing = on;
    tool.play.setAttribute('aria-pressed', String(on));
    tool.play.setAttribute('aria-label', on ? 'Pause' : 'Play');
    showTime();
  };
  audio.addEventListener('play', () => setPlaying(true));
  audio.addEventListener('pause', () => setPlaying(false));
  // when a song ends, the next one comes in and plays
  audio.addEventListener('ended', () => {
    if (tracks.length > 1) {
      select(current + 1, 1);
      play();
    } else {
      audio.currentTime = 0;
      showTime();
    }
  });
  audio.addEventListener('error', () => {
    if (audio.getAttribute('src')) console.warn(`Couldn't play ${audio.getAttribute('src')}.`);
    setPlaying(false);
  });
  audio.addEventListener('loadedmetadata', showTime);

  function play() {
    const t = tracks[current];
    if (!t) return;
    if (audio.getAttribute('src') !== t.audio) audio.src = t.audio;
    stopCycle();
    audio.play().catch((err) => err.name !== 'AbortError' && console.warn(`Couldn't play "${t.title}":`, err.message));
    if ('mediaSession' in navigator) {
      look(t).then((l) => {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: t.title,
          artist: t.artist || artist.name,
          album: t.album || '',
          artwork: [{ src: t.cover || l.thumb, sizes: '512x512' }],
        });
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
    navigator.mediaSession.setActionHandler('nexttrack', () => select(current + 1, 1));
    navigator.mediaSession.setActionHandler('previoustrack', () => select(current - 1, -1));
  }

  // --- what's showing ---

  // `direction`: 1 moving on, -1 going back, 0 no slide
  function select(i, direction = 0) {
    if (!tracks.length) return;
    i = (i + tracks.length) % tracks.length;
    if (i === current && direction) return;
    const resume = playing;
    stopAudio();
    current = i;
    const t = tracks[i];
    cycleT = 0;
    cycleOpened = false;
    if (direction) setOpen(false);

    thumbs.forEach((b, k) => {
      b.setAttribute('aria-current', String(k === i));
      if (k !== i) delete b.dataset.progress;
    });
    const b = thumbs[i];
    rail.scrollTo({ left: b.offsetLeft - (rail.clientWidth - b.offsetWidth) / 2, behavior: reducedMotion ? 'auto' : 'smooth' });

    showInfo(t, direction && !reducedMotion);
    look(t).then((l) => {
      if (tracks[current] !== t) return;
      if (stage) stage.show(l.print, direction);
      else flat.src = l.artwork.toDataURL('image/jpeg', 0.9);
    });
    tool.play.setAttribute('aria-disabled', 'false');
    live.textContent = [t.title, t.album, t.year].filter(Boolean).join(', ');
    if (resume) play();
  }

  function showInfo(t, animate) {
    const info = $('.mx-info');
    const fill = () => {
      $('.mx-meta').textContent = t ? [t.artist && t.artist !== artist.name ? t.artist : '', t.album, t.year].filter(Boolean).join(' · ') : '';
      $('.mx-title').textContent = t ? t.title : 'No songs yet';
      showTime();
    };
    if (!animate) return fill();
    info.dataset.swap = '';
    setTimeout(() => {
      fill();
      delete info.dataset.swap;
    }, 300);
  }

  function showTime() {
    const t = tracks[current];
    const total = t?.duration ?? (Number.isFinite(audio.duration) ? audio.duration : null);
    const started = audio.getAttribute('src') && (playing || audio.currentTime > 0);
    $('.mx-time').textContent = !t ? '' : started ? `${time(audio.currentTime)} / ${time(total)}` : time(total);
  }

  // The library changed (the panel published, reordered, renamed or deleted something).
  async function setTracks(next) {
    const keep = tracks[current]?.id;
    tracks = next;
    await Promise.all(tracks.map(look));
    buildDock();
    const i = tracks.findIndex((t) => t.id === keep);
    if (i >= 0) {
      // the same song is still here: leave it showing (and playing) where it was
      current = i;
      thumbs.forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
      showInfo(tracks[i], false);
    } else {
      stopAudio();
      current = -1;
      if (tracks.length) select(0, keep ? 1 : 0);
      else empty();
    }
  }

  function empty() {
    stage?.show(null);
    if (flat) flat.removeAttribute('src');
    showInfo(null, false);
    tool.play.setAttribute('aria-disabled', 'true');
    live.textContent = '';
  }

  // --- the tools ---

  function setOpen(open) {
    stage?.setOpen(open);
    tool.open.setAttribute('aria-pressed', String(open));
    tool.open.setAttribute('aria-label', open ? 'Close the case' : 'Open the case');
  }

  function setStill(still) {
    stage?.setStill(still);
    tool.still.setAttribute('aria-pressed', String(still));
    if (still) stopCycle();
  }

  function stopCycle() {
    if (!cycling) return;
    cycling = false;
    if (!playing) delete thumbs[current]?.dataset.progress;
  }

  const toggleOpen = () => {
    stopCycle();
    setOpen(!stage.open);
  };
  const toggleStill = () => setStill(tool.still.getAttribute('aria-pressed') !== 'true');
  const togglePlay = () => (playing ? audio.pause() : play());

  tool.open.addEventListener('click', toggleOpen);
  tool.still.addEventListener('click', toggleStill);
  tool.play.addEventListener('click', togglePlay);

  // --- the library panel (for whoever has the upload password) ---

  const openLibrary = async () => {
    const { openPanel } = await import('./panel.js');
    openPanel({
      root,
      artist: artist.name,
      tracks: () => tracks,
      onChange: setTracks,
      onUnlock: () => (tool.library.hidden = false),
      onLock: () => (tool.library.hidden = true),
    });
  };
  tool.library.hidden = !savedKey();
  tool.library.addEventListener('click', openLibrary);
  const fromHash = () => location.hash === '#upload' && openLibrary();
  addEventListener('hashchange', fromHash);

  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    if (e.target.closest?.('input, textarea, .mx-panel')) return;
    const onControl = e.target.closest?.('button, a');
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowLeft':
        stopCycle();
        select(current + (e.key === 'ArrowRight' ? 1 : -1), e.key === 'ArrowRight' ? 1 : -1);
        break;
      case 'o':
      case 'O':
        if (stage) toggleOpen();
        break;
      case 's':
      case 'S':
        if (stage) toggleStill();
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

  buildDock();
  setStill(reducedMotion);
  setOpen(false);
  setPlaying(false);
  if (tracks.length) select(0);
  else empty();
  cycling = tracks.length > 1 && !reducedMotion && !!stage;
  fromHash();

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
      showTime();
    } else if (cycling && bar) {
      cycleT += dt;
      if (cycleT > CYCLE_OPEN && !cycleOpened) {
        cycleOpened = true;
        setOpen(true);
      }
      if (cycleT >= CYCLE) select(current + 1, 1);
      thumbs[current].dataset.progress = '';
      thumbs[current].style.setProperty('--p', Math.min(cycleT / CYCLE, 1).toFixed(4));
    } else if (bar) {
      delete bar.dataset.progress;
    }
  };
  stage.start(() => (root.dataset.ready = ''));
}
