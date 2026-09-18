import { describe, expect, it } from 'vitest'
import { InteractionHeuristicEngine } from './InteractionHeuristicEngine'
import {
  DEFAULT_FOCUS_TARGET,
  DEFAULT_THRESHOLDS as T,
  EMPTY_FACE,
  EMPTY_MOUSE,
  type EngineState,
  type FaceSignals,
  type MouseSignals,
  type Thresholds,
} from './types'

/** 30 Hz synthetic camera clock. */
const DT = 1000 / 30

/** A calibrated face at baseline distance with a neutral expression. */
const face = (over: Partial<FaceSignals> = {}): Partial<FaceSignals> => ({
  status: 'running',
  present: true,
  presence: 1,
  calibrated: true,
  baselineFaceHeight: 0.3,
  ...over,
})

const BROW_LEAN = face({ brow: 0.52, proximity: 1.18 })
const SMILE = face({ smile: 0.61 })
const NEUTRAL = face()
const LEAN = face({ proximity: 1.15 })
const LEAN_BACK = face({ proximity: 0.85 })
const ABSENT = face({ present: false, presence: 0 })

interface RunResult {
  state: EngineState
  /** time of the first frame in the run at which a transition fired, or null */
  firedAt: number | null
  /** every transition that fired in this run, in order */
  fired: Array<{ at: number; to: EngineState['mode']; target: string | null }>
}

/**
 * Drives one engine through synthetic time. The mouse dwell behaves like
 * useMouseSignals: dwellMs grows while the target stays the same, resets on change.
 */
class Sim {
  readonly engine: InteractionHeuristicEngine
  now = 0
  private started = false
  private dwellTarget: string | null = null
  private dwellMs = 0

  constructor(thresholds?: Partial<Thresholds>) {
    this.engine = new InteractionHeuristicEngine(thresholds)
  }

  get state(): EngineState {
    return this.engine.state
  }

  /** Runs `ms` of frames with a constant face and pointer target. */
  run(ms: number, f: Partial<FaceSignals>, target: string | null = null): RunResult {
    const frames = Math.round(ms / DT)
    const fired: RunResult['fired'] = []
    let state = this.engine.state
    for (let i = 0; i < frames; i++) {
      if (this.started) this.now += DT
      this.started = true
      if (target === this.dwellTarget && target !== null) this.dwellMs += DT
      else this.dwellMs = 0
      this.dwellTarget = target

      const before = state.lastTransition?.at ?? -1
      state = this.engine.update({
        face: { ...EMPTY_FACE, ...f, ts: this.now },
        mouse: this.mouse(),
        now: this.now,
      })
      const after = state.lastTransition?.at ?? -1
      if (after !== before) fired.push({ at: this.now, to: state.mode, target: state.focusTarget })
    }
    return { state, firedAt: fired[0]?.at ?? null, fired }
  }

  /** Reaches EXPERT through a real sustained smile, then waits out the cooldown. */
  smileIntoExpert(): void {
    const r = this.run(1000, SMILE)
    expect(r.state.mode).toBe('EXPERT')
    this.run(T.cooldownMs + DT, NEUTRAL)
    expect(this.state.cooldownMs).toBe(0)
  }

  private mouse(): MouseSignals {
    return { ...EMPTY_MOUSE, dwellTarget: this.dwellTarget, dwellMs: this.dwellMs }
  }
}

/** The fire time must be at or just after the sustain threshold (frame quantization). */
const expectFiredAround = (firedAt: number | null, expectedMs: number): void => {
  expect(firedAt).not.toBeNull()
  expect(firedAt as number).toBeGreaterThanOrEqual(expectedMs - 1)
  expect(firedAt as number).toBeLessThan(expectedMs + 2 * DT)
}

