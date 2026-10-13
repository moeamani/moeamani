// The track list.
//   GET                          anyone: the songs, newest first, and the playlists
//   POST   { track }             add a song whose files are already uploaded
//   PATCH  { order: [ids] }      put the songs in this order
//   PATCH  { id, title }         rename one
//   DELETE ?id=…                 take a song off and delete its files
// Changes need the upload password as a Bearer token.

import { del } from '@vercel/blob';
import { cleanTrack, editTitle, failed, guard, readTracks, writeTracks } from './_library.js';

export async function GET() {
  try {
    const { tracks, playlists } = await readTracks();
    return Response.json(
      { tracks, playlists },
      // visitors get the CDN's copy (at most about a minute old); the owner's page asks with
      // ?fresh=…, which skips it
      { headers: { 'cache-control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=30' } },
    );
  } catch (err) {
    return failed(err);
  }
}

export async function POST(request) {
  const refused = await guard(request);
  if (refused) return refused;
  try {
    const body = await request.json().catch(() => ({}));
    let track;
    try {
      track = cleanTrack(body.track || {});
    } catch (err) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    const { tracks, playlists, versions } = await readTracks();
    if (tracks.some((t) => t.id === track.id)) {
      return Response.json({ error: 'That song is already in the library.' }, { status: 409 });
    }
    const next = [track, ...tracks];
    await writeTracks(next, versions, playlists);
    return Response.json({ track, tracks: next }, { status: 201 });
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
    let next;
    if (Array.isArray(body.order)) {
      const byId = new Map(tracks.map((t) => [t.id, t]));
      next = body.order.map((id) => byId.get(id)).filter(Boolean);
      // anything the list left out keeps its place at the end
      for (const t of tracks) if (!next.includes(t)) next.push(t);
    } else if (body.id && 'title' in body) {
      if (!tracks.some((t) => t.id === body.id)) return Response.json({ error: 'No such song.' }, { status: 404 });
      next = tracks.map((t) => (t.id === body.id ? { ...t, title: editTitle(body.title) } : t));
    } else {
      return Response.json({ error: 'Send an order, or an id and a title.' }, { status: 400 });
    }
    await writeTracks(next, versions, playlists);
    return Response.json({ tracks: next });
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
    const gone = tracks.find((t) => t.id === id);
    if (!gone) return Response.json({ error: 'No such song.' }, { status: 404 });
    const next = tracks.filter((t) => t !== gone);
    await writeTracks(next, versions, playlists); // and out of every playlist
    await del([gone.audio, gone.cover].filter(Boolean)).catch((err) => console.warn('Left files behind:', err));
    return Response.json({ tracks: next });
  } catch (err) {
    return failed(err);
  }
}
