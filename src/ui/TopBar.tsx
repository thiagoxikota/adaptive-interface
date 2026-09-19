import { memo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Mode, TransitionSource } from '../engine/types'
import { INSTANT, FADE, exitTransition } from './motion'

interface TopBarProps {
  mode: Mode
  source: TransitionSource
  showNav: boolean
  reduced: boolean
}

const NAV = ['Overview', 'Routes', 'Fleet', 'Drivers', 'Reports'] as const

const MODE_LABEL: Record<Mode, string> = {
  NORMAL: 'Normal',
  SIMPLIFY: 'Simplify',
  FOCUS: 'Focus',
  EXPERT: 'Expert',
}

const SOURCE_LABEL: Record<TransitionSource, string> = {
  init: 'default',
  camera: 'camera',
  keyboard: 'keyboard',
}

export const TopBar = memo(function TopBar({ mode, source, showNav, reduced }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="brand">Northbound Ops</div>
      <AnimatePresence initial={false} mode="popLayout">
        {showNav && (
          <motion.nav
            key="nav"
            className="nav"
            aria-label="Sections"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, transition: exitTransition(reduced) }}
            transition={reduced ? INSTANT : FADE}
          >
            {NAV.map((item, i) => (
              <button
                key={item}
                type="button"
                className="nav-item"
                aria-current={i === 0 ? 'page' : undefined}
              >
                {item}
              </button>
            ))}
          </motion.nav>
        )}
      </AnimatePresence>
      <div className="topbar-right">
        <span className="pill pill-mode" data-mode={mode} aria-live="polite">
          <strong>{MODE_LABEL[mode]}</strong>
          <span className="pill-source">{SOURCE_LABEL[source]}</span>
        </span>
      </div>
    </header>
  )
})