describe('InteractionHeuristicEngine: sustained gestures', () => {
  it('starts in NORMAL with zero progress and no hold', () => {
    const sim = new Sim()
    expect(sim.state).toMatchObject({
      mode: 'NORMAL',
      focusTarget: null,
      source: 'init',
      keyboardHold: false,
      cooldownMs: 0,
      lastTransition: null,
      progress: { simplify: 0, focus: 0, expert: 0, relax: 0 },
    })
  })

  it('sustained smile -> EXPERT at sustainExpertMs, not before', () => {
    const sim = new Sim()
    const early = sim.run(T.sustainExpertMs - 100, SMILE)
    expect(early.state.mode).toBe('NORMAL')
    expect(early.state.progress.expert).toBeGreaterThan(0.8)
    expect(early.state.progress.expert).toBeLessThan(1)

    const r = sim.run(400, SMILE)
    expect(r.state.mode).toBe('EXPERT')
    expect(r.state.source).toBe('camera')
    expectFiredAround(r.firedAt, T.sustainExpertMs)
    expect(r.state.lastTransition).toMatchObject({ from: 'NORMAL', to: 'EXPERT' })
    expect(r.state.lastTransition?.reason).toMatch(/smile 0\.61 sustained 900ms/)
  })

  it('a 3-frame smile spike never transitions and the ramp drains back to 0', () => {
    const sim = new Sim()
    sim.run(500, NEUTRAL)
    const spike = sim.run(3 * DT, SMILE)
    expect(spike.state.mode).toBe('NORMAL')
    expect(spike.state.progress.expert).toBeGreaterThan(0)
    const after = sim.run(500, NEUTRAL)
    expect(after.state.mode).toBe('NORMAL')
    expect(after.state.progress.expert).toBe(0)
    expect(after.fired).toHaveLength(0)
  })

  it('brow + lean -> SIMPLIFY with a descriptive reason', () => {
    const sim = new Sim()
    const r = sim.run(1200, BROW_LEAN)
    expect(r.state.mode).toBe('SIMPLIFY')
    expectFiredAround(r.firedAt, T.sustainSimplifyMs)
    expect(r.state.lastTransition?.reason).toBe('brow 0.52 + lean 1.18 sustained 900ms')
  })

  it('brow alone or lean alone never reaches SIMPLIFY', () => {
    const sim = new Sim()
    expect(sim.run(3000, face({ brow: 0.6 })).state.mode).toBe('NORMAL')
    expect(sim.run(3000, LEAN).state.mode).toBe('NORMAL')
  })

  it('lean + cursor dwell -> FOCUS on the dwelt component', () => {
    const sim = new Sim()
    const r = sim.run(2500, LEAN, 'revenue-chart')
    expect(r.state.mode).toBe('FOCUS')
    expect(r.state.focusTarget).toBe('revenue-chart')
    // dwell must reach dwellMs first, then the gesture is sustained sustainFocusMs
    expectFiredAround(r.firedAt, T.dwellMs + T.sustainFocusMs)
    expect(r.state.lastTransition?.reason).toMatch(/dwell on 'revenue-chart'/)
  })

  it('lean without a dwell target, or dwell without lean, never reaches FOCUS', () => {
    const a = new Sim()
    expect(a.run(3000, LEAN, null).state.mode).toBe('NORMAL')
    const b = new Sim()
    expect(b.run(3000, NEUTRAL, 'revenue-chart').state.mode).toBe('NORMAL')
  })

  it('brow + lean + dwell -> SIMPLIFY wins over FOCUS', () => {
    const sim = new Sim()
    const r = sim.run(3000, BROW_LEAN, 'revenue-chart')
    expect(r.fired.map((f) => f.to)).toEqual(['SIMPLIFY'])
    expect(r.state.focusTarget).toBeNull()
    expect(r.state.progress.focus).toBe(0)
  })

  it('SIMPLIFY then sustained smile -> EXPERT (the demo arc)', () => {
    const sim = new Sim()
    sim.run(1200, BROW_LEAN)
    expect(sim.state.mode).toBe('SIMPLIFY')
    // brow still faintly latched (above browOff) while the user leans and smiles
    const r = sim.run(6000, face({ brow: 0.25, proximity: 1.15, smile: 0.6 }))
    expect(r.state.mode).toBe('EXPERT')
    expect(r.state.lastTransition).toMatchObject({ from: 'SIMPLIFY', to: 'EXPERT' })
    // brow+lean is still held but already spent: no SIMPLIFY/EXPERT flapping
    expect(r.fired.map((f) => f.to)).toEqual(['EXPERT'])
  })

  it('a held gesture is spent after firing and only re-arms after a physical release', () => {
    const sim = new Sim()
    sim.run(1200, BROW_LEAN)
    sim.run(2500, face({ brow: 0.52, proximity: 1.18, smile: 0.6 }))
    expect(sim.state.mode).toBe('EXPERT')
    // smile released, brow+lean never released: nothing may fire
    const held = sim.run(5000, BROW_LEAN)
    expect(held.fired).toHaveLength(0)
    expect(held.state.progress.simplify).toBe(0)
    // release the brow, then furrow again: a fresh sustained gesture counts
    sim.run(300, LEAN)
    const again = sim.run(1200, BROW_LEAN)
    expect(again.state.mode).toBe('SIMPLIFY')
    expectFiredAround(again.firedAt, sim.now - 1200 + T.sustainSimplifyMs)
  })
})

