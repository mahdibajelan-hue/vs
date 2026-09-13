import { supabase } from '../../../lib/supabaseClient'

const BUCKET = 'plc-docs'

/** Anything bigger than this is almost certainly the wrong file for a checklist evidence slot. */
export const MAX_EVIDENCE_BYTES = 15 * 1024 * 1024

/**
 * Upload evidence for a checklist item. Path is `${projectId}/${uuid}.${ext}` so objects
 * stay grouped by project and a re-upload never overwrites the previous document.
 */
export async function uploadLifecycleDoc(
  file: File,
  projectId: string,
): Promise<{ path: string | null; error: string | null }> {
  if (file.size > MAX_EVIDENCE_BYTES) {
    return { path: null, error: 'حجم فایل بیش از ۱۵ مگابایت است' }
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
  const path = `${projectId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })
  if (error) return { path: null, error: error.message }
  return { path, error: null }
}

/** Short-lived signed URL — the bucket is private, so a raw path is never directly openable. */
export async function getLifecycleDocSignedUrl(path: string): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10)
  if (error || !data) return null
  return data.signedUrl
}
