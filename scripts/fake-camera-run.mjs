#!/usr/bin/env node
/**
 * Drives the app in headless Chromium with a fake camera fed by a y4m clip,
 * samples the dev globals (window.__face / __engine / __mouse / __insight)
 * every --interval ms and writes samples.json, summary.json and screenshots
 * under tests/out/<name>/. The summary is the verdict; the exit code is 0
 * unless the browser fails to launch.
 *
 *   node scripts/fake-camera-run.mjs --fixture tests/fixtures/smile.y4m --name smile
 *   node scripts/fake-camera-run.mjs --fixture tests/fixtures/approach.y4m --name approach-keys --keys 2,4 --keyAt 1500
 *   node scripts/fake-camera-run.mjs --fixture tests/fixtures/smile.y4m --name smoke --smoke
 *
 * Flags: --fixture <path.y4m> (required)  --name <label> (required)
 *        --duration 10000  --interval 200  --url http://localhost:5173/?debug=1
 *        --keys 2,4 --keyAt 1500   press each key at keyAt + i*1500 ms
 *        --channel chromium|shell  (default chromium = new headless, full binary)
 *        --headed                  show the browser (debugging only)
 *        --smoke                   only prove getUserMedia + y4m: print videoWidth/videoHeight and frame count.
 *                                  Serves its own blank page on 127.0.0.1 (getUserMedia needs a secure context,
 *                                  which a data: URL is not); --url is ignored in this mode.
 */
import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import process from 'node:process'

/** Table columns for the sample printout. Declared before the top-level run so printHeader() can read it. */
const COLS = [
  ['t', 6],
  ['status', 9],
  ['pres', 5],
  ['presence', 8],
  ['prox', 6],
  ['cal', 4],
  ['brow', 6],
  ['smile', 6],
  ['bInUp', 6],
  ['yaw', 5],
  ['pitch', 5],
  ['roll', 5],
  ['fps', 5],
  ['mode', 9],
  ['focus', 14],
  ['pSimp', 6],
  ['pFoc', 6],
  ['pExp', 6],
  ['pRelax', 6],
  ['ins', 6],
]

const args = parseArgs(process.argv.slice(2))
const opts = {
  fixture: str(args.fixture, ''),
  name: str(args.name, ''),
  duration: num(args.duration, 10000),
  interval: num(args.interval, 200),
  url: str(args.url, 'http://localhost:5173/?debug=1'),
  keys: str(args.keys, '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean),
  keyAt: num(args.keyAt, 1500),
  channel: str(args.channel, 'chromium'),
  headed: Boolean(args.headed),
  smoke: Boolean(args.smoke),
}

if (!opts.fixture || !opts.name) {
  console.error('usage: node scripts/fake-camera-run.mjs --fixture <path.y4m> --name <label> [--duration ms] [--url ...] [--keys 2,4 --keyAt 1500] [--smoke]')
  process.exit(1)
}
const fixtureAbs = path.resolve(opts.fixture)
if (!existsSync(fixtureAbs)) {
  console.error(`fixture not found: ${fixtureAbs}`)
  process.exit(1)
}
const outDir = path.resolve('tests/out', opts.name)
mkdirSync(outDir, { recursive: true })

const launchArgs = [
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  `--use-file-for-fake-video-capture=${fixtureAbs}`,
  '--autoplay-policy=no-user-gesture-required',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
]

let browser
try {
  browser = await chromium.launch({
    headless: !opts.headed,
    channel: opts.channel === 'shell' ? undefined : 'chromium',
    args: launchArgs,
  })
} catch (err) {
  console.error(`browser failed to launch: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}

const consoleErrors = []
const pageErrors = []
const started = Date.now()
const now = () => Date.now() - started
let smokeServer = null

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    permissions: ['camera'],
  })
  const page = await context.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isConsoleNoise(msg.text())) consoleErrors.push({ t: now(), text: msg.text() })
  })
  page.on('pageerror', (err) => pageErrors.push({ t: now(), text: err instanceof Error ? err.message : String(err) }))

  let url = opts.url
  if (opts.smoke) {
    smokeServer = await startSmokeServer()
    url = smokeServer.url
  }
  console.log(`[run] ${opts.name}: fixture=${path.basename(fixtureAbs)} url=${url} channel=${opts.channel}`)
  await page.goto(url, { waitUntil: 'load', timeout: 30000 })

  if (opts.smoke) {
    await runSmoke(page)
  } else {
    await runSampling(page)
  }
} catch (err) {
  console.error(`[run] failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`)
} finally {
  await browser.close().catch(() => {})
  if (smokeServer) smokeServer.close()
}
process.exit(0)

// ---------------------------------------------------------------------------

// getUserMedia only exists in a secure context; 127.0.0.1 qualifies, data: does not.
function startSmokeServer() {
  const html = '<!doctype html><title>smoke</title><body style="margin:0;background:#111">'
  return new Promise((resolve, reject) => {
    const server = createServer((_req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(html)
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve({ url: `http://127.0.0.1:${address.port}/`, close: () => server.close() })
    })
  })
}