describe('InteractionHeuristicEngine: cooldown, hysteresis, single frames', () => {
  it('cooldown blocks a second transition until it expires', () => {
    const sim = new Sim()
    const first = sim.run(1000, BROW_LEAN)
    expect(first.state.mode).toBe('SIMPLIFY')
    const simplifyAt = first.firedAt as number
    expect(first.state.cooldownMs).toBeGreaterThan(0)

    // Smile immediately: the ramp is full at +900ms but cooldown runs until +1500ms.
    const r = sim.run(2000, SMILE)
    expect(r.state.mode).toBe('EXPERT')
    expectFiredAround(r.firedAt, simplifyAt + T.cooldownMs)
    expect((r.firedAt as number) - simplifyAt).toBeGreaterThanOrEqual(T.cooldownMs)
  })

  it('progress is capped at 1 while cooling down', () => {
    const sim = new Sim()
    sim.run(1000, BROW_LEAN)
    const r = sim.run(1200, SMILE)
    expect(r.state.mode).toBe('SIMPLIFY')
    expect(r.state.progress.expert).toBe(1)
  })

  it('hysteresis: a value between off and on keeps accumulating', () => {
    const sim = new Sim()
    sim.run(400, face({ smile: 0.5 }))
    const r = sim.run(800, face({ smile: 0.3 })) // 0.25 < 0.3 < 0.45
    expect(r.state.mode).toBe('EXPERT')
    expectFiredAround(r.firedAt, T.sustainExpertMs)
  })

  it('hysteresis: a value between off and on never starts a ramp', () => {
    const sim = new Sim()
    const r = sim.run(3000, face({ smile: 0.3 }))
    expect(r.state.mode).toBe('NORMAL')
    expect(r.state.progress.expert).toBe(0)
  })

  it('hysteresis: dropping below off decays the ramp at 2x instead of resetting it', () => {
    const sim = new Sim()
    sim.run(400, face({ smile: 0.5 }))
    const dip = sim.run(100, face({ smile: 0.1 }))
    // 400 accumulated, 100ms below off drains 200 -> about 200 left
    expect(dip.state.progress.expert).toBeGreaterThan(0.15)
    expect(dip.state.progress.expert).toBeLessThan(0.3)
    const r = sim.run(1000, face({ smile: 0.5 }))
    expect(r.state.mode).toBe('EXPERT')
    // 200 left + 700 more = fires ~1200ms after start (a hard reset would be 1400)
    expectFiredAround(r.firedAt, 1200)
  })

  it('one huge frame gap cannot fire a transition on its own', () => {
    const engine = new InteractionHeuristicEngine()
    const input = (now: number) => ({
      face: { ...EMPTY_FACE, ...SMILE },
      mouse: EMPTY_MOUSE,
      now,
    })
    engine.update(input(0))
    const s = engine.update(input(30_000)) // tab was hidden for 30s
    expect(s.mode).toBe('NORMAL')
    expect(s.progress.expert).toBeLessThan(0.2)
  })

  it('a stale face snapshot (no new camera frame) stops feeding the ramps', () => {
    const sim = new Sim()
    sim.run(300, SMILE)
    const before = sim.state.progress.expert
    expect(before).toBeGreaterThan(0)
    // the camera froze: same snapshot, ts no longer advancing
    const frozenTs = sim.now
    const frames = Math.round(1500 / DT)
    let state = sim.state
    for (let i = 0; i < frames; i++) {
      sim.now += DT
      state = sim.engine.update({ face: { ...EMPTY_FACE, ...SMILE, ts: frozenTs }, mouse: EMPTY_MOUSE, now: sim.now })
    }
    expect(state.mode).toBe('NORMAL')
    expect(state.progress.expert).toBe(0)
  })

  it('camera not running -> no camera transitions at all', () => {
    const sim = new Sim()
    const r = sim.run(3000, { ...SMILE, status: 'loading' })
    expect(r.state.mode).toBe('NORMAL')
    expect(r.state.progress.expert).toBe(0)
  })

  it('presence below presenceMin -> face signals are ignored', () => {
    const sim = new Sim()
    const r = sim.run(3000, face({ smile: 0.8, presence: 0.4 }))
    expect(r.state.mode).toBe('NORMAL')
  })
})

