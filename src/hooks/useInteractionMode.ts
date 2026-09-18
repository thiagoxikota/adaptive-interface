import { useCallback, useEffect, useRef, useState } from 'react'
import { InteractionHeuristicEngine } from '../engine/InteractionHeuristicEngine'
import { KEYMAP, type EngineState, type InteractionModel, type Mode } from '../engine/types'
import { useFaceSignals } from '../signals/face/useFaceSignals'
import { useMouseSignals } from '../signals/mouse/useMouseSignals'

/** engine update cadence (rAF-driven, gated to ~30 Hz) */
const TICK_MS = 33
/** while debug is on, force a render at this rate so live signal values show */
const DEBUG_RENDER_MS = 100

function initialDebug(): boolean {
  try {
    const v = new URLSearchParams(window.location.search).get('debug')
    return v === '1' || v === 'true'
  } catch {
    return false
  }
}

/**
 * The part of EngineState worth a React render. Progress is bucketed to 0.05
 * and cooldown to 100 ms so the tree re-renders a few times per second at
 * most, never at 60 Hz.
 */
function visibleKey(s: EngineState): string {
  const p = s.progress
  const bucket = (v: number): number => Math.round(v / 0.05)
  return [
    s.mode,
    s.focusTarget ?? '',
    s.since,
    s.source,
    s.keyboardHold ? 1 : 0,
    Math.round(s.cooldownMs / 100),
    bucket(p.simplify),
    bucket(p.focus),
    bucket(p.expert),
    bucket(p.relax),
    s.lastTransition?.at ?? '',
  ].join('|')
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable
}

/**
 * Composes camera + pointer + the local heuristic engine + keyboard fallbacks.
 *
 * MediaPipe -> FaceSignals -> engine.update() at ~30 Hz -> EngineState -> React.
 * Nothing asynchronous sits between a signal and a mode change; Claude copy
 * (useInsight) reads the resulting mode afterwards.
 *
 * useFaceSignals starts the tracker on mount; model.startCamera() is the
 * retry path (permission denied, device busy) for a button in the UI.
 */
export function useInteractionMode(): InteractionModel {
  const camera = useFaceSignals()
  const mouse = useMouseSignals()

  // one engine per mount, never recreated
  const [engine] = useState(() => new InteractionHeuristicEngine())

  const [state, setState] = useState<EngineState>(() => engine.state)
  const [debug, setDebug] = useState<boolean>(initialDebug)
  const [, setDebugTick] = useState(0)

  // Latest face snapshot for the tick, without re-subscribing rAF per render.
  const faceRef = useRef(camera.face)
  useEffect(() => {
    faceRef.current = camera.face
  }, [camera.face])
  const keyRef = useRef(visibleKey(engine.state))

  const publish = useCallback((next: EngineState): void => {
    if (import.meta.env.DEV) {
      ;(window as unknown as { __engine?: EngineState }).__engine = next
    }
    const key = visibleKey(next)
    if (key === keyRef.current) return
    keyRef.current = key
    setState(next)
  }, [])

  useEffect(() => {
    let raf = 0
    let last = Number.NEGATIVE_INFINITY
    const loop = (): void => {
      const now = performance.now()
      if (now - last >= TICK_MS) {
        last = now
        publish(engine.update({ face: faceRef.current, mouse, now }))
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [engine, mouse, publish])

  const { recalibrate, start: startCamera } = camera

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      if (isTypingTarget(e.target)) return
      if (!Object.hasOwn(KEYMAP, e.key)) return
      const action = KEYMAP[e.key]
      e.preventDefault()
      const now = performance.now()
      switch (action) {
        case 'debug':
          setDebug((d) => !d)
          break
        case 'release':
          publish(engine.release(now))
          break
        case 'recalibrate':
          recalibrate()
          break
        default:
          publish(engine.setManual(action, now))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [engine, publish, recalibrate])

  // face and mouse are live objects for some producers; while the debug
  // overlay is open, re-render on a timer so their values read live.
  useEffect(() => {
    if (!debug) return
    const id = window.setInterval(() => setDebugTick((t) => t + 1), DEBUG_RENDER_MS)
    return () => window.clearInterval(id)
  }, [debug])

  const setMode = useCallback(
    (mode: Mode): void => publish(engine.setManual(mode, performance.now())),
    [engine, publish],
  )
  const release = useCallback((): void => publish(engine.release(performance.now())), [engine, publish])
  const toggleDebug = useCallback((): void => setDebug((d) => !d), [])

  return {
    state,
    face: camera.face,
    mouse,
    thresholds: engine.thresholds,
    debug,
    setMode,
    release,
    toggleDebug,
    recalibrate,
    startCamera,
  }
}
