// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OperationsWorkspace } from '@/app/OperationsWorkspace'

describe('OperationsWorkspace', () => {
  it('renders only supplied live summary counts', () => {
    render(
      <OperationsWorkspace
        email="operator@example.test"
        onSignOut={vi.fn(async () => undefined)}
        summary={{ rfqs: 2, salesOrders: 3, availableLots: 4, shipments: 5 }}
        summaryError={false}
      />
    )

    expect(screen.getByText('2')).toBeVisible()
    expect(screen.getByText('5')).toBeVisible()
    expect(screen.getAllByText('Not connected in this MVP')).toHaveLength(2)
  })
})
