import * as lib from '/music/js/library.js';

// The owner's playlist editor: make, name, order and delete playlists, and choose their songs.
// Songs themselves are added in the song library panel (the music page's), opened from here.
// `ctx`: { root, tracks(), playlists(), onChange(playlists), openSongs(), onLock() }

let panel = null;

export function openPlaylists(ctx) {
  panel ||= new PlaylistPanel(ctx);
  panel.open();
  return panel;
}

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
};

class PlaylistPanel {
  constructor(ctx) {
    this.ctx = ctx;
    this.editing = null; // the id of the playlist whose songs are showing
    this.busy = false;
    this.error = '';

    this.node = el('aside', { className: 'mx-panel pl-panel', hidden: true });
    this.node.setAttribute('role', 'dialog');
    this.node.setAttribute('aria-labelledby', 'pl-panel-title');
    const close = el('button', { type: 'button', className: 'mx-x', title: 'Close (Esc)', textContent: '×' });
    close.setAttribute('aria-label', 'Close the playlists');
    close.addEventListener('click', () => this.close());
    this.body = el('div', { className: 'mx-panel-body' });
    this.node.append(el('header', {}, el('h2', { id: 'pl-panel-title', textContent: 'Playlists' }), close), this.body);
    ctx.root.append(this.node);
    const escape = (e) => {
      if (e.key === 'Escape' && !this.node.hidden) this.close();
    };
    this.node.addEventListener('keydown', (e) => {
      escape(e);
      e.stopPropagation();
    });
    document.addEventListener('keydown', escape);
  }

  open() {
    this.lastFocus = document.activeElement;
    this.node.hidden = false;
    this.render();
    requestAnimationFrame(() => this.node.querySelector('input, button:not(.mx-x)')?.focus());
  }

  close() {
    this.node.hidden = true;
    this.lastFocus?.focus?.();
  }

  // Run a change against the server; the page and this panel take the playlists it sends back.
  async change(action) {
    const key = lib.savedKey();
    if (!key) return this.ctx.onLock?.();
    this.busy = true;
    this.error = '';
    this.render();
    try {
      this.ctx.onChange(await action(key));
    } catch (err) {
      this.error = err.message;
      if (!lib.savedKey()) this.ctx.onLock?.();
    }
    this.busy = false;
    this.render();
  }

