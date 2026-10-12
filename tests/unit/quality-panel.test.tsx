// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QualityPanel } from '@/features/quality/QualityPanel'
import {
  qualityCommandSchema,
  type QualityWorkspace,
} from '@/features/quality/useQualityWorkspace'
import type { ProductionWorkspace } from '@/features/production/useProductionWorkspace'
import type { MasterDataOptions } from '@/features/master-data/useMasterDataOptions'

afterEach(cleanup)
const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const companyId = id(1),
  itemId = id(2),
  otherItemId = id(3),
  lotId = id(4),
  planId = id(5)
const options: MasterDataOptions = {
  plants: [],
  warehouses: [],
  locations: [],
  items: [
    {
      id: itemId,
      sku: 'SAMPLE-INPUT',
      description: 'SAMPLE input',
      base_uom: 'pcs',
    },
    {
      id: otherItemId,
      sku: 'SAMPLE-OTHER',
      description: 'SAMPLE other item',
      base_uom: 'pcs',
    },
  ],
}
const production: ProductionWorkspace = {
  packages: [],
  demand: [],
  works: [],
  jobs: [],
  requirements: [],
  issues: [],
  outputs: [],
  workCentres: [],
}
function workspace(
  status: 'draft' | 'approved' = 'approved',
): QualityWorkspace {
  return {
    plans: [
      {
        id: planId,
        item_id: itemId,
        label: 'SAMPLE inspection',
        version: 'SAMPLE-A',
        sample_size: 2,
        status,
        characteristics: [
          {
            key: 'offset',
            label: 'SAMPLE offset',
            type: 'numeric',
            uom: 'mm',
            min: '-2.000001',
            max: '2.000001',
          },
          {
            key: 'condition',
            label: 'SAMPLE condition',
            type: 'attribute',
            expected: 'SAMPLE acceptable',
          },
        ],
      },
    ],
    inspections: [],
    ncrs: [],
    genealogy: [],
    receipts: [],
    shipments: [],
  }
}
const lots = [
  {
    id: lotId,
    item_id: itemId,
    lot_code: 'SAMPLE-LOT',
    qc_status: 'hold' as const,
    revision: 3,
  },
]
function props(data = workspace()) {
  return {
    companyId,
    data,
    production,
    options,
    lots,
    positions: [],
    permissions: ['quality.manage', 'quality.inspect', 'quality.review'],
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
function selectInspection() {
  change('Inspection lot', lotId)
  change('Approved inspection plan', planId)
}
function readings() {
  change('SAMPLE offset sample 1 (mm)', '-0.000001')
  change('SAMPLE offset sample 2 (mm)', '1.123456')
  change('SAMPLE condition sample 1', 'SAMPLE acceptable')
  change('SAMPLE condition sample 2', 'SAMPLE acceptable')
}

describe('quality operator controls', () => {
  it('requires final inspection for transformed production descendants without a direct output row', () => {
    const data = workspace()
    data.contexts = [{ lot_id: lotId, requires_final: true, sales_order_line_id: id(30) }]
    render(<QualityPanel {...props(data)} />)
    expect(within(screen.getByLabelText('Inspection lot')).queryByRole('option', { name: /SAMPLE-LOT/ })).not.toBeInTheDocument()
    change('Inspection stage', 'final')
    expect(within(screen.getByLabelText('Inspection lot')).getByRole('option', { name: /SAMPLE-LOT/ })).toBeInTheDocument()
    expect(production.outputs).toHaveLength(0)
  })

  it('requires review of each saved plan and waits for server approval confirmation', async () => {
    const data = workspace('draft')
    data.plans.push({
      ...data.plans[0]!,
      id: id(6),
      label: 'SAMPLE second plan',
    })
    let resolve: (value: string) => void = () => undefined
    const onCommand = vi.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done
        }),
    )
    render(<QualityPanel {...props(data)} onCommand={onCommand} />)
    fireEvent.click(screen.getByRole('button', { name: 'Plans' }))
    change('Draft inspection plan', planId)
    const approve = screen.getByRole('button', {
      name: 'Approve reviewed inspection plan',
    })
    expect(approve).toBeDisabled()
    fireEvent.click(
      screen.getByRole('checkbox', { name: /I reviewed the saved criteria/ }),
    )
    expect(approve).toBeEnabled()
    change('Draft inspection plan', id(6))
    expect(approve).toBeDisabled()
    expect(
      screen.getByRole('checkbox', { name: /I reviewed the saved criteria/ }),
    ).not.toBeChecked()
    fireEvent.click(
      screen.getByRole('checkbox', { name: /I reviewed the saved criteria/ }),
    )
    fireEvent.submit(approve.closest('form')!)
    expect(onCommand).toHaveBeenCalledWith({
      action: 'approve_plan',
      data: { plan_id: id(6) },
    })
    expect(
      screen.queryByText(/Inspection plan approved\./),
    ).not.toBeInTheDocument()
    await act(async () => resolve(id(99)))
    expect(screen.getByRole('status')).toHaveTextContent(
      `Inspection plan approved. Confirmation: ${id(99)}`,
    )
  })

  it('records every sample with exact signed measurement strings, units and correction lineage', async () => {
    const data = workspace()
    const previousId = id(7)
    data.inspections.push({
      id: previousId,
      plan_id: planId,
      lot_id: lotId,
      job_card_id: null,
      kind: 'incoming',
      result: 'failed',
      lot_revision: 3,
      reason: 'SAMPLE prior result',
      inspector_id: id(8),
      created_at: '2026-10-11T06:00:00Z',
      readings: [{ key: 'offset', uom: 'mm', values: ['3', '3'] }],
      supersedes_id: null,
    })
    let resolve: (value: string) => void = () => undefined
    const onCommand = vi.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done
        }),
    )
    render(<QualityPanel {...props(data)} onCommand={onCommand} />)
    selectInspection()
    change('Correction reference', previousId)
    readings()
    change(
      'Inspection correction reason',
      'SAMPLE verified replacement readings',
    )
    fireEvent.submit(
      screen
        .getByRole('button', { name: 'Record inspection readings' })
        .closest('form')!,
    )
    expect(onCommand).toHaveBeenCalledWith({
      action: 'inspect',
      data: {
        plan_id: planId,
        lot_id: lotId,
        job_card_id: null,
        kind: 'incoming',
        revision: 3,
        supersedes_id: previousId,
        reason: 'SAMPLE verified replacement readings',
        readings: [
          { key: 'offset', uom: 'mm', values: ['-0.000001', '1.123456'] },
          {
            key: 'condition',
            values: ['SAMPLE acceptable', 'SAMPLE acceptable'],
          },
        ],
      },
    })
    expect(
      screen.queryByText(/Inspection readings recorded\./),
    ).not.toBeInTheDocument()
    expect(screen.getByText('SAMPLE prior result')).toBeInTheDocument()
    await act(async () => resolve(id(99)))
    expect(screen.getByRole('status')).toHaveTextContent(
      `Confirmation: ${id(99)}`,
    )
    // A command receipt does not fabricate a passed result or overwrite the old failed record.
    expect(screen.queryByText(/✓ Passed/)).not.toBeInTheDocument()
    expect(screen.getByText('SAMPLE prior result')).toBeInTheDocument()
  })

  it.each(['', '1e3', '1.0000001'])(
    'blocks missing or invalid numeric samples before submission: %j',
    (value) => {
      const ownProps = props()
      render(<QualityPanel {...ownProps} />)
      selectInspection()
      readings()
      change('SAMPLE offset sample 2 (mm)', value)
      change('Inspection evidence and reason', 'SAMPLE inspection')
      fireEvent.submit(
        screen
          .getByRole('button', { name: 'Record inspection readings' })
          .closest('form')!,
      )
      expect(ownProps.onCommand).not.toHaveBeenCalled()
      expect(screen.getByRole('alert')).toHaveTextContent(
        'requires exact decimal measurements',
      )
    },
  )

  it('offers only approved plans matching the target item and disables inspection offline', () => {
    const data = workspace()
    data.plans.push({
      ...data.plans[0]!,
      id: id(10),
      item_id: otherItemId,
      label: 'SAMPLE wrong item',
    })
    data.plans.push({
      ...data.plans[0]!,
      id: id(11),
      status: 'draft',
      label: 'SAMPLE unapproved',
    })
    const ownProps = props(data)
    const { rerender } = render(<QualityPanel {...ownProps} />)
    selectInspection()
    const selector = within(
      screen.getByLabelText('Approved inspection plan', { exact: true }),
    )
    expect(
      selector.queryByRole('option', { name: /SAMPLE wrong item/ }),
    ).not.toBeInTheDocument()
    expect(
      selector.queryByRole('option', { name: /SAMPLE unapproved/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Record inspection readings' }),
    ).toBeEnabled()
    rerender(<QualityPanel {...ownProps} online={false} />)
    const save = screen.getByRole('button', {
      name: 'Record inspection readings',
    })
    expect(save).toBeDisabled()
    fireEvent.submit(save.closest('form')!)
    expect(ownProps.onCommand).not.toHaveBeenCalled()
    rerender(<QualityPanel {...ownProps} permissions={['quality.read']} />)
    expect(
      screen.queryByRole('button', { name: 'Record inspection readings' }),
    ).not.toBeInTheDocument()
  })
})

