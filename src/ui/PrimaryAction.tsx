import { motion } from 'framer-motion'
import type { FocusId } from './layout'
import { PENDING_ROUTES } from './data'
import { FADE, INSTANT, SPRING } from './motion'

interface PrimaryActionProps {
  size: 'md' | 'lg'
  focus: FocusId | null
  reduced: boolean
}

/**
 * The one action that matters. Shares a layoutId across its two slots
 * (toolbar in NORMAL/EXPERT, centre stage in SIMPLIFY) so it physically
 * travels instead of fading out and back in.
 */
export function PrimaryAction({ size, focus, reduced }: PrimaryActionProps) {
  const receded = focus !== null && focus !== 'primary-action'
  const focused = focus === 'primary-action'
  return (
    <motion.button
      type="button"
      layoutId="primary-action"
      data-focus-id="primary-action"
      data-focused={focused ? '' : undefined}
      data-size={size}
      className="primary"
      animate={{ opacity: receded ? 0.62 : 1, scale: receded ? 0.95 : 1 }}
      whileTap={reduced ? undefined : { scale: 0.97 }}
      transition={reduced ? INSTANT : { layout: SPRING, opacity: FADE, scale: SPRING }}
    >
      Dispatch {PENDING_ROUTES} pending routes
    </motion.button>
  )
}
