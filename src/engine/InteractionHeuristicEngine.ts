import {
  DEFAULT_THRESHOLDS,
  type EngineInput,
  type EngineState,
  type Mode,
  type Thresholds,
} from './types'

/**
 * Local, deterministic heuristic state machine.
 *
 * MediaPipe -> smoothed FaceSignals + MouseSignals -> update() -> EngineState.
 * No timers, no network, no React: all time comes from input.now, so the same
 * series of inputs always yields the same transitions (see the unit tests).
 *
 * Every camera-driven transition goes through a sustained accumulator with
 * hysteresis. A single frame can never switch modes.
 */

/**
 * Largest step of wall time one update() may credit to an accumulator.
 * When a tab is hidden, requestAnimationFrame stops and the next update can
 * arrive seconds later; without this cap that one frame could fire a transition.
 */
const MAX_DT_MS = 100

/** ms the cursor must be off the target, or the lean released, to leave FOCUS */
const FOCUS_EXIT_MS = 1200

/** Rate at which an accumulator drains while its gesture is released. */
const DECAY_FACTOR = 2

type Gesture = 'simplify' | 'focus' | 'expert' | 'relax'

interface Accumulators {
  simplify: number
  focus: number
  expert: number
  relax: number
}

/**
 * Per-signal hysteresis latch: engages when the value crosses `on`, and only
 * releases when it drops below `off` (or rises above, for the leaning-back latch).
 */
interface Latch {
  engaged: boolean
}

function latch(l: Latch, value: number, on: number, off: number, gate: boolean): boolean {
  if (!gate) {
    l.engaged = false
    return false
  }
  if (!l.engaged && value >= on) l.engaged = true
  else if (l.engaged && value < off) l.engaged = false
  return l.engaged
}

