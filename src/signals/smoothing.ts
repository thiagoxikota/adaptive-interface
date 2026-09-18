/**
 * Generic, frame-rate independent smoothing helpers shared by the signal
 * modules (face, mouse) and usable by the engine. Pure arithmetic: no DOM,
 * no React, no MediaPipe.
 */

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x
}

/** Blend factor for a time-based EMA: 1 - e^(-dt / tau). */
export function emaAlpha(dtMs: number, tauMs: number): number {
  if (tauMs <= 0) return 1
  if (dtMs <= 0) return 0
  return 1 - Math.exp(-dtMs / tauMs)
}

/**
 * Exponential moving average parameterised by a time constant (ms) instead of
 * a per-sample factor, so the response is identical at 15 fps and at 60 fps.
 *
 * With `initial` given, the filter starts seeded at that value and ramps from
 * there (use this for presence so the first frame with a face does not jump
 * straight to 1). Without `initial`, the first sample is adopted as-is (use
 * this for measurements like face height, which have no meaningful "zero").
 */
export class Ema {
  tauMs: number
  value: number
  private seeded: boolean
  private lastTs: number | null = null

  constructor(tauMs: number, initial?: number) {
    this.tauMs = tauMs
    this.value = initial ?? 0
    this.seeded = initial !== undefined
  }

  update(sample: number, nowMs: number): number {
    if (!this.seeded) {
      this.value = sample
      this.seeded = true
    } else if (this.lastTs !== null) {
      this.value += (sample - this.value) * emaAlpha(nowMs - this.lastTs, this.tauMs)
    }
    // seeded with no time base yet: this call only establishes it
    this.lastTs = nowMs
    return this.value
  }

  /** Forget the time base; the next sample is blended against `value` only if `seeded`. */
  reset(value?: number): void {
    this.value = value ?? 0
    this.seeded = value !== undefined
    this.lastTs = null
  }
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

/** Frames per second measured as the count of ticks inside a sliding window. */
export class FpsMeter {
  private windowMs: number
  private stamps: number[] = []

  constructor(windowMs = 1000) {
    this.windowMs = windowMs
  }

  tick(nowMs: number): number {
    this.stamps.push(nowMs)
    const cutoff = nowMs - this.windowMs
    while (this.stamps.length > 0 && (this.stamps[0] ?? 0) <= cutoff) this.stamps.shift()
    return this.fps
  }

  get fps(): number {
    return (this.stamps.length * 1000) / this.windowMs
  }

  reset(): void {
    this.stamps = []
  }
}

/**
 * Two-threshold switch. Turns on at or above `on`, turns off only below `off`
 * (`off` < `on`), so a value hovering around one threshold cannot flicker.
 */
export class Hysteresis {
  on: number
  off: number
  active: boolean

  constructor(on: number, off: number, initial = false) {
    this.on = on
    this.off = off
    this.active = initial
  }

  update(value: number): boolean {
    if (this.active) {
      if (value < this.off) this.active = false
    } else if (value >= this.on) {
      this.active = true
    }
    return this.active
  }

  reset(active = false): void {
    this.active = active
  }
}

/**
 * Measures how long a condition has been continuously true. `heldMs` is 0 the
 * moment the condition drops, so a single false frame restarts the count.
 */
export class Sustain {
  heldMs = 0
  private startedAt: number | null = null

  update(active: boolean, nowMs: number): number {
    if (!active) {
      this.startedAt = null
      this.heldMs = 0
      return 0
    }
    if (this.startedAt === null) this.startedAt = nowMs
    this.heldMs = nowMs - this.startedAt
    return this.heldMs
  }

  /** 0..1 progress toward `requiredMs` of continuous activity. */
  progress(requiredMs: number): number {
    return requiredMs <= 0 ? 1 : clamp01(this.heldMs / requiredMs)
  }

  reset(): void {
    this.startedAt = null
    this.heldMs = 0
  }
}
