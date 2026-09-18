/** Geometry for the inline SVG line + area chart. Pure functions, no DOM. */

export const CHART_W = 640
export const CHART_H = 220
const PAD_L = 40
const PAD_R = 14
const PAD_T = 22
const PAD_B = 28

export const Y_MAX = 150
export const Y_TICKS: readonly number[] = [0, 50, 100, 150]

const HOURS = 24

export function x(hour: number): number {
  return PAD_L + (hour / (HOURS - 1)) * (CHART_W - PAD_L - PAD_R)
}

export function y(value: number): number {
  return PAD_T + (1 - value / Y_MAX) * (CHART_H - PAD_T - PAD_B)
}

export const X_BASELINE = y(0)
export const X_LEFT = x(0)
export const X_RIGHT = x(HOURS - 1)

export function linePath(series: readonly number[]): string {
  return series
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(' ')
}

export function areaPath(series: readonly number[]): string {
  return `${linePath(series)} L${X_RIGHT.toFixed(1)} ${X_BASELINE.toFixed(1)} L${X_LEFT.toFixed(1)} ${X_BASELINE.toFixed(1)} Z`
}

export function xTicks(every: 3 | 6): number[] {
  const ticks: number[] = []
  for (let h = 0; h < HOURS; h += every) ticks.push(h)
  if (ticks[ticks.length - 1] !== HOURS - 1) ticks.push(HOURS - 1)
  return ticks
}
