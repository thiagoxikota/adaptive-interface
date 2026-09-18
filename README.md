# Adaptive interface: the interface responds to how you interact

Build Day demo. A dashboard that physically restructures in response to
observable signals from the camera and the pointer. No emotion inference:
every input is a measurable physical quantity.

```
MediaPipe Face Landmarker -> smoothed signals -> local heuristic state machine -> Framer Motion
```

Claude never sits in that loop. It only writes one line of contextual copy
after a mode has already changed, and the layout never waits for it.

## Run

```bash
npm install
npm run dev            # http://localhost:5173  (add ?debug=1 to open with the debug panel)
```

The camera starts on load; the top bar has a Start camera button for
browsers that need a gesture. Allow the camera when asked.

## Keys

| Key | Effect |
|---|---|
| 1 / 2 / 3 / 4 | NORMAL / SIMPLIFY / FOCUS / EXPERT (keyboard hold of 6 s, then the camera drives again) |
| D | Debug panel with raw and smoothed camera values, thresholds and gesture ramps |
| R | Recalibrate the distance baseline |
| 0 or Esc | Release the keyboard hold |

## Gestures (demo mappings, not claims about internal state)

| Signal pattern | Mode |
|---|---|
| Sustained brow activity + leaning forward (face larger than baseline) | SIMPLIFY |
| Face closer + pointer dwelling on a component | FOCUS that component |
| Sustained smile | EXPERT |
| Leaning back for 1.5 s, or face absent for 3 s | NORMAL |

Every gesture must hold for 0.7 to 0.9 s, every threshold has a lower
release threshold (hysteresis), and a 1.5 s cooldown follows any change.
A single frame can never switch modes. Thresholds live in
`src/engine/types.ts` (`DEFAULT_THRESHOLDS`).

## Layout

- `src/signals/face/` MediaPipe tracker: presence, face height vs a
  calibrated baseline (proximity), brow (browDownLeft/Right), smile
  (mouthSmileLeft/Right), yaw/pitch/roll, time-based EMA smoothing.
- `src/signals/mouse/` pointer velocity, dwell target (`data-focus-id`), dwell time.
- `src/engine/InteractionHeuristicEngine.ts` pure state machine with unit tests (`npm test`).
- `src/hooks/useInteractionMode.ts` composes signals, engine, keyboard and debug flag.
- `src/ui/` the dashboard, mode layouts (`layout.ts`), motion config, debug overlay.
- `src/insight/` static copy per mode plus the async Claude line via a Vite
  dev middleware (`POST /api/insight`). The key is read from the environment
  or the macOS Keychain on the server side only. Set `INSIGHT_DISABLED=1`
  to run without any Claude call.
- `public/mediapipe/` vendored wasm and model, so the demo does not depend on
  event Wi-Fi.

## Verification with a fake camera

`tests/README.md` explains the Playwright harness. Chromium is launched with
`--use-file-for-fake-video-capture` pointing at y4m clips, so the real
MediaPipe pipeline runs headless. Measured on 2026-09-18:

| Clip | Result |
|---|---|
| smile.y4m | calibrated, smile peaked at 0.90, single transition NORMAL to EXPERT 930 ms after the smile crossed 0.45; proximity stayed at or below 1.09 during the smile (was 1.10 with the forehead-to-chin metric) |
| approach-then-smile.y4m | proximity rose to 1.36 on the 1.4x approach and 1.46 at most, no false SIMPLIFY (brow 0.07 max), EXPERT on the smile |
| left / right / startle | mode stayed NORMAL |

```bash
node scripts/keyboard-run.mjs --url http://localhost:5173/?debug=1
node scripts/fake-camera-run.mjs --fixture tests/fixtures/smile.y4m --name smile --duration 10000
node scripts/viewport-shots.mjs http://localhost:5173/ 2 tests/out/viewport-2
```
