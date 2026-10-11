// The library panel: unlock with the upload password, drop songs in, publish them. Each song's
// title, album, year and artwork come from its own tags (read here, in the browser).

import { artworkBlob, drawnArtwork } from './art.js';
import * as lib from './library.js';
import { readTags } from './tags.js';

const ACCEPT = 'audio/*,.mp3,.m4a,.aac,.flac,.wav,.ogg,.oga,.opus,.aif,.aiff';
let panel = null;

// `ctx`: { root, artist, tracks: () => [...], onChange(tracks) }
export function openPanel(ctx) {
  panel ||= new Panel(ctx);
  panel.open();
  return panel;
}

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
};

const time = (s) => (Number.isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');

class Panel {
  constructor(ctx) {
    this.ctx = ctx;
    this.key = lib.savedKey();
    this.queue = [];
    this.busy = false;
    this.lastFocus = null;

    this.node = el('aside', { className: 'mx-panel', hidden: true });
    this.node.setAttribute('role', 'dialog');
    this.node.setAttribute('aria-labelledby', 'mx-panel-title');
    const close = el('button', { type: 'button', className: 'mx-x', title: 'Close (Esc)', textContent: '×' });
    close.setAttribute('aria-label', 'Close the library');
    close.addEventListener('click', () => this.close());
    this.body = el('div', { className: 'mx-panel-body' });
    this.node.append(el('header', {}, el('h2', { id: 'mx-panel-title', textContent: 'Library' }), close), this.body);
    ctx.root.append(this.node);

    // Esc closes it from anywhere; other keys typed in it stay out of the page's shortcuts
    const escape = (e) => {
      if (e.key === 'Escape' && !this.node.hidden) this.close();
    };
    this.node.addEventListener('keydown', (e) => {
      escape(e);
      e.stopPropagation();
    });
    document.addEventListener('keydown', escape);
    // drop songs anywhere while the panel is open
    for (const type of ['dragover', 'drop']) {
      ctx.root.addEventListener(type, (e) => {
        if (this.node.hidden || !this.key || !e.dataTransfer?.types.includes('Files')) return;
        e.preventDefault();
        if (type === 'drop') this.add(e.dataTransfer.files);
      });
    }
  }

  open() {
    this.lastFocus = document.activeElement;
    this.node.hidden = false;
    // a remembered password may have changed since: check it, and whether uploads are set up
    if (this.key && this.uploadsReady === undefined) {
      lib
        .unlock(this.key)
        .then((r) => (this.uploadsReady = r.uploads))
        .catch(() => {
          lib.forget();
          this.key = '';
          this.ctx.onLock?.();
        })
        .finally(() => this.render());
    }
    this.render();
    requestAnimationFrame(() => this.node.querySelector('input, button:not(.mx-x)')?.focus());
  }

  close() {
    this.node.hidden = true;
    if (location.hash === '#upload') history.replaceState(null, '', location.pathname + location.search);
    this.lastFocus?.focus?.();
  }

  render() {
    const hadFocus = this.node.contains(document.activeElement);
    this.body.replaceChildren(...(this.key ? this.unlocked() : this.locked()));
    // if what had focus was just redrawn away, keep focus in the panel
    if (hadFocus && !this.node.contains(document.activeElement)) this.body.querySelector('input, button')?.focus();
  }

  // --- locked: ask for the password ---

  locked() {
    const input = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Upload password', required: true });
    input.setAttribute('aria-label', 'Upload password');
    const error = el('p', { className: 'mx-error' });
    error.setAttribute('role', 'alert');
    const button = el('button', { type: 'submit', className: 'mx-primary', textContent: 'Unlock' });
    const form = el('form', { className: 'mx-lock' }, el('p', { className: 'mx-note', textContent: 'Enter the upload password to add songs or change the list.' }), input, button, error);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      button.disabled = true;
      error.textContent = '';
      try {
        const { uploads } = await lib.unlock(input.value);
        this.key = input.value;
        this.uploadsReady = uploads;
        this.ctx.onUnlock?.();
        this.render();
      } catch (err) {
        error.textContent = err.message;
        button.disabled = false;
        input.select();
      }
    });
    return [form];
  }

  // --- unlocked: add songs, publish, manage ---

  unlocked() {
    const file = el('input', { type: 'file', multiple: true, accept: ACCEPT, className: 'sr-only' });
    file.addEventListener('change', () => {
      this.add(file.files);
      file.value = '';
    });
    const drop = el(
      'label',
      { className: 'mx-drop' },
      file,
      el('strong', { textContent: 'Add songs' }),
      el('span', { textContent: 'Drop files here or choose them. Title, album and artwork come from each file.' }),
    );

    const parts = [drop];
    if (this.uploadsReady === false) {
      parts.push(el('p', { className: 'mx-error', textContent: "Uploads aren't set up on the server yet: BLOB_READ_WRITE_TOKEN is missing in the Vercel project." }));
    }

    if (this.queue.length) {
      parts.push(el('ul', { className: 'mx-queue' }, ...this.queue.map((item) => this.queueRow(item))));
      const ready = this.queue.filter((i) => i.status === 'ready' || i.status === 'error').length;
      const publish = el('button', {
        type: 'button',
        className: 'mx-primary',
        textContent: this.busy ? 'Publishing…' : `Publish ${ready} song${ready === 1 ? '' : 's'}`,
        disabled: this.busy || !ready,
      });
      publish.addEventListener('click', () => this.publishAll());
      parts.push(publish);
    }

    const tracks = this.ctx.tracks();
    parts.push(
      el('h3', { textContent: 'On the page' }, el('span', { textContent: ` ${tracks.length}` })),
      tracks.length
        ? el('ul', { className: 'mx-list' }, ...tracks.map((t, i) => this.trackRow(t, i, tracks)))
        : el('p', { className: 'mx-note', textContent: 'Nothing yet.' }),
    );

    const lock = el('button', { type: 'button', className: 'mx-link', textContent: 'Lock this device' });
    lock.addEventListener('click', () => {
      lib.forget();
      this.key = '';
      this.ctx.onLock?.();
      this.render();
    });
    parts.push(lock);
    return parts;
  }

  queueRow(item) {
    const art = el('img', { className: 'mx-art', alt: '', src: item.thumb || '' });
    const title = el('input', { type: 'text', value: item.title, disabled: item.status === 'uploading' || item.status === 'done' });
    title.setAttribute('aria-label', 'Title');
    title.addEventListener('input', () => (item.title = title.value));
    const meta = [item.tags?.artist, item.tags?.album, item.tags?.year, time(item.duration)].filter(Boolean).join(' · ');
    const status =
      item.status === 'reading' ? 'Reading…'
      : item.status === 'uploading' ? `Uploading ${Math.round(item.progress * 100)}%`
      : item.status === 'error' ? item.error
      : item.status === 'done' ? 'Published'
      : item.artwork ? 'Artwork from the file' : 'No artwork in the file: one will be drawn';
    const bar = el('span', { className: 'mx-progress' });
    bar.style.setProperty('--p', item.status === 'uploading' ? item.progress : item.status === 'done' ? 1 : 0);
    const remove = el('button', { type: 'button', className: 'mx-icon', textContent: '×', disabled: item.status === 'uploading' });
    remove.setAttribute('aria-label', `Remove ${item.title} from the queue`);
    remove.addEventListener('click', () => {
      this.queue = this.queue.filter((i) => i !== item);
      this.render();
    });
    const row = el(
      'li',
      { className: `mx-row is-${item.status}` },
      art,
      el('div', { className: 'mx-row-text' }, title, el('span', { className: 'mx-meta', textContent: meta }), el('span', { className: 'mx-status', textContent: status }), bar),
      remove,
    );
    item.row = row;
    return row;
  }

  trackRow(t, i, tracks) {
    const art = el('img', { className: 'mx-art', alt: '', src: t.cover || drawnArtwork(t.title, this.ctx.artist).toDataURL('image/jpeg', 0.6), loading: 'lazy' });
    const title = el('input', { type: 'text', value: t.title });
    title.setAttribute('aria-label', 'Title');
    title.addEventListener('change', () => this.change(() => lib.renameTrack(t.id, title.value, this.key)));
    const meta = [t.album, t.year, time(t.duration)].filter(Boolean).join(' · ');
    const move = (d) => {
      const ids = tracks.map((x) => x.id);
      const [moved] = ids.splice(i, 1);
      ids.splice(i + d, 0, moved);
      this.change(() => lib.reorderTracks(ids, this.key));
    };
    const up = el('button', { type: 'button', className: 'mx-icon', textContent: '↑', disabled: i === 0 || this.busy });
    up.setAttribute('aria-label', `Move ${t.title} up`);
    up.addEventListener('click', () => move(-1));
    const down = el('button', { type: 'button', className: 'mx-icon', textContent: '↓', disabled: i === tracks.length - 1 || this.busy });
    down.setAttribute('aria-label', `Move ${t.title} down`);
    down.addEventListener('click', () => move(1));
    const remove = el('button', { type: 'button', className: 'mx-icon mx-danger', textContent: 'Delete', disabled: this.busy });
    remove.addEventListener('click', () => {
      if (confirm(`Delete "${t.title}" from the site? Its file is deleted too.`)) this.change(() => lib.removeTrack(t.id, this.key));
    });
    return el('li', { className: 'mx-row' }, art, el('div', { className: 'mx-row-text' }, title, el('span', { className: 'mx-meta', textContent: meta })), el('div', { className: 'mx-row-tools' }, up, down, remove));
  }

  async change(action) {
    this.busy = true;
    this.render();
    try {
      this.ctx.onChange(await action());
    } catch (err) {
      alert(err.message);
      if (!lib.savedKey()) this.key = '';
    }
    this.busy = false;
    this.render();
  }

  // --- reading dropped files ---

  async add(files) {
    const items = [...files]
      .filter((f) => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|flac|wav|ogg|oga|opus|aiff?)$/i.test(f.name))
      .map((file) => ({ file, title: file.name, status: 'reading', progress: 0 }));
    if (!items.length) return;
    this.queue.push(...items);
    this.render();
    await Promise.all(
      items.map(async (item) => {
        const tags = await readTags(item.file);
        item.tags = tags;
        item.title = tags.title;
        item.artwork = tags.picture ? await artworkBlob(tags.picture) : null;
        item.thumb = item.artwork ? URL.createObjectURL(item.artwork) : drawnArtwork(tags.title, this.ctx.artist).toDataURL('image/jpeg', 0.6);
        item.duration = await duration(item.file);
        item.status = 'ready';
        this.render();
      }),
    );
  }

  async publishAll() {
    this.busy = true;
    this.render();
    for (const item of this.queue.filter((i) => i.status === 'ready' || i.status === 'error')) {
      item.status = 'uploading';
      item.progress = 0;
      this.render();
      try {
        const tracks = await lib.publish(
          { file: item.file, title: item.title.trim() || item.tags.title, artist: item.tags.artist || this.ctx.artist, album: item.tags.album, year: item.tags.year, duration: item.duration, artwork: item.artwork },
          this.key,
          (p) => {
            item.progress = p;
            const status = item.row?.querySelector('.mx-status');
            if (status) status.textContent = `Uploading ${Math.round(p * 100)}%`;
            item.row?.querySelector('.mx-progress')?.style.setProperty('--p', p);
          },
        );
        item.status = 'done';
        this.ctx.onChange(tracks);
      } catch (err) {
        item.status = 'error';
        item.error = err.message;
        if (!lib.savedKey()) {
          this.key = '';
          break;
        }
      }
      this.render();
    }
    this.busy = false;
    // published ones leave the queue once they're in the list below
    this.queue = this.queue.filter((i) => i.status !== 'done');
    this.render();
  }
}

// How long a song is, as the browser reads it.
function duration(file) {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    const done = (value) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => done(null), 10000);
    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', () => done(Number.isFinite(audio.duration) ? audio.duration : null));
    audio.addEventListener('error', () => done(null));
    audio.src = url;
  });
}
