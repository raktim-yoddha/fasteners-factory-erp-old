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
        companies={[{ id: '00000000-0000-4000-8000-000000000001', name: 'Example Factory' }]}
        companyId="00000000-0000-4000-8000-000000000001"
        onCompanyChange={vi.fn()}
        salesPanel={null}
        setupPanel={null}
        masterDataPanel={null}
        stockPanel={null}
        dispatchPanel={null}
        commandCenterPanel={null}
        canBootstrap={false}
      />
    )

    expect(screen.getByText('2')).toBeVisible()
    expect(screen.getByText('5')).toBeVisible()
    expect(screen.queryByText('Not connected in this MVP')).not.toBeInTheDocument()
  })
})
