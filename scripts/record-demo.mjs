#!/usr/bin/env node
/**
 * Records the demo video and the README screenshots into docs/, one headless
 * Chromium at a time. Same fake-camera flags as fake-camera-run.mjs, so the
 * real MediaPipe pipeline reacts to the y4m clip; the mode changes in the
 * video come from the engine, not from a script setting state.
 *
 *   node scripts/record-demo.mjs                 video + screenshots
 *   node scripts/record-demo.mjs --only video    docs/demo.mp4 + docs/demo.gif
 *   node scripts/record-demo.mjs --only shots    docs/mode-*.png, signal-bar-expert.png, debug.png
 *
 * Flags: --url http://localhost:5173/   --fixture tests/fixtures/approach-then-smile.y4m
 *        --only video|shots             --keep-webm (debugging: do not delete the raw recording)
 *
 * Video sequence: wait for the landmarker + calibration, let the clip drive
 * NORMAL -> EXPERT (smile), hold 4 s, key 2 (SIMPLIFY) 4 s, pointer on the
 * chart + key 3 (FOCUS) 4 s, key 1 (NORMAL) 3 s. The mode timeline observed
 * during the recording is printed so the video can be described truthfully.
 * Needs ffmpeg on PATH and the dev server running (dev-only globals).
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const args = parseArgs(process.argv.slice(2))
const opts = {
  url: str(args.url, 'http://localhost:5173/'),
  fixture: str(args.fixture, 'tests/fixtures/approach-then-smile.y4m'),
  only: str(args.only, ''),
  keepWebm: Boolean(args['keep-webm']),
}
const fixtureAbs = path.resolve(opts.fixture)
if (!existsSync(fixtureAbs)) {
  console.error(`fixture not found: ${fixtureAbs}`)
  process.exit(1)
}
const docsDir = path.resolve('docs')
const rawDir = path.resolve('docs/.raw')
mkdirSync(docsDir, { recursive: true })

const VIEWPORT = { width: 1440, height: 900 }
const MP4_MAX = 8 * 1024 * 1024
const GIF_MAX = 12 * 1024 * 1024
const cameraArgs = [
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  `--use-file-for-fake-video-capture=${fixtureAbs}`,
  '--autoplay-policy=no-user-gesture-required',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
]

const started = Date.now()
const now = () => Date.now() - started
const errors = []

try {
  if (opts.only !== 'shots') await recordVideo()
  if (opts.only !== 'video') {
    await keyboardShots()
    await cameraShots()
  }
} catch (err) {
  console.error(`[demo] failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`)
  process.exitCode = 1
}
if (errors.length) {
  console.log(`[demo] ${errors.length} console/page error(s):`)
  for (const e of errors.slice(0, 10)) console.log(`  ${e}`)
} else {
  console.log('[demo] 0 console errors, 0 page errors')
}
printSizes()

// ---------------------------------------------------------------------------

async function recordVideo() {
  mkdirSync(rawDir, { recursive: true })
  const browser = await chromium.launch({ headless: true, channel: 'chromium', args: cameraArgs })
  let webm = null
  const timeline = []
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      permissions: ['camera'],
      recordVideo: { dir: rawDir, size: VIEWPORT },
    })
    const page = await context.newPage()
    const videoStart = Date.now()
    const vt = () => (Date.now() - videoStart) / 1000
    watchErrors(page)

    // Mode timeline observed during the recording (200 ms poll, independent of the sequence below).
    let polling = true
    let lastMode = null
    const poll = (async () => {
      while (polling) {
        const mode = await page.evaluate(() => (window.__engine ? window.__engine.mode : null)).catch(() => null)
        if (mode !== lastMode) {
          timeline.push({ at: round1(vt()), mode })
          lastMode = mode
        }
        await sleep(200)
      }
    })()

    console.log(`[video] ${opts.url} fixture=${path.basename(fixtureAbs)}`)
    await page.goto(opts.url, { waitUntil: 'load', timeout: 30000 })
    await waitFor(page, () => window.__face && window.__face.status === 'running', 20000, 'camera running')
    console.log(`[video] camera running at ${round1(vt())} s`)
    await waitFor(page, () => window.__face && window.__face.calibrated === true, 20000, 'calibrated')
    console.log(`[video] calibrated at ${round1(vt())} s`)

    const expertOk = await waitFor(page, () => window.__engine && window.__engine.mode === 'EXPERT', 20000, 'EXPERT', false)
    const expertAt = vt()
    console.log(expertOk ? `[video] EXPERT from the camera at ${round1(expertAt)} s` : `[video] EXPERT not reached within 20 s (t=${round1(expertAt)} s)`)
    await sleep(4000)

    await page.keyboard.press('2')
    const simplifyAt = vt()
    console.log(`[video] key 2 at ${round1(simplifyAt)} s`)
    // The clip loops every 9 s and smiles again. A key press spends a gesture
    // only when its latch is engaged at that moment, so key 3 goes down as soon
    // as the next smile crosses smileOn (after at least 3.5 s of SIMPLIFY):
    // the smile is then spent until it releases and cannot end the FOCUS hold.
    await sleep(3500)
    await waitFor(page, () => window.__face && window.__face.smile >= 0.5, 6000, 'next smile', false)
    const chart = await page.locator('[data-focus-id="chart"]').boundingBox()
    if (chart) await page.mouse.move(chart.x + chart.width / 2, chart.y + chart.height / 2)
    await page.keyboard.press('3')
    const focusAt = vt()
    console.log(`[video] key 3 (pointer on chart) at ${round1(focusAt)} s, SIMPLIFY held ${round1(focusAt - simplifyAt)} s`)
    await sleep(4000)

    // Pointer off the chart first, otherwise lean + dwell re-enter FOCUS once the hold ends.
    await page.mouse.move(VIEWPORT.width / 2, 28)
    await page.keyboard.press('1')
    console.log(`[video] key 1 at ${round1(vt())} s`)
    await sleep(3000)
    const total = vt()

    polling = false
    await poll
    const video = page.video()
    await context.close()
    webm = video ? await video.path() : null
    console.log(`[video] timeline: ${timeline.map((m) => `${m.mode}@${m.at}s`).join(' -> ')}`)
    if (!webm || !existsSync(webm)) throw new Error('no webm written by recordVideo')
    console.log(`[video] raw ${path.relative(process.cwd(), webm)} (${mb(webm)}), ${round1(total)} s`)

    encodeMp4(webm)
    encodeGif(webm, { expertAt, focusAt, total })
  } finally {
    await browser.close().catch(() => {})
    if (webm && !opts.keepWebm) rmSync(rawDir, { recursive: true, force: true })
  }
}

function encodeMp4(webm) {
  const out = path.join(docsDir, 'demo.mp4')
  for (const crf of [24, 28, 32, 36]) {
    ffmpeg(['-y', '-i', webm, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', out])
    const size = statSync(out).size
    console.log(`[mp4] crf ${crf}: ${mb(out)}`)
    if (size <= MP4_MAX) return
  }
  console.log('[mp4] still above 8 MB at crf 36; kept the last encode')
}

function encodeGif(webm, { expertAt, focusAt, total }) {
  const out = path.join(docsDir, 'demo.gif')
  // From just before the EXPERT transition through the SIMPLIFY hold, ending at the FOCUS key (12 to 15 s).
  const end = Math.min(total, focusAt)
  const start = Math.max(0, Math.min(expertAt - 3, end - 12))
  const duration = Math.min(15, end - start)
  console.log(`[gif] window ${round1(start)} s to ${round1(start + duration)} s (${round1(duration)} s)`)
  const attempts = [
    { fps: 12, colors: 256, scale: 800 },
    { fps: 12, colors: 128, scale: 800 },
    { fps: 10, colors: 96, scale: 800 },
    { fps: 8, colors: 64, scale: 720 },
  ]
  for (const a of attempts) {
    const filter =
      `fps=${a.fps},scale=${a.scale}:-2:flags=lanczos,split[s0][s1];` +
      `[s0]palettegen=max_colors=${a.colors}:stats_mode=diff[p];` +
      `[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`
    ffmpeg(['-y', '-ss', String(start), '-t', String(duration), '-i', webm, '-vf', filter, '-loop', '0', out])
    const size = statSync(out).size
    console.log(`[gif] ${a.fps} fps, ${a.colors} colors, ${a.scale} px: ${mb(out)}`)
    if (size <= GIF_MAX) return
  }
  console.log('[gif] still above 12 MB; kept the last encode')
}

// ---------------------------------------------------------------------------

/** No fake camera and no permission: the app lands in its no-camera path and the keys drive the modes. */
async function keyboardShots() {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' })
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
    const page = await context.newPage()
    watchErrors(page)
    console.log(`[shots] keyboard: ${opts.url} (camera not granted)`)
    await page.goto(opts.url, { waitUntil: 'load', timeout: 30000 })
    await waitFor(page, () => window.__face && window.__face.status === 'no-camera', 10000, 'no-camera', false)
    await sleep(600)
    await shot(page, 'mode-normal.png')

    await page.keyboard.press('2')
    await sleep(1400)
    await shot(page, 'mode-simplify.png')

    await page.hover('[data-focus-id="chart"]')
    await page.keyboard.press('3')
    await sleep(1400)
    await shot(page, 'mode-focus.png')

    await page.keyboard.press('4')
    await sleep(1400)
    await shot(page, 'mode-expert.png')
  } finally {
    await browser.close().catch(() => {})
  }
}