  render() {
    const hadFocus = this.node.contains(document.activeElement);
    const lists = this.ctx.playlists();
    const songs = this.ctx.tracks();

    const name = el('input', { placeholder: 'New playlist', maxLength: 80, required: true });
    name.setAttribute('aria-label', 'New playlist name');
    const make = el('form', { className: 'pl-new' }, name, el('button', { type: 'submit', className: 'mx-primary', textContent: 'Make', disabled: this.busy }));
    make.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = name.value.trim();
      if (!title) return;
      this.change(async (key) => {
        const next = await lib.createPlaylist(title, [], key);
        this.editing = next[next.length - 1]?.id || null;
        return next;
      });
    });

    const songsButton = el('button', { type: 'button', className: 'mx-link', textContent: `Songs in the library (${songs.length}): add or remove` });
    songsButton.addEventListener('click', () => this.ctx.openSongs());

    const parts = [
      make,
      this.error ? el('p', { className: 'mx-error', textContent: this.error }) : null,
      el('h3', { textContent: 'Playlists' }, el('span', { textContent: ` ${lists.length}` })),
      lists.length
        ? el('ul', { className: 'mx-list' }, ...lists.flatMap((p, i) => this.row(p, i, lists, songs)))
        : el('p', { className: 'mx-note', textContent: 'None yet. Name one above to start.' }),
      songsButton,
    ];
    this.body.replaceChildren(...parts.filter(Boolean));
    if (hadFocus && !this.node.contains(document.activeElement)) this.body.querySelector('input, button')?.focus();
  }

  row(p, i, lists, songs) {
    const title = el('input', { value: p.name, maxLength: 80, disabled: this.busy });
    title.setAttribute('aria-label', 'Playlist name');
    title.addEventListener('change', () => {
      const v = title.value.trim();
      if (v && v !== p.name) this.change((key) => lib.updatePlaylist(p.id, { name: v }, key));
    });
    const order = (ids) => this.change((key) => lib.reorderPlaylists(ids, key));
    const ids = lists.map((x) => x.id);
    const swap = (a, b) => {
      [ids[a], ids[b]] = [ids[b], ids[a]];
      order(ids);
    };
    const up = el('button', { type: 'button', className: 'mx-icon', textContent: '↑', disabled: i === 0 || this.busy, title: 'Move up' });
    up.addEventListener('click', () => swap(i, i - 1));
    const down = el('button', { type: 'button', className: 'mx-icon', textContent: '↓', disabled: i === lists.length - 1 || this.busy, title: 'Move down' });
    down.addEventListener('click', () => swap(i, i + 1));
    const open = this.editing === p.id;
    const edit = el('button', { type: 'button', className: 'mx-icon', textContent: open ? 'Done' : 'Songs', disabled: this.busy });
    edit.setAttribute('aria-expanded', String(open));
    edit.addEventListener('click', () => {
      this.editing = open ? null : p.id;
      this.render();
    });
    const remove = el('button', { type: 'button', className: 'mx-icon mx-danger', textContent: 'Delete', disabled: this.busy });
    remove.addEventListener('click', () => {
      if (confirm(`Delete the playlist "${p.name}"? Its songs stay in the library.`)) this.change((key) => lib.deletePlaylist(p.id, key));
    });
    const row = el(
      'li',
      { className: 'mx-row pl-row' },
      el('div', { className: 'mx-row-text' }, title, el('span', { className: 'mx-meta', textContent: `${p.tracks.length} song${p.tracks.length === 1 ? '' : 's'}` })),
      el('div', { className: 'mx-row-tools' }, up, down, edit, remove),
    );
    return open ? [row, this.songs(p, songs)] : [row];
  }

  // a playlist's songs in order, and the library's other songs to add
  songs(p, all) {
    const byId = new Map(all.map((t) => [t.id, t]));
    const set = (tracks) => this.change((key) => lib.updatePlaylist(p.id, { tracks }, key));
    const inList = p.tracks.map((id) => byId.get(id)).filter(Boolean);
    const rows = inList.map((t, i) => {
      const ids = inList.map((x) => x.id);
      const move = (to) => {
        ids.splice(to, 0, ids.splice(i, 1)[0]);
        set(ids);
      };
      const up = el('button', { type: 'button', className: 'mx-icon', textContent: '↑', disabled: i === 0 || this.busy, title: 'Earlier' });
      up.addEventListener('click', () => move(i - 1));
      const down = el('button', { type: 'button', className: 'mx-icon', textContent: '↓', disabled: i === inList.length - 1 || this.busy, title: 'Later' });
      down.addEventListener('click', () => move(i + 1));
      const out = el('button', { type: 'button', className: 'mx-icon', textContent: 'Remove', disabled: this.busy });
      out.addEventListener('click', () => set(ids.filter((id) => id !== t.id)));
      return el('li', { className: 'pl-song' }, el('span', { className: 'pl-song-title', textContent: `${i + 1}. ${t.title}` }), el('span', { className: 'mx-row-tools' }, up, down, out));
    });
    const others = all.filter((t) => !p.tracks.includes(t.id));
    const adds = others.map((t) => {
      const add = el('button', { type: 'button', className: 'mx-icon', textContent: '+ Add', disabled: this.busy });
      add.addEventListener('click', () => set([...p.tracks, t.id]));
      return el('li', { className: 'pl-song' }, el('span', { className: 'pl-song-title', textContent: t.title }), add);
    });
    return el(
      'li',
      { className: 'pl-songs' },
      inList.length ? el('ol', {}, ...rows) : el('p', { className: 'mx-note', textContent: 'No songs in it yet.' }),
      others.length ? el('p', { className: 'pl-label', textContent: 'Add from the library' }) : null,
      others.length ? el('ul', {}, ...adds) : null,
    );
  }
}
