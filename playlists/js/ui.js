import { ROWS } from './screen.js';

// The player's menus and what its controls do. A stack of screens: lists you scroll and choose
// from, Now Playing, and a few screens of plain lines. view() describes the top one for screen.js.

const SETTINGS_KEY = 'pl-settings';
const BACKLIGHT = [
  { label: '5 Seconds', s: 5 },
  { label: '10 Seconds', s: 10 },
  { label: '20 Seconds', s: 20 },
  { label: 'Always On', s: 0 },
];
const byText = (key) => (a, b) => key(a).localeCompare(key(b), undefined, { sensitivity: 'base', numeric: true });

export class UI {
  // `headphones`: { status(): 'On' | 'Off' | 'Not Available', toggle(): Promise }
  constructor({ player, name, headphones, onChange }) {
    this.player = player;
    this.name = name;
    this.headphones = headphones;
    this.onChange = onChange;
    this.tracks = [];
    this.playlists = [];
    this.arts = new Map(); // song id -> artwork canvas, as they load
    this.hold = false;
    this.toastUntil = 0;
    this.volumeUntil = 0;
    this.selAt = performance.now();
    this.battery = null;
    this.settings = { backlight: 10, clicker: true, ...readSettings() };
    player.shuffle = !!this.settings.shuffle;
    player.repeat = this.settings.repeat || 'off';
    this.stack = [this.#root()];
  }

  setLibrary(tracks, playlists) {
    this.tracks = tracks;
    this.playlists = playlists;
    // keep each list's selection in range now its items may have changed
    for (const s of this.stack) if (s.kind === 'list') this.#clamp(s);
    this.#changed();
  }

  get top() {
    return this.stack[this.stack.length - 1];
  }

  // --- the controls; each returns whether anything happened (for the clicker) ---

  scroll(n) {
    if (this.#held()) return false;
    const s = this.top;
    if (s.kind === 'list') {
      const before = s.sel;
      s.sel += n;
      this.#clamp(s);
      if (s.sel === before) return false;
      this.selAt = performance.now();
      this.#changed();
      return true;
    }
    if (s.kind === 'now' && this.player.current) {
      if (s.mode === 'scrub') this.player.seekBy(n * 2);
      else {
        const before = this.player.volume;
        this.player.volume = Math.round((before + n * 0.04) * 100) / 100;
        this.volumeUntil = performance.now() + 2000;
        if (this.player.volume === before) return false;
      }
      this.#changed();
      return true;
    }
    return false;
  }

  select() {
    if (this.#held()) return false;
    const s = this.top;
    if (s.kind === 'list') {
      const item = this.#items(s)[s.sel];
      if (!item || item.dim) return false;
      item.run?.();
    } else if (s.kind === 'now') {
      // the middle button steps through: scrubbing, the artwork, back to the plain view
      const art = this.player.current && this.arts.get(this.player.current.id);
      s.mode = s.mode === 'progress' ? 'scrub' : s.mode === 'scrub' && art ? 'art' : 'progress';
      this.volumeUntil = 0;
    }
    this.#changed();
    return true;
  }

  menu() {
    if (this.#held()) return false;
    const s = this.top;
    if (s.kind === 'now' && s.mode !== 'progress') s.mode = 'progress';
    else if (this.stack.length > 1) this.stack.pop();
    else return false;
    this.selAt = performance.now();
    this.#changed();
    return true;
  }

  play() {
    if (this.#held()) return false;
    if (this.player.current) this.player.toggle();
    else if (this.tracks.length) this.player.play(this.#songs(), 0);
    else return false;
    return true;
  }

  prev() {
    if (this.#held()) return false;
    this.player.prev();
    return !!this.player.current;
  }

  next() {
    if (this.#held()) return false;
    this.player.next();
    return !!this.player.current;
  }

  // back or next held down: rewinds or fast-forwards, faster the longer it's held
  seek(dir, down) {
    clearInterval(this.seeking);
    if (!down || this.#held() || !this.player.current) return;
    const step = dir === 'next' ? 1 : -1;
    const t0 = performance.now();
    this.seeking = setInterval(() => {
      const held = (performance.now() - t0) / 1000;
      this.player.seekBy(step * (held > 3 ? 8 : held > 1.5 ? 4 : 2));
    }, 200);
  }

  toggleHold() {
    this.hold = !this.hold;
    this.toastUntil = 0;
    if (this.hold) this.seek(null, false);
    this.#changed();
    return this.hold;
  }

  // the backlight goes off after this long without a touch (0: never)
  get backlightSeconds() {
    return this.settings.backlight;
  }

  get clicker() {
    return this.settings.clicker;
  }

  // a key or wheel touch with hold on just shows the lock
  #held() {
    if (!this.hold) return false;
    this.toastUntil = performance.now() + 1500;
    this.#changed();
    setTimeout(() => this.#changed(), 1550);
    return true;
  }

  #changed() {
    this.onChange?.();
  }

  // --- what's on the screen ---

  view() {
    const s = this.top;
    const p = this.player;
    const now = performance.now();
    const base = {
      title: s.title,
      status: p.current ? (p.playing ? 'playing' : 'paused') : null,
      hold: this.hold,
      battery: this.battery,
      toast: this.toastUntil > now ? 'hold' : null,
      marquee: (now - this.selAt) / 1000,
    };
    if (s.kind === 'list') {
      const items = this.#items(s).map((i) => ({ label: i.label, value: i.value?.(), more: !!i.more, dim: !!i.dim }));
      return { ...base, kind: 'list', list: { items, selected: s.sel, top: s.top, empty: s.empty } };
    }
    if (s.kind === 'now') {
      const song = p.current;
      if (!song) return { ...base, kind: 'lines', lines: ['Nothing playing'] };
      if (s.mode === 'art') return { ...base, kind: 'art', art: this.arts.get(song.id) };
      return {
        ...base,
        kind: 'now',
        now: {
          index: p.pos + 1,
          total: p.queue.length,
          title: song.title,
          artist: song.artist || this.name,
          album: song.album || '',
          elapsed: p.elapsed,
          duration: p.duration,
          mode: this.volumeUntil > now ? 'volume' : s.mode,
          volume: p.volume,
          shuffle: p.shuffle,
          repeat: p.repeat,
        },
      };
    }
    return { ...base, kind: 'lines', lines: s.lines() };
  }

  // the screen says, for a screen reader
  describe() {
    const s = this.top;
    if (s.kind === 'list') {
      const items = this.#items(s);
      const item = items[s.sel];
      if (!item) return `${s.title}: ${s.empty || 'empty'}`;
      return `${s.title}: ${item.label}${item.value ? `, ${item.value()}` : ''}, ${s.sel + 1} of ${items.length}`;
    }
    const song = this.player.current;
    if (s.kind === 'now' && song) return `Now playing: ${song.title}${song.artist ? ` by ${song.artist}` : ''}`;
    return s.title;
  }

  // --- the screens ---

  #items(s) {
    return typeof s.items === 'function' ? s.items() : s.items;
  }

  #clamp(s) {
    const n = this.#items(s).length;
    s.sel = Math.max(0, Math.min(n - 1, s.sel));
    if (s.sel < s.top) s.top = s.sel;
    if (s.sel >= s.top + ROWS) s.top = s.sel - ROWS + 1;
    s.top = Math.max(0, Math.min(s.top, Math.max(0, n - ROWS)));
  }

  #push(screen) {
    this.stack.push(screen);
    this.selAt = performance.now();
  }

  #list(title, items, empty) {
    return { kind: 'list', title, items, sel: 0, top: 0, empty };
  }

  #root() {
    return this.#list(this.name, () => [
      { label: 'Playlists', more: true, run: () => this.#push(this.#playlists()) },
      { label: 'Music', more: true, run: () => this.#push(this.#music()) },
      {
        label: 'Shuffle Songs',
        dim: !this.tracks.length,
        run: () => {
          const songs = this.#songs();
          this.player.play(songs, Math.floor(Math.random() * songs.length), { shuffle: true });
          this.settings.shuffle = true;
          saveSettings(this.settings);
          this.#nowPlaying();
        },
      },
      { label: 'Settings', more: true, run: () => this.#push(this.#settings()) },
      ...(this.player.current ? [{ label: 'Now Playing', more: true, run: () => this.#nowPlaying() }] : []),
    ]);
  }

  #nowPlaying() {
    if (this.top.kind !== 'now') this.#push({ kind: 'now', title: 'Now Playing', mode: 'progress' });
  }

  #songs(list = this.tracks) {
    return list.slice().sort(byText((t) => t.title));
  }

  #songList(title, songs) {
    return this.#list(
      title,
      () => songs().map((t, i, all) => ({ label: t.title, run: () => (this.player.play(all, i), this.#nowPlaying()) })),
      'No Songs',
    );
  }

  #playlists() {
    return this.#list(
      'Playlists',
      () =>
        this.playlists.map((p) => ({
          label: p.name,
          more: true,
          run: () => {
            // a playlist keeps its own order
            const byId = new Map(this.tracks.map((t) => [t.id, t]));
            this.#push(this.#songList(p.name, () => p.tracks.map((id) => byId.get(id)).filter(Boolean)));
          },
        })),
      'No Playlists',
    );
  }

  #music() {
    const groups = (key, fallback) => {
      const names = [...new Set(this.tracks.map((t) => t[key] || fallback))].sort(byText((x) => x));
      return names.map((name) => ({
        label: name,
        more: true,
        run: () => this.#push(this.#songList(name, () => this.#songs(this.tracks.filter((t) => (t[key] || fallback) === name)))),
      }));
    };
    return this.#list('Music', [
      { label: 'Artists', more: true, run: () => this.#push(this.#list('Artists', () => groups('artist', this.name), 'No Artists')) },
      { label: 'Albums', more: true, run: () => this.#push(this.#list('Albums', () => groups('album', 'Singles'), 'No Albums')) },
      { label: 'Songs', more: true, run: () => this.#push(this.#songList('Songs', () => this.#songs())) },
    ]);
  }

  #settings() {
    const set = (k, v) => {
      this.settings[k] = v;
      saveSettings(this.settings);
    };
    return this.#list('Settings', () => [
      {
        label: 'Shuffle',
        value: () => (this.player.shuffle ? 'Songs' : 'Off'),
        run: () => {
          this.player.setShuffle(!this.player.shuffle);
          set('shuffle', this.player.shuffle);
        },
      },
      {
        label: 'Repeat',
        value: () => ({ off: 'Off', all: 'All', one: 'One' })[this.player.repeat],
        run: () => {
          const next = { off: 'all', all: 'one', one: 'off' }[this.player.repeat];
          this.player.setRepeat(next);
          set('repeat', next);
        },
      },
      {
        label: 'Backlight',
        value: () => (BACKLIGHT.find((b) => b.s === this.settings.backlight) || BACKLIGHT[1]).label,
        run: () => {
          const i = BACKLIGHT.findIndex((b) => b.s === this.settings.backlight);
          set('backlight', BACKLIGHT[(i + 1) % BACKLIGHT.length].s);
        },
      },
      { label: 'Clicker', value: () => (this.settings.clicker ? 'On' : 'Off'), run: () => set('clicker', !this.settings.clicker) },
      {
        label: 'Headphones',
        value: () => this.headphones.status(),
        run: () => this.headphones.toggle().finally(() => this.#changed()),
      },
      {
        label: 'About',
        more: true,
        run: () =>
          this.#push({
            kind: 'lines',
            title: 'About',
            lines: () => [this.name, `${this.tracks.length} Songs`, `${this.playlists.length} Playlists`],
          }),
      },
    ]);
  }
}

function readSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {}
}
