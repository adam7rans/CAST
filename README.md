# CAST

CAST is a local-first web app for shaping long-form spoken video into stylized clips and exports.

It combines:

- transcript-driven clip finding and caption editing
- manual skip editing for long-form cleanup
- shader, gradient, dither, and de-rez visual treatment
- layered music arrangement with fades and cross-track timing
- local rendering and export with project data stored on your machine

## Run CAST

Development:

```bash
cd "/Users/adam/Documents/CAST"
npm install
npm run dev
```

Open [http://127.0.0.1:5180](http://127.0.0.1:5180).
The development API listens on port 3002, which is CAST's assigned local port.

Single-origin local app mode:

```bash
npm run build
npm run start:app
```

Open [http://127.0.0.1:4312](http://127.0.0.1:4312) by default.
Rebuild after source changes. Restart the dock app after server route changes.

## Finalize and YouTube

After exporting the project's chunks, use **Export → Finalize** to check coverage,
stitch the full video, choose chapters, and prepare a description. YouTube upload
requires a Google OAuth Web application client with the YouTube Data API v3 enabled. Put
its credentials in the untracked `.env` file:

```text
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REDIRECT_URI=http://127.0.0.1:3002/api/youtube/oauth/callback
YOUTUBE_UNLISTED_APPROVED=1
```

Authorize both `http://127.0.0.1:3002/api/youtube/oauth/callback` (development API)
and `http://127.0.0.1:4312/api/youtube/oauth/callback` (dock app) in the OAuth client.
The server uses its current port for the callback.

Set `YOUTUBE_UNLISTED_APPROVED=1` only for a project that has passed YouTube's
API audit (or is otherwise exempt from its private-upload restriction). The app
blocks uploads until then. It stores the refresh token in the ignored
`server/.youtube-token.json` with owner-only permissions. Uploads request
unlisted visibility and are marked not for kids.

## Projects and presets

By default, CAST stores local working data here:

- `projects/` — imported media, transcripts, exports, per-project settings
- `presets/` — tracked shareable look presets

You can override those roots with:

- `CAST_DATA_DIR`
- `CAST_PRESETS_DIR`

## Dock launcher

Build the macOS launcher bundle:

```bash
npm run build:launcher
```

Install it into `~/Applications`:

```bash
npm run install:launcher
```

That generates `CAST.app`, which you can pin to the Dock and use to start the local app directly.

## Privacy

This repo is configured so local project data stays untracked:

- `projects/`
- media imports
- transcript/caption outputs
- export artifacts
- local logs

Only code and tracked presets should be committed.

## Legacy Resolve scripts

The original Resolve-era scripts are preserved under:

`legacy/resolve-scripts/`

They are kept for reference only and are no longer part of the active CAST product surface.
