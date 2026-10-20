// Measures field hover responsiveness (Feature #195) in a real Chromium.
// Builds and serves the app, imports a coupling set from test-data/perf/,
// opens every group, moves the mouse over a fixed set of field rows and reads
// Chrome's Event Timing entries: the time from a hover event until the next
// frame is painted. Not part of CI; results go into the PR description.
//
// Usage (from frontend/): npm run perf:hover [-- <dataset.json> ...]
import { resolve } from 'node:path'
import { build, preview } from 'vite'
import { chromium } from '@playwright/test'

const DEFAULT_DATASETS = ['generated.koppelingsset.json', 'det-openzaak.koppelingsset.json']
const OUT_DIR = 'node_modules/.cache/perf-dist'
const SCROLL_STOPS = [0, 1 / 3, 2 / 3]
const ROWS_PER_STOP = 20
const BUDGET_MS = 100
// 1 = this machine as-is; 4 = DevTools' "4× slowdown", a stand-in for a
// typical office laptop. Override with PERF_CPU_THROTTLE=1,4,6 etc.
const CPU_THROTTLES = (process.env.PERF_CPU_THROTTLE ?? '1,4').split(',').map(Number)
const HOVER_EVENTS = new Set([
  'pointerover',
  'pointerenter',
  'pointerout',
  'pointerleave',
  'mouseover',
  'mouseenter',
  'mouseout',
  'mouseleave',
])

// Runs in the page before any app code.
function initPage() {
  // Skip the API key dialog — AI features are not used here.
  localStorage.setItem('ma_openrouter_api_key', 'perf-measurement')
  window.__eventTimings = []
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      window.__eventTimings.push({ name: e.name, startTime: e.startTime, duration: e.duration })
    }
  }).observe({ type: 'event', durationThreshold: 16 })
}

// Answers the remote-storage backend in memory, so measuring never depends on
// (or writes to) the external server. A no-op once persistence is local-only.
async function stubRemoteStorage(page) {
  const store = new Map()
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET, PUT, DELETE, OPTIONS',
  }
  await page.route('**/entities/**', (route) => {
    const req = route.request()
    const key = new URL(req.url()).pathname
    if (req.method() === 'PUT') store.set(key, req.postData() ?? '')
    if (req.method() === 'DELETE') store.delete(key)
    if (req.method() !== 'GET') return route.fulfill({ status: 200, headers: cors, body: '' })
    if (!store.has(key)) return route.fulfill({ status: 404, headers: cors, body: '' })
    return route.fulfill({ status: 200, headers: cors, body: store.get(key) })
  })
  await page.route('**/openrouter.ai/**', (route) => route.abort())
}

function nextPaint(page) {
  return page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  )
}

async function expandAll(page) {
  for (let pass = 0; pass < 10; pass++) {
    const clicked = await page.evaluate(() => {
      const toggles = document.querySelectorAll(
        '[data-testid^="schema-group-toggle-"], [data-testid^="field-toggle-"]',
      )
      let n = 0
      for (const t of toggles) {
        if (t.textContent.includes('▸')) {
          t.click()
          n++
        }
      }
      return n
    })
    if (clicked === 0) return
    await nextPaint(page)
  }
}

async function visibleRowCenters(page, side, stop) {
  return page.evaluate(
    ({ side, stop, max }) => {
      const containers = document.querySelectorAll('[data-scroll-container]')
      const container = containers[side === 'source' ? 0 : 1]
      container.scrollTop = (container.scrollHeight - container.clientHeight) * stop
      const box = container.getBoundingClientRect()
      return [...container.querySelectorAll(`[data-field-side="${side}"]`)]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.height > 0 && r.top >= box.top + 60 && r.bottom <= box.bottom)
        .slice(0, max)
        .map((r) => ({ x: r.left + r.width / 3, y: r.top + r.height / 2 }))
    },
    { side, stop, max: ROWS_PER_STOP },
  )
}

