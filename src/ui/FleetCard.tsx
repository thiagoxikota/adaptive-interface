import { memo } from 'react'
import type { Ref } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Card } from './Card'
import type { FocusId } from './layout'
import { FLEET, FLEET_ROWS_NORMAL } from './data'
import { FADE, INSTANT, exitTransition } from './motion'

interface FleetCardProps {
  dense: boolean
  focus: FocusId | null
  reduced: boolean
  index: number
  ref?: Ref<HTMLDivElement>
}

/** Fleet table. EXPERT adds three columns, three rows and tightens the row height. */
export const FleetCard = memo(function FleetCard({ dense, focus, reduced, index, ref }: FleetCardProps) {
  const rows = dense ? FLEET : FLEET.slice(0, FLEET_ROWS_NORMAL)
  return (
    <Card id="fleet" focus={focus} reduced={reduced} index={index} className="card-fleet" ref={ref}>
      <motion.div layout="position" className="card-head">
        <h2 className="card-title">Fleet</h2>
        <span className="card-meta">{rows.length} of {FLEET.length} vehicles</span>
      </motion.div>
      <motion.div layout className="table-wrap">
        <table className="fleet" data-dense={dense ? '' : undefined}>
          <thead>
            <tr>
              <th scope="col">Vehicle</th>
              <th scope="col">Driver</th>
              <th scope="col">Route</th>
              <th scope="col">Status</th>
              <th scope="col" className="num">ETA</th>
              {dense && (
                <>
                  <th scope="col" className="num">Stops left</th>
                  <th scope="col" className="num">Load</th>
                  <th scope="col" className="num">Last ping</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {rows.map((row) => (
                <motion.tr
                  key={row.vehicle}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitTransition(reduced) }}
                  transition={reduced ? INSTANT : FADE}
                >
                  <td className="mono">{row.vehicle}</td>
                  <td>{row.driver}</td>
                  <td>{row.route}</td>
                  <td>
                    <span className="status" data-status={row.status}>
                      {row.status}
                    </span>
                  </td>
                  <td className="num">{row.eta}</td>
                  {dense && (
                    <>
                      <td className="num">{row.stops}</td>
                      <td className="num">{row.load}%</td>
                      <td className="num">{row.ping}</td>
                    </>
                  )}
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </motion.div>
    </Card>
  )
})
