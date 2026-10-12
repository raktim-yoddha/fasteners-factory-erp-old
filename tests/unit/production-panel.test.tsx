// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProductionPanel } from '@/features/production/ProductionPanel'
import type { ProductionWorkspace } from '@/features/production/useProductionWorkspace'
import type { MasterDataOptions } from '@/features/master-data/useMasterDataOptions'

afterEach(cleanup)
const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const companyId = id(1),
  outputId = id(2),
  inputId = id(3),
  workId = id(4),
  jobId = id(5),
  lotId = id(6),
  packageId = id(7)
const options: MasterDataOptions = {
  plants: [],
  warehouses: [],
  locations: [],
  items: [
    {
      id: outputId,
      sku: 'SAMPLE-OUTPUT',
      description: 'SAMPLE output',
      base_uom: 'pcs',
    },
    {
      id: inputId,
      sku: 'SAMPLE-INPUT',
      description: 'SAMPLE input',
      base_uom: 'pcs',
    },
  ],
}
function workspace(): ProductionWorkspace {
  return {
    packages: [
      {
        id: packageId,
        item_id: outputId,
        label: 'SAMPLE engineering A',
        bom_revision_id: id(8),
        routing_revision_id: id(9),
        status: 'draft',
        basis_quantity: '10.000000',
        uom: 'pcs',
        components: [
          {
            item_id: inputId,
            quantity: '10.000001',
            uom: 'pcs',
            scrap_allowance_pct: '0',
          },
        ],
        operations: [
          { sequence: 1, work_centre_id: id(10), name: 'SAMPLE operation' },
        ],
      },
    ],
    demand: [],
    works: [
      {
        id: workId,
        number: 'SAMPLE-WO',
        sales_order_line_id: id(11),
        source_ncr_id: null,
        approved_rework_lot_id: null,
        item_id: outputId,
        quantity: '10.000000',
        uom: 'pcs',
        status: 'in_progress',
        revision: 2,
        start_date: '2026-10-11',
        due_date: '2026-10-12',
        bom_revision_id: id(8),
        routing_revision_id: id(9),
        drawing_revision_id: null,
      },
    ],
    jobs: [
      {
        id: jobId,
        work_order_id: workId,
        sequence: 1,
        name: 'SAMPLE operation',
        work_centre_id: id(10),
        planned_quantity: '10.000000',
        good_quantity: '0.000000',
        scrap_quantity: '0.000000',
        uom: 'pcs',
        status: 'in_progress',
        revision: 2,
      },
    ],
    requirements: [
      {
        work_order_id: workId,
        item_id: inputId,
        required_quantity: '10.000001',
        uom: 'pcs',
        consumed_quantity: '0.000000',
        wip_quantity: '0.000000',
        available_quantity: '10.000001',
        expected_receipts: '0.000000',
      },
    ],
    issues: [],
    outputs: [],
    workCentres: [{ id: id(10), code: 'SAMPLE-CENTRE', name: 'SAMPLE centre' }],
  }
}
const lots = [
  {
    id: lotId,
    item_id: inputId,
    lot_code: 'SAMPLE-HELD',
    qc_status: 'hold' as const,
    revision: 3,
  },
]
function props(data = workspace()) {
  return {
    companyId,
    data,
    options,
    lots,
    positions: [],
    permissions: [
      'master_data.manage',
      'planning.manage',
      'production.execute',
      'stock.issue',
    ],
    online: true,
    busy: false,
    loading: false,
    error: false,
    onCommand: vi.fn(async () => id(99)),
  }
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: true }), {
    target: { value },
  })
}

