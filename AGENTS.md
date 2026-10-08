## Running the App / Propagating Changes (READ FIRST)

**The macOS dock launcher and port `http://127.0.0.1:4312` serve the PREBUILT `dist/` folder, NOT your live source.** This is static mode (`CAST_SERVE_STATIC=1`).

- After ANY change under `src/` or `server/`, you MUST run `npm run build` for the dock app / port 4312 to pick it up. Editing source alone does nothing — the running app keeps serving the old bundle.
- The static server (`express.static`) reads built files fresh per request. For frontend-only changes, hard-refresh (Cmd+Shift+R) after building. Restart the CAST dock app after server route changes because the running Node process keeps its loaded code.
- For live hot-reload during development, run `npm run dev` and use the Vite URL (port **5180**), which serves source directly and proxies `/api` to the assigned API port 3002.
- Symptom of forgetting this: "I fixed it but the app still crashes / behaves the old way." → You forgot to rebuild `dist/`.

## Crash Handling

- The app is wrapped in `src/components/ErrorBoundary.tsx`. An uncaught render error shows a recoverable panel instead of a black screen. If the user reports the whole UI going black, suspect an uncaught exception in a render path (and check whether they're on a stale `dist/` build).

## Code Style

### File Size Limit
No source file should exceed 300 lines of code. If a file approaches this limit, proactively split it into focused modules (extract hooks, sub-components, utilities, or route handlers). Shader files containing GLSL template strings and pure type-declaration files are exempt from this rule.
