// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { LotTransformPanel } from '@/features/stock/LotTransformPanel'
import { useLotTransformation } from '@/features/stock/useLotTransformations'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const lot = { id: id(1), item_id: id(2), lot_code: 'SAMPLE-PARENT', qc_status: 'released' as const, revision: 2 }
const input = {
  kind: 'split' as const, sources: [{ lot_id: lot.id, revision: 2, quantity: '1' }],
  location_id: id(3), lot_code: 'SAMPLE-CHILD', uom: 'pcs' as const, reason: 'SAMPLE separation',
}
const props = {
  companyId: id(4), lots: [lot], positions: [],
  options: { plants: [], warehouses: [], locations: [], items: [{ id: id(2), sku: 'SAMPLE-ITEM', description: 'SAMPLE item', base_uom: 'pcs' as const }] },
  permissions: ['stock.transform'], online: true, busy: false, loading: false, error: false,
  onTransform: vi.fn(),
}

it('blocks stale staged sources and lets an operator remove and select the current revision', () => {
  const { rerender } = render(<LotTransformPanel {...props} />)
  fireEvent.change(screen.getByLabelText('Transformation source lot'), { target: { value: lot.id } })
  fireEvent.change(screen.getByLabelText('Transformation source quantity'), { target: { value: '1' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Add source lot' }).closest('form')!)
  expect(screen.getByRole('button', { name: 'Confirm lot split' })).toBeEnabled()
  rerender(<LotTransformPanel {...props} lots={[{ ...lot, revision: 3 }]} />)
  expect(screen.getByRole('button', { name: 'Confirm lot split' })).toBeDisabled()
  expect(screen.getByRole('alert')).toHaveTextContent('source lot changed')
  fireEvent.click(screen.getByRole('button', { name: 'Remove source SAMPLE-PARENT' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('retains the transformation identity after a lost response and changes it for a different quantity', async () => {
  const rpc = vi.mocked(supabase!.rpc)
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'SAMPLE response lost' } } as never)
    .mockResolvedValueOnce({ data: null, error: { message: 'SAMPLE response lost' } } as never)
    .mockResolvedValue({ data: id(10), error: null } as never)
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const { result } = renderHook(() => useLotTransformation(id(4)), {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  })
  for (let i = 0; i < 2; i++) {
    await act(async () => { await expect(result.current.mutateAsync(input)).rejects.toBeTruthy() })
  }
  expect(rpc.mock.calls[0]?.[1]?.p_idempotency_key).toBe(rpc.mock.calls[1]?.[1]?.p_idempotency_key)
  await act(async () => { await result.current.mutateAsync({ ...input, sources: [{ ...input.sources[0]!, quantity: '2' }] }) })
  expect(rpc.mock.calls[2]?.[1]?.p_idempotency_key).not.toBe(rpc.mock.calls[0]?.[1]?.p_idempotency_key)
})
