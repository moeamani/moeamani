# moeamani

Personal portfolio site. Plain HTML, CSS and JavaScript with no build step.

- `index.html`: home page (a placeholder for now; links to Music)
- `music/`: the music page. Each release sits in its own 3D CD jewel case. You can open it, turn it round to see the back and spine, and play a preview.

## The music page

Everything on it comes from [`music/js/releases.js`](music/js/releases.js). The four releases in there are placeholders, so replace them with your own:

| Field | What it does |
| --- | --- |
| `title`, `type`, `year` | Shown top right, on the disc, the spine and the back |
| `tracks` | `[name, length]` pairs, printed in the booklet and on the back |
| `cover` | Square image in `music/covers/` (1000px or more). Without one, a cover is generated from `palette` and `art` |
| `audio` | Short preview in `music/audio/` (mp3/m4a/ogg). Without one, the play button is disabled |
| `disc` | `silver`, `black` or `gold` |
| `print` | `label` (title in ink on a bare disc), `ring` (cover round the hole) or `picture` (cover on the whole disc) |
| `tray` | `black`, `clear`, `smoke` or `rose` |
| `links` | `spotify`, `apple`, `youtube`, `soundcloud`, `bandcamp`, `tidal`, `deezer`. The placeholders only search for the artist name |

Controls: click or tap the case to open it, drag to turn it, use the dock to switch releases. Keys: ←/→ switch, O open, S spin, P or Space play. Until someone interacts, the page cycles through the releases on its own. With "reduce motion" set, it stays still.

Without WebGL, the page falls back to flat covers.

## Run it locally

ES modules don't load from `file://`, so serve the folder:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/music/
```

## Deploy

Any static host works: GitHub Pages (Settings → Pages → deploy from `main`), Vercel or Netlify. All paths are relative, so it also works from a sub-path. three.js loads from jsDelivr, pinned to 0.170.0.

## Credit

The CD case idea comes from Ann Nguyen's [CD Case](https://www.bubbbly.com/cd-case). This is a separate implementation, built for showing releases.
