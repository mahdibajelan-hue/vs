import { supabase } from '../../../lib/supabaseClient'

const BUCKET = 'comp-docs'

/** Staff upload path: `${assessmentId}/${uuid}.${ext}` — matches the comp_docs_write_staff RLS policy (folder[1] = assessment id). */
export async function uploadCompDoc(file: File, assessmentId: string): Promise<{ path: string | null; error: string | null }> {
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${assessmentId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })
  if (error) return { path: null, error: error.message }
  return { path, error: null }
}

/** Candidate self-service upload path: `${assessmentId}/${token}/${uuid}.${ext}` — matches the comp_docs_write_candidate RLS policy (folder[1] = assessment id, folder[2] = self_service_token). */
export async function uploadCompDocAsCandidate(file: File, assessmentId: string, token: string): Promise<{ path: string | null; error: string | null }> {
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${assessmentId}/${token}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })
  if (error) return { path: null, error: error.message }
  return { path, error: null }
}

export async function getCompDocSignedUrl(path: string): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10)
  if (error || !data) return null
  return data.signedUrl
}
