import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { databaseRegressions } from './database-regressions.mjs'

if (existsSync('.env.e2e.local')) process.loadEnvFile('.env.e2e.local')
if (process.env.E2E_ALLOW_SAMPLE_WRITES !== '1')
  throw new Error(
    'Database tests require E2E_ALLOW_SAMPLE_WRITES=1 for an isolated test environment.',
  )
const project = process.env.E2E_DATABASE_PROJECT_REF
if (project && !/^[a-z]{20}$/.test(project))
  throw new Error('Invalid E2E_DATABASE_PROJECT_REF.')
const target = project ? ['--linked', '--project-ref', project] : ['--local']
const localProject = readFileSync('supabase/config.toml', 'utf8').match(
  /^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m,
)?.[1]
if (!project && !localProject)
  throw new Error('Local Supabase project id is unavailable.')
for (const file of databaseRegressions) {
  // psql executes transaction scripts; CLI local query uses a single prepared statement.
  const result = project
    ? spawnSync(
        process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
        ['exec', 'supabase', 'db', 'query', ...target, '--file', file],
        { encoding: 'utf8', shell: process.platform === 'win32' },
      )
    : spawnSync(
        'docker',
        [
          'exec',
          '-i',
          `supabase_db_${localProject}`,
          'psql',
          '-U',
          'postgres',
          '-d',
          'postgres',
          '--no-psqlrc',
          '-v',
          'ON_ERROR_STOP=1',
        ],
        { input: readFileSync(file, 'utf8'), encoding: 'utf8' },
      )
  if (
    result.error ||
    result.status !== 0 ||
    /"_tag"\s*:\s*"Error"/.test(result.stdout ?? '')
  ) {
    console.error(
      `${file}: FAIL\n${result.error?.message ?? result.stderr ?? ''}\n${result.stdout ?? ''}`,
    )
    process.exit(1)
  }
  console.log(`${file}: PASS (transaction rolled back)`)
}
