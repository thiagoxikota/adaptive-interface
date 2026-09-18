/**
 * Shared contracts for the adaptive interface.
 *
 * Pipeline (all local, no network in the loop):
 *   MediaPipe FaceLandmarker -> FaceSignals (smoothed)
 *   pointer events           -> MouseSignals (smoothed)
 *   InteractionHeuristicEngine.update({face, mouse, now}) -> EngineState
 *   EngineState.mode -> Framer Motion layout morph
 *
 * Nothing in here infers emotion. Every signal is an observable physical
 * quantity (blendshape coefficient, face size, head angle, pointer motion).
 */

export type Mode = 'NORMAL' | 'SIMPLIFY' | 'FOCUS' | 'EXPERT'

export const MODES: readonly Mode[] = ['NORMAL', 'SIMPLIFY', 'FOCUS', 'EXPERT'] as const

export type CameraStatus =
  | 'idle'        // not started yet
  | 'loading'     // model / wasm loading, camera permission pending
  | 'running'     // frames flowing
  | 'no-camera'   // permission denied or no device: keyboard-only demo
  | 'error'       // model failed to load

/** Raw per-frame readings straight from the landmarker (before smoothing). */
export interface FaceRaw {
  /** normalized face height in frame units (0..1); 0 when no face */
  faceHeight: number
  /** 0..1, mean(browDownLeft, browDownRight) */
  brow: number
  /** 0..1, mean(mouthSmileLeft, mouthSmileRight) */
  smile: number
  /** 0..1, browInnerUp (reported for debug, not used for mode decisions) */
  browInnerUp: number
  /** degrees; from facialTransformationMatrixes when available */
  yaw: number
  pitch: number
  roll: number
}

/** Smoothed, engine-ready face signals. Updated ~every camera frame. */
export interface FaceSignals {
  status: CameraStatus
  error?: string
  /** true when a face was found on the latest frame */
  present: boolean
  /** 0..1 smoothed presence (fraction of recent frames with a face) */
  presence: number
  /**
   * Smoothed faceHeight divided by the calibrated baseline.
   * 1.0 = same distance as calibration, > 1 = closer, < 1 = farther.
   * 1.0 while not calibrated.
   */
  proximity: number
  /** 0..1 smoothed brow-furrow activity */
  brow: number
  /** 0..1 smoothed smile activity */
  smile: number
  /** degrees, smoothed */
  yaw: number
  pitch: number
  roll: number
  /** baseline face height captured over the calibration window; null until ready */
  baselineFaceHeight: number | null
  calibrated: boolean
  /** measured landmarker throughput */
  fps: number
  /** performance.now() of the last processed frame */
  ts: number
  raw: FaceRaw
}

/** Pointer-derived signals. Supplement the camera, never replace it. */
export interface MouseSignals {
  x: number
  y: number
  /** px/s, smoothed */
  velocity: number
  /** ms the pointer has stayed over the same focusable component */
  dwellMs: number
  /** value of data-focus-id under the pointer, or null */
  dwellTarget: string | null
  /** ms since the last pointer movement */
  idleMs: number
}

export interface EngineInput {
  face: FaceSignals
  mouse: MouseSignals
  /** performance.now() */
  now: number
}

export type TransitionSource = 'init' | 'camera' | 'keyboard'

export interface EngineState {
  mode: Mode
  /** data-focus-id of the component in FOCUS, null otherwise */
  focusTarget: string | null
  /** performance.now() when the current mode was entered */
  since: number
  source: TransitionSource
  /**
   * 0..1 progress of each gesture toward its sustained threshold.
   * Purely for the debug overlay so the presenter can see the ramp.
   */
  progress: { simplify: number; focus: number; expert: number; relax: number }
  /** true while a keyboard override suppresses camera transitions */
  keyboardHold: boolean
  /** ms remaining on the post-transition cooldown (0 when free) */
  cooldownMs: number
  /** last transition, for the debug log */
  lastTransition: { from: Mode; to: Mode; at: number; reason: string } | null
}