/** Fake camera: EXPERT reached by the smile, then the live signal bar and the debug panel. */
async function cameraShots() {
  const browser = await chromium.launch({ headless: true, channel: 'chromium', args: cameraArgs })
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, permissions: ['camera'] })
    const page = await context.newPage()
    watchErrors(page)
    console.log(`[shots] camera: ${opts.url} fixture=${path.basename(fixtureAbs)}`)
    await page.goto(opts.url, { waitUntil: 'load', timeout: 30000 })
    await waitFor(page, () => window.__face && window.__face.status === 'running', 20000, 'camera running')
    await waitFor(page, () => window.__face && window.__face.calibrated === true, 20000, 'calibrated')
    const ok = await waitFor(page, () => window.__engine && window.__engine.mode === 'EXPERT', 20000, 'EXPERT', false)
    console.log(`[shots] EXPERT ${ok ? 'reached' : 'NOT reached'} at ${round1(now() / 1000)} s`)
    await sleep(1200)
    await shot(page, 'signal-bar-expert.png', { clip: { x: 0, y: 0, width: VIEWPORT.width, height: 100 } })

    await page.keyboard.press('d')
    await sleep(800)
    await shot(page, 'debug.png')
  } finally {
    await browser.close().catch(() => {})
  }
}

// ---------------------------------------------------------------------------

