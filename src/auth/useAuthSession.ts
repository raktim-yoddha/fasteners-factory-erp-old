import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { workspaceMode } from '@/local/mode'
import { localRequest } from '@/local/client'
import { z } from 'zod'

// Keep identity across StrictMode subscriptions and route remounts for this cache.
const cacheIdentity = new WeakMap<QueryClient, string | null>()

type AuthState = {
  loading: boolean
  session: Session | null
  owner?: { id: string; workspace_id: string; state: string; pending: boolean }
  error?: string
}

export function useAuthSession(): AuthState {
  const queryClient = useQueryClient()
  const [state, setState] = useState<AuthState>({
    loading: Boolean(supabase),
    session: null,
  })

  useEffect(() => {
    if (workspaceMode() === 'solo') {
      let active = true
      const refresh = () => { void localRequest({ operation: 'identity' }).then((response) => {
        if (!active) return
        if (response.error) setState({ loading: false, session: null, error: response.error.message })
        else setState({ loading: false, session: null, owner: z.object({ id: z.uuid(), workspace_id: z.uuid(), state: z.string(), pending: z.boolean() }).parse(response.data) })
        void queryClient.invalidateQueries({ queryKey: ['company-permissions'] })
      })
      }
      refresh()
      window.addEventListener('factory-local-authority-changed', refresh)
      return () => { active = false; window.removeEventListener('factory-local-authority-changed', refresh) }
    }
    if (!supabase) return

    let active = true
    let authEventReceived = false
    const receiveSession = (session: Session | null) => {
      if (!active) return
      const previousIdentity = cacheIdentity.get(queryClient)
      const identity = session?.user.id ?? null
      if (previousIdentity && previousIdentity !== identity) queryClient.clear()
      cacheIdentity.set(queryClient, identity)
      setState({ loading: false, session })
    }
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!authEventReceived) receiveSession(data.session)
      })
      .catch(() => {
        if (!authEventReceived) receiveSession(null)
      })
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        authEventReceived = true
        receiveSession(session)
      },
    )

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [queryClient])

  return state
}