describe('InteractionHeuristicEngine: keyboard override', () => {
  it('setManual switches immediately with source keyboard and starts a short cooldown', () => {
    const sim = new Sim()
    sim.run(200, NEUTRAL)
    const s = sim.engine.setManual('EXPERT', sim.now)
    expect(s.mode).toBe('EXPERT')
    expect(s.source).toBe('keyboard')
    expect(s.keyboardHold).toBe(true)
    expect(s.cooldownMs).toBeCloseTo(T.keyboardHoldMs, 6)
    expect(s.since).toBe(sim.now)
    expect(s.lastTransition).toMatchObject({ from: 'NORMAL', to: 'EXPERT', reason: 'keyboard EXPERT' })
  })

  it('a gesture started after the key press fires as soon as the cooldown ends', () => {
    const sim = new Sim()
    sim.run(100, NEUTRAL)
    sim.engine.setManual('SIMPLIFY', sim.now)
    const pressedAt = sim.now
    const during = sim.run(T.keyboardHoldMs - 200, SMILE)
    expect(during.state.mode).toBe('SIMPLIFY')
    expect(during.state.keyboardHold).toBe(true)
    expect(during.fired).toHaveLength(0)
    const after = sim.run(1500, SMILE)
    expect(after.state.mode).toBe('EXPERT')
    expect(after.state.keyboardHold).toBe(false)
    expectFiredAround(after.firedAt, pressedAt + T.keyboardHoldMs)
  })

  it('an expression already on the face when the key is pressed cannot undo the key press', () => {
    const sim = new Sim()
    sim.run(400, SMILE)
    sim.engine.setManual('SIMPLIFY', sim.now)
    const held = sim.run(4000, SMILE)
    expect(held.state.mode).toBe('SIMPLIFY')
    expect(held.fired).toHaveLength(0)
    sim.run(500, NEUTRAL)
    const again = sim.run(1500, SMILE)
    expect(again.state.mode).toBe('EXPERT')
  })

  it('release() ends the cooldown early and the camera drives again', () => {
    const sim = new Sim()
    sim.run(100, NEUTRAL)
    sim.engine.setManual('SIMPLIFY', sim.now)
    sim.run(500, NEUTRAL)
    const released = sim.engine.release(sim.now)
    expect(released.keyboardHold).toBe(false)
    expect(released.cooldownMs).toBe(0)
    const releaseAt = sim.now
    const r = sim.run(1500, SMILE)
    expect(r.state.mode).toBe('EXPERT')
    expectFiredAround(r.firedAt, releaseAt + T.sustainExpertMs)
  })

  it('setManual to the current mode only restarts the cooldown, no transition record', () => {
    const sim = new Sim()
    sim.run(100, NEUTRAL)
    const s = sim.engine.setManual('NORMAL', sim.now)
    expect(s.mode).toBe('NORMAL')
    expect(s.keyboardHold).toBe(true)
    expect(s.lastTransition).toBeNull()
  })

  it('keyboard FOCUS targets the component under the pointer, else the default target', () => {
    const sim = new Sim()
    sim.run(200, NEUTRAL, 'kpi-grid')
    const s = sim.engine.setManual('FOCUS', sim.now)
    expect(s.mode).toBe('FOCUS')
    expect(s.focusTarget).toBe('kpi-grid')
    const sim2 = new Sim()
    sim2.run(200, NEUTRAL, null)
    expect(sim2.engine.setManual('FOCUS', sim2.now).focusTarget).toBe(DEFAULT_FOCUS_TARGET)
  })

  it('camera transitions during the keyboard cooldown do not fire even when fully ramped', () => {
    const sim = new Sim()
    sim.run(100, NEUTRAL)
    sim.engine.setManual('NORMAL', sim.now)
    const r = sim.run(T.keyboardHoldMs - 100, BROW_LEAN)
    expect(r.state.mode).toBe('NORMAL')
    expect(r.state.progress.simplify).toBe(1)
  })
})

