// The playlists. Anyone reads them from GET /api/tracks, with the songs.
//   POST   { playlist: { name, tracks } }      make one (tracks: song ids, in order)
//   PATCH  { id, name?, tracks? }               rename it, or set its songs
//   PATCH  { order: [ids] }                     put the playlists in this order
//   DELETE ?id=…                                take one away (its songs stay in the library)
// Changes need the upload password as a Bearer token.

import { cleanPlaylist, failed, guard, readTracks, writeTracks } from './_library.js';

export async function POST(request) {
  const refused = await guard(request);
  if (refused) return refused;
  try {
    const body = await request.json().catch(() => ({}));
    const { tracks, playlists, versions } = await readTracks();
    const known = new Set(tracks.map((t) => t.id));
    const playlist = cleanPlaylist({ ...(body.playlist || {}), id: undefined }, known);
    const next = [...playlists, playlist];
    await writeTracks(tracks, versions, next);
    return Response.json({ playlist, playlists: next }, { status: 201 });
  } catch (err) {
    return failed(err);
  }
}

export async function PATCH(request) {
  const refused = await guard(request);
  if (refused) return refused;
  try {
    const body = await request.json().catch(() => ({}));
    const { tracks, playlists, versions } = await readTracks();
    const known = new Set(tracks.map((t) => t.id));
    let next;
    if (Array.isArray(body.order)) {
      const byId = new Map(playlists.map((p) => [p.id, p]));
      next = body.order.map((id) => byId.get(id)).filter(Boolean);
      for (const p of playlists) if (!next.includes(p)) next.push(p);
    } else if (body.id) {
      const old = playlists.find((p) => p.id === body.id);
      if (!old) return Response.json({ error: 'No such playlist.' }, { status: 404 });
      const changed = cleanPlaylist(
        { id: old.id, name: 'name' in body ? body.name : old.name, tracks: Array.isArray(body.tracks) ? body.tracks : old.tracks },
        known,
      );
      next = playlists.map((p) => (p === old ? changed : p));
    } else {
      return Response.json({ error: 'Send an order, or an id with a name or tracks.' }, { status: 400 });
    }
    await writeTracks(tracks, versions, next);
    return Response.json({ playlists: next });
  } catch (err) {
    return failed(err);
  }
}

export async function DELETE(request) {
  const refused = await guard(request);
  if (refused) return refused;
  try {
    const id = new URL(request.url).searchParams.get('id');
    const { tracks, playlists, versions } = await readTracks();
    if (!playlists.some((p) => p.id === id)) return Response.json({ error: 'No such playlist.' }, { status: 404 });
    const next = playlists.filter((p) => p.id !== id);
    await writeTracks(tracks, versions, next);
    return Response.json({ playlists: next });
  } catch (err) {
    return failed(err);
  }
}
