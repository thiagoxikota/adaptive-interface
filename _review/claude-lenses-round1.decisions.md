# Claude adversarial review, round 1 (2026-09-18): 5 lenses, arbitration

Findings: engine E1-E7, face F1-F6, ui U1-U16, server S1-S8, wiring W1-W6 (workflow wf_9f48c5b5-6ce, journal has the full text).

ACCEPTED and dispatched to the fix workflow wf_7e93d6da-c5e:
- engine: E1 keyboard FOCUS undone by camera exits; E2 retarget FOCUS instead of flashing NORMAL; E3 remove the 8 s dwell cap; E4 spent flag cleared only by latch release; E6 dt cap 300 ms; F1 (engine half) relax gated on a frontal head; W5 hit-test at 5 Hz.
- face: F1 cos(yaw)/cos(pitch) compensation of the size metric; F2 calibration stability check; F3 failModel closes the landmarker and falls back to CPU; F4 track ended handler; F5 NotAllowedError message; W1 face out of 30 Hz React state (getFace + 100 ms flush); W3 coarser publish buckets; F6 face README.
- ui: U1 no order:-1 on focused cards (sev 5); U2 SIMPLIFY min-height; U3 system fonts, no Google Fonts; U4 KPI divider; U5 activity li layout; U6 signal bar nowrap; U7 truthful FOCUS copy; U8 labels instead of ids; U9 one camera indicator; U10 primary action travel visible; U11 truthful caption; U12 recession without dimming; U13 debug order; U14 dead KPI path; U15 unused tokens; W4 no reflow on D.
- server/docs: S1 fixtures symlink out of git + make-fixtures.sh; S2 single clock in the harness; S3 S4 E7 README numbers; S5 max_tokens 1024; S7 server code out of the browser tsconfig; S8; W2 useMemo; W6 middleware in vite preview.

REJECTED:
- U16 (drop the `reduced` prop, rely on MotionConfig only): 14-component refactor with no user-visible gain tonight.
- S6 (remove InsightModel/pending): cosmetic, crosses file ownership of the parallel fixers.
- E5: already fixed before the review finished (toBeCloseTo).
