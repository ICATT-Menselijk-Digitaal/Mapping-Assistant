// Runs a TypeScript script that imports app code (with the `@/` alias)
// through Vite's module runner, so scripts need no extra dependency.
// The app's Vue and devtools plugins are deliberately left out: scripts only
// import plain TypeScript modules, and the devtools plugin breaks the runner.
//
// Usage (from frontend/): node scripts/perf/run.mjs <script.ts> [...args]
import { fileURLToPath } from 'node:url'
import { runnerImport } from 'vite'

const [script, ...args] = process.argv.slice(2)
if (!script) {
  console.error('Usage: node scripts/perf/run.mjs <script.ts> [...args]')
  process.exit(1)
}

const { module } = await runnerImport(script, {
  configFile: false,
  logLevel: 'warn',
  resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
})
await module.default(args)
