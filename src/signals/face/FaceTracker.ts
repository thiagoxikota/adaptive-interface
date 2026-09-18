/**
 * FaceTracker: camera + MediaPipe Face Landmarker -> smoothed FaceSignals.
 *
 * Plain class, no React. One instance per mount. Everything runs locally:
 *   getUserMedia -> <video> -> detectForVideo -> FaceRaw -> EMA -> FaceSignals
 *
 * Nothing here decides a mode. It measures observable physical quantities
 * (blendshape coefficients, face size, head angles) and smooths them.
 */
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import type { CameraStatus, FaceRaw, FaceSignals } from '../../engine/types'
import { EMPTY_FACE, EMPTY_FACE_RAW } from '../../engine/types'
import { Ema, FpsMeter, emaAlpha, median } from '../smoothing'
import { rawFromResult } from './geometry'

export type FaceDelegate = 'GPU' | 'CPU'
export type FaceListener = (face: FaceSignals) => void

export interface FaceTrackerOptions {
  /** directory that serves vision_wasm_internal.{js,wasm} */
  wasmPath: string
  modelPath: string
  preferGpu: boolean
  /** ideal capture size; smaller is faster, 640x480 is plenty for one face */
  videoWidth: number
  videoHeight: number
  /** append the hidden <video> to document.body (needed for rVFC / decoding in most browsers) */
  attachVideo: boolean
  /** EMA time constants, ms */
  tauBrowMs: number
  tauSmileMs: number
  tauFaceHeightMs: number
  tauAnglesMs: number
  tauPresenceMs: number
  /** distance calibration */
  calibrationPresenceMin: number
  calibrationMs: number
  calibrationMinSamples: number
  driftTauMs: number
  driftBandLow: number
  driftBandHigh: number
  /** consecutive detect() failures tolerated before the tracker gives up */
  maxConsecutiveErrors: number
}

export const DEFAULT_FACE_TRACKER_OPTIONS: FaceTrackerOptions = {
  wasmPath: '/mediapipe/wasm',
  modelPath: '/mediapipe/face_landmarker.task',
  preferGpu: true,
  videoWidth: 640,
  videoHeight: 480,
  attachVideo: true,
  tauBrowMs: 150,
  tauSmileMs: 150,
  tauFaceHeightMs: 250,
  tauAnglesMs: 200,
  tauPresenceMs: 400,
  calibrationPresenceMin: 0.8,
  calibrationMs: 1500,
  calibrationMinSamples: 12,
  driftTauMs: 30_000,
  driftBandLow: 0.94,
  driftBandHigh: 1.06,
  maxConsecutiveErrors: 5,
}

type WasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>

const filesetCache = new Map<string, Promise<WasmFileset>>()

function getFileset(path: string): Promise<WasmFileset> {
  let p = filesetCache.get(path)
  if (!p) {
    p = FilesetResolver.forVisionTasks(path)
    filesetCache.set(path, p)
    p.catch(() => filesetCache.delete(path))
  }
  return p
}

function describeError(e: unknown): string {
  if (e instanceof Error) return e.name && e.name !== 'Error' ? `${e.name}: ${e.message}` : e.message
  return String(e)
}

function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop()
}

/** Frame callbacks stalled for this long while playing: switch rVFC -> rAF. */
const FRAME_WATCHDOG_MS = 1500

export class FaceTracker {
  readonly options: FaceTrackerOptions

  private listeners = new Set<FaceListener>()
  private snapshot: FaceSignals = EMPTY_FACE

  private video: HTMLVideoElement | null = null
  private stream: MediaStream | null = null
  private landmarker: FaceLandmarker | null = null
  private landmarkerLoad: Promise<FaceLandmarker | null> | null = null
  private delegate: FaceDelegate
  /** true from start() until stop(); decides whether an in-flight load is adopted or closed */
  private wantLandmarker = false
  private active = false
  /** bumped on every start()/stop() so stale async continuations bail out */
  private gen = 0

  private frameMode: 'rvfc' | 'raf' | null = null
  private frameHandle = 0
  private framesSeen = 0
  private watchdog = 0
  private lastVideoTime = -1
  private lastDetectTs = 0
  private detectCount = 0
  private consecutiveErrors = 0

  private browEma: Ema
  private smileEma: Ema
  private faceHeightEma: Ema
  private yawEma: Ema
  private pitchEma: Ema
  private rollEma: Ema
  private presenceEma: Ema
  private fpsMeter = new FpsMeter(1000)

