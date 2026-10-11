// Reads a song file's own tags: title, artist, album, year, track number and its embedded
// artwork. MP3 (ID3v2.2–2.4), M4A/AAC/ALAC (iTunes atoms), FLAC, Ogg Vorbis/Opus and WAV.
// Everything is read in the browser; nothing leaves it.

export async function readTags(file) {
  const head = await bytes(file, 0, 64 * 1024);
  const tags = { title: '', artist: '', album: '', year: '', track: '', picture: null };
  try {
    if (ascii(head, 0, 3) === 'ID3') await id3(file, head, tags, 0);
    else if (ascii(head, 0, 4) === 'fLaC') await flac(file, tags);
    else if (ascii(head, 4, 8) === 'ftyp') await mp4(file, tags);
    else if (ascii(head, 0, 4) === 'OggS') await ogg(file, tags);
    else if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WAVE') await wav(file, tags);
    // some FLACs carry an ID3 tag in front of the stream
    if (ascii(head, 0, 3) === 'ID3' && !tags.picture) {
      const size = 10 + syncsafe(head, 6);
      const after = await bytes(file, size, size + 4);
      if (ascii(after, 0, 4) === 'fLaC') await flac(file, tags, size);
    }
  } catch (err) {
    console.warn(`Couldn't read all the tags in "${file.name}":`, err);
  }
  for (const k of ['title', 'artist', 'album', 'year', 'track']) tags[k] = clean(tags[k]);
  tags.year = (tags.year.match(/\d{4}/) || [''])[0];
  tags.track = (tags.track.match(/\d+/) || [''])[0];
  if (!tags.title) tags.title = titleFromName(file.name);
  return tags;
}

// "03 - Night Swim (final).mp3" -> "Night Swim (final)"
export function titleFromName(name) {
  return (
    name
      .replace(/\.[^.]+$/, '')
      .replace(/^\s*\d{1,3}\s*[-._)]\s*/, '')
      .replace(/_/g, ' ')
      .trim() || name
  );
}

// --- ID3v2 ---------------------------------------------------------------------------------

const ID3_FIELDS = {
  TIT2: 'title', TT2: 'title',
  TPE1: 'artist', TP1: 'artist',
  TALB: 'album', TAL: 'album',
  TYER: 'year', TYE: 'year', TDRC: 'year', TDOR: 'year',
  TRCK: 'track', TRK: 'track',
};

async function id3(file, head, tags, offset) {
  const major = head[3];
  const flags = head[5];
  const size = syncsafe(head, 6);
  let tag = await bytes(file, offset + 10, offset + 10 + size);
  // v2.3 and earlier unsynchronise the whole tag
  if (flags & 0x80 && major < 4) tag = unsync(tag);
  let p = 0;
  if (flags & 0x40) {
    // extended header
    p = major === 4 ? syncsafe(tag, 0) : u32(tag, 0) + 4;
  }
  const idLen = major === 2 ? 3 : 4;
  const headLen = major === 2 ? 6 : 10;
  while (p + headLen <= tag.length) {
    const id = ascii(tag, p, p + idLen);
    if (!/^[A-Z0-9]+$/.test(id)) break; // padding
    const len = major === 2 ? u24(tag, p + 3) : major === 4 ? syncsafe(tag, p + 4) : u32(tag, p + 4);
    const fflags = major === 2 ? 0 : tag[p + 9];
    let data = tag.subarray(p + headLen, p + headLen + len);
    p += headLen + len;
    if (major === 4) {
      if (fflags & 0x01) data = data.subarray(4); // data length indicator
      if (fflags & 0x02) data = unsync(data);
    }
    if (major === 4 && fflags & 0x0c) continue; // compressed or encrypted
    if (major === 3 && fflags & 0xc0) continue;
    const field = ID3_FIELDS[id];
    if (field && !tags[field]) tags[field] = text(data[0], data.subarray(1));
    else if ((id === 'APIC' || id === 'PIC') && !tags.picture) {
      const pic = id3Picture(data, id === 'PIC');
      // prefer the front cover, but take whatever comes first
      if (pic) tags.picture = pic;
    }
  }
}

function id3Picture(data, v22) {
  const enc = data[0];
  let p = 1;
  let mime;
  if (v22) {
    const fmt = ascii(data, 1, 4).toLowerCase();
    mime = fmt === 'png' ? 'image/png' : 'image/jpeg';
    p = 4;
  } else {
    const end = data.indexOf(0, p);
    mime = ascii(data, p, end) || 'image/jpeg';
    p = end + 1;
  }
  p += 1; // picture type
  p = skipString(data, p, enc);
  const image = data.subarray(p);
  if (!image.length) return null;
  return { mime: sniffImage(image) || fixMime(mime), data: image };
}

// --- MP4 / M4A -----------------------------------------------------------------------------

