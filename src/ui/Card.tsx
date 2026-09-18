import type { CSSProperties, ReactNode, Ref } from 'react'
import { motion } from 'framer-motion'
import type { FocusId } from './layout'
import { enterTransition, exitTransition } from './motion'

export interface CardProps {
  id: FocusId
  focus: FocusId | null
  /** sibling index, staggers the entrance by 40 ms each */
  index: number
  reduced: boolean
  className?: string
  children: ReactNode
  /** forwarded so AnimatePresence popLayout can measure the exiting card */
  ref?: Ref<HTMLDivElement>
  style?: CSSProperties
}

/**
 * A morphing surface. `layout` lets Framer FLIP it between grid positions;
 * FOCUS recedes every card except the target (scale 0.96, opacity 0.35,
 * pointer-events none) so the user still sees what moved out of the way.
 */
export function Card({ id, focus, index, reduced, className, children, ref, style }: CardProps) {
  const receded = focus !== null && focus !== id
  const focused = focus === id
  return (
    <motion.div
      ref={ref}
      layout
      data-focus-id={id}
      data-focused={focused ? '' : undefined}
      data-receded={receded ? '' : undefined}
      className={className ? `card ${className}` : 'card'}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: receded ? 0.35 : 1, scale: receded ? 0.96 : 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: exitTransition(reduced) }}
      transition={enterTransition(reduced, index)}
      style={{ ...style, pointerEvents: receded ? 'none' : undefined }}
    >
      {children}
    </motion.div>
  )
}