/**
 * Tunable thresholds. Every "on" threshold has a lower "off" threshold
 * (hysteresis) and every gesture needs to be sustained for a duration.
 * A single frame can never switch modes.
 */
export interface Thresholds {
  /** brow activity: enter above browOn, considered released below browOff */
  browOn: number
  browOff: number
  /** proximity ratio for "leaning forward" */
  leanOn: number
  leanOff: number
  /** proximity ratio for "leaning back" (relax to NORMAL) */
  leanBackOn: number
  leanBackOff: number
  smileOn: number
  smileOff: number
  /** ms the gesture must be sustained before the transition fires */
  sustainSimplifyMs: number
  sustainFocusMs: number
  sustainExpertMs: number
  sustainRelaxMs: number
  /** ms pointer dwell needed on a component for FOCUS */
  dwellMs: number
  /** ms after any transition during which no new transition fires */
  cooldownMs: number
  /** ms a keyboard override blocks camera-driven transitions */
  keyboardHoldMs: number
  /** ms of face absence after which the UI returns to NORMAL */
  absenceMs: number
  /** min smoothed presence to trust face signals at all */
  presenceMin: number
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  browOn: 0.35,
  browOff: 0.24,
  leanOn: 1.15,
  leanOff: 1.08,
  leanBackOn: 0.9,
  leanBackOff: 0.95,
  smileOn: 0.45,
  smileOff: 0.25,
  sustainSimplifyMs: 900,
  sustainFocusMs: 700,
  sustainExpertMs: 900,
  sustainRelaxMs: 1500,
  dwellMs: 900,
  cooldownMs: 1500,
  keyboardHoldMs: 6000,
  absenceMs: 3000,
  presenceMin: 0.6,
}

/** What the UI receives from the composing hook. */
export interface InteractionModel {
  state: EngineState
  face: FaceSignals
  mouse: MouseSignals
  thresholds: Thresholds
  debug: boolean
  /** manual override (keyboard 1-4 also route through this) */
  setMode: (mode: Mode) => void
  /** release the keyboard hold and let the camera drive again */
  release: () => void
  toggleDebug: () => void
  /** re-run the distance calibration */
  recalibrate: () => void
  /** start the camera (user gesture required in some browsers) */
  startCamera: () => void
}

/** Keyboard map. Kept tiny on purpose. */
export const KEYMAP: Record<string, Mode | 'debug' | 'release' | 'recalibrate'> = {
  '1': 'NORMAL',
  '2': 'SIMPLIFY',
  '3': 'FOCUS',
  '4': 'EXPERT',
  d: 'debug',
  D: 'debug',
  '0': 'release',
  Escape: 'release',
  r: 'recalibrate',
  R: 'recalibrate',
}

export const EMPTY_FACE_RAW: FaceRaw = {
  faceHeight: 0, brow: 0, smile: 0, browInnerUp: 0, yaw: 0, pitch: 0, roll: 0,
}

export const EMPTY_FACE: FaceSignals = {
  status: 'idle',
  present: false,
  presence: 0,
  proximity: 1,
  brow: 0,
  smile: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  baselineFaceHeight: null,
  calibrated: false,
  fps: 0,
  ts: 0,
  raw: EMPTY_FACE_RAW,
}

export const EMPTY_MOUSE: MouseSignals = {
  x: 0, y: 0, velocity: 0, dwellMs: 0, dwellTarget: null, idleMs: 0,
}

/**
 * Asynchronous copy from Claude. Requested AFTER a mode change has already
 * been applied; the layout never waits for it. Falls back to static copy.
 */
export interface Insight {
  mode: Mode
  focusTarget: string | null
  text: string
  source: 'claude' | 'static'
}

export interface InsightModel {
  insight: Insight | null
  /** true while a Claude request is in flight (static copy already shown) */
  pending: boolean
}