async function mp4(file, tags) {
  const ilst = await findBox(file, ['moov', 'udta', 'meta', 'ilst'], 0, file.size);
  if (!ilst) return;
  const data = await bytes(file, ilst.start, ilst.end);
  for (const item of boxes(data, 0, data.length)) {
    const name = item.type;
    const inner = [...boxes(data, item.start, item.end)].find((b) => b.type === 'data');
    if (!inner) continue;
    const kind = u32(data, inner.start) & 0xffffff;
    const value = data.subarray(inner.start + 8, inner.end);
    if (name === '©nam') tags.title ||= utf8(value);
    else if (name === '©ART' || (name === 'aART' && !tags.artist)) tags.artist ||= utf8(value);
    else if (name === '©alb') tags.album ||= utf8(value);
    else if (name === '©day') tags.year ||= utf8(value);
    else if (name === 'trkn' && value.length >= 4) tags.track ||= String((value[2] << 8) | value[3]);
    else if (name === 'covr' && !tags.picture && value.length) {
      tags.picture = { mime: sniffImage(value) || (kind === 14 ? 'image/png' : 'image/jpeg'), data: value };
    }
  }
}

// Walk down a path of boxes, reading only their headers until the last one.
async function findBox(file, path, start, end) {
  let from = start;
  let to = end;
  for (let depth = 0; depth < path.length; depth++) {
    let found = null;
    let p = from;
    while (p + 8 <= to) {
      const h = await bytes(file, p, Math.min(p + 16, to));
      let size = u32(h, 0);
      const type = ascii(h, 4, 8);
      let headLen = 8;
      if (size === 1) {
        size = u32(h, 8) * 2 ** 32 + u32(h, 12);
        headLen = 16;
      } else if (size === 0) size = to - p;
      if (size < headLen) break;
      if (type === path[depth]) {
        // `meta` is a full box: four bytes of version and flags before its children
        found = { start: p + headLen + (type === 'meta' ? 4 : 0), end: p + size };
        break;
      }
      p += size;
    }
    if (!found) return null;
    from = found.start;
    to = found.end;
  }
  return { start: from, end: to };
}

function* boxes(data, start, end) {
  let p = start;
  while (p + 8 <= end) {
    let size = u32(data, p);
    const type = latin1(data.subarray(p + 4, p + 8));
    if (size === 0) size = end - p;
    if (size < 8) return;
    yield { type, start: p + 8, end: Math.min(p + size, end) };
    p += size;
  }
}

// --- FLAC ----------------------------------------------------------------------------------

async function flac(file, tags, offset = 0) {
  let p = offset + 4;
  for (let i = 0; i < 64; i++) {
    const h = await bytes(file, p, p + 4);
    if (h.length < 4) return;
    const last = h[0] & 0x80;
    const type = h[0] & 0x7f;
    const len = u24(h, 1);
    if (type === 4 || (type === 6 && !tags.picture)) {
      const block = await bytes(file, p + 4, p + 4 + len);
      if (type === 4) vorbisComments(block, 0, tags);
      else tags.picture = flacPicture(block);
    }
    p += 4 + len;
    if (last) return;
  }
}

function flacPicture(b) {
  let p = 4; // picture type
  const mimeLen = u32(b, p);
  const mime = ascii(b, p + 4, p + 4 + mimeLen);
  p += 4 + mimeLen;
  const descLen = u32(b, p);
  p += 4 + descLen + 16; // description, width, height, depth, colours
  const len = u32(b, p);
  const image = b.subarray(p + 4, p + 4 + len);
  return image.length ? { mime: sniffImage(image) || fixMime(mime), data: image } : null;
}

// Vorbis comments: little-endian lengths, KEY=value strings.
function vorbisComments(b, p, tags) {
  const vendor = u32le(b, p);
  p += 4 + vendor;
  const count = u32le(b, p);
  p += 4;
  for (let i = 0; i < count && p + 4 <= b.length; i++) {
    const len = u32le(b, p);
    const entry = b.subarray(p + 4, p + 4 + len);
    p += 4 + len;
    const eq = entry.indexOf(0x3d);
    if (eq < 0) continue;
    const key = ascii(entry, 0, eq).toUpperCase();
    const value = entry.subarray(eq + 1);
    if (key === 'TITLE') tags.title ||= utf8(value);
    else if (key === 'ARTIST') tags.artist ||= utf8(value);
    else if (key === 'ALBUMARTIST' && !tags.artist) tags.artist = utf8(value);
    else if (key === 'ALBUM') tags.album ||= utf8(value);
    else if (key === 'DATE' || key === 'YEAR') tags.year ||= utf8(value);
    else if (key === 'TRACKNUMBER') tags.track ||= utf8(value);
    else if (key === 'METADATA_BLOCK_PICTURE' && !tags.picture) {
      try {
        tags.picture = flacPicture(Uint8Array.from(atob(latin1(value).trim()), (c) => c.charCodeAt(0)));
      } catch {}
    }
  }
}

// --- Ogg -----------------------------------------------------------------------------------

