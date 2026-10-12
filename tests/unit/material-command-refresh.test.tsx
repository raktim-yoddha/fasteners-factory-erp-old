// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { useMaterialCommand } from '@/features/procurement/useProcurement'
import { supabase } from '@/lib/supabase'
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const command = { command: 'approve_purchase_order' as const, params: { p_company_id: id(1), p_order_id: id(2), p_expected_revision: 1 } }
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const hook = renderHook(() => useMaterialCommand(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
  return { ...hook, client }
}
it('completes a server-confirmed command while an unrelated cache refresh is still pending', async () => {
  vi.mocked(supabase!.rpc).mockResolvedValue({ data: id(3), error: null } as never)
  const { result, client } = setup()
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockImplementation(() => new Promise<void>(() => undefined))
  await act(async () => { expect(await result.current.mutateAsync(command)).toBe(id(3)) })
  expect(result.current.isPending).toBe(false)
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['production'] }, { throwOnError: false })
})
it('does not finish before RPC confirmation and does not refresh after a rejected command', async () => {
  let confirm!: (value: never) => void
  vi.mocked(supabase!.rpc).mockImplementation(() => new Promise((resolve) => { confirm = resolve }) as never)
  const { result, client } = setup()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  let pending!: Promise<string>
  await act(async () => { pending = result.current.mutateAsync(command); await Promise.resolve() })
  expect(invalidate).not.toHaveBeenCalled()
  await act(async () => { confirm({ data: null, error: { message: 'SAMPLE denied' } } as never); await expect(pending).rejects.toBeTruthy() })
  expect(invalidate).not.toHaveBeenCalled()
})
it('retains its retry identity when the server returns malformed confirmation data', async () => {
  const rpc = vi.mocked(supabase!.rpc)
  rpc.mockResolvedValueOnce({ data: null, error: null } as never).mockResolvedValue({ data: id(3), error: null } as never)
  const { result } = setup()
  await act(async () => { await expect(result.current.mutateAsync(command)).rejects.toBeTruthy() })
  await act(async () => { await result.current.mutateAsync(command) })
  expect(rpc.mock.calls[1]?.[1]?.p_idempotency_key).toBe(rpc.mock.calls[0]?.[1]?.p_idempotency_key)
})