async function hoverRows(page) {
  const starts = []
  const labels = []
  for (const side of ['source', 'target']) {
    for (const stop of SCROLL_STOPS) {
      // Park the pointer outside the panels before scrolling: content sliding
      // under a still pointer fires hover events whose frame also carries the
      // scroll's line recalculation — that is scroll cost, not hover cost.
      await page.mouse.move(0, 0)
      await nextPaint(page)
      const rows = await visibleRowCenters(page, side, stop)
      await nextPaint(page)
      for (const [i, { x, y }] of rows.entries()) {
        starts.push(await page.evaluate(() => performance.now()))
        labels.push(`${side} @${Math.round(stop * 100)}% row ${i}`)
        await page.mouse.move(x, y)
        await nextPaint(page)
      }
    }
  }
  return { starts, labels }
}

/** Worst hover-event duration per mouse move; 0 means under 16 ms (not reported). */
function perHoverDurations(starts, timings) {
  return starts.map((start, i) => {
    const end = starts[i + 1] ?? Infinity
    const durations = timings
      .filter((t) => HOVER_EVENTS.has(t.name) && t.startTime >= start && t.startTime < end)
      .map((t) => t.duration)
    return Math.max(0, ...durations)
  })
}

function summarize(dataset, cpu, durations) {
  const sorted = [...durations].sort((a, b) => a - b)
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
  const fmt = (ms) => (ms < 16 ? '<16' : String(Math.round(ms)))
  return {
    dataset,
    cpu,
    hovers: durations.length,
    median: fmt(pct(0.5)),
    p95: fmt(pct(0.95)),
    max: fmt(sorted.at(-1) ?? 0),
    overBudget: durations.filter((d) => d > BUDGET_MS).length,
  }
}

async function measure(browser, url, dataset, cpu) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
  await stubRemoteStorage(page)
  await page.addInitScript(initPage)
  await page.goto(url)
  await page.setInputFiles('[data-testid="import-file-input"]', resolve('test-data/perf', dataset))
  await page.waitForSelector('[data-field-side="target"]', { state: 'attached' })
  await expandAll(page)
  await page.waitForTimeout(500)

  const { starts, labels } = await hoverRows(page)
  await page.waitForTimeout(500)
  const timings = await page.evaluate(() => window.__eventTimings)
  await page.close()
  const durations = perHoverDurations(starts, timings)
  // PERF_DEBUG=1 lists which hovers went over budget, to find patterns.
  if (process.env.PERF_DEBUG) {
    durations.forEach((d, i) => {
      if (d > BUDGET_MS) console.log(`  ${dataset} ${cpu}×: ${labels[i]}: ${Math.round(d)} ms`)
    })
  }
  return summarize(dataset, cpu, durations)
}

const datasets = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_DATASETS
await build({ configFile: 'vite.config.ts', logLevel: 'warn', build: { outDir: OUT_DIR } })
const server = await preview({
  configFile: 'vite.config.ts',
  logLevel: 'warn',
  build: { outDir: OUT_DIR },
  preview: { port: 4179, strictPort: false },
})
const url = server.resolvedUrls.local[0]
// The locally installed Google Chrome (headless) by default — the browser
// people actually use. Override with PERF_BROWSER_CHANNEL, e.g. `msedge` or
// `chromium` (Playwright's own build, after `npx playwright install chromium`).
const browser = await chromium.launch({ channel: process.env.PERF_BROWSER_CHANNEL ?? 'chrome' })
try {
  const results = []
  for (const dataset of datasets) {
    for (const cpu of CPU_THROTTLES) results.push(await measure(browser, url, dataset, cpu))
  }
  console.log('\n| Dataset | CPU | Hovers | Median (ms) | p95 (ms) | Max (ms) | Over 100 ms |')
  console.log('|---|---|---|---|---|---|---|')
  for (const r of results) {
    const row = [r.dataset, `${r.cpu}×`, r.hovers, r.median, r.p95, r.max, r.overBudget]
    console.log(`| ${row.join(' | ')} |`)
  }
} finally {
  await browser.close()
  await server.close()
}