describe('InteractionHeuristicEngine: returning to NORMAL', () => {
  it('face absent for absenceMs -> NORMAL', () => {
    const sim = new Sim()
    sim.smileIntoExpert()
    const leftAt = sim.now
    const r = sim.run(T.absenceMs + 500, ABSENT)
    expect(r.state.mode).toBe('NORMAL')
    expectFiredAround(r.firedAt, leftAt + T.absenceMs)
    expect(r.state.lastTransition?.reason).toBe(`face absent ${T.absenceMs}ms`)
  })

  it('a short absence does not reset the mode', () => {
    const sim = new Sim()
    sim.smileIntoExpert()
    sim.run(1000, ABSENT)
    const r = sim.run(2500, NEUTRAL)
    expect(r.state.mode).toBe('EXPERT')
  })

  it('absence while already NORMAL is a no-op', () => {
    const sim = new Sim()
    const r = sim.run(5000, ABSENT)
    expect(r.state.mode).toBe('NORMAL')
    expect(r.fired).toHaveLength(0)
  })

  it('leaning back sustained -> NORMAL (relax)', () => {
    const sim = new Sim()
    sim.smileIntoExpert()
    const backAt = sim.now
    const r = sim.run(T.sustainRelaxMs + 300, LEAN_BACK)
    expect(r.state.mode).toBe('NORMAL')
    expectFiredAround(r.firedAt, backAt + T.sustainRelaxMs)
    expect(r.state.lastTransition?.reason).toMatch(/leaned back 0\.85/)
  })

  it('leaning back while still smiling does not relax (no EXPERT/NORMAL flapping)', () => {
    const sim = new Sim()
    sim.smileIntoExpert()
    const r = sim.run(4000, face({ proximity: 0.85, smile: 0.6 }))
    expect(r.state.mode).toBe('EXPERT')
    expect(r.fired).toHaveLength(0)
  })

  it('not calibrated -> no lean-based transitions, smile still works', () => {
    const sim = new Sim()
    expect(sim.run(3000, { ...BROW_LEAN, calibrated: false }).state.mode).toBe('NORMAL')
    expect(sim.run(3000, { ...LEAN, calibrated: false }, 'revenue-chart').state.mode).toBe('NORMAL')
    expect(sim.state.progress.simplify).toBe(0)
    expect(sim.state.progress.focus).toBe(0)
    expect(sim.run(1200, { ...SMILE, calibrated: false }).state.mode).toBe('EXPERT')
    expect(sim.run(3000, { ...LEAN_BACK, calibrated: false }).state.mode).toBe('EXPERT')
  })

  it('a gesture whose target is the current mode is a no-op (no cooldown reset)', () => {
    const sim = new Sim()
    sim.smileIntoExpert()
    const at = sim.state.lastTransition?.at
    const r = sim.run(5000, SMILE)
    expect(r.fired).toHaveLength(0)
    expect(r.state.lastTransition?.at).toBe(at)
    expect(r.state.cooldownMs).toBe(0)
    // consumed: the ramp sits at 0 until the smile is released and made again
    expect(r.state.progress.expert).toBe(0)
  })

  it('a same-mode gesture reached by keyboard is consumed too', () => {
    const sim = new Sim()
    sim.run(100, NEUTRAL)
    sim.engine.setManual('EXPERT', sim.now)
    sim.engine.release(sim.now)
    const r = sim.run(3000, SMILE)
    expect(r.state.mode).toBe('EXPERT')
    expect(r.fired).toHaveLength(0)
    expect(r.state.progress.expert).toBe(0)
  })
})

