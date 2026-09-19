# Architecture

One page. The full pipeline is local and synchronous; Claude joins after the fact.

```
camera frame -> FaceTracker -> FaceSignals (smoothed)  \
pointer events -> useMouseSignals -> MouseSignals        > InteractionHeuristicEngine.update({face, mouse, now}) -> EngineState
keyboard -> engine.setManual / engine.release           /
EngineState.mode + focusTarget -> deriveLayout() -> Layout -> Framer Motion (src/ui)
EngineState.mode + focusTarget -> useInsight() -> POST /api/insight -> Claude (async, replaces static copy on success)
```

## Modules

| Module | Responsibility | Talks to |
|---|---|---|
| `src/signals/face/FaceTracker.ts` | `getUserMedia` at 640x480, MediaPipe Face Landmarker (GPU delegate, automatic CPU fallback), one `detectForVideo` per new video frame, time-based EMA, distance calibration, `subscribe()`. Plain class, no React. | `geometry.ts`, `../smoothing.ts` |
| `src/signals/face/geometry.ts` | Pure functions over a `FaceLandmarkerResult`: face size from landmarks 33-263 and 10-1 with cosine compensation, blendshape picking (5 of 52), head angles from the 4x4 transform matrix with a landmark fallback. | nothing |
| `src/signals/face/useFaceSignals.ts` | React binding. Publishes to React at most every 100 ms; per-frame consumers read the live value through `getFace()`. | `FaceTracker` |
| `src/signals/mouse/useMouseSignals.ts` | One mutable `MouseSignals` object: velocity EMA (120 ms), dwell target from `data-focus-id`, dwell time, idle time. Re-hit-tests with `elementFromPoint` every 200 ms because Framer Motion moves components under a resting pointer. | DOM |
| `src/signals/smoothing.ts` | `Ema`, `median`, `FpsMeter`, `emaAlpha`. Shared by the signal modules. | nothing |
| `src/engine/InteractionHeuristicEngine.ts` | Deterministic state machine. All time comes from `input.now`; no timers, no network, no DOM. Latches with hysteresis, sustained accumulators, cooldown, spent gestures, absence timer, Focus exit. 45 unit tests. | `types.ts` |
| `src/hooks/useInteractionMode.ts` | Composes face, pointer, engine and keyboard. Ticks the engine at 30 Hz from `requestAnimationFrame`, re-renders React only when a visible field changes (progress bucketed to 0.1, cooldown to 250 ms). | everything above |
| `src/ui/layout.ts` | `deriveLayout(mode, focusTarget)`: the only mapping from mode to what is on screen (rail, nav, KPI count, chart variant, primary action placement, density). | `types.ts` |
| `src/ui/*` | Dashboard, cards, signal bar, toast, debug overlay, key strip. Reads `Layout` and `EngineState`; never decides a mode. | Framer Motion |
| `src/insight/useInsight.ts` | Static sentence synchronously from `(mode, focusTarget)`; Claude request 350 ms later, aborted on the next change, ignored on anything but a 200. | `/api/insight` |
| `server/insight.ts` | Vite middleware for dev and preview. Validates the body, calls `claude-opus-5` with an 8 s timeout and no retries, tidies the reply (max 28 words, physical vocabulary regex), answers 200 with JSON or 204. Key from env or macOS Keychain, never sent to the client. | Anthropic SDK |
| `scripts/` | `fake-camera-run.mjs` (Chromium with a y4m clip as the camera, samples the dev globals, writes `tests/out/<name>/summary.json`), `keyboard-run.mjs` (no camera, keys 1 to 4, D), `viewport-shots.mjs` (mid-transition frames), `make-fixtures.sh` (ffmpeg). | dev server |

## Contracts (`src/engine/types.ts`)

- `Mode`: `'NORMAL' | 'SIMPLIFY' | 'FOCUS' | 'EXPERT'`.
- `FaceRaw`: per-frame readings before smoothing: `faceHeight`, `brow`, `smile`, `browInnerUp`, `yaw`, `pitch`, `roll`.
- `FaceSignals`: smoothed, engine-ready: `status` (`idle | loading | running | no-camera | error`), `present`, `presence`, `proximity` (smoothed size over the calibrated baseline, 1.0 until calibrated), `brow`, `smile`, angles, `baselineFaceHeight`, `calibrated`, `fps`, `ts` (`performance.now()` of the last processed frame), `raw`.
- `MouseSignals`: `x`, `y`, `velocity`, `dwellMs`, `dwellTarget`, `idleMs`.
- `EngineInput`: `{ face, mouse, now }`.
- `EngineState`: `mode`, `focusTarget`, `since`, `source` (`init | camera | keyboard`), `progress` per gesture (0 to 1, for the chips and the debug panel), `keyboardHold`, `cooldownMs`, `lastTransition` with a human-readable `reason`.
- `Thresholds` and `DEFAULT_THRESHOLDS`: every `on` has a lower `off`, every gesture has a sustain duration. Values are listed in the README.
- `InteractionModel`: what the UI receives: `state`, `face`, `getFace`, `mouse`, `thresholds`, `debug`, `setMode`, `release`, `toggleDebug`, `recalibrate`, `startCamera`.
- `Insight` / `InsightModel`: `{ mode, focusTarget, text, source: 'claude' | 'static' }` plus `pending`.
- `KEYMAP`: `1 2 3 4` modes, `d` debug, `0` and `Escape` release, `r` recalibrate.

In development the hook exposes `window.__face`, `window.__engine`, `window.__mouse` and `window.__insight`; the harness reads only these.

## Three design decisions

**1. Decisions are local.** The state machine runs in the browser on smoothed numbers, and it is pure: the same series of inputs yields the same transitions, which is what makes the 45 unit tests and the fake-camera harness possible. Latency from gesture to layout is the sustain time plus one animation frame; no network round trip sits in that path, so the demo works on event Wi-Fi and with the key disabled.

**2. Claude is off the critical path.** The layout moves first, the static sentence appears in the same render, and Claude is asked afterwards for one better line. Every failure mode of a network call (timeout, rate limit, refusal, a reply that arrives after the mode moved on, a sentence that drifts into internal-state language) resolves to "keep the static copy". The product is the same with `INSIGHT_DISABLED=1`; Claude improves the words, never the behaviour.

**3. Physical vocabulary only.** Every signal is a measurable quantity: a blendshape coefficient, a face size ratio against a calibrated baseline, a head angle, a pointer dwell. The engine names transitions by those quantities (`smile 0.80 sustained 900ms`), the toast repeats them in words ("Expert: smile held for a second"), and the Claude prompt is instructed to describe what the layout shows, never why the person moved. A measured lean can be shown on a chip, tested with a clip and reversed with one key. An inferred internal state can be none of those.
