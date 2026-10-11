// Everything on the music page comes from this file. Edit it, refresh, done.
//
// The four releases below are PLACEHOLDERS so the page has something to show.
// Swap in your own titles, tracks, covers, previews and links.

export const artist = {
  name: 'Moe Amani',
  // Where the name in the top-left corner links to (your portfolio home).
  home: '../',
};

// One entry per release, newest first.
//
//   cover   Path to a square image (jpg/png/webp, 1000px+ is plenty), relative to
//           music/index.html, e.g. 'covers/night-swim.jpg'. Leave it out and a
//           cover is generated from `palette`.
//   audio   Path to a short preview (mp3/m4a/ogg), e.g. 'audio/night-swim.mp3'.
//           Leave it out and the play button stays disabled for that release.
//   disc    The metal under the print: 'silver', 'black' or 'gold'.
//   print   What is printed on the disc:
//             'label'   your title and name in ink, with the bare rainbow disc around it
//             'ring'    the cover in a band round the hole, rainbow outside it
//             'picture' the cover over the whole disc
//   tray    The plastic the disc sits in: 'black', 'clear', 'smoke' or 'rose'.
//   palette Three colours [background, mid, accent] for generated art and the booklet.
//   art     Style of the generated cover when there is no `cover`:
//           'waves', 'sun', 'bloom' or 'swirl'.
//   links   Any of spotify, apple, youtube, soundcloud, bandcamp, tidal, deezer.
//           The links below only search the platform for your name: replace them
//           with the real release URLs.
export const releases = [
  {
    id: 'night-swim',
    title: 'Night Swim',
    type: 'EP',
    year: 2025,
    disc: 'silver',
    print: 'label',
    tray: 'black',
    palette: ['#0b1730', '#2b4c8c', '#f2d7a1'],
    art: 'waves',
    tracks: [
      ['Low Tide', '3:12'],
      ['Night Swim', '4:05'],
      ['Undertow', '3:41'],
      ['Phosphor', '2:58'],
      ['Shoreline (Reprise)', '3:30'],
    ],
    credits: 'Written and produced by Moe Amani.',
    links: searchLinks(),
  },
  {
    id: 'gold-hour',
    title: 'Gold Hour',
    type: 'Single',
    year: 2024,
    disc: 'gold',
    print: 'label',
    tray: 'clear',
    palette: ['#2a1606', '#c47a1c', '#ffe3a3'],
    art: 'sun',
    tracks: [
      ['Gold Hour', '3:48'],
      ['Gold Hour (Instrumental)', '3:48'],
    ],
    credits: 'Written and produced by Moe Amani.',
    links: searchLinks(),
  },
  {
    id: 'rosewater',
    title: 'Rosewater',
    type: 'Album',
    year: 2023,
    disc: 'black',
    print: 'ring',
    tray: 'rose',
    palette: ['#3a0612', '#d23a55', '#ffd1da'],
    art: 'bloom',
    tracks: [
      ['Petals', '2:44'],
      ['Rosewater', '3:57'],
      ['Thorn', '3:20'],
      ['Slow Bloom', '4:12'],
      ['Garden at 3AM', '3:35'],
      ['Pressed Flowers', '2:51'],
      ['Wilt', '3:09'],
      ['Perennial', '4:40'],
    ],
    credits: 'Written and produced by Moe Amani.',
    links: searchLinks(),
  },
  {
    id: 'static-bloom',
    title: 'Static Bloom',
    type: 'EP',
    year: 2022,
    disc: 'silver',
    print: 'picture',
    tray: 'smoke',
    palette: ['#120c2e', '#7b5cff', '#7ef0d8'],
    art: 'swirl',
    tracks: [
      ['Signal', '3:03'],
      ['Static Bloom', '3:46'],
      ['Interference', '4:18'],
      ['Carrier Wave', '3:27'],
    ],
    credits: 'Written and produced by Moe Amani.',
    links: searchLinks(),
  },
];

// Placeholder links that search each platform for the artist name.
function searchLinks() {
  const q = encodeURIComponent(artist.name);
  return {
    spotify: `https://open.spotify.com/search/${q}`,
    apple: `https://music.apple.com/search?term=${q}`,
    youtube: `https://music.youtube.com/search?q=${q}`,
    soundcloud: `https://soundcloud.com/search?q=${q}`,
  };
}