  private baseline: number | null = null
  private calibrating = false
  private calibrationStart = 0
  private calibrationSamples: number[] = []
  private lastDriftTs: number | null = null

  constructor(options: Partial<FaceTrackerOptions> = {}) {
    this.options = { ...DEFAULT_FACE_TRACKER_OPTIONS, ...options }
    this.delegate = this.options.preferGpu ? 'GPU' : 'CPU'
    this.browEma = new Ema(this.options.tauBrowMs, 0)
    this.smileEma = new Ema(this.options.tauSmileMs, 0)
    this.faceHeightEma = new Ema(this.options.tauFaceHeightMs)
    this.yawEma = new Ema(this.options.tauAnglesMs, 0)
    this.pitchEma = new Ema(this.options.tauAnglesMs, 0)
    this.rollEma = new Ema(this.options.tauAnglesMs, 0)
    this.presenceEma = new Ema(this.options.tauPresenceMs, 0)
  }

  get face(): FaceSignals {
    return this.snapshot
  }

  get status(): CameraStatus {
    return this.snapshot.status
  }

  get videoElement(): HTMLVideoElement | null {
    return this.video
  }

  get activeDelegate(): FaceDelegate {
    return this.delegate
  }

  /** Called at most once per processed frame (plus once per status change). */
  subscribe(listener: FaceListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Idempotent while loading/running; re-tries after 'no-camera' / 'error'. */
  start(): void {
    if (this.active) return
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    this.active = true
    this.wantLandmarker = true
    const gen = ++this.gen
    this.consecutiveErrors = 0
    this.publish({ ...this.snapshot, status: 'loading', error: undefined })
    void this.openCamera(gen)
    void this.ensureLandmarker()
  }

  stop(): void {
    this.gen++
    this.active = false
    this.wantLandmarker = false
    this.stopLoop()
    if (this.stream) {
      stopStream(this.stream)
      this.stream = null
    }
    if (this.video) {
      this.video.srcObject = null
      this.video.remove()
      this.video = null
    }
    const lm = this.landmarker
    this.landmarker = null
    if (lm) {
      try {
        lm.close()
      } catch {
        /* already closed */
      }
    }
    // an in-flight load is closed when it resolves (see ensureLandmarker)
    this.resetSmoothing()
    this.publish({
      ...this.snapshot,
      status: 'idle',
      error: undefined,
      present: false,
      presence: 0,
      fps: 0,
      raw: EMPTY_FACE_RAW,
    })
  }

  /** Clears the distance baseline; a new 1.5 s window starts once a face is steadily present. */
  recalibrate(): void {
    this.baseline = null
    this.calibrating = false
    this.calibrationSamples = []
    this.lastDriftTs = null
    this.publish({ ...this.snapshot, proximity: 1, baselineFaceHeight: null, calibrated: false })
  }

  // ---------------------------------------------------------------- camera

  private async openCamera(gen: number): Promise<void> {
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined
    if (!md || typeof md.getUserMedia !== 'function') {
      this.failCamera(gen, 'getUserMedia is not available in this browser')
      return
    }
    let stream: MediaStream
    try {
      stream = await md.getUserMedia({
        video: {
          width: { ideal: this.options.videoWidth },
          height: { ideal: this.options.videoHeight },
          facingMode: 'user',
        },
        audio: false,
      })
    } catch (e) {
      this.failCamera(gen, describeError(e))
      return
    }
    if (gen !== this.gen) {
      stopStream(stream)
      return
    }
    this.stream = stream
    const video = this.video ?? this.createVideo()
    video.srcObject = stream
    // announce the element so a debug preview can attach before frames flow
    this.publish({ ...this.snapshot, status: 'loading' })
    try {
      await video.play()
    } catch {
      /* muted autoplay; a later user gesture will resume it */
    }
    if (gen !== this.gen) return
    this.startLoop(gen)
  }

  private failCamera(gen: number, message: string): void {
    if (gen !== this.gen) return
    this.active = false
    this.stopLoop()
    this.publish({ ...EMPTY_FACE, status: 'no-camera', error: message, baselineFaceHeight: this.baseline, calibrated: this.baseline !== null })
  }

  private createVideo(): HTMLVideoElement {
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.autoplay = true
    v.setAttribute('muted', '')
    v.setAttribute('playsinline', '')
    v.setAttribute('aria-hidden', 'true')
    v.dataset.faceTracker = 'source'
    Object.assign(v.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none',
    })
    if (this.options.attachVideo) document.body.appendChild(v)
    this.video = v
    return v
  }

  // ----------------------------------------------------------------- model

