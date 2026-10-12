// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { useCustomerPartCommand } from '@/features/master-data/useCustomerParts'
import { useCommercialCommands } from '@/features/sales/useCommercialWorkflow'
import { supabase } from '@/lib/supabase'
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>
}
const mapping = { action: 'create' as const, data: { customer_id: id(2), item_id: id(3), part_number: 'SAMPLE-PART', description: 'SAMPLE', drawing_revision_id: null, reason: 'SAMPLE checked' } }
const quote = { companyId: id(1), rfqId: id(2), quotationNumber: 'SAMPLE-Q', currencyCode: 'INR', validUntil: '2099-01-01', itemId: id(3), quantity: '0.000001', uom: 'pcs' as const, unitPrice: '1', bomRevisionId: null, routingRevisionId: null, customerPartReferenceId: id(4), idempotencyKey: id(5) }
it.each(['create','retire'] as const)('retains the %s mapping retry key until server confirmation', async (action) => {
  const rpc = vi.mocked(supabase!.rpc)
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'SAMPLE lost response' } } as never).mockResolvedValue({ data: id(4), error: null } as never)
  const { result } = renderHook(() => useCustomerPartCommand(id(1),id(8)), { wrapper })
  const input = action === 'create' ? mapping : { action, referenceId: id(4), reason: 'SAMPLE corrected' }
  await act(async () => { await expect(result.current.mutateAsync(input)).rejects.toBeTruthy() })
  await act(async () => { await result.current.mutateAsync(input) })
  expect(rpc.mock.calls[1]?.[1]?.p_idempotency_key).toBe(rpc.mock.calls[0]?.[1]?.p_idempotency_key)
})
it('quotes exact quantities with pinned references and retains a lost response key', async () => {
  const rpc = vi.mocked(supabase!.rpc)
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'SAMPLE lost response' } } as never).mockResolvedValue({ data: id(6), error: null } as never)
  const { result } = renderHook(() => useCommercialCommands(id(8)), { wrapper })
  await act(async () => { await expect(result.current.quotation.mutateAsync(quote)).rejects.toBeTruthy() })
  await act(async () => { await result.current.quotation.mutateAsync({ ...quote, idempotencyKey: id(7) }) })
  expect(rpc.mock.calls[1]?.[1]).toMatchObject({ p_idempotency_key: quote.idempotencyKey, p_lines: [{ quantity: '0.000001', customer_part_reference_id: id(4) }] })
})
it('separates changed quotation content even when a caller reuses its failed key', async () => {
  const rpc = vi.mocked(supabase!.rpc)
  rpc.mockResolvedValue({ data: null, error: { message: 'SAMPLE dropped response' } } as never)
  const { result } = renderHook(() => useCommercialCommands(id(8)), { wrapper })
  await act(async () => { await expect(result.current.quotation.mutateAsync(quote)).rejects.toBeTruthy() })
  await act(async () => { await expect(result.current.quotation.mutateAsync({ ...quote, customerPartReferenceId: id(9) })).rejects.toBeTruthy() })
  expect(rpc.mock.calls[1]?.[1]?.p_idempotency_key).not.toBe(quote.idempotencyKey)
})
it('rejects malformed quotation confirmation without losing its retry identity', async () => {
  const rpc = vi.mocked(supabase!.rpc)
  rpc.mockResolvedValueOnce({ data: null, error: null } as never).mockResolvedValue({ data: id(6), error: null } as never)
  const { result } = renderHook(() => useCommercialCommands(id(8)), { wrapper })
  await act(async () => { await expect(result.current.quotation.mutateAsync(quote)).rejects.toBeTruthy() })
  await act(async () => { await result.current.quotation.mutateAsync({ ...quote, idempotencyKey: id(7) }) })
  expect(rpc.mock.calls[1]?.[1]?.p_idempotency_key).toBe(quote.idempotencyKey)
})
