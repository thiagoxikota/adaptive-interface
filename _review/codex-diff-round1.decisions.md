# Codex diff review, round 1 (2026-09-18, base c3a4e95 -> working tree)

FINDINGS=5. Arbitration:

1. Stale camera snapshots keep feeding gesture ramps. ACCEPTED. Engine now treats a face snapshot older than 500 ms (face.ts) as "camera not running"; test added.
2. failModel() leaves a pending getUserMedia able to adopt its stream. ACCEPTED. failModel() bumps gen so the late stream is stopped.
3. video.play() rejected by autoplay policy left the tracker stuck in loading. ACCEPTED. The tracker stops the stream and reports no-camera with a message; Start camera (a user gesture) calls start() again.
4. pointer-events: none on receded cards made the pointer-driven FOCUS exit unreachable. ACCEPTED. Recession is visual only now (scale + opacity 0.62); cards stay hoverable.
5. Tests out of date with the new engine semantics. ALREADY DONE in the same edit session (42 tests pass); Codex read the tree mid-edit.

Rejected: none.

# Codex diff review, round 2 (base 33c670d -> working tree)

FINDINGS=3, all ACCEPTED:
1. Toast: Motion's inline transform overrode translateX(-50%). Horizontal centering moved into Motion's x.
2. Signal bar could not wrap and clipped the Back to Normal button on narrow widths. flex-wrap added.
3. Calibration toast lingered after R cleared the baseline. Cleared when calibrated turns false.
