import { useState } from 'react'
import { Check, Plus, ShieldCheck, Sparkles, UserCog } from 'lucide-react'
import { Modal } from '../../../components/common/Modal'
import { useUserCenterStore } from '../store/useUserCenterStore'
import { useAccessData, useUserAccess } from '../lib/useAccessModel'
import { useAccessActions } from '../lib/useAccessActions'
import { faNum } from '../lib/format'
import { USER_TYPES, USER_TYPE_HINT, USER_TYPE_LABEL, type UcUser, type UserType } from '../types'
import { Badge, ConfirmDialog, Popover, Section, Switch, useToast } from '../components/ui'
import { useAuthStore } from '../../../store/useAuthStore'

export function RolesTab({ user }: { user: UcUser }) {
  const updateProfile = useUserCenterStore((s) => s.updateProfile)
  const myId = useAuthStore((s) => s.profile?.id)
  const { roles, rolePermissions } = useAccessData()
  const { userRoleIds } = useUserAccess(user.id)
  const actions = useAccessActions(user.id)
  const notify = useToast()
  const [adminDialog, setAdminDialog] = useState(false)
  const [newRole, setNewRole] = useState(false)

  const setType = async (t: UserType) => {
    if (t === user.userType) return
    const res = await updateProfile(user.id, { user_type: t })
    notify(res.ok ? `نوع کاربر به «${USER_TYPE_LABEL[t]}» تغییر کرد` : (res.error ?? 'تغییر نوع انجام نشد'), res.ok ? 'ok' : 'bad')
  }
  const assigned = roles.filter((r) => userRoleIds.includes(r.id))
  const available = roles.filter((r) => !userRoleIds.includes(r.id))

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Section className="lg:col-span-3" title="نوع کاربر" hint="جایگاه این فرد در پروژه‌ها؛ برای گزارش‌گیری و فیلتر کردن به کار می‌رود و به‌تنهایی دسترسی نمی‌دهد.">
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="نوع کاربر">
          {USER_TYPES.map((t) => {
            const on = user.userType === t
            return (
              <button
                key={t}
                role="radio"
                aria-checked={on}
                onClick={() => setType(t)}
                className="flex items-start gap-3 rounded-xl p-3 text-right"
                style={{ border: `1px solid ${on ? 'var(--uc-accent)' : 'var(--uc-line)'}`, background: on ? 'var(--uc-accent-soft)' : 'var(--uc-surface-2)', fontFamily: 'inherit', color: 'inherit', cursor: 'pointer', transition: 'border-color .15s, background-color .15s' }}
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ border: `1.5px solid ${on ? 'var(--uc-accent)' : 'var(--uc-line-2)'}`, background: on ? 'var(--uc-accent)' : 'transparent', color: 'var(--uc-on-accent)' }}>
                  {on && <Check size={12} strokeWidth={3.5} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold">{USER_TYPE_LABEL[t]}</span>
                  <span className="uc-eyebrow block leading-6">{USER_TYPE_HINT[t]}</span>
                </span>
              </button>
            )
          })}
        </div>
      </Section>

      <div className="flex flex-col gap-4 lg:col-span-2">
        <Section title="مدیر سیستم" hint="دسترسی کامل به همهٔ ماژول‌ها و مدیریت کاربران">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: 'color-mix(in srgb, var(--uc-warn) 14%, transparent)', color: 'var(--uc-warn)' }}><ShieldCheck size={17} /></span>
              <p className="text-[12.5px] leading-6" style={{ color: 'var(--uc-ink-2)' }}>{user.isAdmin ? 'این کاربر مدیر سیستم است.' : 'این کاربر مدیر سیستم نیست.'}</p>
            </div>
            <Switch checked={user.isAdmin} onChange={() => setAdminDialog(true)} label="دسترسی مدیر سیستم" />
          </div>
        </Section>

        <Section
          title="نقش‌های سازمانی"
          hint="مجموعه‌ای از مجوزها که به‌صورت ارثی به کاربر می‌رسد"
          action={
            <Popover label="افزودن نقش" trigger={({ toggle }) => <button className="uc-btn uc-btn-sm" onClick={toggle} disabled={available.length === 0}><Plus size={13} /> افزودن</button>}>
              {(close) => (
                <div className="max-h-72 overflow-y-auto">
                  {available.map((r) => (
                    <button key={r.id} className="uc-pop-item" onClick={() => { close(); actions.setRoles([...userRoleIds, r.id], `نقش «${r.name}» افزوده شد`) }}>
                      <UserCog size={14} />
                      <span className="min-w-0"><span className="block truncate">{r.name}</span><small>{faNum(rolePermissions[r.id]?.size ?? 0)} مجوز</small></span>
                    </button>
                  ))}
                </div>
              )}
            </Popover>
          }
        >
          {assigned.length === 0 ? (
            <p className="uc-eyebrow leading-7">هنوز نقشی ندارد. بدون نقش، کاربر فقط مجوزهای اختصاصی خودش را دارد.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {assigned.map((r) => (
                <span key={r.id} className="uc-chip" title={r.description || undefined}>
                  {r.name} <Badge>{faNum(rolePermissions[r.id]?.size ?? 0)} مجوز</Badge>
                  <button aria-label={`حذف نقش ${r.name}`} onClick={() => actions.setRoles(userRoleIds.filter((x) => x !== r.id), `نقش «${r.name}» برداشته شد`)}>×</button>
                </span>
              ))}
            </div>
          )}
          <button className="uc-btn uc-btn-ghost uc-btn-sm mt-3" onClick={() => setNewRole(true)}><Sparkles size={13} /> تعریف نقش سفارشی</button>
        </Section>
      </div>

      {adminDialog && (
        <ConfirmDialog
          tone={user.isAdmin ? 'warn' : 'danger'}
          title={user.isAdmin ? 'برداشتن دسترسی مدیر سیستم' : 'اعطای دسترسی مدیر سیستم'}
          confirmLabel={user.isAdmin ? 'برداشتن دسترسی' : 'اعطای دسترسی کامل'}
          description={user.isAdmin ? <>{user.id === myId ? 'شما در حال برداشتن دسترسی مدیر از خودتان هستید و بلافاصله از این بخش خارج می‌شوید. ' : ''}کاربر دیگر به همه‌چیز دسترسی ندارد و فقط طبق نقش‌ها و پروژه‌هایش کار می‌کند.</> : 'مدیر سیستم همهٔ پروژه‌ها و ماژول‌ها را می‌بیند، کاربران را مدیریت می‌کند و می‌تواند دسترسی بقیه را عوض کند. فقط برای افراد مورداعتماد فعال کنید.'}
          onConfirm={async () => {
            const res = await updateProfile(user.id, { is_admin: !user.isAdmin })
            notify(res.ok ? (user.isAdmin ? 'دسترسی مدیر سیستم برداشته شد' : 'دسترسی مدیر سیستم داده شد') : (res.error ?? 'انجام نشد'), res.ok ? 'ok' : 'bad')
            if (res.ok) setAdminDialog(false)
          }}
          onClose={() => setAdminDialog(false)}
        />
      )}
      {newRole && <NewRoleDialog onClose={() => setNewRole(false)} onCreate={actions.createRole} />}
    </div>
  )
}

function NewRoleDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, description: string) => Promise<void> }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const notify = useToast()
  return (
    <Modal panelClassName="uc-modal" title="تعریف نقش سفارشی" subtitle="نقش تازه برای همهٔ کاربران قابل استفاده است." onClose={() => !busy && onClose()} width="max-w-md" isDirty={!!(name || desc)}>
      <div className="uc-root" dir="rtl">
        <label className="block"><span className="uc-label">نام نقش *</span><input className="uc-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <label className="mt-3 block"><span className="uc-label">توضیح</span><textarea className="uc-input uc-textarea" value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
        <p className="uc-hint">پس از ساخت، مجوزهای نقش را از «داده‌های پایه ← نقش‌ها و دسترسی‌ها» تعیین کنید. تا آن موقع نقش مجوزی نمی‌دهد.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="uc-btn" disabled={busy} onClick={onClose}>انصراف</button>
          <button className="uc-btn uc-btn-primary" disabled={busy || !name.trim()} onClick={async () => { setBusy(true); await onCreate(name.trim(), desc.trim()); setBusy(false); notify(`نقش «${name.trim()}» ساخته شد`); onClose() }}>ساخت نقش</button>
        </div>
      </div>
    </Modal>
  )
}
