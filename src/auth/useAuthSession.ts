import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type AuthState = {
  loading: boolean
  session: Session | null
}

export function useAuthSession(): AuthState {
  const [state, setState] = useState<AuthState>({ loading: Boolean(supabase), session: null })

  useEffect(() => {
    if (!supabase) return

    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setState({ loading: false, session: data.session })
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setState({ loading: false, session })
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  return state
}
