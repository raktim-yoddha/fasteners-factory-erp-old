// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useStockCommands } from '@/features/stock/useStockCommands'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const payloads = {
  receipt: { companyId: id(1), itemId: id(2), locationId: id(3), lotCode: 'SAMPLE-LOT', quantity: '1', uom: 'pcs' as const, idempotencyKey: id(10) },
  release: { companyId: id(1), lotId: id(2), expectedRevision: 1, idempotencyKey: id(10) },
  reserve: { companyId: id(1), salesOrderLineId: id(2), lotId: id(3), quantity: '1', expectedSalesOrderRevision: 1, idempotencyKey: id(10) },
}
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return renderHook(() => useStockCommands(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
}
describe('stock command response-loss recovery', () => {
  it.each(['receipt', 'release', 'reserve'] as const)('reuses %s retry identity until confirmed, then gives a new action its new identity', async (operation) => {
    const rpc = vi.mocked(supabase!.rpc)
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'SAMPLE connection lost after write' } } as never)
      .mockResolvedValue({ data: id(20), error: null } as never)
    const { result } = setup()
    async function submit(key: string) {
      const command = { ...payloads[operation], idempotencyKey: key }
      if (operation === 'receipt') return result.current.receipt.mutateAsync(command as typeof payloads.receipt)
      if (operation === 'release') return result.current.release.mutateAsync(command as typeof payloads.release)
      return result.current.reserve.mutateAsync(command as typeof payloads.reserve)
    }
    await act(async () => { await expect(submit(id(10))).rejects.toMatchObject({ message: 'SAMPLE connection lost after write' }) })
    await act(async () => { await submit(id(11)) })
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_idempotency_key: id(10) })
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({ p_idempotency_key: id(10) })
    await act(async () => { await submit(id(12)) })
    expect(rpc.mock.calls[2]?.[1]).toMatchObject({ p_idempotency_key: id(12) })
  })

  it('gives a changed receipt quantity a distinct request identity after a failed request', async () => {
    const rpc = vi.mocked(supabase!.rpc)
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'SAMPLE unavailable' } } as never)
      .mockResolvedValue({ data: id(20), error: null } as never)
    const { result } = setup()
    await act(async () => { await expect(result.current.receipt.mutateAsync(payloads.receipt)).rejects.toBeTruthy() })
    await act(async () => { await result.current.receipt.mutateAsync({ ...payloads.receipt, quantity: '2', idempotencyKey: id(11) }) })
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({ p_quantity: '2', p_idempotency_key: id(11) })
  })
})
