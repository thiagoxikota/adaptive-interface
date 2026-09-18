import type { Mode } from '../engine/types'

/** The five components a FOCUS transition may target (their data-focus-id). */
export const FOCUSABLE = ['chart', 'kpis', 'activity', 'fleet', 'primary-action'] as const
export type FocusId = (typeof FOCUSABLE)[number]

export function isFocusId(value: string | null): value is FocusId {
  return value !== null && (FOCUSABLE as readonly string[]).includes(value)
}

/** Component focused when FOCUS is entered without a known target (keyboard 3 with the pointer off the grid). */
export const DEFAULT_FOCUS: FocusId = 'chart'

export type Density = 'airy' | 'normal' | 'dense'

/**
 * Everything the dashboard needs to know to render a mode. Derived from the
 * engine state only; the UI never decides a mode on its own.
 */
export interface Layout {
  /** effective mode; FOCUS with an unknown target focuses DEFAULT_FOCUS */
  mode: Mode
  focus: FocusId | null
  rail: boolean
  secondaryNav: boolean
  activity: boolean
  fleet: boolean
  kpis: 0 | 1 | 4 | 8
  chart: 'standard' | 'dense' | 'explain'
  primary: 'toolbar' | 'stage'
  shortcuts: boolean
  /** explanatory sentence under the chart title */
  explainer: boolean
  density: Density
}

const NORMAL: Layout = {
  mode: 'NORMAL',
  focus: null,
  rail: true,
  secondaryNav: true,
  activity: true,
  fleet: true,
  kpis: 4,
  chart: 'standard',
  primary: 'toolbar',
  shortcuts: false,
  explainer: true,
  density: 'normal',
}

const SIMPLIFY: Layout = {
  mode: 'SIMPLIFY',
  focus: null,
  rail: false,
  secondaryNav: false,
  activity: false,
  fleet: false,
  kpis: 0,
  chart: 'explain',
  primary: 'stage',
  shortcuts: false,
  explainer: false,
  density: 'airy',
}

const EXPERT: Layout = {
  mode: 'EXPERT',
  focus: null,
  rail: true,
  secondaryNav: true,
  activity: true,
  fleet: true,
  kpis: 8,
  chart: 'dense',
  primary: 'toolbar',
  shortcuts: true,
  explainer: false,
  density: 'dense',
}

export function deriveLayout(mode: Mode, focusTarget: string | null): Layout {
  switch (mode) {
    case 'SIMPLIFY':
      return SIMPLIFY
    case 'EXPERT':
      return EXPERT
    case 'FOCUS': {
      // Keyboard 3 with no pointer target (or an unknown id) still has to
      // visibly focus something, so the chart is the default target.
      const focus: FocusId = isFocusId(focusTarget) ? focusTarget : DEFAULT_FOCUS
      return {
        ...NORMAL,
        mode: 'FOCUS',
        focus,
        primary: focus === 'primary-action' ? 'stage' : 'toolbar',
      }
    }
    case 'NORMAL':
    default:
      return NORMAL
  }
}
