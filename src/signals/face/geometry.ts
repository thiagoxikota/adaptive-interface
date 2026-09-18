/**
 * Pure geometry over a MediaPipe FaceLandmarkerResult. No DOM, no state.
 *
 * Landmark indices follow the 478-point MediaPipe face mesh. "Left"/"right"
 * always mean the SUBJECT's left/right. Normalized landmark coordinates are in
 * the raw (unmirrored) camera frame: x grows to the viewer's right, y grows
 * downward, so the subject's left side appears at larger x.
 */
import type { Category, FaceLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { FaceRaw } from '../../engine/types'
import { clamp } from '../smoothing'

export const LANDMARK_FOREHEAD_TOP = 10
export const LANDMARK_CHIN = 152
export const LANDMARK_NOSE_TIP = 1
/** subject's right eye outer corner (viewer's left in an unmirrored frame) */
export const LANDMARK_RIGHT_EYE_OUTER = 33
/** subject's left eye outer corner */
export const LANDMARK_LEFT_EYE_OUTER = 263
export const LANDMARK_RIGHT_CHEEK = 234
export const LANDMARK_LEFT_CHEEK = 454

export const BLENDSHAPES = [
  'browDownLeft',
  'browDownRight',
  'browInnerUp',
  'mouthSmileLeft',
  'mouthSmileRight',
] as const
export type BlendshapeName = (typeof BLENDSHAPES)[number]
export type BlendshapeScores = Record<BlendshapeName, number>

const BLENDSHAPE_SET: ReadonlySet<string> = new Set(BLENDSHAPES)

function isTrackedBlendshape(name: string): name is BlendshapeName {
  return BLENDSHAPE_SET.has(name)
}

/** Picks the five blendshape scores we use out of the 52 the model reports. */
export function pickBlendshapes(categories: readonly Category[] | undefined): BlendshapeScores {
  const out: BlendshapeScores = {
    browDownLeft: 0,
    browDownRight: 0,
    browInnerUp: 0,
    mouthSmileLeft: 0,
    mouthSmileRight: 0,
  }
  if (!categories) return out
  for (const c of categories) {
    if (isTrackedBlendshape(c.categoryName)) out[c.categoryName] = c.score
  }
  return out
}

/**
 * Face size in units of frame HEIGHT, built from two measures that do not
 * move when the mouth does: the distance between the outer eye corners
 * (33-263) and the forehead-top to nose-tip height (10-1). Forehead-to-chin
 * grows about 10% on a smile because the jaw drops, which read as "leaning
 * in"; these two do not. `aspect` is videoWidth / videoHeight; x is rescaled
 * by it so a rolled head measures the same as an upright one.
 */
export function faceHeightFromLandmarks(landmarks: readonly NormalizedLandmark[], aspect: number): number {
  const top = landmarks[LANDMARK_FOREHEAD_TOP]
  const nose = landmarks[LANDMARK_NOSE_TIP]
  const eyeR = landmarks[LANDMARK_RIGHT_EYE_OUTER]
  const eyeL = landmarks[LANDMARK_LEFT_EYE_OUTER]
  if (!top || !nose || !eyeR || !eyeL) return 0
  const upper = Math.hypot((top.x - nose.x) * aspect, top.y - nose.y)
  const eyes = Math.hypot((eyeR.x - eyeL.x) * aspect, eyeR.y - eyeL.y)
  return upper + eyes
}

export interface HeadAngles {
  yaw: number
  pitch: number
  roll: number
}

const RAD2DEG = 180 / Math.PI

/**
 * Head angles (degrees) from the 4x4 facial transformation matrix.
 *
 * `data` is column-major (data[col * 4 + row]) and maps the canonical face
 * model into MediaPipe's metric camera space: camera at the origin looking
 * down -Z, +X to the viewer's right, +Y up. The canonical model faces +Z with
 * +X through the ears toward the subject's left, so:
 *   column 2 = where the face is pointing ("forward" axis)
 *   column 0 = the ear-to-ear axis, pointing to the subject's left
 *
 * Sign conventions (documented in README.md):
 *   yaw   > 0  the user turns to THEIR left (nose swings to the viewer's right)
 *   pitch > 0  chin up (looking up)
 *   roll  > 0  the subject's left side rises (head tilts toward THEIR right shoulder)
 */
export function anglesFromMatrix(data: readonly number[]): HeadAngles | null {
  if (data.length < 16) return null
  const m = (row: number, col: number): number => data[col * 4 + row] ?? 0
  const fx = m(0, 2)
  const fy = m(1, 2)
  const fz = m(2, 2)
  const lx = m(0, 0)
  const ly = m(1, 0)
  const yaw = Math.atan2(fx, fz) * RAD2DEG
  const pitch = Math.atan2(fy, Math.hypot(fx, fz)) * RAD2DEG
  const roll = Math.atan2(ly, lx) * RAD2DEG
  if (!Number.isFinite(yaw) || !Number.isFinite(pitch) || !Number.isFinite(roll)) return null
  return { yaw, pitch, roll }
}

/**
 * Coarse fallback when the transformation matrix is missing. Same sign
 * conventions as anglesFromMatrix, derived from 2D landmark layout:
 *   yaw   from the nose tip offset between the cheeks
 *   pitch from the nose tip position between forehead top and chin
 *   roll  from the eye line
 * Only approximate; the matrix path is the real one.
 */
export function anglesFromLandmarks(landmarks: readonly NormalizedLandmark[], aspect: number): HeadAngles {
  const nose = landmarks[LANDMARK_NOSE_TIP]
  const top = landmarks[LANDMARK_FOREHEAD_TOP]
  const chin = landmarks[LANDMARK_CHIN]
  const rightCheek = landmarks[LANDMARK_RIGHT_CHEEK]
  const leftCheek = landmarks[LANDMARK_LEFT_CHEEK]
  const rightEye = landmarks[LANDMARK_RIGHT_EYE_OUTER]
  const leftEye = landmarks[LANDMARK_LEFT_EYE_OUTER]
  if (!nose || !top || !chin || !rightCheek || !leftCheek || !rightEye || !leftEye) {
    return { yaw: 0, pitch: 0, roll: 0 }
  }

  const cheekMid = (rightCheek.x + leftCheek.x) / 2
  const cheekHalf = Math.max(1e-4, (leftCheek.x - rightCheek.x) / 2)
  const yaw = Math.asin(clamp((nose.x - cheekMid) / cheekHalf, -1, 1)) * RAD2DEG

  // At rest the nose tip sits a bit below the midpoint of the face box; it
  // migrates toward the forehead as the chin comes up.
  const faceSpan = Math.max(1e-4, chin.y - top.y)
  const noseFrac = (nose.y - top.y) / faceSpan
  const pitch = (0.55 - noseFrac) * 120

  const ex = (leftEye.x - rightEye.x) * aspect
  const ey = -(leftEye.y - rightEye.y)
  const roll = Math.atan2(ey, ex) * RAD2DEG

  return { yaw, pitch, roll }
}

/** null when the result holds no face. */
export function rawFromResult(result: FaceLandmarkerResult, aspect: number): FaceRaw | null {
  const landmarks = result.faceLandmarks[0]
  if (!landmarks || landmarks.length === 0) return null

  const bs = pickBlendshapes(result.faceBlendshapes[0]?.categories)
  const matrix = result.facialTransformationMatrixes[0]
  const fromMatrix = matrix && matrix.rows === 4 && matrix.columns === 4 ? anglesFromMatrix(matrix.data) : null
  const angles = fromMatrix ?? anglesFromLandmarks(landmarks, aspect)

  return {
    faceHeight: faceHeightFromLandmarks(landmarks, aspect),
    brow: (bs.browDownLeft + bs.browDownRight) / 2,
    smile: (bs.mouthSmileLeft + bs.mouthSmileRight) / 2,
    browInnerUp: bs.browInnerUp,
    yaw: angles.yaw,
    pitch: angles.pitch,
    roll: angles.roll,
  }
}
