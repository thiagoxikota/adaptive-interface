import { useEffect, useState } from 'react'
import { EMPTY_MOUSE, type MouseSignals } from '../../engine/types'

/** time constant of the velocity EMA */
const VELOCITY_TAU_MS = 120
/** dwell / idle bookkeeping rate; also re-hit-tests the resting pointer */
const TICK_MS = 50

const FOCUS_SELECTOR = '[data-focus-id]'

function focusIdAt(el: Element | null): string | null {
  return el?.closest(FOCUS_SELECTOR)?.getAttribute('data-focus-id') ?? null
}

/**
 * Pointer signals as ONE stable object whose fields mutate in place.
 *
 * The returned reference never changes, so reading it never causes a React
 * render and it must not be used as a dependency expecting one. Consumers read
 * the fields at use time: the engine tick does, and the debug overlay is
 * re-rendered on a timer by useInteractionMode while debug is on.
 *
 * dwellTarget is the data-focus-id under the pointer; dwellMs grows while that
 * id stays the same and resets on change. Because Framer Motion moves
 * components under a pointer that is not moving, the tick re-hit-tests with
 * document.elementFromPoint instead of trusting the last pointermove alone.
 */
export function useMouseSignals(): MouseSignals {
  // one live object per mount; useState keeps the identity without a ref
  const [m] = useState<MouseSignals>(() => ({ ...EMPTY_MOUSE }))

  useEffect(() => {
    let lastMoveAt = performance.now()
    let lastTickAt = lastMoveAt
    let dwellStart = lastMoveAt
    let inside = false

    const setTarget = (id: string | null, now: number): void => {
      if (id === m.dwellTarget) return
      m.dwellTarget = id
      m.dwellMs = 0
      dwellStart = now
    }

    const onMove = (e: PointerEvent): void => {
      const now = performance.now()
      const dt = now - lastMoveAt
      if (inside && dt > 0) {
        const instant = Math.hypot(e.clientX - m.x, e.clientY - m.y) / (dt / 1000)
        const alpha = 1 - Math.exp(-dt / VELOCITY_TAU_MS)
        m.velocity += alpha * (instant - m.velocity)
      }
      m.x = e.clientX
      m.y = e.clientY
      m.idleMs = 0
      lastMoveAt = now
      inside = true
      const el = e.target instanceof Element ? e.target : document.elementFromPoint(e.clientX, e.clientY)
      setTarget(focusIdAt(el), now)
    }

    const leave = (): void => {
      inside = false
      m.velocity = 0
      setTarget(null, performance.now())
    }

    // pointerout with no relatedTarget is the pointer leaving the window
    const onOut = (e: PointerEvent): void => {
      if (e.relatedTarget === null) leave()
    }
    const onVisibility = (): void => {
      if (document.visibilityState !== 'visible') leave()
    }

    const tick = (): void => {
      const now = performance.now()
      const elapsed = now - lastTickAt
      lastTickAt = now
      m.idleMs = now - lastMoveAt
      if (m.idleMs >= elapsed) m.velocity *= Math.exp(-elapsed / VELOCITY_TAU_MS)
      if (inside) setTarget(focusIdAt(document.elementFromPoint(m.x, m.y)), now)
      m.dwellMs = m.dwellTarget === null ? 0 : now - dwellStart
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerout', onOut, { passive: true })
    window.addEventListener('blur', leave)
    document.addEventListener('visibilitychange', onVisibility)
    const timer = window.setInterval(tick, TICK_MS)

    if (import.meta.env.DEV) {
      ;(window as unknown as { __mouse?: MouseSignals }).__mouse = m
    }

    return () => {
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerout', onOut)
      window.removeEventListener('blur', leave)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(timer)
    }
  }, [m])

  return m
}
