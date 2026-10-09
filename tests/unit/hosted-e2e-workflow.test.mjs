import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(new URL('../../.github/workflows/hosted-e2e.yml', import.meta.url), 'utf8')

describe('hosted E2E workflow', () => {
  it('is manual and requires isolated runner secrets without placing them in Pages', () => {
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain('pnpm e2e')
    for (const secret of ['E2E_BASE_URL', 'E2E_SUPABASE_URL', 'E2E_SUPABASE_SERVICE_ROLE_KEY', 'E2E_TEST_EMAIL']) {
      expect(workflow).toContain(`secrets.${secret}`)
      expect(workflow).toContain(secret)
    }
    expect(workflow).toContain('$name must be configured as a repository secret')
    expect(workflow).not.toContain('VITE_SUPABASE_SERVICE_ROLE_KEY')
  })
})
