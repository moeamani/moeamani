# moeamani

Personal portfolio site, live at **https://moeamani.vercel.app** (music at `/music/`). The pages are plain HTML, CSS and JavaScript with no build step. A small API keeps the music in Vercel Blob storage. Every push to the repo's default branch deploys to production.

- `index.html`: home page (a placeholder for now; links to Music)
- `music/`: the music page. Every song is a disc in its own clear CD case. You can open the case, turn it in your hand (let go and it swings back face on), and play the song right there on the page.
- `api/`: the music library. It lists the songs for visitors and handles uploads, which need a password.

## The music page

Visitors see each song's artwork printed on a disc, with its title, album and year. They can play songs in order, one after another, without leaving the page.

Controls:
- Click or tap the case to open it. Drag to turn it; let go and it swings back face on.
- Use the dock to switch songs.
- The turning-disc button stops all movement.
- Keys: ←/→ switch songs, O opens the case, S stops movement, P or Space plays.

Until someone interacts, the page cycles through the songs on its own. With "reduce motion" set, it starts out still. Without WebGL, it shows the artwork flat.

The name in the corner comes from [`music/js/config.js`](music/js/config.js).

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

The CD case idea comes from Ann Nguyen's [CD Case](https://www.bubbbly.com/cd-case). This is a separate implementation, built for playing music.
