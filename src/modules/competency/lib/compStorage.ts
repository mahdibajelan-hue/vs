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

/** Personnel photo limits: jpg/png only; anything larger than the pixel box or byte budget is
 * downscaled and re-encoded as JPEG in the browser before upload; only an unreadable image or a
 * source above PHOTO_SOURCE_MAX_BYTES is refused. */
export const PHOTO_MAX_SIDE_PX = 600
export const PHOTO_MAX_BYTES = 150 * 1024
export const PHOTO_SOURCE_MAX_BYTES = 8 * 1024 * 1024
export const PHOTO_LIMIT_FA = 'عکس حداکثر ۶۰۰×۶۰۰ پیکسل و ۱۵۰ کیلوبایت (JPG/PNG)؛ عکس بزرگ‌تر خودکار کوچک می‌شود.'

export async function preparePhoto(file: File): Promise<{ file: File | null; error: string | null }> {
  if (!['jpg', 'jpeg', 'png'].includes(extensionOf(file))) return { file: null, error: 'فقط عکس JPG یا PNG قابل بارگذاری است.' }
  if (file.size > PHOTO_SOURCE_MAX_BYTES) return { file: null, error: 'حجم عکس بیش از ۸ مگابایت است؛ عکس کوچک‌تری انتخاب کنید.' }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return { file: null, error: 'فایل انتخاب‌شده عکس معتبری نیست.' }
  }
  const scale = Math.min(1, PHOTO_MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.size <= PHOTO_MAX_BYTES) {
    bitmap.close()
    return { file, error: null }
  }
  const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) { bitmap.close(); return { file: null, error: 'پردازش عکس در این مرورگر ممکن نیست.' } }
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  for (const q of [0.85, 0.75, 0.65, 0.55, 0.45]) {
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', q))
    if (blob && blob.size <= PHOTO_MAX_BYTES) return { file: new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }), error: null }
  }
  return { file: null, error: 'عکس را نمی‌توان به کمتر از ۱۵۰ کیلوبایت رساند؛ عکس ساده‌تری انتخاب کنید.' }
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
