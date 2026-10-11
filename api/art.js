// Serves a song's artwork from this site's own address. The page draws artwork onto the disc
// with WebGL, which needs images it is allowed to read; if the Blob store's address ever refuses
// that, the page asks here instead.

import { libraryUrl } from './_library.js';

export async function GET(request) {
  const url = libraryUrl(new URL(request.url).searchParams.get('u'));
  if (!url) return new Response('Not a library file.', { status: 400 });
  const res = await fetch(url);
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !type.startsWith('image/')) return new Response('No such artwork.', { status: 404 });
  return new Response(res.body, {
    headers: { 'content-type': type, 'cache-control': 'public, max-age=31536000, immutable' },
  });
}
