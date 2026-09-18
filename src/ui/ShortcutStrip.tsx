import type { Ref } from 'react'
import { motion } from 'framer-motion'
import { FADE, INSTANT, SPRING, exitTransition } from './motion'

interface ShortcutStripProps {
  reduced: boolean
  ref?: Ref<HTMLDivElement>
}

const SHORTCUTS = [
  { key: '⌘D', label: 'Dispatch' },
  { key: '⌘F', label: 'Filter' },
  { key: '⌘K', label: 'Command' },
  { key: '⌘E', label: 'Export' },
  { key: '/', label: 'Search' },
] as const

/** Product shortcuts. Appears only in EXPERT. */
export function ShortcutStrip({ reduced, ref }: ShortcutStripProps) {
  return (
    <motion.div
      ref={ref}
      layout
      className="shortcuts"
      aria-label="Keyboard shortcuts"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6, transition: exitTransition(reduced) }}
      transition={reduced ? INSTANT : { layout: SPRING, opacity: FADE, y: SPRING }}
    >
      {SHORTCUTS.map((s) => (
        <span key={s.key} className="shortcut">
          <kbd>{s.key}</kbd>
          {s.label}
        </span>
      ))}
    </motion.div>
  )
}
