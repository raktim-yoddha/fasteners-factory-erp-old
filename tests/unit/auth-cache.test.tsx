// @vitest-environment jsdom
import { render, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import { useAuthSession } from '@/auth/useAuthSession'

const auth = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: Session | null) => void),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: (
        callback: (event: string, session: Session | null) => void,
      ) => {
        auth.listener = callback
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      },
    },
  },
}))
function Probe() {
  const { session } = useAuthSession()
  return <p>{session?.user.id ?? 'signed out'}</p>
}

describe('authenticated query cache', () => {
  it('clears private records on identity change and sign-out, but preserves them on same-user refresh', async () => {
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={cache}>
        <Probe />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(auth.listener).not.toBeNull())
    act(() =>
      auth.listener?.('SIGNED_IN', { user: { id: 'sample-first' } } as Session),
    )
    cache.setQueryData(['private-record'], { name: 'SAMPLE first-user record' })
    act(() =>
      auth.listener?.('TOKEN_REFRESHED', {
        user: { id: 'sample-first' },
      } as Session),
    )
    expect(cache.getQueryData(['private-record'])).toBeDefined()
    act(() =>
      auth.listener?.('SIGNED_IN', {
        user: { id: 'sample-second' },
      } as Session),
    )
    expect(cache.getQueryData(['private-record'])).toBeUndefined()
    cache.setQueryData(['private-record'], {
      name: 'SAMPLE second-user record',
    })
    act(() => auth.listener?.('SIGNED_OUT', null))
    expect(cache.getQueryData(['private-record'])).toBeUndefined()
  })
})
