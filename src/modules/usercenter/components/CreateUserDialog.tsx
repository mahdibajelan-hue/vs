import { useState } from 'react'
import { Mail, ShieldCheck } from 'lucide-react'
import { Modal } from '../../../components/common/Modal'
import { useUserCenterStore } from '../store/useUserCenterStore'
import { USER_TYPES, USER_TYPE_LABEL, type UserType } from '../types'
import { useAccessData } from '../lib/useAccessModel'
import { Field, Segmented, Switch, useToast } from './ui'
import { PasswordInput } from './PasswordDialog'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The only "form" left in the module: short, one screen. Access is assigned afterwards from the new user's profile. */
export function CreateUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const createUser = useUserCenterStore((s) => s.createUser)
  const users = useUserCenterStore((s) => s.users)
  const { organizations } = useAccessData()
  const notify = useToast()
  const [f, setF] = useState({ full_name: '', email: '', phone: '', position_title: '', organization: '', user_type: 'other' as UserType, is_admin: false })
  const [mode, setMode] = useState<'invite' | 'password'>('invite')
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }))
  const email = f.email.trim().toLowerCase()
  const errors = {
    full_name: f.full_name.trim() ? '' : 'نام و نام خانوادگی را وارد کنید',
    email: !EMAIL_RE.test(email) ? 'ایمیل معتبر وارد کنید' : users.some((u) => u.email.toLowerCase() === email) ? 'برای این ایمیل قبلاً حساب ساخته شده است' : '',
    password: mode === 'password' && password.length < 8 ? 'رمز عبور باید حداقل ۸ کاراکتر باشد' : '',
  }
  const invalid = Object.values(errors).some(Boolean)
  const dirty = !!(f.full_name || f.email || f.phone || f.position_title || f.organization || password)

  const submit = async () => {
    setTouched(true)
    if (invalid) return
    setBusy(true)
    const res = await createUser({ ...f, email, password: mode === 'password' ? password : undefined })
    setBusy(false)
    if (!res.ok) {
      notify(res.error ?? 'ساخت حساب انجام نشد', 'bad')
      return
    }
    notify(mode === 'invite' ? 'حساب ساخته شد و دعوت‌نامه ایمیل شد' : 'حساب ساخته شد')
    onCreated(res.id ?? '')
  }

  return (
    <Modal panelClassName="uc-modal" title="افزودن کاربر جدید" subtitle="مشخصات اصلی را وارد کنید؛ پروژه‌ها و دسترسی‌ها را در مرحلهٔ بعد از پروفایل کاربر تعیین می‌کنید." onClose={() => !busy && onClose()} width="max-w-xl" isDirty={dirty}>
      <div className="uc-root" dir="rtl">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="نام و نام خانوادگی *" error={touched ? errors.full_name : ''}>
            <input className="uc-input" value={f.full_name} onChange={(e) => set('full_name', e.target.value)} autoFocus />
          </Field>
          <Field label="ایمیل (نام کاربری ورود) *" error={touched ? errors.email : ''}>
            <input className="uc-input" type="email" dir="ltr" style={{ textAlign: 'left' }} value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="person@company.com" />
          </Field>
          <Field label="سمت سازمانی">
            <input className="uc-input" value={f.position_title} onChange={(e) => set('position_title', e.target.value)} />
          </Field>
          <Field label="شرکت / سازمان">
            <input className="uc-input" list="uc-orgs" value={f.organization} onChange={(e) => set('organization', e.target.value)} />
            <datalist id="uc-orgs">{organizations.map((o) => <option key={o.id} value={o.name} />)}</datalist>
          </Field>
          <Field label="شماره موبایل">
            <input className="uc-input" dir="ltr" style={{ textAlign: 'left' }} inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="09xxxxxxxxx" />
          </Field>
          <Field label="نوع کاربر">
            <select className="uc-select" value={f.user_type} onChange={(e) => set('user_type', e.target.value as UserType)}>
              {USER_TYPES.map((t) => <option key={t} value={t}>{USER_TYPE_LABEL[t]}</option>)}
            </select>
          </Field>
        </div>

        <div className="uc-card-flat mt-4 p-3.5">
          <p className="mb-2.5 text-[12.5px] font-bold">نحوهٔ شروع کار کاربر</p>
          <Segmented
            label="روش ایجاد حساب"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'invite', label: <span className="inline-flex items-center gap-1.5"><Mail size={13} /> دعوت‌نامهٔ ایمیلی</span> },
              { value: 'password', label: 'تعیین رمز اولیه' },
            ]}
          />
          {mode === 'invite' ? (
            <p className="uc-hint">کاربر ایمیلی دریافت می‌کند و رمز عبور خودش را تعیین می‌کند. شما هیچ رمزی را نمی‌بینید.</p>
          ) : (
            <div className="mt-3">
              <PasswordInput value={password} onChange={setPassword} placeholder="حداقل ۸ کاراکتر" />
              {touched && errors.password && <p className="uc-field-err">{errors.password}</p>}
              <p className="uc-hint">رمز را به‌صورت امن به کاربر بدهید و از او بخواهید پس از اولین ورود آن را عوض کند.</p>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl px-3.5 py-3" style={{ border: '1px solid var(--uc-line)' }}>
          <div className="flex min-w-0 items-start gap-2.5">
            <ShieldCheck size={16} style={{ color: 'var(--uc-warn)', marginTop: 4 }} />
            <div>
              <p className="text-[12.5px] font-bold">دسترسی مدیر سیستم</p>
              <p className="uc-eyebrow leading-6">دسترسی کامل به همهٔ بخش‌ها و مدیریت کاربران. فقط در صورت لزوم فعال کنید.</p>
            </div>
          </div>
          <Switch checked={f.is_admin} onChange={(v) => set('is_admin', v)} label="دسترسی مدیر سیستم" />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button className="uc-btn" disabled={busy} onClick={onClose}>
            انصراف
          </button>
          <button className="uc-btn uc-btn-primary" disabled={busy} onClick={submit}>
            {busy ? 'در حال ساخت…' : 'ساخت حساب و ادامه'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