// The comment header is the second packet; artwork can make it span many pages.
async function ogg(file, tags) {
  const data = await bytes(file, 0, Math.min(file.size, 16 * 1024 * 1024));
  const packets = [];
  let current = [];
  let p = 0;
  while (p + 27 <= data.length && packets.length < 2) {
    if (ascii(data, p, p + 4) !== 'OggS') break;
    const segments = data[p + 26];
    const table = data.subarray(p + 27, p + 27 + segments);
    let q = p + 27 + segments;
    for (const lace of table) {
      current.push(data.subarray(q, q + lace));
      q += lace;
      if (lace < 255) {
        packets.push(concat(current));
        current = [];
        if (packets.length === 2) break;
      }
    }
    p = q;
  }
  const comment = packets[1];
  if (!comment) return;
  if (ascii(comment, 1, 7) === 'vorbis') vorbisComments(comment, 7, tags);
  else if (ascii(comment, 0, 8) === 'OpusTags') vorbisComments(comment, 8, tags);
}

// --- WAV -----------------------------------------------------------------------------------

async function wav(file, tags) {
  let p = 12;
  while (p + 8 <= file.size) {
    const h = await bytes(file, p, p + 12);
    const id = ascii(h, 0, 4);
    const len = u32le(h, 4);
    if (id === 'id3 ' || id === 'ID3 ') {
      const head = await bytes(file, p + 8, p + 8 + 10);
      if (ascii(head, 0, 3) === 'ID3') await id3(file, head, tags, p + 8);
    } else if (id === 'LIST' && ascii(h, 8, 12) === 'INFO') {
      const list = await bytes(file, p + 12, p + 8 + len);
      let q = 0;
      while (q + 8 <= list.length) {
        const key = ascii(list, q, q + 4);
        const n = u32le(list, q + 4);
        const value = list.subarray(q + 8, q + 8 + n);
        if (key === 'INAM') tags.title ||= utf8(value);
        else if (key === 'IART') tags.artist ||= utf8(value);
        else if (key === 'IPRD') tags.album ||= utf8(value);
        else if (key === 'ICRD') tags.year ||= utf8(value);
        else if (key === 'ITRK' || key === 'IPRT') tags.track ||= utf8(value);
        q += 8 + n + (n & 1);
      }
    }
    p += 8 + len + (len & 1);
  }
}

// --- bytes and text ------------------------------------------------------------------------

async function bytes(file, start, end) {
  return new Uint8Array(await file.slice(start, Math.min(end, file.size)).arrayBuffer());
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, a) => n + a.length, 0));
  let p = 0;
  for (const a of parts) {
    out.set(a, p);
    p += a.length;
  }
  return out;
}

const u32 = (b, p) => ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
const u24 = (b, p) => (b[p] << 16) | (b[p + 1] << 8) | b[p + 2];
const u32le = (b, p) => (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
const syncsafe = (b, p) => ((b[p] & 0x7f) << 21) | ((b[p + 1] & 0x7f) << 14) | ((b[p + 2] & 0x7f) << 7) | (b[p + 3] & 0x7f);
const latin1 = (b) => new TextDecoder('latin1').decode(b);
const ascii = (b, s, e) => latin1(b.subarray(s, e));
const utf8 = (b) => new TextDecoder('utf-8').decode(b);

// 0xFF 0x00 -> 0xFF
function unsync(b) {
  const out = new Uint8Array(b.length);
  let n = 0;
  for (let i = 0; i < b.length; i++) {
    out[n++] = b[i];
    if (b[i] === 0xff && b[i + 1] === 0x00) i++;
  }
  return out.subarray(0, n);
}

// ID3 text: an encoding byte, then the text (several values split by NULs: keep the first)
function text(enc, b) {
  let s;
  if (enc === 1 || enc === 2) {
    let le = enc === 1;
    let start = 0;
    if (b[0] === 0xff && b[1] === 0xfe) (le = true), (start = 2);
    else if (b[0] === 0xfe && b[1] === 0xff) (le = false), (start = 2);
    s = new TextDecoder(le ? 'utf-16le' : 'utf-16be').decode(b.subarray(start, start + ((b.length - start) & ~1)));
  } else if (enc === 3) s = utf8(b);
  else s = latin1(b);
  return s.split('\u0000')[0];
}

function skipString(b, p, enc) {
  if (enc === 1 || enc === 2) {
    while (p + 1 < b.length && (b[p] || b[p + 1])) p += 2;
    return p + 2;
  }
  while (p < b.length && b[p]) p++;
  return p + 1;
}

function clean(s) {
  return String(s || '').replace(/\u0000/g, '').trim();
}

function sniffImage(b) {
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'image/webp';
  if (ascii(b, 0, 3) === 'GIF') return 'image/gif';
  return null;
}

function fixMime(m) {
  m = String(m || '').toLowerCase();
  if (m === 'jpg' || m === 'image/jpg') return 'image/jpeg';
  if (m === 'png') return 'image/png';
  return m.startsWith('image/') ? m : 'image/jpeg';
}
