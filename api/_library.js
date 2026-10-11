// Shared by the API routes (the underscore keeps Vercel from making it a route of its own).
//
// The library lives in Vercel Blob:
//   library/<id>/audio-….<ext>   each song, uploaded straight from the browser
//   library/<id>/cover-….jpg     its artwork, taken from the song's tags
//   library/index-….json         the track list, rewritten under a new name on every change
//                                (so no CDN ever serves an old one) and the old copies deleted

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { del, list, put } from '@vercel/blob';

const INDEX = 'library/index';

export async function readTracks() {
  const { blobs } = await list({ prefix: INDEX, limit: 1000 });
  if (!blobs.length) return { tracks: [], versions: [] };
  blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  const res = await fetch(blobs[0].url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Couldn't read the track list (${res.status}).`);
  const data = await res.json();
  return { tracks: Array.isArray(data.tracks) ? data.tracks : [], versions: blobs };
}

export async function writeTracks(tracks, versions) {
  await put(`${INDEX}.json`, JSON.stringify({ tracks, updated: new Date().toISOString() }), {
    access: 'public',
    addRandomSuffix: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
  if (versions.length) await del(versions.map((b) => b.url));
}

// --- the upload password ------------------------------------------------------------------

const digest = (s) => createHash('sha256').update(String(s)).digest();

// Returns a response to send back if the request may not change the library, otherwise null.
export async function guard(request) {
  const secret = process.env.UPLOAD_PASSWORD;
  if (!secret) {
    return Response.json({ error: 'Uploads are off: set UPLOAD_PASSWORD in the Vercel project.' }, { status: 503 });
  }
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (given && timingSafeEqual(digest(given), digest(secret))) return null;
  await new Promise((r) => setTimeout(r, 500)); // slow down guessing
  return Response.json({ error: 'Wrong password.' }, { status: 401 });
}

// --- what a track may contain -------------------------------------------------------------

export function libraryUrl(value) {
  try {
    const url = new URL(value);
    const ok =
      url.protocol === 'https:' &&
      /\.public\.blob\.vercel-storage\.com$/.test(url.hostname) &&
      url.pathname.startsWith('/library/');
    return ok ? url.toString() : null;
  } catch {
    return null;
  }
}

const text = (v, max = 200) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

export const ID = /^[a-z0-9-]{1,80}$/;

export function cleanTrack(t) {
  const audio = libraryUrl(t.audio);
  if (!audio) throw new Error('The audio has to be a file in this library.');
  const cover = t.cover ? libraryUrl(t.cover) : null;
  if (t.cover && !cover) throw new Error('The artwork has to be a file in this library.');
  const id = ID.test(t.id) ? t.id : randomBytes(6).toString('hex');
  const duration = Number(t.duration);
  return {
    id,
    title: text(t.title) || 'Untitled',
    artist: text(t.artist),
    album: text(t.album),
    year: text(t.year, 4).replace(/\D/g, ''),
    duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration * 10) / 10 : null,
    audio,
    cover,
    added: new Date().toISOString(),
  };
}

export function editTitle(value) {
  return text(value) || 'Untitled';
}

export function failed(err) {
  console.error(err);
  return Response.json({ error: err.message || 'Something went wrong.' }, { status: 500 });
}
