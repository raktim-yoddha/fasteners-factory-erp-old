// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from '@/app/App'

vi.mock('virtual:pwa-register', () => ({ registerSW: vi.fn(() => vi.fn()) }))
vi.mock('@/lib/supabase', () => ({ isSupabaseConfigured: false, supabase: null }))

describe('App', () => {
  it('does not expose an operational workspace before backend setup', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: /fasteners factory erp/i })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Choose your workspace.' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Use solo on this device' })).toBeEnabled()
  })
})
