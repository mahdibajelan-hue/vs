import { supabase } from './supabaseClient'

/** The signed-in user's saved sample signature (a PNG data URL), or null. Backed by user_signatures (owner-only RLS). */
export async function loadMySignature(): Promise<string | null> {
  const { data, error } = await supabase.from('user_signatures').select('image').maybeSingle()
  if (error) return null
  return (data as { image: string } | null)?.image ?? null
}

export async function saveMySignature(image: string | null): Promise<void> {
  const { data: u } = await supabase.auth.getUser()
  const id = u.user?.id
  if (!id) throw new Error('ابتدا وارد حساب کاربری شوید.')
  if (image === null) {
    const { error } = await supabase.from('user_signatures').delete().eq('user_id', id)
    if (error) throw new Error('حذف امضا انجام نشد.')
    return
  }
  const { error } = await supabase.from('user_signatures').upsert({ user_id: id, image, updated_at: new Date().toISOString() })
  if (error) throw new Error('ثبت امضا انجام نشد: ' + error.message)
}