  private ensureLandmarker(): Promise<FaceLandmarker | null> {
    if (this.landmarker) return Promise.resolve(this.landmarker)
    if (!this.landmarkerLoad) {
      this.landmarkerLoad = this.loadLandmarker(this.delegate).then((lm) => {
        this.landmarkerLoad = null
        if (!lm) return null
        if (!this.wantLandmarker || this.landmarker) {
          lm.close()
          return null
        }
        this.landmarker = lm
        this.detectCount = 0
        return lm
      })
    }
    return this.landmarkerLoad
  }

  private async loadLandmarker(delegate: FaceDelegate): Promise<FaceLandmarker | null> {
    try {
      const fileset = await getFileset(this.options.wasmPath)
      const lm = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: this.options.modelPath, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      })
      this.delegate = delegate
      return lm
    } catch (e) {
      if (delegate === 'GPU') {
        console.warn('[FaceTracker] GPU delegate unavailable, falling back to CPU:', describeError(e))
        return this.loadLandmarker('CPU')
      }
      this.failModel(`Face model failed to load: ${describeError(e)}`)
      return null
    }
  }

  private failModel(message: string): void {
    this.active = false
    this.wantLandmarker = false
    this.stopLoop()
    if (this.stream) {
      stopStream(this.stream)
      this.stream = null
    }
    if (this.video) {
      this.video.srcObject = null
    }
    this.publish({ ...this.snapshot, status: 'error', error: message, present: false, presence: 0, fps: 0 })
  }

  // ------------------------------------------------------------ frame loop

  private startLoop(gen: number): void {
    const video = this.video
    if (!video) return
    this.stopLoop()
    this.lastVideoTime = -1
    this.framesSeen = 0
    if ('requestVideoFrameCallback' in video) {
      this.frameMode = 'rvfc'
      const tick = (): void => {
        if (gen !== this.gen) return
        this.framesSeen++
        this.safeFrame()
        this.frameHandle = video.requestVideoFrameCallback(tick)
      }
      this.frameHandle = video.requestVideoFrameCallback(tick)
      this.armWatchdog(gen)
    } else {
      this.startRafLoop(gen)
    }
  }

  private startRafLoop(gen: number): void {
    this.frameMode = 'raf'
    const tick = (): void => {
      if (gen !== this.gen) return
      this.safeFrame()
      this.frameHandle = requestAnimationFrame(tick)
    }
    this.frameHandle = requestAnimationFrame(tick)
  }

  /** Some browsers never fire rVFC for a hidden element; fall back to rAF if no frame arrives. */
  private armWatchdog(gen: number): void {
    const seenAtArm = this.framesSeen
    this.watchdog = window.setTimeout(() => {
      this.watchdog = 0
      if (gen !== this.gen || this.frameMode !== 'rvfc') return
      const video = this.video
      const playing = !!video && !video.paused && video.readyState >= 2
      if (this.framesSeen === seenAtArm && playing && !document.hidden) {
        console.warn('[FaceTracker] requestVideoFrameCallback stalled, switching to requestAnimationFrame')
        this.cancelFrame()
        this.startRafLoop(gen)
      } else if (this.framesSeen === seenAtArm) {
        this.armWatchdog(gen)
      }
    }, FRAME_WATCHDOG_MS)
  }

  private cancelFrame(): void {
    if (this.frameMode === 'rvfc' && this.video) {
      this.video.cancelVideoFrameCallback(this.frameHandle)
    } else if (this.frameMode === 'raf') {
      cancelAnimationFrame(this.frameHandle)
    }
    this.frameMode = null
    this.frameHandle = 0
  }

  private stopLoop(): void {
    this.cancelFrame()
    if (this.watchdog) {
      clearTimeout(this.watchdog)
      this.watchdog = 0
    }
    this.fpsMeter.reset()
  }

  private safeFrame(): void {
    try {
      this.onFrame()
    } catch (e) {
      this.onDetectError(e)
    }
  }

  private onFrame(): void {
    const video = this.video
    if (!video || video.readyState < 2 || video.videoWidth === 0) return
    const lm = this.landmarker
    if (!lm) {
      if (!this.landmarkerLoad && this.wantLandmarker) void this.ensureLandmarker()
      return
    }
    if (video.currentTime === this.lastVideoTime) return
    this.lastVideoTime = video.currentTime

    const now = performance.now()
    // MediaPipe requires strictly increasing timestamps
    const ts = Math.max(now, this.lastDetectTs + 1)
    this.lastDetectTs = ts

    let result: FaceLandmarkerResult
    try {
      result = lm.detectForVideo(video, ts)
    } catch (e) {
      this.onDetectError(e)
      return
    }
    this.detectCount++
    this.consecutiveErrors = 0

    const aspect = video.videoWidth / video.videoHeight
    this.integrate(rawFromResult(result, aspect), now)
  }

  private onDetectError(e: unknown): void {
    if (this.delegate === 'GPU' && this.detectCount === 0 && this.landmarker) {
      // created fine on GPU but cannot run there: rebuild on CPU, keep the loop alive
      console.warn('[FaceTracker] GPU detect failed on first frame, rebuilding on CPU:', describeError(e))
      const old = this.landmarker
      this.landmarker = null
      this.delegate = 'CPU'
      try {
        old.close()
      } catch {
        /* ignore */
      }
      void this.ensureLandmarker()
      return
    }
    this.consecutiveErrors++
    if (this.consecutiveErrors >= this.options.maxConsecutiveErrors) {
      this.failModel(`Face detection failed: ${describeError(e)}`)
    }
  }

  // ------------------------------------------------------------- signals

  private integrate(raw: FaceRaw | null, now: number): void {
    const present = raw !== null
    const r = raw ?? EMPTY_FACE_RAW

    const presence = this.presenceEma.update(present ? 1 : 0, now)
    // activity signals decay to zero while no face is visible
    const brow = this.browEma.update(r.brow, now)
    const smile = this.smileEma.update(r.smile, now)
    const yaw = this.yawEma.update(r.yaw, now)
    const pitch = this.pitchEma.update(r.pitch, now)
    const roll = this.rollEma.update(r.roll, now)
    // face height holds its last value while absent so proximity does not collapse
    const faceHeight = present ? this.faceHeightEma.update(r.faceHeight, now) : this.faceHeightEma.value

    this.updateCalibration(present, presence, faceHeight, now)
    const baseline = this.baseline
    const proximity = baseline !== null && baseline > 0 && faceHeight > 0 ? faceHeight / baseline : 1

    this.publish({
      status: 'running',
      error: undefined,
      present,
      presence,
      proximity,
      brow,
      smile,
      yaw,
      pitch,
      roll,
      baselineFaceHeight: baseline,
      calibrated: baseline !== null,
      fps: this.fpsMeter.tick(now),
      ts: now,
      raw: r,
    })
  }

  private updateCalibration(present: boolean, presence: number, faceHeight: number, now: number): void {
    const o = this.options
    const steady = present && presence >= o.calibrationPresenceMin && faceHeight > 0

    if (this.baseline === null) {
      if (steady) {
        if (!this.calibrating) {
          this.calibrating = true
          this.calibrationStart = now
          this.calibrationSamples = []
        }
        this.calibrationSamples.push(faceHeight)
        if (now - this.calibrationStart >= o.calibrationMs && this.calibrationSamples.length >= o.calibrationMinSamples) {
          this.baseline = median(this.calibrationSamples)
          this.calibrating = false
          this.calibrationSamples = []
          this.lastDriftTs = now
        }
      } else if (this.calibrating && presence < o.calibrationPresenceMin) {
        // face lost mid-window: start a fresh window when it is back
        this.calibrating = false
        this.calibrationSamples = []
      }
      return
    }

    // slow drift: follow the user while they sit at roughly the calibrated distance
    if (steady) {
      const ratio = faceHeight / this.baseline
      if (this.lastDriftTs !== null && ratio >= o.driftBandLow && ratio <= o.driftBandHigh) {
        this.baseline += (faceHeight - this.baseline) * emaAlpha(now - this.lastDriftTs, o.driftTauMs)
      }
      this.lastDriftTs = now
    } else {
      this.lastDriftTs = null
    }
  }

  private resetSmoothing(): void {
    this.browEma.reset(0)
    this.smileEma.reset(0)
    this.faceHeightEma.reset()
    this.yawEma.reset(0)
    this.pitchEma.reset(0)
    this.rollEma.reset(0)
    this.presenceEma.reset(0)
    this.fpsMeter.reset()
    this.calibrating = false
    this.calibrationSamples = []
    this.lastDriftTs = null
    this.lastVideoTime = -1
    this.detectCount = 0
    this.consecutiveErrors = 0
    // baseline is kept on purpose: a restart should not force a recalibration
  }

  private publish(next: FaceSignals): void {
    this.snapshot = next
    for (const listener of this.listeners) {
      try {
        listener(next)
      } catch (e) {
        console.error('[FaceTracker] listener threw', e)
      }
    }
  }
}
