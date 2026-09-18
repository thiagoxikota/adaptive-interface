#!/usr/bin/env node
/**
 * Keyboard-only run: no fake camera, camera permission NOT granted (prompts are
 * auto-dismissed, so the app must fall into its no-camera path). Presses
 * 1, 2, 3, 4, checks window.__engine.mode after each, screenshots every mode
 * and the D debug overlay into tests/out/keyboard/. Exit code 0 unless the
 * browser fails to launch; the log and summary.json are the verdict.
 *
 *   node scripts/keyboard-run.mjs [--url http://localhost:5173/] [--wait 1400] [--channel chromium|shell] [--headed]
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const args = parseArgs(process.argv.slice(2))
const opts = {
  url: str(args.url, 'http://localhost:5173/'),
  wait: num(args.wait, 1400),
  channel: str(args.channel, 'chromium'),
  headed: Boolean(args.headed),
}
const EXPECTED = { 1: 'NORMAL', 2: 'SIMPLIFY', 3: 'FOCUS', 4: 'EXPERT' }
const outDir = path.resolve('tests/out/keyboard')
mkdirSync(outDir, { recursive: true })

let browser
try {
  browser = await chromium.launch({
    headless: !opts.headed,
    channel: opts.channel === 'shell' ? undefined : 'chromium',
  })
} catch (err) {
  console.error(`browser failed to launch: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}

const consoleErrors = []
const pageErrors = []
const results = []
const started = Date.now()
const now = () => Date.now() - started

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push({ t: now(), text: msg.text() })
  })
  page.on('pageerror', (err) => pageErrors.push({ t: now(), text: err instanceof Error ? err.message : String(err) }))

  console.log(`[keyboard] url=${opts.url} channel=${opts.channel} camera=denied`)
  await page.goto(opts.url, { waitUntil: 'load', timeout: 30000 })

  const waitStart = now()
  let engineReady = false
  while (now() - waitStart < 10000) {
    engineReady = await page.evaluate(() => Boolean(window.__engine)).catch(() => false)
    if (engineReady) break
    await sleep(200)
  }
  const cameraStatus = await page.evaluate(() => (window.__face ? window.__face.status : 'undefined')).catch(() => 'eval-error')
  console.log(`[keyboard] engine global ${engineReady ? 'ready' : 'MISSING after 10 s'}; camera status: ${cameraStatus}`)
  if (cameraStatus === 'running') console.log('[keyboard] WARNING: camera reports running although permission was not granted')

  for (const key of ['1', '2', '3', '4']) {
    const expected = EXPECTED[key]
    await page.keyboard.press(key)
    await sleep(opts.wait)
    const state = await readEngine(page)
    const pass = state.mode === expected
    const file = path.join(outDir, `${expected}.png`)
    await page.screenshot({ path: file, fullPage: true })
    results.push({ key, expected, mode: state.mode, source: state.source, keyboardHold: state.keyboardHold, pass, screenshot: path.relative(process.cwd(), file) })
    console.log(`[keyboard] ${pass ? 'PASS' : 'FAIL'} key ${key}: expected ${expected}, got ${state.mode ?? 'null'} (source ${state.source ?? '-'}, hold ${state.keyboardHold ?? '-'}) -> ${path.relative(process.cwd(), file)}`)
  }

  await page.keyboard.press('d')
  await sleep(Math.min(opts.wait, 800))
  const debugFile = path.join(outDir, 'debug.png')
  await page.screenshot({ path: debugFile, fullPage: true })
  const afterDebug = await readEngine(page)
  const debugPass = afterDebug.mode === 'EXPERT'
  results.push({ key: 'd', expected: 'EXPERT (mode unchanged, overlay visible)', mode: afterDebug.mode, pass: debugPass, screenshot: path.relative(process.cwd(), debugFile) })
  console.log(`[keyboard] ${debugPass ? 'PASS' : 'FAIL'} key d: mode still ${afterDebug.mode ?? 'null'} -> ${path.relative(process.cwd(), debugFile)} (check the overlay in the screenshot)`)

  const passed = results.filter((r) => r.pass).length
  console.log(`[keyboard] ${passed}/${results.length} checks passed; console errors: ${consoleErrors.length}, page errors: ${pageErrors.length}`)
  for (const e of consoleErrors.slice(0, 5)) console.log(`  console: ${e.text.slice(0, 200)}`)
  for (const e of pageErrors.slice(0, 5)) console.log(`  page:    ${e.text.slice(0, 200)}`)
  writeFileSync(
    path.join(outDir, 'summary.json'),
    JSON.stringify({ url: opts.url, engineReady, cameraStatus, results, passed, total: results.length, consoleErrors, pageErrors }, null, 2),
  )
  console.log(`[keyboard] written to ${path.relative(process.cwd(), outDir)}/summary.json`)
} catch (err) {
  console.error(`[keyboard] failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`)
} finally {
  await browser.close().catch(() => {})
}
process.exit(0)

function readEngine(page) {
  return page
    .evaluate(() => {
      const e = window.__engine
      return e ? { mode: e.mode, source: e.source, keyboardHold: e.keyboardHold } : { mode: null, source: null, keyboardHold: null }
    })
    .catch(() => ({ mode: null, source: null, keyboardHold: null }))
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
