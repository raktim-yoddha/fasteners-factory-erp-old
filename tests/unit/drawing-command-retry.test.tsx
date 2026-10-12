// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { useDrawingCommands } from '@/features/production/useDrawingWorkspace'
import { supabase } from '@/lib/supabase'
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return renderHook((actorId: string) => useDrawingCommands(id(1), actorId), { initialProps: id(2), wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
}
const input = { action: 'create' as const, drawingId: id(3), revision: 'A', reason: 'SAMPLE original issue' }
it.each(['create', 'approve'] as const)('retains %s idempotency after a lost confirmation', async (action) => {
  const rpc = vi.mocked(supabase!.rpc)
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'SAMPLE lost response' } } as never).mockResolvedValue({ data: id(4), error: null } as never)
  const { result } = setup()
  const command = action === 'create' ? input : { action, revisionId: id(4), reason: 'SAMPLE reviewed' }
  await act(async () => { await expect(result.current.command.mutateAsync(command)).rejects.toBeTruthy() })
  await act(async () => { await result.current.command.mutateAsync(command) })
  expect(rpc.mock.calls[1]?.[1]?.p_idempotency_key).toBe(rpc.mock.calls[0]?.[1]?.p_idempotency_key)
})
it('separates changed revision requests and signed-in actors', async () => {
  const rpc = vi.mocked(supabase!.rpc)
  rpc.mockResolvedValue({ data: null, error: { message: 'SAMPLE dropped response' } } as never)
  const { result, rerender } = setup()
  await act(async () => { await expect(result.current.command.mutateAsync(input)).rejects.toBeTruthy() })
  await act(async () => { await expect(result.current.command.mutateAsync({ ...input, revision: 'B' })).rejects.toBeTruthy() })
  rerender(id(5))
  await act(async () => { await expect(result.current.command.mutateAsync({ ...input, revision: 'B' })).rejects.toBeTruthy() })
  expect(new Set(rpc.mock.calls.map((call) => call[1]?.p_idempotency_key)).size).toBe(3)
})
