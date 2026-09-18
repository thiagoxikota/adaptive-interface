// Viewport-only screenshots (1440x900) of a key-driven transition, with
// mid-transition frames, so the morph itself can be judged, not just the end.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const url = process.argv[2] ?? 'http://localhost:5173/'
const key = process.argv[3] ?? '2'
const out = process.argv[4] ?? `tests/out/viewport-${key}`
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.screenshot({ path: `${out}/00-before.png` })
await page.keyboard.press(key)
for (const t of [120, 300, 600, 1200]) {
  await page.waitForTimeout(t - (t === 120 ? 0 : [120, 300, 600, 1200][[120, 300, 600, 1200].indexOf(t) - 1]))
  await page.screenshot({ path: `${out}/t${String(t).padStart(4, '0')}.png` })
}
const mode = await page.evaluate(() => window.__engine?.mode)
console.log(JSON.stringify({ key, mode, errors }))
await browser.close()
