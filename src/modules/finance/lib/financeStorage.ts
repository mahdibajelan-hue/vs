import { supabase } from '../../../lib/supabaseClient'

/**
 * Documents live in the private `finance-docs` Storage bucket (see schema.sql section 23) —
 * unlike the public `avatars` bucket, read access requires a short-lived signed URL rather than
 * a stable public URL, so `attachment_url` columns store a storage *path*, never a public link.
 */
const BUCKET = 'finance-docs'

export async function uploadFinanceDoc(file: File, folder: string): Promise<{ path: string | null; error: string | null }> {
  const ext = file.name.split('.').pop() ?? 'pdf'
  const path = `${folder}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })
  if (error) return { path: null, error: error.message }
  return { path, error: null }
}

export async function getFinanceDocSignedUrl(path: string): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10)
  if (error || !data) return null
  return data.signedUrl
}

export function financeDocFileName(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}
