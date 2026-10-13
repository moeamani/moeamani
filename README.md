# moeamani

Personal portfolio site, live at **https://moeamani.vercel.app** (music at `/music/`). The pages are plain HTML, CSS and JavaScript with no build step. A small API keeps the music in Vercel Blob storage. Every push to the repo's default branch deploys to production.

- `index.html`: home page (a placeholder for now; links to Music)
- `music/`: the music page. Every song is a disc in its own clear CD case. You can open the case, turn it in your hand (let go and it springs back), and play the song right there on the page.
- `playlists/`: the playlists page. The same songs on a pocket music player you can hold, modelled on the mid-2000s kind with a touch wheel, with no names or marks on it.
- `api/`: the music library. It lists the songs and playlists for visitors and handles changes, which need a password.

## The music page

Visitors see each song's artwork printed on a disc, with its title, album and year. They can play songs in order, one after another, without leaving the page.

Controls:
- Tap the case to open it. Drag to turn it; let go and it springs back.
- Use the dock to switch songs.
- The turning-disc button stops all movement: the disc, the drift, and the case opening on its own.
- Keys: ←/→ switch songs, O opens the case, S stops movement, P or Space plays.

Every so often the case opens on its own, stays open a few seconds, and shuts again; not while a song is playing. Until someone interacts, the next song comes in each time it shuts. With "reduce motion" set, it starts out still. A mouse resting over the case holds the show for 2 seconds, in case you're about to click.

The 3D case needs WebGL 2: Safari 15 or later (iOS 15+), and any current Chrome, Edge or Firefox. Where it can't start, the page shows the artwork flat; the songs still play.

To see what a browser could and couldn't do, open **`/music/?debug`**: a panel at the top lists the graphics chip, the resolution it draws at, and any errors.

The name in the corner comes from [`music/js/config.js`](music/js/config.js).

## The playlists page

A 3D player in the same white studio as the music page: a white front, a mirror-polished back, a greyscale screen and a touch wheel. It works like the real thing.

- Drag round the wheel to scroll; press the middle to choose. MENU (top of the wheel) goes back, the bottom plays and pauses, left and right skip, and holding left or right seeks.
- Main menu: Playlists, Music (Artists, Albums, Songs), Shuffle Songs, Settings (Shuffle, Repeat, Backlight, Clicker, Headphones, About), and Now Playing once something's on.
- On Now Playing the wheel sets the volume; the middle button steps through scrubbing (the wheel seeks), the album art, and back.
- The hold switch on top (or L) locks the controls. Drag the body to turn it over; let go and it comes back.
- Keys: ↑/↓ scroll, Enter chooses, Esc or M goes back, Space or P plays, ←/→ skip (hold to seek), H plugs headphones in or out, L is hold.

**Headphones.** When the computer's sound moves to headphones (a jack, USB or Bluetooth), a headphone plug comes down onto the player, slows as it nears, hovers, and clicks into the socket with a sound to match; when they're taken out it pulls out again, and the music pauses, like the real thing. Browsers only name sound devices once a site may use the microphone, so this is switched on in Settings → Headphones: that asks for the microphone once and closes it straight away (nothing is recorded). Chrome and Edge support it; Safari doesn't list sound outputs to web pages, so there it says Not Available. H shows the animation anywhere.

**Making playlists.** On a device with the upload password, the Library button (bottom right, or `/playlists/#upload`) opens the playlist editor: make, rename, reorder and delete playlists, and add or remove their songs. Its link opens the music page's song library, to upload songs. Deleting a song from the library takes it out of every playlist.

## Adding music

Open **`/music/#upload`** on the live site and enter the upload password. After that, that browser also shows a Library button in the dock.

Drop in your songs (MP3, M4A/AAC/ALAC, FLAC, Ogg/Opus or WAV). Each file's own tags supply the title, album, year and artwork, read in your browser before anything uploads. Check the titles, then publish. In the same panel you can reorder, rename and delete songs. Deleting a song also deletes its files.

A song without embedded artwork gets a cover drawn from its title. "Lock this device" makes the browser forget the password.

## How it's set up on Vercel

- **Project** `moeamani`, preset **Other**, with no build step. It's linked to this GitHub repo.
- **Blob store** `moeamani-music` (public), connected to the project. That gave the project its `BLOB_READ_WRITE_TOKEN`.
- **`UPLOAD_PASSWORD`** is a sensitive variable for production and preview. To change it, edit it in the project's settings, then redeploy.
- **Deployment Protection** guards previews and per-deployment URLs. The production address is public.

To set it up again from scratch: import the repo with preset Other, create a public Blob store connected to the project (check that `BLOB_READ_WRITE_TOKEN` appears; if only `BLOB_STORE_ID` does, copy the read-write token from the store's settings), add `UPLOAD_PASSWORD`, and redeploy.

How it's stored: songs go straight from your browser into Blob, so file size isn't capped by the function's request limit. The track list is a small JSON file in the same store, rewritten under a new name on each change so no cache serves an old one. On a device where you've entered the password, changes show up right away. Visitors see them within about a minute.

## Run it locally

```sh
npm install
npx vercel link && npx vercel env pull   # the Blob token and password from the project
npx vercel dev                           # then open http://localhost:3000/music/
```

A plain static server (`python3 -m http.server`) shows the page too, but with no API it has no songs.

## Credit

The CD case's model (the tray, the lid and the hinge) is **Ann Nguyen**'s ([@ann_nnng](https://x.com/ann_nnng)), from her [CD Case](https://github.com/annnguyentt/vibe-coding/tree/main/cd-case), vibe-coded with [TypingMind](https://typingmind.com). Her source is published for anyone to use with credit.

- [`music/js/case-geometry.js`](music/js/case-geometry.js): her case geometry, unchanged. [`music/js/case.js`](music/js/case.js) puts it together with this page's own disc.
- [`music/js/shaders.js`](music/js/shaders.js): her studio and her rod and sheet shaders, which give the plastic its chrome. She drew the case in several passes, each rod refracting a picture of everything behind it; here the rods are solid and drawn in the page's single pass, a ray leaving a rod seeing her studio and the lit wall instead. [`music/js/glass.js`](music/js/glass.js) bakes the studio and makes the materials.
