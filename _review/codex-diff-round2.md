The new status UI introduces positioning, responsive-layout, and notification-lifecycle defects. TypeScript checking passed; Vitest could not start under the read-only sandbox.

Full review comments:

- [P2] Preserve horizontal centering in the toast animation — /Users/thiagoxikota/Projetos/adaptive-interface/src/ui/SignalBar.tsx:120-122
  Framer Motion writes an inline `transform` for the `y` animation, overriding `.toast`'s `translateX(-50%)`. Rendering confirms `translateY(8px)` initially and `none` at rest, so the toast starts at the viewport midpoint instead of being centered. On narrow screens, its content and Back to Normal button can be clipped. Include the horizontal translation in Motion's transform or center a separate wrapper.

- [P2] Allow the signal bar to wrap at narrower widths — /Users/thiagoxikota/Projetos/adaptive-interface/src/ui/dashboard.css:980-985
  The outer signal bar cannot wrap, while its status, gesture chips, and Back to Normal button have non-wrapping content and minimum widths. At narrow viewport widths, these items overflow and the trailing recovery button is clipped by the existing `html, body { overflow-x: clip }`. Wrapping only `.gchips` does not resolve the outer row's minimum width. Add wrapping or a stacked responsive layout so the recovery control remains reachable.

- [P3] Clear the calibration toast when calibration is reset — /Users/thiagoxikota/Projetos/adaptive-interface/src/ui/SignalBar.tsx:106-111
  If the user presses R during the calibration toast's 4.5-second lifetime, the effect cleanup cancels its dismissal timer, but the next effect returns without clearing the item because `calibrated` is false. If no face is subsequently available, the stale “Distance calibrated” notification remains indefinitely. Clear the calibration item when calibration becomes false, or manage dismissal independently of that flag.