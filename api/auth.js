// Checks the upload password, so the library panel can unlock. Also says whether uploads are
// set up, so the panel can point at what's missing.

import { guard } from './_library.js';

export async function GET(request) {
  const refused = await guard(request);
  if (refused) return refused;
  return Response.json({ ok: true, uploads: Boolean(process.env.BLOB_READ_WRITE_TOKEN) });
}
