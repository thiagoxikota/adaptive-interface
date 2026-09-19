# Build Day submission copy

Copy for the Anthropic Build Day project form ("Show off what you built with Claude"). Paste each block as is. Physical vocabulary only; every number comes from `tests/out/*/summary.json` or `_review/`.

## Project name

Adaptive Interface

## One-line description (140 characters max)

A dashboard that physically restructures in response to your face and pointer. Decisions are local; Claude writes the words after.

(130 characters)

## Description (120 to 180 words)

We built a dashboard that changes its own layout from what the camera and the pointer can measure. Lean in and furrow your brow and the page drops to one number and one action. Hold a smile and the page densifies into eight KPIs, shortcuts and controls. Lean in with the pointer resting on a chart and that chart comes forward. Lean back and the full dashboard returns.

Every input is a physical quantity: MediaPipe blendshape coefficients, face size against a calibrated baseline, head angles, pointer dwell. A local, deterministic state machine (hysteresis, sustained accumulators, cooldown, spent gestures) decides everything in the browser. Nothing is inferred about the person; no frame leaves the machine.

Claude sits off the critical path: after the layout has moved, Claude Opus 5 writes one line about what the page now shows; static copy stays if that line is late. We verified it headless with a fake camera fed by clips of the author's face: smile to Expert in about one second, no false transitions on head turns or raised brows, keyboard fallback 5/5.

(179 words)

## How Claude was used (60 words)

Claude Code (Claude Fable 5.1) built the project in one evening: four subagents on disjoint modules, a Playwright harness that runs the real MediaPipe pipeline headless, Codex diff reviews and five Claude review lenses with skeptic verification, findings logged in `_review/`. In the product, Claude Opus 5 writes one line of copy after each mode change, off the critical path.

(60 words)

## Suggested social caption (2 lines)

We built a dashboard that restructures itself from your face and pointer, with every decision made locally in the browser and Claude writing one line of copy after the layout has already moved.
Built in one evening with Claude Code for Build Day, verified headless with a fake camera and clips of a real face. Repo and demo below.

## Links to fill

| Field | Value |
|---|---|
| Repository URL | `<REPO_URL>` (public GitHub repo; README, docs/ARCHITECTURE.md and _review/ are in it) |
| Demo video | `docs/demo.mp4` in the repo (upload the file to the form, or link the same file hosted where the form accepts video) |
| Demo GIF | `docs/demo.gif` (embedded at the top of the README) |
| Screenshots | `docs/mode-normal.png`, `docs/mode-simplify.png`, `docs/mode-focus.png`, `docs/mode-expert.png` |
| Form | https://form.typeform.com/to/SygLMeAD |
| License | MIT |

## Checklist before submitting

- The repo is public and `npm install && npm run build && npm run preview` works from a clean clone (the vendored MediaPipe files are in `public/mediapipe/`).
- `docs/demo.gif` and `docs/demo.mp4` exist and are small enough for the form.
- No API key anywhere in the repo (`.env` is git-ignored; the server reads the key from the environment or the macOS Keychain).
- The claims above match `tests/out/*/summary.json` and the README "Verified" table.
