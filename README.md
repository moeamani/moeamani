# moeamani

Personal portfolio site, hosted on Vercel. The pages are plain HTML, CSS and JavaScript with no build step. A small API keeps the music in Vercel Blob storage.

- `index.html`: home page (a placeholder for now; links to Music)
- `music/`: the music page. Every song is a disc in its own clear CD case. You can open the case, turn it round, and play the song right there on the page.
- `api/`: the music library. It lists the songs for visitors and handles uploads, which need a password.

## The music page

Visitors see each song's artwork printed on a disc, with its title, album and year. They can play songs in order, one after another, without leaving the page.

Controls:
- Click or tap the case to open it, and drag to turn it.
- Use the dock to switch songs.
- The turning-disc button stops all movement.
- Keys: ←/→ switch songs, O opens the case, S stops movement, P or Space plays.

Until someone interacts, the page cycles through the songs on its own. With "reduce motion" set, it starts out still. Without WebGL, it shows the artwork flat.

The name in the corner comes from [`music/js/config.js`](music/js/config.js).

## Adding music

Open **`/music/#upload`** on the live site and enter the upload password. After that, that browser also shows a Library button in the dock.

Drop in your songs (MP3, M4A/AAC/ALAC, FLAC, Ogg/Opus or WAV). Each file's own tags supply the title, album, year and artwork, read in your browser before anything uploads. Check the titles, then publish. In the same panel you can reorder, rename and delete songs. Deleting a song also deletes its files.

A song without embedded artwork gets a cover drawn from its title. "Lock this device" makes the browser forget the password.

## Set up on Vercel (once)

1. **Import the repo.** In Vercel, go to New Project and import `moeamani/moeamani`. Use the framework preset **Other**, with no build command and no output directory.
2. **Add storage.** Under Storage, create a **Blob** store with **public** access and connect it to the project.
3. **Check the token.** The project needs a `BLOB_READ_WRITE_TOKEN` environment variable, so uploads from the browser can be signed. Connecting a store usually adds it. If you only see `BLOB_STORE_ID`, copy the read-write token from the store's settings into a variable with that name.
4. **Set a password.** Add an environment variable `UPLOAD_PASSWORD` with a long passphrase. That's what the upload panel asks for.
5. **Redeploy**, then open `/music/#upload`.

How it's stored: songs go straight from your browser into Blob, so file size isn't capped by the function's request limit. The track list is a small JSON file in the same store, rewritten under a new name on each change so no cache serves an old one. Visitors see changes within about 30 seconds.

## Run it locally

```sh
npm install
npx vercel link && npx vercel env pull   # the Blob token and password from the project
npx vercel dev                           # then open http://localhost:3000/music/
```

A plain static server (`python3 -m http.server`) shows the page too, but with no API it has no songs.

## Credit

The CD case idea comes from Ann Nguyen's [CD Case](https://www.bubbbly.com/cd-case). This is a separate implementation, built for playing music.
