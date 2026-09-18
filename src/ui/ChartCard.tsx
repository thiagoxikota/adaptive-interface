import { memo } from 'react'
import type { Ref } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Card } from './Card'
import type { FocusId } from './layout'
import {
  CHART_H,
  CHART_W,
  X_LEFT,
  X_RIGHT,
  Y_TICKS,
  areaPath,
  linePath,
  x,
  xTicks,
  y,
} from './chart'
import { DELTA_PCT, HOURLY_AVG, HOURLY_TODAY, PEAK, TOTAL_TODAY, fmtHour, fmtInt } from './data'
import { FADE, INSTANT, SPRING, exitTransition } from './motion'

const TODAY_LINE = linePath(HOURLY_TODAY)
const TODAY_AREA = areaPath(HOURLY_TODAY)
const AVG_LINE = linePath(HOURLY_AVG)

interface ChartProps {
  dense: boolean
  reduced: boolean
  ref?: Ref<HTMLDivElement>
}

function Chart({ dense, reduced, ref }: ChartProps) {
  const ticks = xTicks(dense ? 3 : 6)
  return (
    <motion.div
      ref={ref}
      layout
      className="chart"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitTransition(reduced) }}
      transition={reduced ? INSTANT : { layout: SPRING, opacity: FADE }}
    >
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        role="img"
        aria-label={`Deliveries per hour over the last 24 hours. Peak ${PEAK.value} at ${fmtHour(PEAK.hour)}.`}
      >
        {Y_TICKS.map((tick) => (
          <g key={tick}>
            <line x1={X_LEFT} x2={X_RIGHT} y1={y(tick)} y2={y(tick)} className="gridline" />
            <text x={X_LEFT - 10} y={y(tick)} className="axis-label" textAnchor="end" dominantBaseline="middle">
              {tick}
            </text>
          </g>
        ))}
        {ticks.map((hour) => (
          <text
            key={hour}
            x={x(hour)}
            y={CHART_H - 8}
            className="axis-label"
            textAnchor={hour === 0 ? 'start' : hour === 23 ? 'end' : 'middle'}
          >
            {fmtHour(hour)}
          </text>
        ))}
        <path d={TODAY_AREA} className="area" />
        <path d={TODAY_LINE} className="line" />
        <AnimatePresence initial={false}>
          {dense && (
            <motion.path
              key="avg"
              d={AVG_LINE}
              className="line-avg"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduced ? INSTANT : FADE}
            />
          )}
        </AnimatePresence>
        <circle cx={x(PEAK.hour)} cy={y(PEAK.value)} r={4.5} className="peak" />
        <text x={x(PEAK.hour)} y={y(PEAK.value) - 12} className="peak-label" textAnchor="middle">
          {PEAK.value} at {fmtHour(PEAK.hour)}
        </text>
      </svg>
    </motion.div>
  )
}

interface ExplainProps {
  reduced: boolean
  ref?: Ref<HTMLDivElement>
}

/** The same data as the chart, said plainly: one big number and two short sentences. */
function Explain({ reduced, ref }: ExplainProps) {
  return (
    <motion.div
      ref={ref}
      layout
      className="explain"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitTransition(reduced) }}
      transition={reduced ? INSTANT : { layout: SPRING, opacity: FADE, y: SPRING }}
    >
      <div className="explain-number">{fmtInt(TOTAL_TODAY)}</div>
      <div className="explain-label">deliveries in the last 24 hours</div>
      <p className="explain-text">
        That is {DELTA_PCT}% ahead of the 7-day average. The busiest hour was {fmtHour(PEAK.hour)}, with{' '}
        {PEAK.value} deliveries.
      </p>
    </motion.div>
  )
}

interface ChartCardProps {
  variant: 'standard' | 'dense' | 'explain'
  explainer: boolean
  focus: FocusId | null
  reduced: boolean
  index: number
  ref?: Ref<HTMLDivElement>
}

export const ChartCard = memo(function ChartCard({
  variant,
  explainer,
  focus,
  reduced,
  index,
  ref,
}: ChartCardProps) {
  const explain = variant === 'explain'
  return (
    <Card id="chart" focus={focus} reduced={reduced} index={index} className="card-chart" ref={ref}>
      <motion.div layout="position" className="card-head">
        <div className="card-head-text">
          <h2 className="card-title">{explain ? 'Deliveries, last 24 hours' : 'Deliveries per hour, last 24 h'}</h2>
          <AnimatePresence initial={false}>
            {explainer && (
              <motion.p
                key="explainer"
                className="card-explainer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitTransition(reduced) }}
                transition={reduced ? INSTANT : FADE}
              >
                Each point is the number of completed deliveries in that hour, across all depots.
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        <AnimatePresence initial={false}>
          {variant === 'dense' && (
            <motion.div
              key="legend"
              className="legend"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitTransition(reduced) }}
              transition={reduced ? INSTANT : FADE}
            >
              <span className="legend-item">
                <i className="swatch swatch-today" aria-hidden="true" />
                Today
              </span>
              <span className="legend-item">
                <i className="swatch swatch-avg" aria-hidden="true" />
                7-day average
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      <AnimatePresence initial={false} mode="popLayout">
        {explain ? (
          <Explain key="explain" reduced={reduced} />
        ) : (
          <Chart key="chart" dense={variant === 'dense'} reduced={reduced} />
        )}
      </AnimatePresence>
    </Card>
  )
})
