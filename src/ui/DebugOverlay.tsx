import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { InteractionModel, Thresholds } from '../engine/types'
import './debug.css'

const f2 = (v: number) => v.toFixed(2)
const f0 = (v: number) => Math.round(v).toString()
const deg = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}°`
const ms = (v: number) => `${Math.max(0, Math.round(v))} ms`

interface Tick {
  at: number
  kind: 'on' | 'off' | 'min' | 'base'
  label: string
}

interface BarProps {
  value: number
  min?: number
  max?: number
  ticks?: readonly Tick[]
  accent?: boolean
}

/** Horizontal bar with threshold ticks (accent = ON, amber = OFF, grey = reference). */
function Bar({ value, min = 0, max = 1, ticks = [], accent = false }: BarProps) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100)).toFixed(1)}%`
  return (
    <div className="dbg-bar" data-accent={accent ? '' : undefined}>
      <div className="dbg-fill" style={{ width: pct(value) }} />
      {ticks.map((t) => (
        <i
          key={`${t.kind}-${t.label}`}
          className="dbg-tick"
          data-kind={t.kind}
          style={{ left: pct(t.at) }}
          title={`${t.label}: ${t.at}`}
        />
      ))}
    </div>
  )
}

interface SignalRowProps {
  name: string
  raw: string
  smooth: string
  bar?: ReactNode
}

function SignalRow({ name, raw, smooth, bar }: SignalRowProps) {
  return (
    <div className="dbg-row">
      <span className="dbg-name">{name}</span>
      <span className="dbg-raw">{raw}</span>
      <span className="dbg-smooth">{smooth}</span>
      <span className="dbg-barcell">{bar}</span>
    </div>
  )
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="dbg-kv">
      <span>{k}</span>
      <span>{v}</span>
    </div>
  )
}

/**
 * Live preview of the tracker's hidden <video data-face-tracker="1">.
 * Draws at ~15 fps into a small canvas; shows "no preview" when absent.
 */
function CameraPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hasVideo, setHasVideo] = useState(false)

  useEffect(() => {
    let raf = 0
    let last = 0
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick)
      if (ts - last < 66) return
      last = ts
      const video = document.querySelector<HTMLVideoElement>('video[data-face-tracker]')
      const canvas = canvasRef.current
      const ready = video !== null && video.readyState >= 2 && video.videoWidth > 0
      setHasVideo((prev) => (prev === ready ? prev : ready))
      if (!ready || !canvas || !video) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.save()
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      ctx.restore()
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="dbg-preview">
      <canvas ref={canvasRef} width={160} height={120} aria-label="Camera preview" />
      {!hasVideo && <span className="dbg-nopreview">no preview</span>}
    </div>
  )
}

const THRESHOLD_KEYS: readonly (keyof Thresholds)[] = [
  'browOn',
  'browOff',
  'leanOn',
  'leanOff',
  'leanBackOn',
  'leanBackOff',
  'smileOn',
  'smileOff',
  'sustainSimplifyMs',
  'sustainFocusMs',
  'sustainExpertMs',
  'sustainRelaxMs',
  'dwellMs',
  'cooldownMs',
  'keyboardHoldMs',
  'absenceMs',
  'presenceMin',
]

interface DebugOverlayProps {
  model: InteractionModel
}

