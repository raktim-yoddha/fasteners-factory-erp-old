import { z } from 'zod'
export const privateFileMetadataSchema = z.object({
  original_name: z.string().min(1).max(255),
  mime_type: z.enum(['application/pdf', 'image/png', 'image/jpeg']),
  byte_size: z.number().int().min(1).max(5 * 1024 * 1024),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
})
export const privateFileRecordSchema = privateFileMetadataSchema.extend({
  id: z.uuid(), company_id: z.uuid(), object_path: z.string(),
  status: z.enum(['pending', 'ready']), created_by: z.uuid(),
  created_at: z.string(), confirmed_at: z.string().nullable(),
})
