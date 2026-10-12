// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { useDispatchCommands } from '@/features/dispatch/useDispatchWorkflow'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const prepare = { companyId: id(1), salesOrderId: id(2), packingNumber: 'SAMPLE-PACK', shipmentNumber: 'SAMPLE-SHIP', reservationId: id(3), quantity: '1', expectedSalesOrderRevision: 2, idempotencyKey: id(10) }
const dispatch = { companyId: id(1), shipmentId: id(4), expectedShipmentRevision: 1, idempotencyKey: id(10) }
const cancel = { ...dispatch, reason: 'SAMPLE packing correction' }
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return renderHook((actorId: string) => useDispatchCommands(actorId), { initialProps: id(30), wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
}
it.each(['prepare', 'dispatch', 'cancel'] as const)('retains %s identity after a lost confirmation and clears it only after success', async (operation) => {
  const rpc = vi.mocked(supabase!.rpc)
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'SAMPLE lost confirmation' } } as never).mockResolvedValue({ data: id(20), error: null } as never)
  const { result } = setup()
  const submit = (key: string) => operation === 'prepare' ? result.current.prepare.mutateAsync({ ...prepare, idempotencyKey: key })
    : operation === 'dispatch' ? result.current.dispatch.mutateAsync({ ...dispatch, idempotencyKey: key }) : result.current.cancel.mutateAsync({ ...cancel, idempotencyKey: key })
  await act(async () => { await expect(submit(id(10))).rejects.toMatchObject({ message: 'SAMPLE lost confirmation' }) })
  await act(async () => { await submit(id(11)) })
  expect(rpc.mock.calls[1]?.[1]).toMatchObject({ p_idempotency_key: id(10) })
  await act(async () => { await submit(id(12)) })
  expect(rpc.mock.calls[2]?.[1]).toMatchObject({ p_idempotency_key: id(12) })
})
it('creates a distinct retry key when a changed quantity tries to reuse the previous key', async () => {
  const rpc = vi.mocked(supabase!.rpc)
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'SAMPLE lost response' } } as never).mockResolvedValue({ data: id(20), error: null } as never)
  const { result } = setup()
  await act(async () => { await expect(result.current.prepare.mutateAsync(prepare)).rejects.toBeTruthy() })
  await act(async () => { await result.current.prepare.mutateAsync({ ...prepare, quantity: '2' }) })
  expect(rpc.mock.calls[1]?.[1]).toMatchObject({ p_lines: [{ reservation_id: id(3), quantity: '2' }] })
  expect(rpc.mock.calls[1]?.[1]?.p_idempotency_key).not.toBe(id(10))
})
it('does not carry another signed-in actor’s pending request key into a new session', async () => {
  const rpc = vi.mocked(supabase!.rpc)
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'SAMPLE lost response' } } as never).mockResolvedValue({ data: id(20), error: null } as never)
  const { result, rerender } = setup()
  await act(async () => { await expect(result.current.prepare.mutateAsync(prepare)).rejects.toBeTruthy() })
  rerender(id(31))
  await act(async () => { await result.current.prepare.mutateAsync({ ...prepare, idempotencyKey: id(11) }) })
  expect(rpc.mock.calls[1]?.[1]).toMatchObject({ p_idempotency_key: id(11) })
})
it('does not confirm a malformed server receipt or discard the pending retry identity', async () => {
  const rpc = vi.mocked(supabase!.rpc)
  rpc.mockResolvedValueOnce({ data: null, error: null } as never).mockResolvedValue({ data: id(20), error: null } as never)
  const { result } = setup()
  await act(async () => { await expect(result.current.dispatch.mutateAsync(dispatch)).rejects.toBeTruthy() })
  await act(async () => { await result.current.dispatch.mutateAsync({ ...dispatch, idempotencyKey: id(11) }) })
  expect(rpc.mock.calls[1]?.[1]).toMatchObject({ p_idempotency_key: id(10) })
})
