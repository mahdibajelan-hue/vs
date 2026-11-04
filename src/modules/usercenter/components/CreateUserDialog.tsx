import { useState } from 'react'
import { ArrowLeft, Check, Copy, KeyRound, LayoutGrid, Link2, ShieldCheck } from 'lucide-react'
import { useAccessStore } from '../../masterdata/store/useAccessStore'
import type { ModuleKeyRef } from '../../masterdata/rbacTypes'
import { Modal } from '../../../components/common/Modal'
import { appUrl, useUserCenterStore } from '../store/useUserCenterStore'
import { USER_TYPES, USER_TYPE_LABEL, type UserType } from '../types'
import { useAccessData } from '../lib/useAccessModel'
import { generatePassword } from '../lib/format'
import { Field, Segmented, Switch, useToast } from './ui'
import { PasswordInput } from './PasswordDialog'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** copy text to the clipboard; false when the browser refuses */
async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

/**
 * What the admin hands to the person: the sign-in address and either the initial password or the one-time invite link,
 * as rows to copy one by one and as one ready message (for SMS, a messenger or an e-mail of the admin's own).
 */
export function AccessShare({ name, email, password, link, mustChange }: { name: string; email: string; password?: string; link?: string; mustChange: boolean }) {
  const [copied, setCopied] = useState<string | null>(null)
  const notify = useToast()
  const mark = async (key: string, text: string) => {
    if (await copy(text)) { setCopied(key); setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500) } else notify('مرورگر اجازهٔ کپی نداد؛ متن را انتخاب و کپی کنید', 'bad')
  }
  const url = appUrl()
  const message = link
    ? `${name} عزیز، حساب کاربری شما در سامانهٔ مدیریت پروژه ساخته شد.\nبرای فعال‌سازی و تعیین رمز عبور، این لینک یک‌بارمصرف را باز کنید:\n${link}\nپس از آن با ایمیل ${email} از نشانی ${url} وارد شوید.`
    : `${name} عزیز، حساب کاربری شما در سامانهٔ مدیریت پروژه ساخته شد.\nنشانی ورود: ${url}\nنام کاربری: ${email}\nرمز عبور اولیه: ${password}${mustChange ? '\nدر اولین ورود، رمز عبور تازه‌ای برای خود انتخاب می‌کنید.' : ''}`
  const Row = ({ k, label, value }: { k: string; label: string; value: string }) => (
    <div className="flex items-center gap-2 py-1.5" style={{ borderBottom: '1px solid var(--uc-line)' }}>
      <span className="uc-eyebrow w-24 shrink-0">{label}</span>
      <span className="min-w-0 flex-1 truncate" dir="ltr" style={{ fontFamily: 'var(--font-mono)', fontSize: 13, textAlign: 'left', userSelect: 'all' }} title={value}>{value}</span>
      <button type="button" className="uc-btn uc-btn-ghost uc-btn-icon" aria-label={`کپی ${label}`} onClick={() => mark(k, value)}>{copied === k ? <Check size={14} style={{ color: 'var(--uc-ok)' }} /> : <Copy size={14} />}</button>
    </div>
  )
  return (
    <div className="uc-card-flat p-3.5">
      <Row k="url" label="نشانی ورود" value={url} />
      <Row k="email" label="نام کاربری" value={email} />
      {password && <Row k="pw" label="رمز اولیه" value={password} />}
      {link && <Row k="link" label="لینک دعوت" value={link} />}
      <button type="button" className="uc-btn mt-3 w-full justify-center" onClick={() => mark('msg', message)}>
        {copied === 'msg' ? <Check size={15} style={{ color: 'var(--uc-ok)' }} /> : <Copy size={15} />} کپی پیام آماده برای ارسال به کاربر
      </button>
      <p className="uc-hint">
        {link ? 'لینک یک‌بارمصرف است و پس از مدتی منقضی می‌شود؛ اگر منقضی شد، از پروفایل کاربر «رمز عبور ← لینک ورود» را بزنید تا لینک تازه ساخته شود.' : 'این رمز دوباره نمایش داده نمی‌شود؛ آن را از راهی امن (پیامک یا پیام‌رسان) به کاربر بدهید.'}
      </p>
    </div>
  )
}

