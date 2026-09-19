# Face signals

Camera to `FaceSignals` (see `src/engine/types.ts`). MediaPipe Face Landmarker, Tasks Vision 1.0.1, wasm served from `/mediapipe/wasm`, model from `/mediapipe/face_landmarker.task`. Everything runs in the browser; no frame leaves the machine.

Files

- `FaceTracker.ts`: plain class. Camera, model loading (GPU with automatic CPU fallback), frame loop, smoothing, distance calibration, `subscribe()`.
- `geometry.ts`: pure functions over a `FaceLandmarkerResult` (face height, blendshape picking, head angles).
- `useFaceSignals.ts`: React hook, one tracker per mount, renders throttled to ~30 Hz.
- `../smoothing.ts`: generic `Ema`, `median`, `FpsMeter`, `Hysteresis`, `Sustain`. Shared with other signal modules.

## Landmarker options

`runningMode: 'VIDEO'`, `numFaces: 1`, `outputFaceBlendshapes: true`, `outputFacialTransformationMatrixes: true`, `baseOptions.delegate: 'GPU'`. If creation or the very first `detectForVideo` throws on GPU, the tracker rebuilds on CPU without stopping the loop. Capture is `getUserMedia` at ideal 640x480, `facingMode: 'user'`.

Frame loop: `video.requestVideoFrameCallback` when present, `requestAnimationFrame` otherwise, plus a 1.5 s watchdog that switches to rAF if rVFC never fires for the hidden element. `detectForVideo` runs only when `video.currentTime` advanced; the timestamp is `max(performance.now(), last + 1)` so it is strictly increasing.

## Raw readings (`FaceRaw`)

| field | source |
|---|---|
- Face size (`faceHeight`): distance between the outer eye corners (landmarks 33 and 263) plus forehead-top to nose-tip (landmarks 10 and 1), each divided by cos(yaw) / cos(pitch) (floored at 0.6) so a turned head is not read as a farther face. Forehead-to-chin was dropped because the jaw drops about 10% on a smile. Units: frame height, x scaled by videoWidth/videoHeight.
| `brow` | mean of blendshapes `browDownLeft`, `browDownRight` |
| `smile` | mean of `mouthSmileLeft`, `mouthSmileRight` |
| `browInnerUp` | blendshape `browInnerUp` (debug only) |
| `yaw`, `pitch`, `roll` | degrees from `facialTransformationMatrixes[0]`; landmark fallback if the matrix is missing |

No face on the frame: `present = false`, raw is all zeros.

## Head angle conventions

`facialTransformationMatrixes[0].data` is a 4x4 in column-major order (`data[col * 4 + row]`) mapping the canonical face model into MediaPipe's metric camera space: camera at the origin looking down -Z, +X to the viewer's right, +Y up. The canonical model faces +Z with +X through the ears toward the subject's left, so column 2 is the direction the face points and column 0 the ear-to-ear axis.

- `yaw = atan2(m02, m22)`. Positive when the user turns to THEIR left (nose swings toward the viewer's right in the unmirrored frame).
- `pitch = atan2(m12, hypot(m02, m22))`. Positive with the chin up (looking up).
- `roll = atan2(m10, m00)`. Positive when the subject's left side rises, i.e. the head tilts toward THEIR right shoulder.

"Left"/"right" in landmark names (33/263 eyes, 234/454 cheeks) are the subject's. Landmark coordinates come from the raw camera frame; mirroring the preview with CSS does not change them. If a live check shows the yaw sign inverted, flip the sign in `anglesFromMatrix` only; the fallback in `anglesFromLandmarks` follows the same convention and is the reference.

## Smoothing

Time-based EMA, `alpha = 1 - exp(-dt / tau)`, so behaviour is independent of frame rate.

| signal | tau |
|---|---|
| `brow`, `smile` | 150 ms |
| `faceHeight` (feeds `proximity`) | 250 ms |
| `yaw`, `pitch`, `roll` | 200 ms |
| `presence` (EMA of 0/1) | 400 ms |

While no face is visible, `brow`, `smile` and the angles are fed zeros and decay; `faceHeight` holds its last value so `proximity` does not collapse. After a long absence the next sample is adopted almost fully (large dt).

`fps` counts processed frames in the last 1000 ms. `ts` is `performance.now()` of the last processed frame.

## Distance calibration

- Starts once `presence >= 0.8`. Smoothed `faceHeight` samples are collected for 1500 ms (at least 12 samples); the baseline is their median. Losing the face mid-window restarts the window.
- `proximity = smoothedFaceHeight / baseline`; 1.0 until calibrated. Above 1 means closer.
- Drift: while `proximity` stays within 0.94..1.06 and the face is present, the baseline follows the current value with a 30 s time constant. Outside the band (leaning in or back) the baseline is frozen, so a sustained lean keeps reading as a lean.
- Absence, however long, keeps the baseline. `recalibrate()` (keyboard R via the hook owner) clears it and a new window starts on the next steady presence. `stop()` also keeps the baseline.

Pitch shrinks the projected face height a little (cos of the angle); at the +-10 degrees typical of a demo that is under 2 % and no compensation is applied.

## Status

`idle` -> `loading` -> `running`. `no-camera` when `getUserMedia` rejects (NotAllowedError, NotFoundError, NotReadableError, ...; message in `error`); `start()` can be called again from a button. `error` when the model fails on both delegates or detection fails 5 frames in a row.

## Preview for the debug overlay

The hidden `<video>` (1 px, opacity 0, fixed, appended to `document.body`) is exposed as `videoElement`. To show a preview, render your own `<video muted playsInline autoPlay>` and set `previewRef.current.srcObject = videoElement.srcObject`. Mirror it with `transform: scaleX(-1)`; that does not affect the signals.

## Dev globals

In DEV the hook writes `window.__face` on every processed frame (not throttled).
