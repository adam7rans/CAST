# CAST health sweep

`agents/cast-health-sweep.yaml` adds one dedicated Auto agent. It imports the
installed staff-engineer template and shared Node runtime without changing the
other agents. The overlay removes the inherited chat tool and thread trigger,
replaces the task instructions, and retains GitHub PR/check follow-up events.
It has no Slack integration, merge tool, or GitHub Actions workflow permission.

## Schedule and scope

- Every Monday at **07:00 America/Los_Angeles**, cron **`0 7 * * 1`**.
- The timezone preserves local 07:00 through daylight saving changes.
- Each scheduled event starts a new session on the current default branch.
- Run the build, launcher-style static smoke, and 300-line source-size guard.
- Success: one short session report, no repository changes or PR.
- Reproducible failure: diagnose, check for an existing repair, then open at most
  one focused PR only if a safe repository fix fits the scope. Otherwise report
  evidence. No broad refactors, dependency upgrades, features, or cleanup.
- A repair owner stays with the PR through CI, exact-head PR review, comments,
  and conflicts. The user decides whether to merge.

## Local verification

Run from the repository root after `npm ci --no-audit --no-fund`:

```sh
npm run build
node .auto/scripts/static-smoke.mjs
node .auto/scripts/source-size.mjs
```

The smoke test requires the Unix process-group support available in the Auto
Linux runtime and macOS. It checks port 4312 before spawning, uses isolated
temporary data/preset directories, verifies exact built HTML and JavaScript,
and stops only its own process group. Startup is limited to 20 seconds, each
HTTP request to two seconds, and graceful cleanup to three seconds before a
SIGKILL fallback. A busy port fails without disturbing the existing listener.
This is an HTTP static-serving smoke, not a browser or full media-export test.

The size guard counts physical lines, including comments and blank lines, and
includes a final unterminated line. It scans JS/TS, stylesheets, and shader source
under `src/` and `server/`. TypeScript parsing identifies pure type declarations;
shader-named files must contain a real GLSL-like template with a `void main`
entrypoint and shader syntax. Exempt oversized files are listed explicitly.
Mixed runtime/type files are not exempt just because their name contains `types`.

Validate resources without deploying them:

```sh
auto apply --dry-run -f .auto/agents/cast-health-sweep.yaml --no-prune
```

GitHub Sync activates the schedule after the setup PR is merged and the
resources are applied. Merely opening this PR does not activate the automation.
