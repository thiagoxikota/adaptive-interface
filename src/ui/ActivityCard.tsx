import { memo } from 'react'
import type { Ref } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Card } from './Card'
import type { FocusId } from './layout'
import { ACTIVITY, ACTIVITY_ROWS_NORMAL } from './data'
import { FADE, INSTANT, exitTransition } from './motion'

interface ActivityCardProps {
  dense: boolean
  focus: FocusId | null
  reduced: boolean
  index: number
  ref?: Ref<HTMLDivElement>
}

export const ActivityCard = memo(function ActivityCard({
  dense,
  focus,
  reduced,
  index,
  ref,
}: ActivityCardProps) {
  const items = dense ? ACTIVITY : ACTIVITY.slice(0, ACTIVITY_ROWS_NORMAL)
  return (
    <Card id="activity" focus={focus} reduced={reduced} index={index} className="card-activity" ref={ref}>
      <motion.div layout="position" className="card-head">
        <h2 className="card-title">Recent activity</h2>
      </motion.div>
      <motion.ol layout="position" className="activity" data-dense={dense ? '' : undefined}>
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.li
              key={item.id}
              layout="position"
              className="activity-item"
              data-tone={item.tone ?? 'plain'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitTransition(reduced) }}
              transition={reduced ? INSTANT : FADE}
            >
              <span className="activity-time">{item.time}</span>
              <span className="activity-text">{item.text}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ol>
    </Card>
  )
})
