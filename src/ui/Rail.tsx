import type { Ref } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FADE, INSTANT, SPRING, exitTransition } from './motion'

interface RailProps {
  dense: boolean
  reduced: boolean
  ref?: Ref<HTMLElement>
}

const VIEWS = ['Live board', 'Dispatch queue', 'Exceptions', 'Depots'] as const
const RANGES = ['Live', 'Today', '7 days'] as const
const CHIPS = ['Region: all', 'Depot: North', 'Status: active'] as const

/** Left rail. Collapses away in SIMPLIFY; gains filters in EXPERT. */
export function Rail({ dense, reduced, ref }: RailProps) {
  return (
    <motion.aside
      ref={ref}
      layout
      className="rail"
      aria-label="Views"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12, transition: exitTransition(reduced) }}
      transition={reduced ? INSTANT : { layout: SPRING, opacity: FADE, x: SPRING }}
    >
      <div className="rail-group">
        <div className="rail-title">Views</div>
        {VIEWS.map((view, i) => (
          <button
            key={view}
            type="button"
            className="rail-item"
            aria-current={i === 0 ? 'page' : undefined}
          >
            {view}
          </button>
        ))}
      </div>
      <AnimatePresence initial={false}>
        {dense && (
          <motion.div
            key="filters"
            className="rail-group"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitTransition(reduced) }}
            transition={reduced ? INSTANT : FADE}
          >
            <div className="rail-title">Filters</div>
            <div className="segmented" role="group" aria-label="Time range">
              {RANGES.map((range, i) => (
                <button key={range} type="button" aria-pressed={i === 0}>
                  {range}
                </button>
              ))}
            </div>
            <div className="chips">
              {CHIPS.map((chip) => (
                <button key={chip} type="button" className="chip">
                  {chip}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  )
}
