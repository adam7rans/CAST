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

Single-origin local app mode:

```bash
npm run build
npm run start:app
```

Open [http://127.0.0.1:4312](http://127.0.0.1:4312) by default.

## AI clip finder

Open **Editor → Clips** after selecting a project and loading a timed transcript.
Choose **Find clips**, review the titles, source timestamps, durations and editorial reasons,
then select candidates and choose **Add selected**. You can edit each title and range or
seek to its start before adding it. Invalid ranges must be corrected or deselected.
Selected candidates append to the existing colored, editable timeline clips and use normal
project autosave. Existing clips are never replaced. Candidates are temporary until added;
changing the project or transcript clears the review list. Cancel stops an in-flight search.

The easiest way is to paste your key into the **Editor Clips workspace** when prompted — CAST
saves it locally on this machine (outside project files, mode 600) and sends it only to OpenAI.

Alternatively set these variables in the **server process environment**, not a client/Vite
configuration. An environment `OPENAI_API_KEY` takes precedence over the saved key;
`OPENAI_MODEL` is optional and defaults to `gpt-5.4-mini`.

```bash
export OPENAI_API_KEY="your-api-key"
export OPENAI_MODEL="gpt-5.4-mini"
npm run dev
```

For static/dock mode, the process that launches CAST must inherit these variables. Restart
the server after changing its environment. CAST does not automatically load `.env` files.
Do not put secrets in source files or variables beginning with `VITE_`.

Discovery sends the entire currently loaded timed transcript (including current caption edits)
to the server and then to OpenAI, only on request. The saved server transcript is used when
the endpoint is called without a transcript snapshot. The Responses API call uses a strict
JSON schema and `store: false`; this disables response storage, but does not promise zero
provider retention under OpenAI's other data policies. Keys and transcript contents are not logged.
API usage is billed to your OpenAI account; manual clipping does not require an API key.

Long transcripts are analyzed in UTF-8-bounded 48 KB sections, with up to 120 seconds / 12 KB
of overlap and at most two provider calls at once per search. Every section is processed before candidates
are published; a failed section fails the search rather than returning an incomplete analysis.
Candidates use exact word boundaries when available (otherwise utterance boundaries), are ranked
by editorial score, and near-duplicate source ranges are removed. A search supports up to 300
sections and a 25 MB transcript; oversized or invalid sections are rejected explicitly, not truncated.

After changing `src/` or `server/`, run `npm run build` so the launcher-served `dist/` is current,
then hard-refresh the app (Cmd+Shift+R). New server code requires restarting the server process.

### Verification

```bash
npm test                  # mocked provider, full coverage/chunking, parsing, range validation, mapping
npm run typecheck
npm run build
npx playwright install chromium
npm run test:ui            # browser review/edit/append/autosave path; no live API key
```

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
