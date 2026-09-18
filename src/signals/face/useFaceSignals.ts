/**
 * React binding for FaceTracker. One tracker per mount; the tracker publishes
 * every processed camera frame, React is notified at most every ~33 ms
 * (trailing edge kept, so the last frame always lands).
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { FaceSignals } from '../../engine/types'
import { EMPTY_FACE } from '../../engine/types'
import { FaceTracker } from './FaceTracker'

export interface FaceSignalsModel {
  face: FaceSignals
  start: () => void
  stop: () => void
  recalibrate: () => void
  videoElement: HTMLVideoElement | null
}

const PUBLISH_INTERVAL_MS = 33

/** useSyncExternalStore-compatible store that coalesces frame updates. */
class ThrottledFaceStore {
  private snapshot: FaceSignals = EMPTY_FACE
  private pending: FaceSignals | null = null
  private lastEmit = Number.NEGATIVE_INFINITY
  private timer = 0
  private listeners = new Set<() => void>()

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): FaceSignals => this.snapshot

  push(face: FaceSignals): void {
    this.pending = face
    const wait = PUBLISH_INTERVAL_MS - (performance.now() - this.lastEmit)
    if (wait <= 0) {
      this.flush()
    } else if (this.timer === 0) {
      this.timer = window.setTimeout(this.flush, wait)
    }
  }

  dispose(): void {
    if (this.timer !== 0) clearTimeout(this.timer)
    this.timer = 0
    this.pending = null
  }

  private flush = (): void => {
    this.timer = 0
    if (this.pending === null) return
    this.snapshot = this.pending
    this.pending = null
    this.lastEmit = performance.now()
    for (const listener of this.listeners) listener()
  }
}

function getServerSnapshot(): FaceSignals {
  return EMPTY_FACE
}

export function useFaceSignals(): FaceSignalsModel {
  // lazy initialisers: one tracker and one store per mount, never recreated
  const [tracker] = useState(() => new FaceTracker())
  const [store] = useState(() => new ThrottledFaceStore())

  useEffect(() => {
    const unsubscribe = tracker.subscribe((face) => {
      if (import.meta.env.DEV) {
        ;(window as unknown as { __face?: FaceSignals }).__face = face
      }
      store.push(face)
    })
    // seed React with whatever the tracker already holds (StrictMode remount)
    store.push(tracker.face)
    tracker.start()
    return () => {
      unsubscribe()
      tracker.stop()
      store.dispose()
    }
  }, [tracker, store])

  const face = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot)

  const start = useCallback(() => tracker.start(), [tracker])
  const stop = useCallback(() => tracker.stop(), [tracker])
  const recalibrate = useCallback(() => tracker.recalibrate(), [tracker])

  return { face, start, stop, recalibrate, videoElement: tracker.videoElement }
}
