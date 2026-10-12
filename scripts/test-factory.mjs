// ADR 0017: repeatable local validation; no hosted writes or database resets.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'

import { dirname, join } from 'node:path'

const corepack = join(dirname(process.execPath), 'node_modules', 'corepack', 'dist', 'pnpm.js')
const packageScript = process.env.npm_execpath?.endsWith('.js') ? process.env.npm_execpath : existsSync(corepack) ? corepack : null
const runner = packageScript ? process.execPath : process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const original = existsSync('.env.e2e.local') ? readFileSync('.env.e2e.local') : null
const started = performance.now()
function run(args, capture = false) {
  const result = spawnSync(runner, packageScript ? [packageScript, ...args] : args, {
    shell: !packageScript && process.platform === 'win32',
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    env: { ...process.env, E2E_DATABASE_PROJECT_REF: '' },
  })
  if (result.error || result.status !== 0 || /"_tag"\s*:\s*"Error"/.test(result.stdout ?? '')) {
    // Captured Supabase output may include local credentials; never echo it.
    throw new Error(`${args.join(' ')} failed (${result.status ?? 'spawn error'}).${capture ? ' Check Docker availability and local Supabase health.' : ''}`)
  }
  return result.stdout
}
try {
  console.log('Starting local SAMPLE factory validation…')
  run(['e2e:stack'], true)
  run(['exec', 'supabase', 'db', 'push', '--local'], true)
  writeFileSync('.env.supabase.local', run(['exec', 'supabase', 'status', '-o', 'env'], true), { mode: 0o600 })
  run(['e2e:seed'])
  run(['typecheck'])
  run(['lint'])
  run(['test'])
  run(['test:db'])
  run(['check:operations', '--local'])
  run(['e2e'])
  run(['test:restore'])
  console.log(`Factory validation PASS (${((performance.now() - started) / 1000).toFixed(1)}s). Browser diagnostics: playwright-report/, test-results/.`)
} catch (error) {
  console.error(`Factory validation FAIL: ${error.message}`)
  process.exitCode = 1
} finally {
  if (original) writeFileSync('.env.e2e.local', original, { mode: 0o600 })
  else if (existsSync('.env.e2e.local')) unlinkSync('.env.e2e.local')
}
