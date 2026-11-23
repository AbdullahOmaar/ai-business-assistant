# Visual-regression harness (3A-650 part E)

A small, dependency-light way to catch unintended visual changes on the
surfaces a reviewer can capture without a running backend. It exists
because the round-2 review (3A-445) found layout defects (the overview
KPI grid collapsing to one card per row) that every automated suite had
missed — the suites assert on source text, not on rendered pixels.

## What it does

- `capture.mjs` serves the production build (`frontend/dist`) locally
  with the exact response headers from `frontend/vercel.json` and
  screenshots the key unauthenticated surfaces:
  - login, Arabic, mobile 390px
  - login, English, mobile 390px
  - login, Arabic, desktop 1440px
- Each run writes PNGs plus a `manifest.json` (timestamp, viewports,
  languages) into `runs/<timestamp>/` (or a directory you pass).
- `compare.mjs <baseline-dir> <current-dir>` decodes both runs' PNGs
  with a built-in decoder (no extra dependencies) and reports the
  changed-pixel ratio per surface. Defaults: a pixel counts as changed
  when any channel moves by more than 16; a surface fails above 0.1%
  changed pixels. Tune with `--threshold` / `--max-ratio`.

## Running it

```bash
cd frontend
npm run build
npm install --no-save playwright-core   # tooling only; never a runtime dep
CHROMIUM_PATH=/path/to/chromium node tools/visual-regression/capture.mjs
node tools/visual-regression/compare.mjs tools/visual-regression/runs/<old> tools/visual-regression/runs/<new>
```

## Baseline policy

- A baseline is captured from a reviewed release candidate and kept by
  the reviewer; it is **not** committed to the repo, because rendering
  depends on the machine's fonts and Chromium build.
- A `CHANGED` result is a prompt for a human to look at the two PNGs,
  not an automatic failure of the change.
- This harness is deliberately **not** a CI gate. Wiring browser E2E
  into CI is a separate, larger program (Phase 2 planning); this tool
  covers the per-batch manual check the review asked for.

## Limits (stated honestly)

- Unauthenticated surfaces only. Authenticated workspaces need a local
  full-stack harness (backend + database + identity), which does not
  exist yet — the same limitation recorded by the accessibility audit.
- Font rendering differs across machines; compare runs captured on the
  same machine and Chromium build.