async function shot(page, name, extra = {}) {
  const file = path.join(docsDir, name)
  const mode = await page.evaluate(() => (window.__engine ? window.__engine.mode : null)).catch(() => null)
  const status = await page.evaluate(() => (window.__face ? window.__face.status : null)).catch(() => null)
  await page.screenshot({ path: file, ...extra })
  console.log(`[shots] ${name} (mode ${mode ?? '-'}, camera ${status ?? '-'}, ${mb(file)})`)
}

async function waitFor(page, predicate, timeoutMs, label, strict = true) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const ok = await page.evaluate(predicate).catch(() => false)
    if (ok) return true
    await sleep(100)
  }
  if (strict) throw new Error(`timed out after ${timeoutMs} ms waiting for ${label}`)
  return false
}

function watchErrors(page) {
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isConsoleNoise(msg.text())) errors.push(`console: ${msg.text().slice(0, 200)}`)
  })
  page.on('pageerror', (err) => errors.push(`page: ${err instanceof Error ? err.message : String(err)}`))
}

/** MediaPipe prints this INFO line through console.error when the blendshape graph starts; it is not an error. */
function isConsoleNoise(text) {
  return /^INFO: Created TensorFlow Lite XNNPACK delegate for CPU\./.test(text)
}

function ffmpeg(cmdArgs) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...cmdArgs], { stdio: ['ignore', 'inherit', 'inherit'] })
}

function printSizes() {
  if (!existsSync(docsDir)) return
  const files = readdirSync(docsDir).filter((f) => !f.startsWith('.')).sort()
  console.log('[docs]')
  for (const f of files) console.log(`  ${f.padEnd(24)} ${mb(path.join(docsDir, f))}`)
}

function mb(file) {
  const b = statSync(file).size
  return b >= 1024 * 1024 ? `${(b / (1024 * 1024)).toFixed(2)} MB` : `${Math.round(b / 1024)} KB`
}
function round1(v) {
  return Math.round(v * 10) / 10
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
function str(v, d) {
  return typeof v === 'string' ? v : d
}
function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const eq = a.indexOf('=')
    if (eq !== -1) {
      out[a.slice(2, eq)] = a.slice(eq + 1)
      continue
    }
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next
      i += 1
    } else {
      out[key] = true
    }
  }
  return out
}
