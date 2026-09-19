import type { MotionProps } from 'framer-motion'

export type Transition = NonNullable<MotionProps['transition']>

/** Layout spring. Firm, settles in about 0.8 s, no visible overshoot. */
export const SPRING: Transition = { type: 'spring', stiffness: 300, damping: 32, mass: 0.9 }

/** Opacity tween for things that appear. */
export const FADE: Transition = { type: 'tween', duration: 0.35, ease: [0.16, 1, 0.3, 1] }

/** Exit: shorter than the entrance so the page never waits on what is leaving. */
export const EXIT: Transition = { type: 'tween', duration: 0.2, ease: [0.7, 0, 0.84, 0] }

/** Reduced motion: near-instant, still a transition so state never snaps mid-frame. */
export const INSTANT: Transition = { type: 'tween', duration: 0.02 }

export const STAGGER_S = 0.04

/** Enter transition for a card or tile. `index` staggers siblings by 40 ms. */
export function enterTransition(reduced: boolean, index = 0): Transition {
  if (reduced) return INSTANT
  const delay = index * STAGGER_S
  return {
    layout: SPRING,
    opacity: { ...FADE, delay },
    y: { ...SPRING, delay },
    x: { ...SPRING, delay },
    scale: SPRING,
    default: SPRING,
  }
}

export function exitTransition(reduced: boolean): Transition {
  return reduced ? INSTANT : EXIT
}
