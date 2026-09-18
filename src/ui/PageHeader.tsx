import { memo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { InsightModel } from '../engine/types'
import { INSTANT } from './motion'

interface PageHeaderProps {
  insight: InsightModel
  reduced: boolean
}

/**
 * Thesis, caption and the insight slot. The insight is asynchronous copy
 * that arrives after a mode has already changed; nothing here waits for it.
 */
export const PageHeader = memo(function PageHeader({ insight, reduced }: PageHeaderProps) {
  const current = insight.insight
  return (
    <motion.header layout="position" className="page-header">
      <h1 className="thesis">The interface responds to how you interact.</h1>
      <p className="caption">Face and pointer signals are read locally and never leave this machine.</p>
      <div className="insight" aria-live="polite">
        <AnimatePresence initial={false} mode="wait">
          {current && (
            <motion.p
              key={`${current.mode}:${current.focusTarget ?? ''}:${current.text}`}
              className="insight-text"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduced ? INSTANT : { duration: 0.25 }}
            >
              {current.source === 'claude' && <span className="tag">Claude</span>}
              {current.text}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.header>
  )
})
