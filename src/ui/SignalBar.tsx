import { memo, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { EngineState, FaceSignals, InteractionModel, Mode, Thresholds } from '../engine/types'
import { INSTANT } from './motion'

/**
 * Visibility of system status (Nielsen 1) for the camera path: what the
 * camera sees right now, how far each gesture is from switching the mode,
 * and why the mode just changed. Also the way back (Nielsen 3): one button
 * to Normal, always visible when the layout is not the default.
 */

const MODE_LABEL: Record<Mode, string> = {
  NORMAL: 'Normal',
  SIMPLIFY: 'Simplify',
  FOCUS: 'Focus',
  EXPERT: 'Expert',
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

interface GestureChipProps {
  label: string
  target: Mode
  /** 0..1 how close the raw signal is to its ON threshold (1 = armed) */
  level: number
  /** 0..1 sustain progress from the engine */
  progress: number
  value: string
  active: boolean
}

function GestureChip({ label, target, level, progress, value, active }: GestureChipProps) {
  const armed = level >= 1
  return (
    <span
      className="gchip"
      data-armed={armed ? '' : undefined}
      data-active={active ? '' : undefined}
      data-target={target}
      style={{ ['--fill' as string]: `${Math.round(progress * 100)}%`, ['--level' as string]: `${Math.round(level * 100)}%` }}
      title={`${label} switches to ${MODE_LABEL[target]} after ${target === 'FOCUS' ? '0.7' : '0.9'} s`}
    >
      <i className="gchip-fill" aria-hidden="true" />
      <i className="gchip-level" aria-hidden="true" />
      <span className="gchip-label">
        {label} <span className="gchip-arrow">→</span> {MODE_LABEL[target]}
      </span>
      <span className="gchip-val">{value}</span>
    </span>
  )
}

function cameraStatus(face: FaceSignals): string {
  switch (face.status) {
    case 'idle':
      return 'Camera off'
    case 'loading':
      return 'Loading face model'
    case 'no-camera':
      return 'No camera: keys 1 to 4 drive the modes'
    case 'error':
      return 'Camera error: keys 1 to 4 drive the modes'
    case 'running':
      if (!face.present || face.presence < 0.6) return 'No face in view'
      if (!face.calibrated) return 'Calibrating distance, hold still'
      return 'Watching'
  }
}

interface ToastProps {
  state: EngineState
  face: FaceSignals
  onBack: () => void
  reduced: boolean
}

function transitionText(t: NonNullable<EngineState['lastTransition']>, focusTarget: string | null): string {
  if (t.reason.startsWith('keyboard')) return `Key ${MODE_LABEL[t.to]}`
  if (t.to === 'FOCUS') return `Focus on ${focusTarget ?? 'component'}: you leaned in with the pointer resting there`
  if (t.to === 'EXPERT') return 'Expert: smile held for a second'
  if (t.to === 'SIMPLIFY') return 'Simplify: brow and lean held for a second'
  if (t.reason.startsWith('face absent')) return 'Normal: no face in view'
  if (t.reason.startsWith('leaned back')) return 'Normal: you leaned back'
  if (t.reason.startsWith('cursor')) return 'Normal: pointer moved to another component'
  if (t.reason.startsWith('lean released')) return 'Normal: lean released'
  return `${MODE_LABEL[t.to]}`
}

const TOAST_MS = 4500

function Toast({ state, face, onBack, reduced }: ToastProps) {
  const [item, setItem] = useState<{ key: string; text: string; back: boolean } | null>(null)

  const t = state.lastTransition
  const at = t?.at ?? null
  useEffect(() => {
    if (!t || at === null) return
    setItem({ key: `t${at}`, text: transitionText(t, state.focusTarget), back: t.to !== 'NORMAL' })
    const id = window.setTimeout(() => setItem((cur) => (cur?.key === `t${at}` ? null : cur)), TOAST_MS)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at])

  const calibrated = face.calibrated
  useEffect(() => {
    if (!calibrated) return
    setItem({ key: 'cal', text: 'Distance calibrated. Lean in about 15% closer to trigger a lean; R redoes it.', back: false })
    const id = window.setTimeout(() => setItem((cur) => (cur?.key === 'cal' ? null : cur)), TOAST_MS)
    return () => window.clearTimeout(id)
  }, [calibrated])

  return (
    <AnimatePresence initial={false}>
      {item && (
        <motion.div
          key={item.key}
          className="toast"
          role="status"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={reduced ? INSTANT : { duration: 0.22 }}
        >
          <span>{item.text}</span>
          {item.back && (
            <button type="button" className="toast-btn" onClick={onBack}>
              Back to Normal <kbd>1</kbd>
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

interface SignalBarProps {
  model: InteractionModel
  reduced: boolean
}

function levels(face: FaceSignals, t: Thresholds) {
  const usable = face.status === 'running' && face.presence >= t.presenceMin
  const lean = usable && face.calibrated ? clamp01((face.proximity - 1) / (t.leanOn - 1)) : 0
  const brow = usable ? clamp01(face.brow / t.browOn) : 0
  const smile = usable ? clamp01(face.smile / t.smileOn) : 0
  return { lean, brow, smile }
}

export const SignalBar = memo(function SignalBar({ model, reduced }: SignalBarProps) {
  const { face, state, thresholds: t, mouse } = model
  const { lean, brow, smile } = levels(face, t)
  const dwell = mouse.dwellTarget !== null && mouse.dwellMs >= t.dwellMs
  const cooling = state.cooldownMs > 0
  const running = face.status === 'running'

  return (
    <>
      <div className="signalbar" aria-live="polite">
        <span className="signal-status" data-status={face.status}>
          <i className="dot" aria-hidden="true" />
          {cameraStatus(face)}
          {running && cooling && <span className="signal-cool"> · settling {(state.cooldownMs / 1000).toFixed(1)} s</span>}
        </span>
        <div className="gchips">
          <GestureChip
            label="Brow + lean in"
            target="SIMPLIFY"
            level={Math.min(brow, lean)}
            progress={state.progress.simplify}
            value={running ? `${face.brow.toFixed(2)} · ${face.proximity.toFixed(2)}` : ''}
            active={state.mode === 'SIMPLIFY'}
          />
          <GestureChip
            label="Lean in + pointer rest"
            target="FOCUS"
            level={Math.min(lean, dwell ? 1 : 0)}
            progress={state.progress.focus}
            value={running ? `${face.proximity.toFixed(2)} · ${mouse.dwellTarget ?? 'no target'}` : ''}
            active={state.mode === 'FOCUS'}
          />
          <GestureChip
            label="Smile"
            target="EXPERT"
            level={smile}
            progress={state.progress.expert}
            value={running ? face.smile.toFixed(2) : ''}
            active={state.mode === 'EXPERT'}
          />
        </div>
        {state.mode !== 'NORMAL' && (
          <button type="button" className="btn btn-secondary signal-back" onClick={() => model.setMode('NORMAL')}>
            Back to Normal <kbd>1</kbd>
          </button>
        )}
      </div>
      <Toast state={state} face={face} onBack={() => model.setMode('NORMAL')} reduced={reduced} />
    </>
  )
})
