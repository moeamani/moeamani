// Talks to the site's /api: the published songs, and (with the upload password) changing them.

// Vercel's own upload helper, loaded only when someone actually uploads.
const BLOB_CLIENT = 'https://esm.sh/@vercel/blob@2.8.0/client?bundle&target=es2022';
const KEY = 'mx-library-key';

export async function loadTracks({ fresh = false } = {}) {
  const res = await fetch(`/api/tracks${fresh ? `?fresh=${Date.now()}` : ''}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`The library answered ${res.status}.`);
  const data = await res.json();
  return Array.isArray(data.tracks) ? data.tracks : [];
}

// --- the password, remembered on this device -----------------------------------------------

export function savedKey() {
  try {
    return localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}

function remember(key) {
  try {
    if (key) localStorage.setItem(KEY, key);
    else localStorage.removeItem(KEY);
  } catch {}
}

export const forget = () => remember('');

// Checks the password with the server; remembers it if it's right.
export async function unlock(key) {
  const res = await fetch('/api/auth', { headers: { authorization: `Bearer ${key}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Couldn't check the password (${res.status}).`);
  remember(key);
  return data; // { ok, uploads }
}

async function call(method, path, key, body) {
  const res = await fetch(path, {
    method,
    headers: { authorization: `Bearer ${key}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) forget();
  if (!res.ok) throw new Error(data.error || `The library answered ${res.status}.`);
  return data;
}

export const removeTrack = (id, key) => call('DELETE', `/api/tracks?id=${encodeURIComponent(id)}`, key).then((d) => d.tracks);
export const reorderTracks = (ids, key) => call('PATCH', '/api/tracks', key, { order: ids }).then((d) => d.tracks);
export const renameTrack = (id, title, key) => call('PATCH', '/api/tracks', key, { id, title }).then((d) => d.tracks);

// --- publishing a song ---------------------------------------------------------------------

const TYPES = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  alac: 'audio/mp4',
  flac: 'audio/flac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  webm: 'audio/webm',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
};

function audioType(file) {
  if (file.type.startsWith('audio/')) return file.type;
  return TYPES[extension(file.name)] || 'audio/mpeg';
}

function extension(name) {
  const ext = (name.match(/\.([a-z0-9]{1,5})$/i) || [])[1];
  return ext ? ext.toLowerCase() : '';
}

export function slug(text) {
  return (
    String(text)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'song'
  );
}

// Uploads the song and its artwork straight to Blob storage, then adds it to the list.
// `song`: { file, title, artist, album, year, duration, artwork (a JPEG Blob or null) }
export async function publish(song, key, onProgress = () => {}) {
  const { upload } = await import(BLOB_CLIENT);
  const id = `${slug(song.title)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
  const options = {
    access: 'public',
    handleUploadUrl: '/api/upload',
    headers: { authorization: `Bearer ${key}` },
  };
  const share = song.artwork ? 0.96 : 1;
  const ext = extension(song.file.name) || 'mp3';
  let audio;
  let cover = null;
  try {
    audio = await upload(`library/${id}/audio.${ext}`, song.file, {
      ...options,
      contentType: audioType(song.file),
      multipart: song.file.size > 16 * 1024 * 1024,
      onUploadProgress: (e) => onProgress((e.percentage / 100) * share),
    });
    if (song.artwork) {
      cover = await upload(`library/${id}/cover.jpg`, song.artwork, { ...options, contentType: 'image/jpeg' });
    }
  } catch (err) {
    throw new Error(await explain(err, key));
  }
  onProgress(1);
  const data = await call('POST', '/api/tracks', key, {
    track: {
      id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      year: song.year,
      duration: song.duration,
      audio: audio.url,
      cover: cover?.url || null,
    },
  });
  return data.tracks;
}

// The upload helper only says it couldn't get a token; ask the server why.
async function explain(err, key) {
  if (!/client token/i.test(err.message)) return err.message;
  try {
    const { uploads } = await unlock(key);
    if (!uploads) return "Uploads aren't set up on the server yet: BLOB_READ_WRITE_TOKEN is missing in the Vercel project.";
  } catch (why) {
    return why.message;
  }
  return err.message;
}
