import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { workspaceMode } from '@/local/mode'
import { localRepository } from '@/local/client'

const environmentSchema = z.object({
  VITE_SUPABASE_URL: z.url().optional(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional()
})

const environment = environmentSchema.parse(import.meta.env)

export const isSupabaseConfigured = Boolean(
  environment.VITE_SUPABASE_URL && environment.VITE_SUPABASE_PUBLISHABLE_KEY
)

// ADR 0019: the facade preserves existing typed feature ingress. Solo never starts cloud Auth.
// Only from/rpc are shared; Auth and Storage access remain explicit authority-specific operations.
let cloudConnection: SupabaseClient | null = null
export function getCloudConnection(): SupabaseClient {
  if (!isSupabaseConfigured) throw new Error('Configure Supabase before using optional cloud services.')
  cloudConnection ??= createClient(environment.VITE_SUPABASE_URL!, environment.VITE_SUPABASE_PUBLISHABLE_KEY!)
  return cloudConnection
}
export const supabase = workspaceMode() === 'solo'
  ? localRepository as unknown as SupabaseClient
  : isSupabaseConfigured
  ? getCloudConnection()
  : null
