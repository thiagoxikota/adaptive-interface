import { memo, useMemo } from 'react'
import { AnimatePresence, LayoutGroup, MotionConfig, motion, useReducedMotion } from 'framer-motion'
import type { InsightModel, InteractionModel } from '../engine/types'
import { deriveLayout } from './layout'
import type { Layout } from './layout'
import { TopBar } from './TopBar'
import { Rail } from './Rail'
import { PageHeader } from './PageHeader'
import { KpiRow } from './KpiRow'
import { ChartCard } from './ChartCard'
import { ActivityCard } from './ActivityCard'
import { FleetCard } from './FleetCard'
import { PrimaryAction } from './PrimaryAction'
import { ShortcutStrip } from './ShortcutStrip'
import { KeyboardHint } from './KeyboardHint'
import { SignalBar } from './SignalBar'
import { DebugOverlay } from './DebugOverlay'
import { FADE, INSTANT, SPRING, exitTransition } from './motion'
import './dashboard.css'

interface DashboardProps {
  model: InteractionModel
  insight: InsightModel
}

const RANGES = ['Live', 'Today', '7 days'] as const

/**
 * The part of the page that restructures. Memoised on the derived layout so
 * per-frame signal updates in the model never re-render the cards.
 */
const Stage = memo(function Stage({ layout, reduced }: { layout: Layout; reduced: boolean }) {
  const { focus } = layout
  const dense = layout.density === 'dense'
  const airy = layout.density === 'airy'
  const toolbarEmpty = airy && layout.primary !== 'toolbar'
  return (
    <>
      <motion.div layout="position" className="toolbar" data-empty={toolbarEmpty ? '' : undefined}>
        <div className="toolbar-left">
          <AnimatePresence initial={false} mode="popLayout">
            {dense && (
              <motion.div
                key="controls"
                className="controls"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitTransition(reduced) }}
                transition={reduced ? INSTANT : FADE}
              >
                <div className="segmented" role="group" aria-label="Time range">
                  {RANGES.map((range, i) => (
                    <button key={range} type="button" aria-pressed={i === 0}>
                      {range}
                    </button>
                  ))}
                </div>
                <button type="button" className="chip">
                  Filter
                </button>
                <button type="button" className="chip">
                  Columns
                </button>
              </motion.div>
            )}
            {!dense && !airy && (
              <motion.div
                key="live"
                className="live-note"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitTransition(reduced) }}
                transition={reduced ? INSTANT : FADE}
              >
                <i className="dot" aria-hidden="true" />
                Live board, all depots
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="toolbar-right">
          {layout.primary === 'toolbar' && <PrimaryAction size="md" focus={focus} reduced={reduced} />}
        </div>
      </motion.div>

      <AnimatePresence initial={false} mode="popLayout">
        {layout.shortcuts && <ShortcutStrip key="shortcuts" reduced={reduced} />}
      </AnimatePresence>

      <motion.section layout className="grid" aria-label="Operations">
        <AnimatePresence initial={false} mode="popLayout">
          {layout.kpis !== 0 && (
            <KpiRow key="kpis" count={layout.kpis} focus={focus} reduced={reduced} index={0} />
          )}
          <ChartCard
            key="chart"
            variant={layout.chart}
            explainer={layout.explainer}
            focus={focus}
            reduced={reduced}
            index={1}
          />
          {layout.primary === 'stage' && (
            <motion.div
              key="stage"
              layout
              className="stage"
              data-focused={focus === 'primary-action' ? '' : undefined}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitTransition(reduced) }}
              transition={reduced ? INSTANT : { layout: SPRING, opacity: FADE, y: SPRING }}
            >
              <PrimaryAction size="lg" focus={focus} reduced={reduced} />
            </motion.div>
          )}
          {layout.activity && (
            <ActivityCard key="activity" dense={dense} focus={focus} reduced={reduced} index={2} />
          )}
          {layout.fleet && <FleetCard key="fleet" dense={dense} focus={focus} reduced={reduced} index={3} />}
        </AnimatePresence>
      </motion.section>
    </>
  )
})

/**
 * Renders whatever mode the engine is in. Never decides a mode: it reads
 * `model.state.mode` and `model.state.focusTarget` and morphs accordingly.
 */
export function Dashboard({ model, insight }: DashboardProps) {
  const prefersReduced = useReducedMotion()
  const reduced = prefersReduced === true
  const { state, face } = model
  const layout = useMemo(
    () => deriveLayout(state.mode, state.focusTarget),
    [state.mode, state.focusTarget],
  )

  return (
    <MotionConfig reducedMotion="user">
      <div
        className="app"
        data-mode={layout.mode}
        data-density={layout.density}
        data-focus={layout.focus ?? undefined}
        data-debug={model.debug ? '' : undefined}
      >
        <LayoutGroup>
          <TopBar
            status={face.status}
            error={face.error}
            mode={state.mode}
            source={state.source}
            showNav={layout.secondaryNav}
            reduced={reduced}
            onStartCamera={model.startCamera}
          />
          <SignalBar model={model} reduced={reduced} />
          <div className="frame">
            <AnimatePresence initial={false} mode="popLayout">
              {layout.rail && <Rail key="rail" dense={layout.density === 'dense'} reduced={reduced} />}
            </AnimatePresence>
            <main className="main">
              <div className="main-inner">
                <PageHeader insight={insight} reduced={reduced} />
                <Stage layout={layout} reduced={reduced} />
              </div>
            </main>
          </div>
        </LayoutGroup>
        <KeyboardHint />
        {model.debug && <DebugOverlay model={model} />}
      </div>
    </MotionConfig>
  )
}
