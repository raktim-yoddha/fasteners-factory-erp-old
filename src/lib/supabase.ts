import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const environmentSchema = z.object({
  VITE_SUPABASE_URL: z.url().optional(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional()
})

const environment = environmentSchema.parse(import.meta.env)

export const isSupabaseConfigured = Boolean(
  environment.VITE_SUPABASE_URL && environment.VITE_SUPABASE_PUBLISHABLE_KEY
)

export const supabase = isSupabaseConfigured
  ? createClient(environment.VITE_SUPABASE_URL!, environment.VITE_SUPABASE_PUBLISHABLE_KEY!)
  : null