// ---------------------------------------------------------------------------

async function runSmoke(page) {
  const probe = await page.evaluate(async (ms) => {
    const out = { webgl2: false, label: '', videoWidth: 0, videoHeight: 0, frames: 0, ms: 0, error: null }
    try {
      out.webgl2 = document.createElement('canvas').getContext('webgl2') !== null
    } catch {
      out.webgl2 = false
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      out.label = stream.getVideoTracks()[0]?.label ?? ''
      const video = document.createElement('video')
      video.srcObject = stream
      video.muted = true
      video.playsInline = true
      video.style.width = '480px'
      document.body.appendChild(video)
      await video.play()
      if (!video.videoWidth) {
        await new Promise((resolve) => video.addEventListener('loadedmetadata', resolve, { once: true }))
      }
      out.videoWidth = video.videoWidth
      out.videoHeight = video.videoHeight
      const t0 = performance.now()
      await new Promise((resolve) => {
        const tick = () => {
          out.frames += 1
          if (performance.now() - t0 < ms) video.requestVideoFrameCallback(tick)
          else resolve()
        }
        video.requestVideoFrameCallback(tick)
      })
      out.ms = Math.round(performance.now() - t0)
    } catch (err) {
      out.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    }
    return out
  }, Math.min(opts.duration, 5000))
  const shot = path.join(outDir, 'smoke.png')
  await page.screenshot({ path: shot })
  console.log('[smoke]', JSON.stringify(probe))
  console.log(`[smoke] fps~${probe.ms ? (probe.frames / (probe.ms / 1000)).toFixed(1) : '0'} screenshot=${shot}`)
  console.log(`[smoke] console errors: ${consoleErrors.length}, page errors: ${pageErrors.length}`)
  writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ smoke: true, fixture: fixtureAbs, probe, consoleErrors, pageErrors }, null, 2))
}