describe('quality command ingress', () => {
  it('rejects ambiguous inspection targets, duplicate keys and invalid sampling configuration', () => {
    const inspect = {
      action: 'inspect',
      data: {
        plan_id: planId,
        lot_id: lotId,
        job_card_id: id(20),
        kind: 'incoming',
        revision: 3,
        reason: 'SAMPLE reason',
        supersedes_id: null,
        readings: [{ key: 'offset', uom: 'mm', values: ['0'] }],
      },
    }
    expect(qualityCommandSchema.safeParse(inspect).success).toBe(false)
    expect(
      qualityCommandSchema.safeParse({
        ...inspect,
        data: { ...inspect.data, lot_id: null, job_card_id: null },
      }).success,
    ).toBe(false)
    const plan = workspace().plans[0]!
    const draft = {
      action: 'create_plan',
      data: {
        item_id: itemId,
        label: plan.label,
        version: plan.version,
        sample_size: 2,
        characteristics: plan.characteristics,
      },
    }
    expect(
      qualityCommandSchema.safeParse({
        ...draft,
        data: { ...draft.data, sample_size: 0 },
      }).success,
    ).toBe(false)
    expect(
      qualityCommandSchema.safeParse({
        ...draft,
        data: { ...draft.data, sample_size: 101 },
      }).success,
    ).toBe(false)
    expect(
      qualityCommandSchema.safeParse({
        ...draft,
        data: {
          ...draft.data,
          characteristics: [plan.characteristics[0], plan.characteristics[0]],
        },
      }).success,
    ).toBe(false)
  })
})
