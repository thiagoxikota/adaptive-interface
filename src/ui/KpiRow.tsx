import { memo } from 'react'
import type { Ref } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Card } from './Card'
import type { FocusId } from './layout'
import { KPI_EXPERT, KPI_NORMAL, KPI_ONE } from './data'
import type { Kpi } from './data'
import { enterTransition, exitTransition } from './motion'

interface KpiTileProps {
  kpi: Kpi
  index: number
  reduced: boolean
  big: boolean
  ref?: Ref<HTMLDivElement>
}

function KpiTile({ kpi, index, reduced, big, ref }: KpiTileProps) {
  return (
    <motion.div
      ref={ref}
      layout
      className="kpi"
      data-big={big ? '' : undefined}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6, transition: exitTransition(reduced) }}
      transition={enterTransition(reduced, index)}
    >
      <div className="kpi-label">{kpi.label}</div>
      <div className="kpi-value">
        {kpi.value}
        {kpi.unit && <span className="kpi-unit">{kpi.unit}</span>}
      </div>
      {kpi.note && (
        <div className="kpi-note" data-tone={kpi.tone ?? 'plain'}>
          {kpi.note}
        </div>
      )}
    </motion.div>
  )
}

interface KpiRowProps {
  count: 1 | 4 | 8
  focus: FocusId | null
  reduced: boolean
  index: number
  ref?: Ref<HTMLDivElement>
}

/** 4 KPIs in NORMAL, the single one that matters in SIMPLIFY, 8 dense in EXPERT. */
export const KpiRow = memo(function KpiRow({ count, focus, reduced, index, ref }: KpiRowProps) {
  const kpis = count === 1 ? KPI_ONE : count === 8 ? KPI_EXPERT : KPI_NORMAL
  return (
    <Card id="kpis" focus={focus} reduced={reduced} index={index} className="card-kpis" ref={ref}>
      <motion.div layout className="kpi-grid" data-count={count} role="list">
        <AnimatePresence initial={false} mode="popLayout">
          {kpis.map((kpi, i) => (
            <KpiTile key={kpi.id} kpi={kpi} index={i} reduced={reduced} big={count === 1} />
          ))}
        </AnimatePresence>
      </motion.div>
    </Card>
  )
})
