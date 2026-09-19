# Test harness

Two Node ESM scripts drive the app in headless Chromium through the `playwright` package already in `devDependencies`. Browsers are cached in `~/Library/Caches/ms-playwright`; do not run `playwright install`.

Both scripts read the dev-only globals the app exposes when `import.meta.env.DEV` is true: `window.__face` (FaceSignals), `window.__engine` (EngineState), `window.__mouse` (MouseSignals) and `window.__insight` (Insight). They need the dev server running on `http://localhost:5173` (`npm run dev`). Exit code is 0 unless the browser fails to launch; the printed summary and `tests/out/<name>/summary.json` are the verdict.

## Fake camera run

```sh
node scripts/fake-camera-run.mjs --fixture tests/fixtures/smile.y4m --name smile
node scripts/fake-camera-run.mjs --fixture tests/fixtures/approach.y4m --name approach --duration 12000
node scripts/fake-camera-run.mjs --fixture tests/fixtures/close-neutral.y4m --name close-then-keys --keys 2,4 --keyAt 1500
```

Flags:

| Flag | Default | Meaning |
| --- | --- | --- |
| `--fixture <path.y4m>` | required | Clip fed to Chromium as the camera (`--use-file-for-fake-video-capture`). Loops automatically. |
| `--name <label>` | required | Output folder `tests/out/<label>/`. |
| `--duration <ms>` | `10000` | Sampling window after the landmarker reports `running`. |
| `--interval <ms>` | `200` | Sampling period. |
| `--url <url>` | `http://localhost:5173/?debug=1` | Page to drive. |
| `--keys 2,4 --keyAt 1500` | none | Press each key at `keyAt + i * 1500` ms into the sampling window. |
| `--channel chromium\|shell` | `chromium` | `chromium` is the full binary in new headless mode (WebGL through SwiftShader); `shell` is the headless shell. |
| `--headed` | off | Show the window (debugging only). |
| `--smoke` | off | Skip the app: serve a blank page on `127.0.0.1` (`getUserMedia` needs a secure context, so `--url` is ignored), call `getUserMedia`, print `videoWidth`/`videoHeight`, frame count and WebGL2 availability, save `smoke.png`. |

What it does: launches Chromium with the fake-device flags and camera permission granted, opens the URL, waits up to 20 s for `window.__face.status === 'running'` (the status timeline is logged), then samples every 200 ms for `--duration`: `t`, status, present, presence, proximity, calibrated, brow, smile, browInnerUp, yaw, pitch, roll, fps, engine mode, focus target, the four progress ramps and the insight source. It prints an aligned table as it goes and writes:

- `tests/out/<name>/samples.json`: every sample.
- `tests/out/<name>/summary.json`: min/max/mean per signal, `runningAtMs`, `calibrationMs`, the mode timeline, every transition with `engine.lastTransition.reason`, console errors and page errors.
- `tests/out/<name>/NN-<mode>.png`: full-page screenshots at 1440x900, one at t=0, one at every mode change, one at the end (`NN-end-<mode>.png`).

## Keyboard run

```sh
node scripts/keyboard-run.mjs
node scripts/keyboard-run.mjs --url http://localhost:5173/ --wait 1400
```

No fake camera and no camera permission (Playwright auto-dismisses the prompt, so the app must land in its no-camera path). Presses `1`, `2`, `3`, `4` in that order, waits `--wait` ms after each, checks `window.__engine.mode` against NORMAL / SIMPLIFY / FOCUS / EXPERT and screenshots `tests/out/keyboard/<mode>.png`. Then presses `d` and screenshots `tests/out/keyboard/debug.png` (inspect the overlay by eye; the script only asserts the mode did not change). Console errors and page errors are reported and written to `tests/out/keyboard/summary.json`.

## Fixtures

`tests/fixtures` is a symlink to the session scratchpad (`/private/tmp/claude-501/-Users-thiagoxikota/41585798-f44b-469e-b2ea-312386f28738/scratchpad/fixtures`). Both `tests/fixtures/` and `tests/out/` are git-ignored. The clips are synthetic: one cut-out face on a grey background, 480x640 at 24 fps, YUV 4:2:0 (`C420jpeg`), so `videoWidth` reads 480 and `videoHeight` 640. Chromium loops a y4m clip, so a 3 s clip repeats several times inside a 10 s run.

| Fixture | Length | Content | Expected outcome (design intent, to be confirmed by the runs) |
| --- | --- | --- | --- |
| `smile.y4m` | 8.0 s (193 frames) | Face at calibration distance, sustained smile | `smile` climbs above `smileOn` 0.45 and stays there; SIMPLIFY-free; NORMAL -> EXPERT after ~0.9 s sustained (`sustainExpertMs`) plus calibration. `brow` stays low. |
| `left.y4m` | 8.0 s (193 frames) | Head turned to the left | Negative or positive `yaw` of clear magnitude (sign depends on the landmarker convention; record it), no mode change. Head orientation is reported, not mapped to a mode. |
| `right.y4m` | 8.0 s (193 frames) | Head turned to the right | Opposite `yaw` sign to `left`, no mode change. |
| `startle.y4m` | 8.0 s (193 frames) | Neutral face, brows raised | `browInnerUp` rises, `brow` (furrow) stays low: no SIMPLIFY. This is the false-positive check for the brow channel. |
| `close-neutral.y4m` | 3.0 s (72 frames) | Face large in frame, neutral | Clip loops, so the face is always close: calibration captures the close size and `proximity` sits near 1.0. Use with `--keys` to test keyboard overrides while a face is present. |
| `close-smile.y4m` | 8.0 s (193 frames) | Face large in frame, smiling | `smile` high; expected EXPERT. Because the clip is close from frame one, `proximity` stays near 1.0, so this is not a lean test. |
| `approach.y4m` | 5.0 s (120 frames) | Face grows from far to close | `proximity` should ramp well above `leanOn` 1.15 after the baseline is captured on the far frames; with a brow furrow absent, no SIMPLIFY. Without pointer dwell, no FOCUS. Because the clip loops, proximity drops back at each restart. |
| `approach-then-smile.y4m` | 9.0 s (216 frames) | Face grows closer, then smiles | `proximity` ramps, then `smile` climbs: expected NORMAL -> EXPERT once the smile is sustained. |

None of the fixtures contains a sustained brow furrow at close range, so the SIMPLIFY gesture (brow activity + leaning forward) is exercised live at the demo and through the keyboard (`2`), not by these clips.

## Reading a summary

- `runningAtMs` is when the landmarker came up; `calibrationMs` is when the distance baseline was ready. Both must be present before any camera-driven transition can appear.
- `transitions[].reason` comes straight from `engine.lastTransition`; a run with a mode change and no transition entry means the mode moved without the engine recording it.
- `stats.<signal>` gives the range each fixture actually produced. Use these to check the thresholds in `src/engine/types.ts` (`browOn` 0.35, `smileOn` 0.45, `leanOn` 1.15) against real values before tuning.
- Console errors and page errors are collected for the whole run; a MediaPipe wasm or model 404 shows up here first.

## Clocks and precision

Samples are taken every 200 ms, so any latency read from the tables carries
that precision. `runningAtMs` counts from the script start, sample `t` from
the first sample, and `transitions[].at` is the page's `performance.now()`;
compare a transition with the sample timeline by `t`, not by `at`.

## Regenerating fixtures

`tests/fixtures` is ignored by git. Run `scripts/make-fixtures.sh` (needs
ffmpeg and the source clips in `~/xikota-os/_design/interactive-head/assets`)
to rebuild every clip; about 560 MB of y4m.
