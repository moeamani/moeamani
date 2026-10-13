// What's playing: a queue of songs, an order through it (shuffled or not), repeat, volume.
// Fires 'change' when the song or play/pause changes, 'time' as it plays.

const VOLUME_KEY = 'pl-volume';

export class Player extends EventTarget {
  constructor() {
    super();
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.queue = []; // the songs, as listed
    this.order = []; // indices into queue, in the order they play
    this.pos = -1; // where in `order`
    this.shuffle = false;
    this.repeat = 'off'; // 'off' | 'one' | 'all'
    this.audio.volume = stored(VOLUME_KEY, 0.7);
    const fire = (type) => () => this.dispatchEvent(new Event(type));
    for (const type of ['play', 'pause', 'loadedmetadata', 'emptied']) this.audio.addEventListener(type, fire('change'));
    this.audio.addEventListener('timeupdate', fire('time'));
    this.audio.addEventListener('ended', () => this.#ended());
    this.audio.addEventListener('error', () => {
      if (this.audio.getAttribute('src')) console.warn(`Couldn't play ${this.current?.title}.`);
    });
    this.#mediaKeys();
  }

  get current() {
    return this.pos >= 0 ? this.queue[this.order[this.pos]] : null;
  }

  get playing() {
    return !this.audio.paused && !!this.current;
  }

  get elapsed() {
    return this.audio.currentTime || 0;
  }

  get duration() {
    return Number.isFinite(this.audio.duration) ? this.audio.duration : this.current?.duration || 0;
  }

  get volume() {
    return this.audio.volume;
  }

  set volume(v) {
    this.audio.volume = Math.max(0, Math.min(1, v));
    try {
      localStorage.setItem(VOLUME_KEY, String(this.audio.volume));
    } catch {}
    this.dispatchEvent(new Event('change'));
  }

  // Play `songs` from song `index`. With shuffle on, that song first, the rest shuffled.
  play(songs, index = 0, { shuffle = this.shuffle } = {}) {
    if (!songs.length) return;
    this.queue = songs.slice();
    this.shuffle = shuffle;
    this.#order(index);
    this.pos = this.shuffle ? 0 : index;
    this.#load(true);
  }

  setShuffle(on) {
    this.shuffle = on;
    if (!this.current) return this.dispatchEvent(new Event('change'));
    // keep the song that's on, reshuffle (or unshuffle) the rest round it
    const on_ = this.order[this.pos];
    this.#order(on_);
    this.pos = on ? 0 : on_;
    this.dispatchEvent(new Event('change'));
  }

  setRepeat(mode) {
    this.repeat = mode;
    this.dispatchEvent(new Event('change'));
  }

  toggle() {
    if (!this.current) return;
    if (this.audio.paused) this.#resume();
    else this.audio.pause();
  }

  pause() {
    this.audio.pause();
  }

  next() {
    if (!this.current) return;
    if (this.pos < this.order.length - 1) this.pos++;
    else if (this.repeat === 'all') this.pos = 0;
    else return this.#stop();
    this.#load(!this.audio.paused);
  }

  // back to the start of the song if it's more than three seconds in, otherwise the one before
  prev() {
    if (!this.current) return;
    if (this.elapsed > 3 || this.pos === 0) {
      this.audio.currentTime = 0;
      this.dispatchEvent(new Event('time'));
      return;
    }
    this.pos--;
    this.#load(!this.audio.paused);
  }

  seekBy(seconds) {
    if (!this.current) return;
    this.audio.currentTime = Math.max(0, Math.min(this.duration || 0, this.elapsed + seconds));
    this.dispatchEvent(new Event('time'));
  }

  #order(first) {
    const rest = this.queue.map((_, i) => i);
    if (this.shuffle) {
      rest.splice(rest.indexOf(first), 1);
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      this.order = [first, ...rest];
    } else {
      this.order = rest;
    }
  }

  #load(autoplay) {
    const song = this.current;
    if (!song) return;
    this.audio.src = song.audio;
    if (autoplay) this.#resume();
    this.dispatchEvent(new Event('change'));
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artist || '',
        album: song.album || '',
        artwork: song.cover ? [{ src: song.cover, sizes: '512x512', type: 'image/jpeg' }] : [],
      });
    }
  }

  #resume() {
    this.audio.play().catch((err) => err.name !== 'AbortError' && console.warn(`Couldn't play "${this.current?.title}":`, err.message));
  }

  #ended() {
    if (this.repeat === 'one') {
      this.audio.currentTime = 0;
      this.#resume();
    } else if (this.pos < this.order.length - 1 || this.repeat === 'all') {
      this.pos = (this.pos + 1) % this.order.length;
      this.#load(true);
    } else {
      this.#stop();
    }
  }

  // the end of the queue: back to the first song, stopped
  #stop() {
    this.audio.pause();
    this.pos = 0;
    this.audio.src = this.current.audio;
    this.dispatchEvent(new Event('change'));
  }

  #mediaKeys() {
    if (!('mediaSession' in navigator)) return;
    const set = (action, fn) => {
      try {
        navigator.mediaSession.setActionHandler(action, fn);
      } catch {}
    };
    set('play', () => this.toggle());
    set('pause', () => this.audio.pause());
    set('nexttrack', () => this.next());
    set('previoustrack', () => this.prev());
  }
}

function stored(key, fallback) {
  try {
    const v = parseFloat(localStorage.getItem(key));
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
  } catch {
    return fallback;
  }
}