/** Fixed right panel with the real signal values. Toggled with D. */
export function DebugOverlay({ model }: DebugOverlayProps) {
  const { face, mouse, state, thresholds: t } = model
  const now = performance.now()
  const last = state.lastTransition

  return (
    <aside className="dbg" aria-label="Debug">
      <div className="dbg-head">
        <strong>Debug</strong>
        <span>D closes · R recalibrates</span>
      </div>

      <section className="dbg-section">
        <h3>Camera</h3>
        <CameraPreview />
        <KV k="status" v={face.error ? `${face.status} (${face.error})` : face.status} />
        <KV k="fps" v={f0(face.fps)} />
        <KV k="present" v={face.present ? 'yes' : 'no'} />
        <KV
          k="baseline"
          v={`${face.baselineFaceHeight === null ? 'none' : f2(face.baselineFaceHeight)} · ${face.calibrated ? 'calibrated' : 'not calibrated'}`}
        />
        <KV k="frame age" v={face.ts > 0 ? ms(now - face.ts) : 'none'} />
      </section>

      <section className="dbg-section">
        <h3>Signals</h3>
        <div className="dbg-row dbg-row-head">
          <span>signal</span>
          <span>raw</span>
          <span>smooth</span>
          <span>bar (off | on)</span>
        </div>
        <SignalRow
          name="presence"
          raw={face.present ? '1.00' : '0.00'}
          smooth={f2(face.presence)}
          bar={<Bar value={face.presence} ticks={[{ at: t.presenceMin, kind: 'min', label: 'presenceMin' }]} />}
        />
        <SignalRow
          name="proximity"
          raw={f2(face.raw.faceHeight)}
          smooth={f2(face.proximity)}
          bar={
            <Bar
              value={face.proximity}
              min={0.7}
              max={1.4}
              ticks={[
                { at: t.leanBackOn, kind: 'off', label: 'leanBackOn' },
                { at: t.leanBackOff, kind: 'off', label: 'leanBackOff' },
                { at: 1, kind: 'base', label: 'baseline' },
                { at: t.leanOff, kind: 'off', label: 'leanOff' },
                { at: t.leanOn, kind: 'on', label: 'leanOn' },
              ]}
            />
          }
        />
        <SignalRow
          name="brow"
          raw={f2(face.raw.brow)}
          smooth={f2(face.brow)}
          bar={
            <Bar
              value={face.brow}
              ticks={[
                { at: t.browOff, kind: 'off', label: 'browOff' },
                { at: t.browOn, kind: 'on', label: 'browOn' },
              ]}
            />
          }
        />
        <SignalRow
          name="smile"
          raw={f2(face.raw.smile)}
          smooth={f2(face.smile)}
          bar={
            <Bar
              value={face.smile}
              ticks={[
                { at: t.smileOff, kind: 'off', label: 'smileOff' },
                { at: t.smileOn, kind: 'on', label: 'smileOn' },
              ]}
            />
          }
        />
        <SignalRow
          name="browInnerUp"
          raw={f2(face.raw.browInnerUp)}
          smooth="-"
          bar={<Bar value={face.raw.browInnerUp} />}
        />
        <SignalRow
          name="yaw"
          raw={deg(face.raw.yaw)}
          smooth={deg(face.yaw)}
          bar={<Bar value={face.yaw} min={-45} max={45} ticks={[{ at: 0, kind: 'base', label: 'centre' }]} />}
        />
        <SignalRow
          name="pitch"
          raw={deg(face.raw.pitch)}
          smooth={deg(face.pitch)}
          bar={<Bar value={face.pitch} min={-45} max={45} ticks={[{ at: 0, kind: 'base', label: 'centre' }]} />}
        />
        <SignalRow
          name="roll"
          raw={deg(face.raw.roll)}
          smooth={deg(face.roll)}
          bar={<Bar value={face.roll} min={-45} max={45} ticks={[{ at: 0, kind: 'base', label: 'centre' }]} />}
        />
        <p className="dbg-note">
          proximity raw = face height in frame units; smoothed = ratio to baseline (1.00 = calibration distance).
        </p>
      </section>

      <section className="dbg-section">
        <h3>Gesture ramps</h3>
        {(['simplify', 'focus', 'expert', 'relax'] as const).map((key) => (
          <div key={key} className="dbg-ramp">
            <span className="dbg-name">{key}</span>
            <Bar value={state.progress[key]} accent />
            <span className="dbg-smooth">{f0(state.progress[key] * 100)}%</span>
          </div>
        ))}
      </section>

      <section className="dbg-section">
        <h3>Pointer</h3>
        <KV k="dwellTarget" v={mouse.dwellTarget ?? 'none'} />
        <KV k="dwellMs" v={ms(mouse.dwellMs)} />
        <KV k="velocity" v={`${f0(mouse.velocity)} px/s`} />
        <KV k="idleMs" v={ms(mouse.idleMs)} />
        <KV k="x, y" v={`${f0(mouse.x)}, ${f0(mouse.y)}`} />
      </section>

      <section className="dbg-section">
        <h3>Engine</h3>
        <KV k="mode" v={state.mode} />
        <KV k="focusTarget" v={state.focusTarget ?? 'none'} />
        <KV k="source" v={state.source} />
        <KV k="in mode for" v={ms(now - state.since)} />
        <KV k="keyboardHold" v={state.keyboardHold ? 'yes' : 'no'} />
        <KV k="cooldownMs" v={ms(state.cooldownMs)} />
        <KV
          k="lastTransition"
          v={last ? `${last.from} to ${last.to} · ${ms(now - last.at)} ago` : 'none'}
        />
        {last && <KV k="reason" v={last.reason} />}
      </section>

      <section className="dbg-section">
        <h3>Thresholds</h3>
        <div className="dbg-thresholds">
          {THRESHOLD_KEYS.map((key) => (
            <KV key={key} k={key} v={String(t[key])} />
          ))}
        </div>
      </section>
    </aside>
  )
}
