import { useRef, useState } from 'react'
import { Camera, ImageUp, Loader2, Trash2 } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { prepareAvatar } from '../../../lib/imageTools'
import { useAuthStore } from '../../../store/useAuthStore'
import { useUserCenterStore } from '../store/useUserCenterStore'
import type { UcUser } from '../types'
import { Avatar, Section, useToast } from './ui'

/** Photo of the user: shown everywhere in the system. An admin can set it for anyone; people can set their own. */
export function PhotoCard({ user }: { user: UcUser }) {
  const updateProfile = useUserCenterStore((s) => s.updateProfile)
  const refreshProfile = useAuthStore((s) => s.refreshProfile)
  const myId = useAuthStore((s) => s.profile?.id)
  const notify = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const apply = async (url: string) => {
    const res = await updateProfile(user.id, { avatar_url: url })
    if (!res.ok) throw new Error(res.error ?? 'ذخیره نشد')
    if (user.id === myId) await refreshProfile()
  }

  const pick = async (file: File) => {
    if (!file.type.startsWith('image/')) return notify('فقط فایل تصویر مجاز است', 'bad')
    setBusy(true)
    try {
      let body: Blob = file
      try {
        body = await prepareAvatar(file) // square crop, 320px, flattened on white
      } catch {
        /* undecodable in this browser: upload the original */
      }
      const processed = body !== file
      const path = `${user.id}/avatar.${processed ? 'jpg' : file.name.split('.').pop() ?? 'jpg'}`
      const { error } = await supabase.storage.from('avatars').upload(path, body, { upsert: true, contentType: processed ? 'image/jpeg' : file.type })
      if (error) throw new Error(error.message)
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      await apply(`${data.publicUrl}?t=${Date.now()}`)
      notify('عکس کاربر ذخیره شد')
    } catch (e) {
      notify(e instanceof Error ? `بارگذاری عکس انجام نشد: ${e.message}` : 'بارگذاری عکس انجام نشد', 'bad')
    }
    setBusy(false)
  }

  const remove = async () => {
    setBusy(true)
    try {
      await apply('')
      notify('عکس حذف شد')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'حذف نشد', 'bad')
    }
    setBusy(false)
  }

  return (
    <Section title="عکس کاربر" hint="در همهٔ بخش‌های سامانه کنار نام کاربر نمایش داده می‌شود">
      <div className="flex flex-wrap items-center gap-5">
        <button type="button" className="group relative" onClick={() => input.current?.click()} aria-label="تغییر عکس" disabled={busy}>
          <Avatar user={user} size={96} />
          <span className="absolute inset-0 flex items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" style={{ background: 'rgba(8,20,48,0.55)', color: '#fff' }}>
            {busy ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="uc-eyebrow m-0 leading-6">فرمت JPG یا PNG. عکس به‌صورت خودکار مربع و سبک می‌شود.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="uc-btn uc-btn-primary uc-btn-sm" disabled={busy} onClick={() => input.current?.click()}><ImageUp size={14} /> {user.avatarUrl ? 'تغییر عکس' : 'بارگذاری عکس'}</button>
            {user.avatarUrl && <button className="uc-btn uc-btn-danger uc-btn-sm" disabled={busy} onClick={remove}><Trash2 size={14} /> حذف عکس</button>}
          </div>
        </div>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = '' }} />
      </div>
    </Section>
  )
}