async function runSampling(page) {
  // 1. wait for the landmarker
  const statusTimeline = []
  let lastStatus = Symbol('none')
  const waitStart = now()
  while (now() - waitStart < 20000) {
    const status = await page
      .evaluate(() => (window.__face ? window.__face.status : 'undefined'))
      .catch(() => 'eval-error')
    if (status !== lastStatus) {
      statusTimeline.push({ t: now(), status })
      console.log(`[status] t=${now()}ms ${status}`)
      lastStatus = status
    }
    if (status === 'running') break
    await sleep(200)
  }
  if (lastStatus !== 'running') console.log(`[status] never reached running within 20 s (last: ${String(lastStatus)}); sampling anyway`)

  // 2. sample
  const samples = []
  const screenshots = []
  const transitions = []
  const modeTimeline = []
  const seenTransitions = new Set()
  const pendingKeys = opts.keys.map((key, i) => ({ key, at: opts.keyAt + i * 1500, pressed: false }))
  let shotIndex = 0
  let lastMode = null
  const sampleStart = now()
  printHeader()

  const shoot = async (label) => {
    const file = path.join(outDir, `${String(shotIndex).padStart(2, '0')}-${label}.png`)
    shotIndex += 1
    await page.screenshot({ path: file, fullPage: true }).catch((err) => console.log(`[shot] failed: ${err.message}`))
    screenshots.push({ t: now(), file: path.relative(process.cwd(), file) })
    return file
  }

  while (now() - sampleStart < opts.duration) {
    const t = now() - sampleStart
    for (const k of pendingKeys) {
      if (!k.pressed && t >= k.at) {
        k.pressed = true
        await page.keyboard.press(k.key).catch(() => {})
        console.log(`[key] t=${t}ms pressed ${k.key}`)
      }
    }
    const s = await readSample(page)
    s.t = t
    samples.push(s)
    printRow(s)

    if (s.lastTransition) {
      const id = `${s.lastTransition.from}>${s.lastTransition.to}@${s.lastTransition.at}`
      if (!seenTransitions.has(id)) {
        seenTransitions.add(id)
        transitions.push({ t, ...s.lastTransition })
      }
    }
    if (s.mode !== lastMode) {
      modeTimeline.push({ t, mode: s.mode })
      const label = String(s.mode)
      const file = await shoot(label)
      console.log(`[shot] t=${t}ms mode=${s.mode} -> ${path.relative(process.cwd(), file)}`)
      lastMode = s.mode
    }
    await sleep(opts.interval)
  }
  const final = await readSample(page)
  final.t = now() - sampleStart
  const endShot = await shoot(`end-${final.mode}`)
  console.log(`[shot] end -> ${path.relative(process.cwd(), endShot)}`)

  // 3. summarise
  const signals = ['presence', 'proximity', 'brow', 'smile', 'browInnerUp', 'yaw', 'pitch', 'roll', 'fps']
  const stats = {}
  for (const key of signals) {
    const values = samples.map((s) => s[key]).filter((v) => typeof v === 'number' && Number.isFinite(v))
    stats[key] = values.length
      ? {
          min: round(Math.min(...values)),
          max: round(Math.max(...values)),
          mean: round(values.reduce((a, b) => a + b, 0) / values.length),
          n: values.length,
        }
      : null
  }
  const firstCalibrated = samples.find((s) => s.calibrated === true)
  const running = statusTimeline.find((e) => e.status === 'running')
  const summary = {
    name: opts.name,
    fixture: fixtureAbs,
    url: opts.url,
    durationMs: opts.duration,
    intervalMs: opts.interval,
    keys: pendingKeys,
    runningAtMs: running ? running.t : null,
    calibrationMs: firstCalibrated ? firstCalibrated.t : null,
    statusTimeline,
    stats,
    modeTimeline,
    transitions,
    finalMode: final.mode,
    finalFocusTarget: final.focusTarget,
    finalInsightSource: final.insightSource,
    presentFraction: round(samples.filter((s) => s.present === true).length / Math.max(1, samples.length)),
    screenshots,
    consoleErrors,
    pageErrors,
    samplesFile: path.relative(process.cwd(), path.join(outDir, 'samples.json')),
  }
  writeFileSync(path.join(outDir, 'samples.json'), JSON.stringify(samples, null, 1))
  writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2))

  console.log('')
  console.log(`[summary] running at ${summary.runningAtMs ?? 'never'} ms, calibrated at ${summary.calibrationMs ?? 'never'} ms, present ${Math.round(summary.presentFraction * 100)}% of samples`)
  for (const key of signals) {
    const st = stats[key]
    console.log(`[summary] ${key.padEnd(12)} ${st ? `min ${fmt(st.min)}  max ${fmt(st.max)}  mean ${fmt(st.mean)}` : 'no data'}`)
  }
  console.log(`[summary] modes: ${modeTimeline.map((m) => `${m.mode}@${m.t}`).join(' -> ') || 'none'}`)
  for (const tr of transitions) console.log(`[summary] transition ${tr.from} -> ${tr.to} at engine t=${Math.round(tr.at)} (${tr.reason})`)
  if (transitions.length === 0) console.log('[summary] no transitions')
  console.log(`[summary] console errors: ${consoleErrors.length}, page errors: ${pageErrors.length}`)
  for (const e of consoleErrors.slice(0, 5)) console.log(`  console: ${e.text.slice(0, 200)}`)
  for (const e of pageErrors.slice(0, 5)) console.log(`  page:    ${e.text.slice(0, 200)}`)
  console.log(`[summary] written to ${path.relative(process.cwd(), outDir)}/summary.json`)
}

