Camera lifecycle failures and stale observations can leave tracking stuck or trigger unsupported transitions, and pointer-driven FOCUS exit is unreachable. TypeScript checks passed; sandbox restrictions blocked Vitest, but in-memory reproductions confirmed the reported runtime and assertion failures.

Full review comments:

- [P2] Reject stale camera snapshots before accumulating gestures — /Users/thiagoxikota/Projetos/adaptive-interface/src/engine/InteractionHeuristicEngine.ts:129-131
  If camera frames stop arriving while the page remains active, `useInteractionMode` continues updating the engine with the last snapshot. This gate ignores `face.ts`, so a frozen smile can trigger EXPERT after 900 ms without further camera evidence. An in-memory reproduction confirms this. Expire stale observations and stop crediting them toward gesture duration.

- [P2] Invalidate pending camera requests when model loading fails — /Users/thiagoxikota/Projetos/adaptive-interface/src/signals/face/FaceTracker.ts:341-344
  If model loading fails while camera permission is pending, `failModel()` does not increment `gen`. Granting permission afterward therefore lets `openCamera()` adopt the stream and overwrite the error with `loading`, although `wantLandmarker` is false. The camera stays active without detection, and TopBar hides the retry button. Invalidate the pending generation so the late stream is stopped instead.

- [P2] Provide a retry path when video playback is blocked — /Users/thiagoxikota/Projetos/adaptive-interface/src/signals/face/FaceTracker.ts:260-266
  When browser autoplay policy rejects `video.play()`, this catch leaves the tracker active and permanently `loading`. No later gesture calls `play()` again: TopBar hides Start camera during loading, and `start()` would return immediately because `active` remains true. Publish a recoverable state and explicitly retry playback from the user gesture.

- [P2] Keep receded components detectable by pointer hit-testing — /Users/thiagoxikota/Projetos/adaptive-interface/src/engine/InteractionHeuristicEngine.ts:161-162
  In FOCUS, `Card` and `PrimaryAction` apply `pointer-events: none` to every other target. Consequently, `useMouseSignals` cannot discover those targets through pointer events or `elementFromPoint`; moving onto another card produces a null dwell target. This new non-null condition therefore makes the pointer-driven FOCUS exit unreachable. Preserve target detection independently of the disabled interaction styling.

- [P2] Align regression tests with the revised engine behavior — /Users/thiagoxikota/Projetos/adaptive-interface/src/engine/InteractionHeuristicEngine.test.ts:366-369
  The current engine changes leave four test bodies failing: two retain the previous keyboard-hold behavior, one expects `face absent 3000ms` despite the new 10000 ms threshold, and one expects a null pointer target to exit FOCUS. These failures were reproduced by replaying the assertions in memory. Update the tests alongside the intentional behavior changes so the added test suite passes.