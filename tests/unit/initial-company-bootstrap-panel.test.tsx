// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { InitialCompanyBootstrapPanel } from '@/features/company/InitialCompanyBootstrapPanel'

describe('InitialCompanyBootstrapPanel', () => {
  it('submits the first company and plant names', () => {
    const onBootstrap = vi.fn()
    render(<InitialCompanyBootstrapPanel bootstrapping={false} error={null} onBootstrap={onBootstrap} />)

    fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'Example Factory' } })
    fireEvent.change(screen.getByLabelText('First plant name'), { target: { value: 'Main Plant' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create company and plant' }).closest('form')!)

    expect(onBootstrap).toHaveBeenCalledWith({ companyName: 'Example Factory', plantName: 'Main Plant' })
  })
})