function readSample(page) {
  return page
    .evaluate(() => {
      const f = window.__face
      const e = window.__engine
      const m = window.__mouse
      const i = window.__insight
      return {
        status: f ? f.status : null,
        present: f ? f.present : null,
        presence: f ? f.presence : null,
        proximity: f ? f.proximity : null,
        calibrated: f ? f.calibrated : null,
        brow: f ? f.brow : null,
        smile: f ? f.smile : null,
        browInnerUp: f && f.raw ? f.raw.browInnerUp : null,
        yaw: f ? f.yaw : null,
        pitch: f ? f.pitch : null,
        roll: f ? f.roll : null,
        fps: f ? f.fps : null,
        mode: e ? e.mode : null,
        focusTarget: e ? e.focusTarget : null,
        progress: e ? e.progress : null,
        keyboardHold: e ? e.keyboardHold : null,
        cooldownMs: e ? e.cooldownMs : null,
        lastTransition: e ? e.lastTransition : null,
        dwellTarget: m ? m.dwellTarget : null,
        dwellMs: m ? m.dwellMs : null,
        insightSource: i ? i.source : null,
      }
    })
    .catch(() => ({ status: 'eval-error', mode: null, focusTarget: null, progress: null, lastTransition: null }))
}


function printHeader() {
  console.log(COLS.map(([name, w]) => name.padEnd(w)).join(' '))
  console.log(COLS.map(([, w]) => '-'.repeat(w)).join(' '))
}

function printRow(s) {
  const p = s.progress ?? {}
  const cells = [
    String(s.t),
    String(s.status ?? '-'),
    s.present === null || s.present === undefined ? '-' : s.present ? 'y' : 'n',
    fmt(s.presence),
    fmt(s.proximity),
    s.calibrated === null || s.calibrated === undefined ? '-' : s.calibrated ? 'y' : 'n',
    fmt(s.brow),
    fmt(s.smile),
    fmt(s.browInnerUp),
    fmt(s.yaw, 0),
    fmt(s.pitch, 0),
    fmt(s.roll, 0),
    fmt(s.fps, 0),
    String(s.mode ?? '-'),
    String(s.focusTarget ?? '-'),
    fmt(p.simplify),
    fmt(p.focus),
    fmt(p.expert),
    fmt(p.relax),
    String(s.insightSource ?? '-'),
  ]
  console.log(cells.map((c, i) => c.slice(0, COLS[i][1]).padEnd(COLS[i][1])).join(' '))
}

/** MediaPipe prints this INFO line through console.error when the blendshape graph starts; it is not an error. */
function isConsoleNoise(text) {
  return /^INFO: Created TensorFlow Lite XNNPACK delegate for CPU\./.test(text)
}
function fmt(v, digits = 2) {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '-'
}
function round(v) {
  return Math.round(v * 1000) / 1000
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
function str(v, d) {
  return typeof v === 'string' ? v : d
}
function num(v, d) {
  const n = Number(v)
  return Number.isFinite(n) && v !== undefined && v !== true ? n : d
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
