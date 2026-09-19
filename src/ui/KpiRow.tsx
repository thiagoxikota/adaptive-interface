import { memo } from 'react'
import type { Ref } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Card } from './Card'
import type { FocusId } from './layout'
import { KPI_EXPERT, KPI_NORMAL } from './data'
import type { Kpi } from './data'
import { enterTransition, exitTransition } from './motion'

interface KpiTileProps {
  kpi: Kpi
  index: number
  reduced: boolean
  ref?: Ref<HTMLDivElement>
}

function KpiTile({ kpi, index, reduced, ref }: KpiTileProps) {
  return (
    <motion.div
      ref={ref}
      layout
      className="kpi"
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
  count: 4 | 8
  focus: FocusId | null
  reduced: boolean
  index: number
  ref?: Ref<HTMLDivElement>
}

/** 4 KPIs in NORMAL and FOCUS, 8 dense in EXPERT. SIMPLIFY hides the row (layout.kpis = 0). */
export const KpiRow = memo(function KpiRow({ count, focus, reduced, index, ref }: KpiRowProps) {
  const kpis = count === 8 ? KPI_EXPERT : KPI_NORMAL
  return (
    <Card id="kpis" focus={focus} reduced={reduced} index={index} className="card-kpis" ref={ref}>
      <motion.div layout className="kpi-grid" data-count={count} role="list">
        <AnimatePresence initial={false} mode="popLayout">
          {kpis.map((kpi, i) => (
            <KpiTile key={kpi.id} kpi={kpi} index={i} reduced={reduced} />
          ))}
        </AnimatePresence>
      </motion.div>
    </Card>
  )
})