describe('production operator controls', () => {
  it('requires review of persisted engineering and resets review when the selected package changes', async () => {
    const data = workspace()
    data.packages.push({
      ...data.packages[0]!,
      id: id(12),
      label: 'SAMPLE engineering B',
    })
    let resolve: (value: string) => void = () => undefined
    const onCommand = vi.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done
        }),
    )
    render(<ProductionPanel {...props(data)} onCommand={onCommand} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Engineering' }),
    )
    change('Review engineering package', packageId)
    const approve = screen.getByRole('button', {
      name: 'Approve engineering package',
    })
    expect(approve).toBeDisabled()
    expect(
      screen.getByRole('table', {
        name: 'Component quantities per saved output basis',
      }),
    ).toHaveTextContent('10.000001 pcs')
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /I reviewed the saved output basis/,
      }),
    )
    expect(approve).toBeEnabled()
    change('Review engineering package', id(12))
    expect(approve).toBeDisabled()
    expect(
      screen.getByRole('checkbox', {
        name: /I reviewed the saved output basis/,
      }),
    ).not.toBeChecked()
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /I reviewed the saved output basis/,
      }),
    )
    fireEvent.click(approve)
    expect(onCommand).toHaveBeenCalledWith({
      action: 'approve_package',
      data: { package_id: id(12) },
    })
    expect(
      screen.queryByText(/Engineering approval confirmed/),
    ).not.toBeInTheDocument()
    await act(async () => resolve(id(99)))
    expect(screen.getByRole('status')).toHaveTextContent(
      `Engineering approval confirmed. Reference: ${id(99)}`,
    )
  })

  it.each([
    { online: false, permissions: ['master_data.manage'] },
    { online: true, permissions: ['production.read'] },
  ])('cannot approve engineering without online permission: %j', (access) => {
    const ownProps = props()
    render(<ProductionPanel {...ownProps} {...access} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Engineering' }),
    )
    change('Review engineering package', packageId)
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /I reviewed the saved output basis/,
      }),
    )
    const approve = screen.getByRole('button', {
      name: 'Approve engineering package',
    })
    expect(approve).toBeDisabled()
    fireEvent.click(approve)
    expect(ownProps.onCommand).not.toHaveBeenCalled()
  })

  it('submits partial good quantity with explicit zero scrap and keeps the job open until server data says completed', async () => {
    const ownProps = props()
    const { rerender } = render(<ProductionPanel {...ownProps} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Shop floor' }),
    )
    change('Production work order', workId)
    change('Shop-floor job card', jobId)
    change('Job good quantity', '4.000001')
    change('Job completion reason', 'SAMPLE partial production')
    const complete = screen.getByRole('button', {
      name: 'Record job completion',
    })
    fireEvent.submit(complete.closest('form')!)
    expect(ownProps.onCommand).toHaveBeenCalledWith({
      action: 'complete_job',
      data: {
        job_card_id: jobId,
        revision: 2,
        good_quantity: '4.000001',
        scrap_quantity: '0',
        reason: 'SAMPLE partial production',
      },
    })
    await act(async () => undefined)
    const partial = workspace()
    partial.jobs[0] = {
      ...partial.jobs[0]!,
      good_quantity: '4.000001',
      status: 'in_progress',
      revision: 3,
    }
    rerender(<ProductionPanel {...ownProps} data={partial} />)
    expect(complete).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Start job' })).toBeDisabled()
    expect(
      screen.getByRole('table', {
        name: 'Job cards for the selected work order',
      }),
    ).toHaveTextContent('4.000001 pcs')
    const finished = workspace()
    finished.jobs[0] = {
      ...finished.jobs[0]!,
      good_quantity: '10.000000',
      status: 'completed',
      revision: 4,
    }
    rerender(<ProductionPanel {...ownProps} data={finished} />)
    expect(complete).toBeDisabled()
  })

  it('blocks held material for normal production and authorizes only the exact held NCR rework source', () => {
    const ownProps = props()
    const { rerender } = render(<ProductionPanel {...ownProps} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Materials' }),
    )
    change('Production work order', workId)
    change('Material job card', jobId)
    change('Material stock lot', lotId)
    change('Material issue quantity', '1.000001')
    const issue = screen.getByRole('button', { name: 'Issue material to job' })
    expect(issue).toBeDisabled()
    fireEvent.submit(issue.closest('form')!)
    expect(ownProps.onCommand).not.toHaveBeenCalled()
    const rework = workspace()
    rework.works[0] = {
      ...rework.works[0]!,
      item_id: inputId,
      source_ncr_id: id(20),
      approved_rework_lot_id: id(21),
    }
    rerender(<ProductionPanel {...ownProps} data={rework} />)
    expect(issue).toBeDisabled()
    rework.works[0] = { ...rework.works[0]!, approved_rework_lot_id: lotId }
    rerender(<ProductionPanel {...ownProps} data={rework} />)
    expect(issue).toBeEnabled()
    fireEvent.submit(issue.closest('form')!)
    expect(ownProps.onCommand).toHaveBeenCalledWith({
      action: 'issue_material',
      data: {
        work_order_id: workId,
        job_card_id: jobId,
        lot_id: lotId,
        quantity: '1.000001',
        uom: 'pcs',
        lot_revision: 3,
      },
    })
    rerender(
      <ProductionPanel
        {...ownProps}
        data={rework}
        lots={[{ ...lots[0]!, qc_status: 'rejected' }]}
      />,
    )
    expect(issue).toBeDisabled()
  })
})
