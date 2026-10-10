// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
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
        searchPanel={null}
        canBootstrap={false}
      />
    )

    expect(screen.getByText('2')).toBeVisible()
    expect(screen.getByText('5')).toBeVisible()
    expect(screen.queryByText('Not connected in this MVP')).not.toBeInTheDocument()
  })

  it('focuses and clears global search through documented keyboard shortcuts', () => {
    const onClearSearch = vi.fn()
    render(<OperationsWorkspace email="operator@example.test" onSignOut={vi.fn(async () => undefined)} summary={undefined} summaryError={false} companies={[]} companyId={null} onCompanyChange={vi.fn()} salesPanel={null} setupPanel={null} masterDataPanel={null} stockPanel={null} dispatchPanel={null} commandCenterPanel={null} searchPanel={<><input aria-label="Search records" id="global-search-input" /><input aria-label="Other field" /></>} canBootstrap={false} onClearSearch={onClearSearch} />)

    const input = screen.getByRole('textbox', { name: 'Search records' })
    const otherField = screen.getByRole('textbox', { name: 'Other field' })
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(input).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClearSearch).toHaveBeenCalledTimes(1)
    otherField.focus()
    fireEvent.keyDown(otherField, { key: '/' })
    expect(otherField).toHaveFocus()
    fireEvent.keyDown(window, { key: '/' })
    expect(input).toHaveFocus()
  })

  it('makes operational command controls read-only while offline', () => {
    const view = render(<OperationsWorkspace email="operator@example.test" onSignOut={vi.fn(async () => undefined)} summary={undefined} summaryError={false} companies={[]} companyId={null} onCompanyChange={vi.fn()} salesPanel={<button type="button">Create RFQ</button>} setupPanel={null} masterDataPanel={null} stockPanel={null} dispatchPanel={null} commandCenterPanel={null} searchPanel={null} canBootstrap={false} online={false} />)
    const scoped = within(view.container)

    expect(scoped.getByRole('alert')).toHaveTextContent('Blocked because this device is offline.')
    fireEvent.click(scoped.getByRole('button', { name: 'Sales orders' }))
    expect(scoped.getByRole('button', { name: 'Create RFQ' })).toBeDisabled()
  })
})