/** Same as latch() but for a signal that engages when it goes BELOW `on`. */
function latchBelow(l: Latch, value: number, on: number, off: number, gate: boolean): boolean {
  if (!gate) {
    l.engaged = false
    return false
  }
  if (!l.engaged && value <= on) l.engaged = true
  else if (l.engaged && value > off) l.engaged = false
  return l.engaged
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const fmt = (v: number): string => v.toFixed(2)

export class InteractionHeuristicEngine {
  private readonly t: Thresholds

  private mode: Mode = 'NORMAL'
  private focusTarget: string | null = null
  private since = 0
  private source: EngineState['source'] = 'init'
  private lastTransition: EngineState['lastTransition'] = null

  private readonly acc: Accumulators = { simplify: 0, focus: 0, expert: 0, relax: 0 }
  /**
   * Gestures are edge-triggered: once one reaches its threshold it is spent
   * until the user physically releases it. Otherwise two gestures held at the
   * same time (brow+lean and smile) would alternate modes every cooldown.
   */
  private readonly spent: Record<Gesture, boolean> = { simplify: false, focus: false, expert: false, relax: false }
  private absenceAcc = 0
  private focusLeaveAcc = 0
  private focusLeanAcc = 0

  private readonly browLatch: Latch = { engaged: false }
  private readonly leanLatch: Latch = { engaged: false }
  private readonly smileLatch: Latch = { engaged: false }
  private readonly leanBackLatch: Latch = { engaged: false }

  private lastNow: number | null = null
  private cooldownUntil = 0
  private holdUntil = 0
  private holdActive = false
  /** dwellTarget seen on the latest update(); used when FOCUS is chosen by keyboard */
  private lastDwellTarget: string | null = null

  private snapshot: EngineState

  constructor(thresholds?: Partial<Thresholds>) {
    this.t = { ...DEFAULT_THRESHOLDS, ...thresholds }
    this.snapshot = this.buildState(0)
  }

  get thresholds(): Thresholds {
    return this.t
  }

  get state(): EngineState {
    return this.snapshot
  }

  update(input: EngineInput): EngineState {
    const { face, mouse, now } = input
    const t = this.t
    const dt = this.lastNow === null ? 0 : Math.min(MAX_DT_MS, Math.max(0, now - this.lastNow))
    this.lastNow = now
    this.lastDwellTarget = mouse.dwellTarget

    if (this.holdActive && now >= this.holdUntil) {
      // The hold expires quietly: ramps restart from zero so the camera cannot
      // fire on the very next frame from progress it built during the hold.
      this.holdActive = false
      this.resetRamps()
    }

    const cameraRunning = face.status === 'running'
    const faceOk = cameraRunning && face.presence >= t.presenceMin
    const leanOk = faceOk && face.calibrated

    const brow = latch(this.browLatch, face.brow, t.browOn, t.browOff, faceOk)
    const lean = latch(this.leanLatch, face.proximity, t.leanOn, t.leanOff, leanOk)
    const smile = latch(this.smileLatch, face.smile, t.smileOn, t.smileOff, faceOk)
    const leanBack = latchBelow(this.leanBackLatch, face.proximity, t.leanBackOn, t.leanBackOff, leanOk)

    const dwelling = mouse.dwellTarget !== null && mouse.dwellMs >= t.dwellMs

    const simplifyActive = brow && lean
    // Brow present means simplify owns the lean; focus waits.
    const focusActive = lean && dwelling && !brow
    const expertActive = smile
    // A smile or a furrowed brow is an active signal; leaning back only relaxes when they stop.
    const relaxActive = leanBack && !smile && !brow

    this.ramp('simplify', simplifyActive, dt, t.sustainSimplifyMs)
    this.ramp('focus', focusActive, dt, t.sustainFocusMs)
    this.ramp('expert', expertActive, dt, t.sustainExpertMs)
    this.ramp('relax', relaxActive, dt, t.sustainRelaxMs)

    if (cameraRunning && face.presence < t.presenceMin) {
      this.absenceAcc = Math.min(t.absenceMs, this.absenceAcc + dt)
    } else {
      this.absenceAcc = 0
    }

    if (this.mode === 'FOCUS') {
      this.focusLeaveAcc =
        mouse.dwellTarget !== this.focusTarget ? Math.min(FOCUS_EXIT_MS, this.focusLeaveAcc + dt) : 0
      this.focusLeanAcc =
        leanOk && face.proximity < t.leanOff ? Math.min(FOCUS_EXIT_MS, this.focusLeanAcc + dt) : 0
    } else {
      this.focusLeaveAcc = 0
      this.focusLeanAcc = 0
    }

    const canFire = !this.holdActive && now >= this.cooldownUntil
    const pick = this.pickTransition(input, simplifyActive)
    if (pick) {
      if (pick.to === this.mode) {
        // Same-mode gesture: consumed, nothing else happens (no cooldown reset).
        if (pick.gesture) {
          this.spent[pick.gesture] = true
          this.acc[pick.gesture] = 0
        }
      } else if (canFire) {
        if (pick.gesture) this.spent[pick.gesture] = true
        this.transition(pick.to, pick.focusTarget, now, 'camera', pick.reason)
      }
    }

    this.snapshot = this.buildState(now)
    return this.snapshot
  }

  setManual(mode: Mode, now: number): EngineState {
    this.lastNow ??= now
    const target = mode === 'FOCUS' ? this.lastDwellTarget : null
    this.holdActive = true
    this.holdUntil = now + this.t.keyboardHoldMs
    this.resetRamps()
    if (mode !== this.mode || (mode === 'FOCUS' && target !== this.focusTarget)) {
      this.transition(mode, target, now, 'keyboard', `keyboard ${mode}`)
    }
    this.snapshot = this.buildState(now)
    return this.snapshot
  }

  release(now: number): EngineState {
    this.holdActive = false
    this.holdUntil = 0
    this.cooldownUntil = 0
    this.resetRamps()
    this.snapshot = this.buildState(now)
    return this.snapshot
  }

  private ramp(g: Gesture, active: boolean, dt: number, threshold: number): void {
    if (!active) {
      this.spent[g] = false
      this.acc[g] = Math.max(0, this.acc[g] - DECAY_FACTOR * dt)
    } else if (this.spent[g]) {
      this.acc[g] = 0
    } else {
      this.acc[g] = Math.min(threshold, this.acc[g] + dt)
    }
  }

  private pickTransition(
    input: EngineInput,
    simplifyActive: boolean,
  ): { gesture: Gesture | null; to: Mode; focusTarget: string | null; reason: string } | null {
    const { face, mouse } = input
    const t = this.t

    // Absence and FOCUS exits are not gestures: they only ever lead to NORMAL.
    if (this.absenceAcc >= t.absenceMs) {
      return this.mode === 'NORMAL'
        ? null
        : { gesture: null, to: 'NORMAL', focusTarget: null, reason: `face absent ${t.absenceMs}ms` }
    }

    if (this.mode === 'FOCUS') {
      if (this.focusLeaveAcc >= FOCUS_EXIT_MS) {
        return {
          gesture: null,
          to: 'NORMAL',
          focusTarget: null,
          reason: `cursor left '${this.focusTarget}' for ${FOCUS_EXIT_MS}ms`,
        }
      }
      if (this.focusLeanAcc >= FOCUS_EXIT_MS) {
        return {
          gesture: null,
          to: 'NORMAL',
          focusTarget: null,
          reason: `lean released (${fmt(face.proximity)}) for ${FOCUS_EXIT_MS}ms`,
        }
      }
    }

    // Priority order. The first ready gesture is picked even when its target
    // is the current mode (the caller then marks it spent without a transition),
    // so a same-mode gesture never shadows a lower-priority one for long.
    if (this.acc.simplify >= t.sustainSimplifyMs) {
      return {
        gesture: 'simplify',
        to: 'SIMPLIFY',
        focusTarget: null,
        reason: `brow ${fmt(face.brow)} + lean ${fmt(face.proximity)} sustained ${t.sustainSimplifyMs}ms`,
      }
    }

    if (!simplifyActive && this.acc.focus >= t.sustainFocusMs && mouse.dwellTarget !== null) {
      return {
        gesture: 'focus',
        to: 'FOCUS',
        focusTarget: mouse.dwellTarget,
        reason: `lean ${fmt(face.proximity)} + dwell on '${mouse.dwellTarget}' ${Math.round(mouse.dwellMs)}ms sustained ${t.sustainFocusMs}ms`,
      }
    }

    if (this.acc.expert >= t.sustainExpertMs) {
      return {
        gesture: 'expert',
        to: 'EXPERT',
        focusTarget: null,
        reason: `smile ${fmt(face.smile)} sustained ${t.sustainExpertMs}ms`,
      }
    }

    if (this.acc.relax >= t.sustainRelaxMs) {
      return {
        gesture: 'relax',
        to: 'NORMAL',
        focusTarget: null,
        reason: `leaned back ${fmt(face.proximity)} sustained ${t.sustainRelaxMs}ms`,
      }
    }

    return null
  }

  private transition(
    to: Mode,
    focusTarget: string | null,
    now: number,
    source: 'camera' | 'keyboard',
    reason: string,
  ): void {
    this.lastTransition = { from: this.mode, to, at: now, reason }
    this.mode = to
    this.focusTarget = to === 'FOCUS' ? focusTarget : null
    this.since = now
    this.source = source
    // Keyboard transitions are covered by the hold; cooldown is for camera-driven ones.
    if (source === 'camera') this.cooldownUntil = now + this.t.cooldownMs
    // Every transition consumes the gesture that caused it and any partial
    // ramps: the next one must be sustained fresh.
    this.resetRamps()
  }

  private resetRamps(): void {
    this.acc.simplify = 0
    this.acc.focus = 0
    this.acc.expert = 0
    this.acc.relax = 0
    this.absenceAcc = 0
    this.focusLeaveAcc = 0
    this.focusLeanAcc = 0
  }

  private buildState(now: number): EngineState {
    const t = this.t
    return {
      mode: this.mode,
      focusTarget: this.focusTarget,
      since: this.since,
      source: this.source,
      progress: {
        simplify: clamp01(this.acc.simplify / t.sustainSimplifyMs),
        focus: clamp01(this.acc.focus / t.sustainFocusMs),
        expert: clamp01(this.acc.expert / t.sustainExpertMs),
        relax: clamp01(this.acc.relax / t.sustainRelaxMs),
      },
      keyboardHold: this.holdActive,
      cooldownMs: Math.max(0, this.cooldownUntil - now),
      lastTransition: this.lastTransition,
    }
  }
}
