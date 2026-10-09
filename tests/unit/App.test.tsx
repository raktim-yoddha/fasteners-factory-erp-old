// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from '@/app/App'

vi.mock('virtual:pwa-register', () => ({ registerSW: vi.fn(() => vi.fn()) }))

describe('App', () => {
  it('renders the signed-out installable shell', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Fasteners Factory ERP' })).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Online')
    expect(screen.getByRole('heading', { name: 'Install this workspace' })).toBeVisible()
  })
})
