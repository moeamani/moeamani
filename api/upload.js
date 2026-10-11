// Hands the browser a short-lived token to upload one file straight into Blob storage, so songs
// of any size skip the function's request size limit. Needs the upload password.

import { handleUpload } from '@vercel/blob/client';
import { guard } from './_library.js';

const PATH = /^library\/[a-z0-9-]{1,80}\/(audio\.[a-z0-9]{1,5}|cover\.jpg)$/;

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (body?.type !== 'blob.generate-client-token') {
    return Response.json({ error: 'Unsupported request.' }, { status: 400 });
  }
  const refused = await guard(request);
  if (refused) return refused;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      { error: "Uploads need BLOB_READ_WRITE_TOKEN: copy it from the Blob store's settings into the project." },
      { status: 503 },
    );
  }
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!PATH.test(pathname)) throw new Error('Files can only go in the library.');
        return {
          allowedContentTypes: pathname.endsWith('.jpg') ? ['image/jpeg'] : ['audio/*'],
          maximumSizeInBytes: 500 * 1024 * 1024,
          addRandomSuffix: true,
          cacheControlMaxAge: 365 * 24 * 60 * 60, // every file gets a fresh name, so it never changes
        };
      },
    });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