describe('InteractionHeuristicEngine: FOCUS exit', () => {
  const intoFocus = (sim: Sim): void => {
    sim.run(2500, LEAN, 'revenue-chart')
    expect(sim.state.mode).toBe('FOCUS')
    sim.run(T.cooldownMs, LEAN, 'revenue-chart')
    expect(sim.state.mode).toBe('FOCUS')
  }

  it('cursor on blank space or a parked pointer keeps FOCUS', () => {
    const sim = new Sim()
    intoFocus(sim)
    const r = sim.run(3000, LEAN, null)
    expect(r.state.mode).toBe('FOCUS')
    expect(r.fired).toHaveLength(0)
  })

  it('cursor rests on another component for 1200ms -> NORMAL', () => {
    const sim = new Sim()
    intoFocus(sim)
    const leftAt = sim.now
    const r = sim.run(1600, LEAN, 'fleet-table')
    expect(r.state.mode).toBe('NORMAL')
    expectFiredAround(r.firedAt, leftAt + 1200)
    expect(r.state.lastTransition?.reason).toMatch(/cursor left 'revenue-chart'/)
  })

  it('cursor briefly leaves and comes back -> stays in FOCUS', () => {
    const sim = new Sim()
    intoFocus(sim)
    sim.run(600, LEAN, null)
    const r = sim.run(2000, LEAN, 'revenue-chart')
    expect(r.state.mode).toBe('FOCUS')
    expect(r.fired).toHaveLength(0)
  })

  it('lean released for 1200ms -> NORMAL', () => {
    const sim = new Sim()
    intoFocus(sim)
    const releasedAt = sim.now
    const r = sim.run(1600, face({ proximity: 1.0 }), 'revenue-chart')
    expect(r.state.mode).toBe('NORMAL')
    expectFiredAround(r.firedAt, releasedAt + 1200)
    expect(r.state.lastTransition?.reason).toMatch(/lean released/)
  })

  it('re-dwelling on the same target while in FOCUS does nothing', () => {
    const sim = new Sim()
    intoFocus(sim)
    const r = sim.run(3000, LEAN, 'revenue-chart')
    expect(r.fired).toHaveLength(0)
    expect(r.state.focusTarget).toBe('revenue-chart')
  })
})

describe('InteractionHeuristicEngine: configuration and determinism', () => {
  it('merges partial threshold overrides over the defaults', () => {
    const engine = new InteractionHeuristicEngine({ sustainExpertMs: 300, smileOn: 0.7 })
    expect(engine.thresholds).toEqual({ ...T, sustainExpertMs: 300, smileOn: 0.7 })
    const sim = new Sim({ sustainExpertMs: 300 })
    const r = sim.run(600, SMILE)
    expect(r.state.mode).toBe('EXPERT')
    expectFiredAround(r.firedAt, 300)
  })

  it('the same input series always yields the same transitions', () => {
    const play = (): RunResult['fired'] => {
      const sim = new Sim()
      const out: RunResult['fired'] = []
      out.push(...sim.run(1200, BROW_LEAN).fired)
      out.push(...sim.run(2500, SMILE).fired)
      out.push(...sim.run(2500, LEAN_BACK).fired)
      out.push(...sim.run(3000, LEAN, 'kpi-grid').fired)
      return out
    }
    const a = play()
    const b = play()
    expect(a).toEqual(b)
    expect(a.map((f) => f.to)).toEqual(['SIMPLIFY', 'EXPERT', 'NORMAL', 'FOCUS'])
  })

  it('state snapshots are immutable objects, a new one per update', () => {
    const sim = new Sim()
    const before = sim.state
    sim.run(100, NEUTRAL)
    expect(sim.state).not.toBe(before)
    expect(before.mode).toBe('NORMAL')
  })
})
