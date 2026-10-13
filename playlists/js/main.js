import { artist } from '/music/js/config.js';
import * as art from '/music/js/art.js';
import { loadLibrary, savedKey } from '/music/js/library.js';
import { Headphones } from './headphones.js';
import { Player } from './player.js';
import { Screen } from './screen.js';
import * as sound from './sound.js';
import { UI } from './ui.js';

const root = document.querySelector('.mx');
const $ = (s) => root.querySelector(s);
const stageEl = $('.mx-stage');
const live = $('#mx-live');
const libraryButton = $('[data-tool="library"]');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

document.title = `Playlists — ${artist.name}`;
$('.mx-name').textContent = artist.name;
$('.mx-name').href = artist.home || '/';

boot();

async function boot() {
  const loadingDevice = import('./device.js');
  loadingDevice.catch(() => {});
  // the screen's pixel font, before the first thing is drawn on it (but not for ever)
  await Promise.race([document.fonts?.load('600 21px "Pixelify Sans"'), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});

  const screen = new Screen();
  const player = new Player();
  let device = null;
  let flat = null; // the screen on its own, without WebGL
  let plugWhenReady = false;

  const headphones = new Headphones((plugged, name, first) => {
    live.textContent = plugged ? `Headphones in${name ? `: ${name}` : ''}` : 'Headphones out';
    if (plugged) {
      if (device && root.hasAttribute('data-ready')) device.plugIn(true);
      else plugWhenReady = true;
    } else {
      plugWhenReady = false;
      device?.unplug();
      // like the real thing, pulling the headphones out pauses it
      if (!first) player.pause();
    }
  });

  // --- the screen ---

  let lastSaid = '';
  let queued = 0;
  let again = 0;
  const ui = new UI({ player, name: artist.name, headphones, onChange: () => redraw() });
  function redraw() {
    // what the screen says, for screen readers, straight away; the picture with the next frame
    const said = ui.describe();
    if (said !== lastSaid) live.textContent = lastSaid = said;
    root.dataset.screen = said;
    if (queued) return;
    queued = requestAnimationFrame(() => {
      queued = 0;
      const moving = screen.draw(ui.view());
      device?.screenChanged();
      // keep drawing while a long name scrolls or a song plays
      clearTimeout(again);
      if (moving || player.playing || ui.toastUntil > performance.now() || ui.volumeUntil > performance.now()) again = setTimeout(redraw, moving ? 60 : 250);
    });
  }
  player.addEventListener('change', redraw);
  player.addEventListener('time', redraw);

  // the battery icon shows this computer's battery, where the browser says
  navigator.getBattery?.().then((b) => {
    const read = () => {
      ui.battery = { level: b.level, charging: b.charging };
      redraw();
    };
    read();
    b.addEventListener('levelchange', read);
    b.addEventListener('chargingchange', read);
  }).catch(() => {});

  // --- the songs ---

  let tracks = [];
  let playlists = [];
  async function load(fresh) {
    try {
      ({ tracks, playlists } = await loadLibrary({ fresh }));
    } catch (err) {
      console.info(`No music library (${err.message}). The page needs the API on Vercel; see the README.`);
    }
    ui.setLibrary(tracks, playlists);
    // the covers, for the artwork view, one at a time in the background
    for (const t of tracks) {
      if (ui.arts.has(t.id)) continue;
      const picture = (await art.loadArtwork(t.cover).catch(() => null)) || art.drawnArtwork(t.title, artist.name);
      ui.arts.set(t.id, picture);
    }
  }
  const loaded = load(Boolean(savedKey()));

  // --- the player itself ---

  try {
    const { Device } = await loadingDevice;
    device = new Device(stageEl, { screen: screen.canvas, reducedMotion });
  } catch (err) {
    console.error(err);
  }
  if (!device) {
    // no WebGL: the screen on its own, worked from the keyboard
    flat = screen.canvas;
    flat.className = 'pl-flat';
    flat.setAttribute('aria-hidden', 'true');
    stageEl.append(flat);
    $('.mx-hint').textContent = 'Use the arrow keys, Enter and Esc';
  }

  // the backlight: on at any touch, off again after a while
  let dark = 0;
  function wake() {
    device?.setBacklight(true);
    clearTimeout(dark);
    const s = ui.backlightSeconds;
    if (s) dark = setTimeout(() => device?.setBacklight(false), s * 1000);
  }

  const click = (did) => did && ui.clicker && sound.click();
  const press = (button) => {
    wake();
    const did = { select: () => ui.select(), menu: () => ui.menu(), play: () => ui.play(), prev: () => ui.prev(), next: () => ui.next() }[button]();
    click(did);
  };
  const scroll = (steps) => {
    wake();
    const dir = Math.sign(steps);
    for (let i = 0; i < Math.abs(steps); i++) click(ui.scroll(dir));
  };
  const hold = () => {
    const on = ui.toggleHold();
    device?.setHold(on);
    live.textContent = on ? 'Hold on' : 'Hold off';
  };

  if (device) {
    device.onInteract = () => {
      sound.unlock();
      wake();
    };
    device.onScroll = scroll;
    device.onPress = press;
    device.onLongPress = (dir, down) => ui.seek(dir, down);
    device.onHoldSwitch = hold;
    device.onPlugSound = (kind) => sound[kind]?.();
  }

  // the keyboard does what the wheel does
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, .mx-panel')) return;
    sound.unlock();
    const onControl = e.target.closest?.('button, a');
    const k = e.key;
    if (k === 'ArrowDown') scroll(1);
    else if (k === 'ArrowUp') scroll(-1);
    else if (k === 'Enter' && !onControl) press('select');
    else if (k === 'Escape' || k === 'Backspace' || k === 'm' || k === 'M') press('menu');
    else if ((k === ' ' && !onControl) || k === 'p' || k === 'P') press('play');
    else if (k === 'ArrowLeft' || k === 'ArrowRight') {
      const dir = k === 'ArrowLeft' ? 'prev' : 'next';
      // held down, the key repeats: that's seeking
      if (e.repeat) ui.seek(dir, true);
      else press(dir);
    } else if (k === 'h' || k === 'H') {
      // try the headphones without any: in, or out
      if (device?.plugged) device.unplug();
      else device?.plugIn(true);
    } else if (k === 'l' || k === 'L') hold();
    else return;
    e.preventDefault();
  });
  addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') ui.seek(null, false);
  });

  // --- the owner's tools ---

  const openSongs = async (then) => {
    const { openPanel } = await import('/music/js/panel.js');
    openPanel({
      root,
      artist: artist.name,
      tracks: () => tracks,
      onChange: async () => {
        await load(true);
        redraw();
      },
      onUnlock: () => {
        libraryButton.hidden = false;
        then?.();
      },
      onLock: () => (libraryButton.hidden = true),
    });
  };
  const openLibrary = async () => {
    if (!savedKey()) return openSongs(() => openLibrary());
    const { openPlaylists } = await import('./playlist-panel.js');
    openPlaylists({
      root,
      tracks: () => tracks,
      playlists: () => playlists,
      onChange: (next) => {
        playlists = next;
        ui.setLibrary(tracks, playlists);
      },
      openSongs: () => openSongs(),
      onLock: () => {
        libraryButton.hidden = true;
        openSongs(() => openLibrary());
      },
    });
  };
  libraryButton.hidden = !savedKey();
  libraryButton.addEventListener('click', openLibrary);
  const fromHash = () => location.hash === '#upload' && openLibrary();
  addEventListener('hashchange', fromHash);

  // ?debug: the pieces, to poke at from the console
  if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { plDevice: device, plUI: ui, plPlayer: player });

  // --- go ---

  await loaded;
  redraw();
  wake();
  fromHash();
  const ready = () => {
    root.dataset.ready = '';
    // headphones already in when the page opened: they come in once it's showing
    if (plugWhenReady) setTimeout(() => device?.plugIn(true), 700);
  };
  if (device) device.start(ready);
  else ready();
}
