import { useEffect, useRef, useState } from 'react'
import { Camera, Check, Loader2, User } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { supabase } from '../../lib/supabaseClient'
import { PasswordField } from './AuthGate'
import { SignaturePad } from '../common/SignaturePad'
import { loadMySignature, saveMySignature } from '../../lib/userSignature'
import { prepareAvatar } from '../../lib/imageTools'

export function ProfileForm({ mode, onSaved }: { mode: 'forced' | 'edit'; onSaved?: () => void }) {
  const profile = useAuthStore((s) => s.profile)
  const refreshProfile = useAuthStore((s) => s.refreshProfile)
  const updatePassword = useAuthStore((s) => s.updatePassword)

  const [fullName, setFullName] = useState(profile?.fullName ?? '')
  const [positionTitle, setPositionTitle] = useState(profile?.positionTitle ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl ?? '')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passError, setPassError] = useState('')
  const [passInfo, setPassInfo] = useState('')
  const [savingPass, setSavingPass] = useState(false)

  // Sample signature — printed under the user's mission reports. Saved on its own (not part of «ذخیره تغییرات»).
  const [signature, setSignature] = useState<string | null>(null)
  const [signatureLoaded, setSignatureLoaded] = useState(false)
  const [savingSignature, setSavingSignature] = useState(false)
  const [signatureError, setSignatureError] = useState('')
  useEffect(() => {
    loadMySignature().then((s) => {
      setSignature(s)
      setSignatureLoaded(true)
    })
  }, [])

  if (!profile) return null

  const handleSignature = async (png: string) => {
    setSavingSignature(true)
    setSignatureError('')
    try {
      await saveMySignature(png)
      setSignature(png)
    } catch (e) {
      setSignatureError(e instanceof Error ? e.message : 'ثبت امضا انجام نشد')
    }
    setSavingSignature(false)
  }

  const handleAvatarPick = async (file: File) => {
    setUploading(true)
    setError('')
    let body: Blob = file
    try {
      // Square crop without black/transparent borders, 320 px, flattened on white (~30 KB).
      body = await prepareAvatar(file)
    } catch {
      /* undecodable (e.g. HEIC in an old browser): upload the original */
    }
    const processed = body !== file
    const path = `${profile.id}/avatar.${processed ? 'jpg' : file.name.split('.').pop() ?? 'jpg'}`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, body, { upsert: true, contentType: processed ? 'image/jpeg' : file.type })
    setUploading(false)
    if (upErr) {
      setError('خطا در آپلود عکس — ' + upErr.message)
      return
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    setAvatarUrl(`${data.publicUrl}?t=${Date.now()}`)
  }

  const submit = async () => {
    if (!fullName.trim() || !positionTitle.trim()) {
      setError('نام و سمت را وارد کنید')
      return
    }
    setSaving(true)
    setError('')
    const { error: err } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        position_title: positionTitle.trim(),
        phone: phone.trim(),
        avatar_url: avatarUrl,
        profile_completed: true,
      })
      .eq('id', profile.id)
    setSaving(false)
    if (err) {
      setError('خطا در ذخیره — ' + err.message)
      return
    }
    await refreshProfile()
    onSaved?.()
  }

  const submitPassword = async () => {
    setPassError('')
    setPassInfo('')
    if (newPassword.length < 6) {
      setPassError('رمز عبور باید حداقل ۶ کاراکتر باشد')
      return
    }
    if (newPassword !== confirmPassword) {
      setPassError('رمز عبور و تکرار آن یکسان نیستند')
      return
    }
    setSavingPass(true)
    const res = await updatePassword(newPassword)
    setSavingPass(false)
    if (!res.ok) {
      setPassError(res.error ?? 'خطا در تغییر رمز عبور')
      return
    }
    setPassInfo('رمز عبور با موفقیت تغییر کرد')
    setNewPassword('')
    setConfirmPassword('')
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/5"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full bg-white object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <User size={28} className="text-muted" />
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            {uploading ? <Loader2 size={16} className="animate-spin text-white" /> : <Camera size={16} className="text-white" />}
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleAvatarPick(f)
            e.target.value = ''
          }}
        />
        <p className="text-[11px] text-muted">برای تغییر عکس کلیک کنید</p>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs text-secondary">نام و نام خانوادگی *</span>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" placeholder="مثلاً مهدی باجلان" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-secondary">سمت در پروژه *</span>
        <input
          value={positionTitle}
          onChange={(e) => setPositionTitle(e.target.value)}
          className="input"
          placeholder="مثلاً سرپرست کارگاه، مدیر پروژه"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-secondary">شماره تماس</span>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="09xxxxxxxxx" dir="ltr" />
      </label>
      <div className="space-y-2 rounded-xl border border-white/10 p-3">
        <p className="text-xs font-bold text-secondary">امضای نمونه</p>
        <p className="text-[11px] leading-5 text-muted">
          امضای شما پای گزارش‌های مأموریتی که ارسال می‌کنید درج می‌شود. بدون امضای ثبت‌شده، ارسال گزارش مأموریت ممکن نیست. فقط خودتان می‌توانید آن را ببینید یا تغییر دهید.
        </p>
        {signatureLoaded ? <SignaturePad value={signature} onSave={handleSignature} saving={savingSignature} /> : <Loader2 size={14} className="animate-spin text-muted" />}
        {signatureError && <p className="text-xs text-red-400">{signatureError}</p>}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={submit}
        disabled={saving}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-400 disabled:opacity-50 transition-colors"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
        {mode === 'forced' ? 'ذخیره و ادامه' : 'ذخیره تغییرات'}
      </button>

      <div className="space-y-3 border-t pt-4" style={{ borderColor: 'var(--border-soft)' }}>
        <p className="text-xs font-bold text-secondary">تغییر رمز عبور</p>
        <PasswordField label="رمز عبور جدید" value={newPassword} onChange={setNewPassword} placeholder="حداقل ۶ کاراکتر" />
        <PasswordField label="تکرار رمز عبور جدید" value={confirmPassword} onChange={setConfirmPassword} />
        {passError && <p className="text-xs text-red-400">{passError}</p>}
        {passInfo && <p className="text-xs text-green-400">{passInfo}</p>}
        <button
          onClick={submitPassword}
          disabled={savingPass || !newPassword}
          className="w-full rounded-xl border border-white/10 px-5 py-2.5 text-sm font-medium text-secondary hover:bg-white/5 disabled:opacity-50 transition-colors"
        >
          {savingPass ? 'در حال ذخیره...' : 'تغییر رمز عبور'}
        </button>
      </div>
    </div>
  )
}
