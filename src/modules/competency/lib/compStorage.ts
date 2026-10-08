import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../../../lib/supabaseClient'

const BUCKET = 'comp-docs'

/** Per-document limit (schema.sql Section 55): enforced here before uploading, by a trigger on
 * storage.objects for every non-photo object in the bucket, and again by the registration RPCs. The
 * personnel photo keeps its own rules. */
export const COMP_DOC_MAX_BYTES = 300 * 1024
export const COMP_DOC_TOO_LARGE_FA = 'حجم فایل بیش از ۳۰۰ کیلوبایت است'
const DOC_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png']
export const COMP_DOC_ACCEPT = '.pdf,.jpg,.jpeg,.png'

function extensionOf(file: File): string {
  return (file.name.split('.').pop() ?? '').toLowerCase()
}

/** Persian error for a file that must not be uploaded as a document, or null when it is fine. */
export function validateCompDoc(file: File): string | null {
  if (!DOC_EXTENSIONS.includes(extensionOf(file))) return 'فقط فایل PDF یا تصویر JPG/PNG قابل بارگذاری است.'
  if (file.size > COMP_DOC_MAX_BYTES) return COMP_DOC_TOO_LARGE_FA
  return null
}

/** Maps a storage/RPC error to a message the uploader can act on. */
export function compDocErrorFa(message: string | null | undefined): string {
  const m = message ?? ''
  if (/file_too_large|exceeded the maximum|too large|413/i.test(m)) return COMP_DOC_TOO_LARGE_FA
  if (/self_service_closed/.test(m)) return 'این فرم دیگر قابل ویرایش نیست؛ بارگذاری یا حذف مدرک امکان‌پذیر نیست.'
  if (/assessment_locked/.test(m)) return 'این ارزیابی نهایی شده است؛ مدارک آن تا بازگشایی توسط مدیر ماژول قابل تغییر نیست.'
  if (/forbidden|row-level security|permission/i.test(m)) return 'شما مجوز تغییر مدارک این ارزیابی را ندارید.'
  if (/too_many_documents/.test(m)) return 'تعداد مدارک بارگذاری‌شده بیش از حد مجاز است.'
  return 'بارگذاری انجام نشد. اتصال اینترنت و حجم/نوع فایل را بررسی کنید و دوباره تلاش کنید.'
}

let anonClient: SupabaseClient | null = null

/** A session-less client for the candidate self-service page: the candidate storage policies are
 * granted to anon only (a signed-in user can read every token through comp_assessments, so a token
 * path must never grant a signed-in user anything), so the page must not send whatever staff session
 * happens to live in this browser. */
export function compAnonClient(): SupabaseClient {
  if (!anonClient) {
    const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'https://placeholder.supabase.co'
    const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? 'placeholder-anon-key'
    anonClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'comp-self-service-anon' },
    })
  }
  return anonClient
}

async function put(client: SupabaseClient, path: string, file: File): Promise<{ path: string | null; error: string | null }> {
  const { error } = await client.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined })
  if (error) return { path: null, error: error.message }
  return { path, error: null }
}

/** Staff photo path: `${assessmentId}/${uuid}.${ext}` — the convention comp_set_photo accepts (Section 53). */
export async function uploadCompDoc(file: File, assessmentId: string): Promise<{ path: string | null; error: string | null }> {
  return put(supabase, `${assessmentId}/${crypto.randomUUID()}.${extensionOf(file) || 'bin'}`, file)
}

/** Staff document path: `${assessmentId}/docs/${uuid}.${ext}` — the only layout comp_add_attachment accepts (Section 55). */
export async function uploadCompDocument(file: File, assessmentId: string): Promise<{ path: string | null; error: string | null }> {
  return put(supabase, `${assessmentId}/docs/${crypto.randomUUID()}.${extensionOf(file)}`, file)
}

/** Candidate photo path: `${assessmentId}/${token}/${uuid}.${ext}` — matches comp_self_service_set_photo. */
export async function uploadCompDocAsCandidate(file: File, assessmentId: string, token: string): Promise<{ path: string | null; error: string | null }> {
  return put(compAnonClient(), `${assessmentId}/${token}/${crypto.randomUUID()}.${extensionOf(file) || 'bin'}`, file)
}

/** Candidate document path: `${assessmentId}/${token}/docs/${uuid}.${ext}` — matches comp_self_service_add_document. */
export async function uploadCandidateDocument(file: File, assessmentId: string, token: string): Promise<{ path: string | null; error: string | null }> {
  return put(compAnonClient(), `${assessmentId}/${token}/docs/${crypto.randomUUID()}.${extensionOf(file)}`, file)
}

/** Best effort: the registration row is what matters, an unregistered object is never listed. */
export async function removeCompDocObject(path: string, client: SupabaseClient = supabase): Promise<void> {
  if (path) await client.storage.from(BUCKET).remove([path])
}

export async function getCompDocSignedUrl(path: string, client: SupabaseClient = supabase): Promise<string | null> {
  if (!path) return null
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, 60 * 10)
  if (error || !data) return null
  return data.signedUrl
}