/** A new account in one short screen — no Supabase dashboard and no e-mail service needed. Access is assigned afterwards from the new user's profile. */
export function CreateUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const createUser = useUserCenterStore((s) => s.createUser)
  const users = useUserCenterStore((s) => s.users)
  const { organizations, modules } = useAccessData()
  // a new account starts with every module closed; these are opened right after it is made
  const choosable = modules.filter((m) => m.isActive && m.key !== 'admin')
  const [mods, setMods] = useState<Set<ModuleKeyRef>>(new Set())
  const toggleMod = (k: ModuleKeyRef) => setMods((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const notify = useToast()
  const [f, setF] = useState({ full_name: '', email: '', phone: '', position_title: '', organization: '', user_type: 'other' as UserType, is_admin: false })
  const [mode, setMode] = useState<'password' | 'link'>('password')
  const [password, setPassword] = useState(() => generatePassword(12))
  const [mustChange, setMustChange] = useState(true)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ id: string; password?: string; link?: string } | null>(null)

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }))
  const email = f.email.trim().toLowerCase()
  const errors = {
    full_name: f.full_name.trim() ? '' : 'نام و نام خانوادگی را وارد کنید',
    email: !EMAIL_RE.test(email) ? 'ایمیل معتبر وارد کنید' : users.some((u) => u.email.toLowerCase() === email) ? 'برای این ایمیل قبلاً حساب ساخته شده است' : '',
    password: mode === 'password' && password.length < 8 ? 'رمز عبور باید حداقل ۸ کاراکتر باشد' : '',
  }
  const invalid = Object.values(errors).some(Boolean)
  const dirty = !done && !!(f.full_name || f.email || f.phone || f.position_title || f.organization)

  const submit = async () => {
    setTouched(true)
    if (invalid) return
    setBusy(true)
    const res = await createUser({ ...f, email, mode, must_change: mustChange, password: mode === 'password' ? password : undefined })
    setBusy(false)
    if (!res.ok) { notify(res.error ?? 'ساخت حساب انجام نشد', 'bad'); return }
    if (res.id && !f.is_admin) for (const k of mods) await useAccessStore.getState().setUserModuleAccess(res.id, k, true)
    // the database closed every module for the new account; read that back so its profile shows the real state
    await useAccessStore.getState().fetchAll()
    if (mode === 'link' && !res.link) { notify('حساب ساخته شد ولی لینک دعوت برنگشت؛ از پروفایل کاربر لینک ورود بسازید', 'bad'); onCreated(res.id ?? ''); return }
    notify('حساب ساخته شد')
    setDone({ id: res.id ?? '', password: mode === 'password' ? password : undefined, link: res.link })
  }

  return (
    <Modal panelClassName="uc-modal" title={done ? 'حساب ساخته شد' : 'افزودن کاربر جدید'} subtitle={done ? 'اطلاعات ورود را برای کاربر بفرستید؛ سپس پروژه‌ها و دسترسی‌هایش را تعیین کنید.' : 'مشخصات اصلی را وارد کنید؛ پروژه‌ها و دسترسی‌ها را در مرحلهٔ بعد از پروفایل کاربر تعیین می‌کنید.'} onClose={() => !busy && (done ? onCreated(done.id) : onClose())} width="max-w-xl" isDirty={dirty}>
      <div className="uc-root" dir="rtl">
        {done ? (
          <div className="uc-rise">
            <div className="mb-3 flex items-start gap-3 rounded-xl p-3.5" style={{ background: 'color-mix(in srgb, var(--uc-ok) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--uc-ok) 30%, transparent)' }}>
              <Check size={18} style={{ color: 'var(--uc-ok)', marginTop: 3 }} />
              <p className="text-[13px] leading-7">حساب <b>{f.full_name.trim()}</b>{!f.is_admin ? ` با ${mods.size ? `${mods.size.toLocaleString('fa-IR')} ماژول باز` : 'همهٔ ماژول‌ها بسته'}` : ''} فعال است{done.link ? ' و پس از باز کردن لینک دعوت قابل استفاده می‌شود' : mustChange ? '؛ کاربر در اولین ورود رمز تازه‌ای انتخاب می‌کند' : ''}.</p>
            </div>
            <AccessShare name={f.full_name.trim()} email={email} password={done.password} link={done.link} mustChange={mustChange} />
            <div className="mt-5 flex justify-end">
              <button className="uc-btn uc-btn-primary" onClick={() => onCreated(done.id)}>ادامه: سطح دسترسی و پروژه‌ها <ArrowLeft size={15} /></button>
            </div>
          </div>
        ) : (
          <>
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
                  { value: 'password', label: <span className="inline-flex items-center gap-1.5"><KeyRound size={13} /> رمز اولیه</span> },
                  { value: 'link', label: <span className="inline-flex items-center gap-1.5"><Link2 size={13} /> لینک دعوت</span> },
                ]}
              />
              {mode === 'password' ? (
                <div className="mt-3">
                  <PasswordInput value={password} onChange={setPassword} placeholder="حداقل ۸ کاراکتر" />
                  {touched && errors.password && <p className="uc-field-err">{errors.password}</p>}
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-[12.5px]" style={{ color: 'var(--uc-ink-2)' }}>کاربر در اولین ورود رمز تازه‌ای انتخاب کند</span>
                    <Switch checked={mustChange} onChange={setMustChange} label="تغییر رمز در اولین ورود" />
                  </div>
                  <p className="uc-hint">حساب بلافاصله آماده است. پس از ساخت، نام کاربری و رمز را کپی و برای کاربر بفرستید.</p>
                </div>
              ) : (
                <p className="uc-hint">یک لینک یک‌بارمصرف ساخته می‌شود که خودتان (با پیامک، پیام‌رسان یا ایمیل) برای کاربر می‌فرستید؛ کاربر با باز کردن آن وارد می‌شود و رمز عبورش را خودش تعیین می‌کند. شما هیچ رمزی را نمی‌بینید.</p>
              )}
            </div>

            {!f.is_admin && (
              <div className="uc-card-flat mt-3 p-3.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-1.5 text-[12.5px] font-bold"><LayoutGrid size={14} /> ماژول‌های کاربر</p>
                  <span className="uc-eyebrow">{mods.size ? `${mods.size.toLocaleString('fa-IR')} ماژول باز می‌شود` : 'همه بسته'}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {choosable.map((m) => <button key={m.key} type="button" className="uc-chip" aria-pressed={mods.has(m.key)} onClick={() => toggleMod(m.key)} style={mods.has(m.key) ? { background: 'var(--uc-accent)', borderColor: 'var(--uc-accent)', color: '#fff', cursor: 'pointer' } : { cursor: 'pointer' }}>{mods.has(m.key) && <Check size={12} />}{m.labelFa}</button>)}
                </div>
                <p className="uc-hint">حساب تازه با همهٔ ماژول‌ها بسته شروع می‌شود؛ ماژول‌های انتخاب‌شده با سطح «مشاهده» باز می‌شوند. در مرحلهٔ بعد (تب «دسترسی») سطح هر ماژول، مثلاً «ثبت و ویرایش»، و پروژه‌ها را تعیین می‌کنید.</p>
              </div>
            )}

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
              <button className="uc-btn" disabled={busy} onClick={onClose}>انصراف</button>
              <button className="uc-btn uc-btn-primary" disabled={busy} onClick={submit}>{busy ? 'در حال ساخت…' : 'ساخت حساب'}</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
