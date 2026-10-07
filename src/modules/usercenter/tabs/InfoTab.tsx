import { useEffect, useMemo, useState } from 'react'
import { BadgeCheck, CalendarClock, Check, Copy, KeyRound, Mail, Pencil, Power, Save, X } from 'lucide-react'
import { useUserCenterStore } from '../store/useUserCenterStore'
import { useAccessData } from '../lib/useAccessModel'
import { displayName, fmtDate, fmtDateTime, relTime } from '../lib/format'
import { STATUS_LABEL, type UcUser } from '../types'
import { Badge, Field, Section, StatusBadge, useToast } from '../components/ui'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5" style={{ borderBottom: '1px solid var(--uc-line)' }}>
      <dt className="uc-eyebrow shrink-0 pt-0.5" style={{ minWidth: 110 }}>{label}</dt>
      <dd className="m-0 min-w-0 flex-1 text-[13px] font-medium">{children}</dd>
    </div>
  )
}

export function InfoTab({ user, editing, setEditing, onPassword, onStatus }: { user: UcUser; editing: boolean; setEditing: (v: boolean) => void; onPassword: () => void; onStatus: () => void }) {
  const updateProfile = useUserCenterStore((s) => s.updateProfile)
  const users = useUserCenterStore((s) => s.users)
  const authInfoAvailable = useUserCenterStore((s) => s.authInfoAvailable)
  const { organizations } = useAccessData()
  const notify = useToast()
  const [form, setForm] = useState({ full_name: user.fullName, position_title: user.positionTitle, organization: user.organization, phone: user.phone })
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setForm({ full_name: user.fullName, position_title: user.positionTitle, organization: user.organization, phone: user.phone })
  }, [user, editing])

  const changed = useMemo(() => {
    const patch: Record<string, string> = {}
    if (form.full_name.trim() !== user.fullName) patch.full_name = form.full_name.trim()
    if (form.position_title.trim() !== user.positionTitle) patch.position_title = form.position_title.trim()
    if (form.organization.trim() !== user.organization) patch.organization = form.organization.trim()
    if (form.phone.trim() !== user.phone) patch.phone = form.phone.trim()
    return patch
  }, [form, user])
  const dirty = Object.keys(changed).length > 0
  const nameError = !form.full_name.trim() ? 'نام نمی‌تواند خالی باشد' : ''

  const save = async () => {
    if (nameError) return
    setBusy(true)
    const res = await updateProfile(user.id, changed)
    setBusy(false)
    if (!res.ok) return notify(res.error ?? 'ذخیره نشد', 'bad')
    notify('اطلاعات کاربر ذخیره شد')
    setEditing(false)
  }
  const changedBy = users.find((u) => u.id === user.statusChangedBy)

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Section
        className="lg:col-span-3"
        title="اطلاعات پایه"
        hint="مشخصات هویتی و سازمانی کاربر"
        action={
          editing ? null : (
            <button className="uc-btn uc-btn-sm" onClick={() => setEditing(true)}>
              <Pencil size={13} /> ویرایش
            </button>
          )
        }
      >
        {editing ? (
          <div className="uc-rise">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="نام و نام خانوادگی *" error={nameError}>
                <input className="uc-input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} autoFocus />
              </Field>
              <Field label="سمت سازمانی">
                <input className="uc-input" value={form.position_title} onChange={(e) => setForm({ ...form, position_title: e.target.value })} />
              </Field>
              <Field label="شرکت / سازمان">
                <input className="uc-input" list="uc-orgs-edit" value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} />
                <datalist id="uc-orgs-edit">{organizations.map((o) => <option key={o.id} value={o.name} />)}</datalist>
              </Field>
              <Field label="شماره موبایل">
                <input className="uc-input" dir="ltr" style={{ textAlign: 'left' }} inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label="ایمیل / نام کاربری ورود" hint="ایمیل پس از ساخت حساب قابل تغییر نیست." className="sm:col-span-2">
                <input className="uc-input" dir="ltr" style={{ textAlign: 'left' }} value={user.email} readOnly />
              </Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="uc-btn" disabled={busy} onClick={() => setEditing(false)}>
                <X size={14} /> انصراف
              </button>
              <button className="uc-btn uc-btn-primary" disabled={busy || !dirty || !!nameError} onClick={save}>
                <Save size={14} /> {busy ? 'در حال ذخیره…' : 'ذخیرهٔ تغییرات'}
              </button>
            </div>
          </div>
        ) : (
          <dl className="m-0">
            <Row label="نام و نام خانوادگی">{displayName(user)}</Row>
            <Row label="سمت سازمانی">{user.positionTitle || <span style={{ color: 'var(--uc-muted)' }}>ثبت نشده</span>}</Row>
            <Row label="شرکت / سازمان">{user.organization || <span style={{ color: 'var(--uc-muted)' }}>ثبت نشده</span>}</Row>
            <Row label="شماره موبایل"><span dir="ltr" className="uc-num">{user.phone || '—'}</span></Row>
            <Row label="ایمیل">
              <span className="inline-flex items-center gap-2">
                <span dir="ltr">{user.email}</span>
                <button
                  className="uc-btn uc-btn-ghost uc-btn-icon"
                  style={{ minWidth: 26, minHeight: 26 }}
                  aria-label="کپی ایمیل"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(user.email)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    } catch {
                      /* clipboard unavailable */
                    }
                  }}
                >
                  {copied ? <Check size={13} style={{ color: 'var(--uc-ok)' }} /> : <Copy size={13} />}
                </button>
              </span>
            </Row>
          </dl>
        )}
      </Section>

      <div className="flex flex-col gap-4 lg:col-span-2">
        <Section title="ورود و امنیت" hint="نام کاربری، رمز عبور و وضعیت حساب">
          <dl className="m-0">
            <Row label="نام کاربری"><span dir="ltr">{user.email}</span></Row>
            <Row label="رمز عبور">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="uc-num tracking-[0.25em]" style={{ color: 'var(--uc-muted)' }} aria-label="رمز عبور مخفی است">••••••••••</span>
                <button className="uc-btn uc-btn-sm" onClick={onPassword}><KeyRound size={13} /> تغییر / بازنشانی</button>
              </span>
            </Row>
            <Row label="وضعیت حساب">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <StatusBadge status={user.accountStatus} />
                <button className="uc-btn uc-btn-sm" onClick={onStatus}><Power size={13} /> تغییر وضعیت</button>
              </span>
              {user.accountStatus !== 'active' && (
                <span className="uc-eyebrow mt-2 block leading-6">
                  {STATUS_LABEL[user.accountStatus]}{changedBy ? ` توسط ${displayName(changedBy)}` : ''}{user.statusChangedAt ? ` در ${fmtDate(user.statusChangedAt)}` : ''}
                  {user.statusReason ? ` — «${user.statusReason}»` : ''}
                </span>
              )}
            </Row>
          </dl>
        </Section>

        <Section title="سوابق حساب">
          <dl className="m-0">
            <Row label="تاریخ ایجاد"><span className="inline-flex items-center gap-1.5"><CalendarClock size={13} style={{ color: 'var(--uc-muted)' }} /> {fmtDate(user.authCreatedAt ?? user.createdAt)}</span></Row>
            <Row label="آخرین ورود">{authInfoAvailable ? <span title={fmtDateTime(user.lastSignInAt)}>{user.lastSignInAt ? `${relTime(user.lastSignInAt)} — ${fmtDateTime(user.lastSignInAt)}` : 'هنوز وارد نشده'}</span> : <span style={{ color: 'var(--uc-muted)' }}>در دسترس نیست</span>}</Row>
            <Row label="ایمیل"><span className="inline-flex items-center gap-1.5">{user.emailConfirmed ? <Badge tone="ok"><BadgeCheck size={11} /> تأیید شده</Badge> : <Badge tone="warn"><Mail size={11} /> تأیید نشده</Badge>}</span></Row>
            <Row label="تکمیل پروفایل">{user.profileCompleted ? <Badge tone="ok">تکمیل شده</Badge> : <Badge tone="warn">هنوز تکمیل نکرده</Badge>}</Row>
          </dl>
        </Section>
      </div>
    </div>
  )
}
