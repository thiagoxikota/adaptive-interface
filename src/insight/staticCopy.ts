import type { Mode } from '../engine/types.ts'

/**
 * Copy shown the instant a mode changes. Claude may replace it later, off the
 * critical path. Physical vocabulary only: what the layout shows or lets the
 * user do, never why the person did something.
 */
export const STATIC_COPY: Record<Mode, string> = {
  NORMAL: 'Full dashboard: hourly deliveries, pending routes, activity and the fleet panel are all in view.',
  SIMPLIFY: 'The layout is reduced to one number and the next action, with the chart read as a sentence.',
  FOCUS: 'One component is enlarged and the rest of the dashboard steps back.',
  EXPERT: 'Dense view: advanced metrics, shortcuts and controls are all within reach.',
}

/** FOCUS variants keyed by the data-focus-id of the enlarged component. */
export const FOCUS_COPY: Record<string, string> = {
  chart: 'The deliveries chart fills the view with hourly detail and the trend line.',
  kpis: 'The key numbers are enlarged: deliveries per hour, 12 pending routes, on-time rate 94%.',
  activity: 'The activity feed is expanded so recent events read in order.',
  fleet: 'The fleet panel is enlarged with each vehicle and its current route.',
  'primary-action': 'The primary action is front and center, ready to dispatch the pending routes.',
}

export function staticCopyFor(mode: Mode, focusTarget: string | null): string {
  if (mode === 'FOCUS' && focusTarget !== null && Object.hasOwn(FOCUS_COPY, focusTarget)) {
    return FOCUS_COPY[focusTarget]
  }
  return STATIC_COPY[mode]
}
