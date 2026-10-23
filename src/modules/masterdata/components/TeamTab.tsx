import { useMemo, useState } from 'react'
import { Pencil, Plus, ShieldCheck, UserRound, Users } from 'lucide-react'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { useMasterDataStore } from '../store/useMasterDataStore'
import { SUPERVISION_POSITIONS, TEAM_POSITIONS, TEAM_POSITION_LABEL, type TeamMember } from '../types'
import { positionColor } from '../lib/colors'
import { DeleteButton, Empty, Field, Sheet, initials } from './md'

const toFa = (v: string | number) => String(v).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))
const MINUTES = Array.from({ length: 12 }, (_, m) => String(m * 5).padStart(2, '0'))

/** 24-hour «HH:MM» as two lists — a phone opens its own wheel for each. */
function TimeInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [h, m] = value ? value.split(':') : ['', '']
  return (
    <span className="flex items-center gap-1" dir="ltr" role="group" aria-label={label}>
      <select className="md-input md-num" aria-label={`${label} — ساعت`} value={h} onChange={(e) => onChange(e.target.value ? `${e.target.value}:${m || '00'}` : '')}><option value="">--</option>{HOURS.map((x) => <option key={x} value={x}>{toFa(x)}</option>)}</select>
      <b aria-hidden>:</b>
      <select className="md-input md-num" aria-label={`${label} — دقیقه`} value={m} disabled={!h} onChange={(e) => onChange(`${h}:${e.target.value}`)}>{!h && <option value="">--</option>}{(m && !MINUTES.includes(m) ? [...MINUTES, m] : MINUTES).map((x) => <option key={x} value={x}>{toFa(x)}</option>)}</select>
    </span>
  )
}

const nameOf = (m: TeamMember, users: { id: string; fullName: string; email: string }[]) => m.personName || users.find((u) => u.id === m.userId)?.fullName || users.find((u) => u.id === m.userId)?.email || 'بدون نام'

/** The human-resources structure of a project: who holds which position, for which organization, and who reports to whom. */
export function TeamTab({ projectId }: { projectId: string }) {
  const team = useMasterDataStore((s) => s.team).filter((m) => m.projectId === projectId)
  const users = useMasterDataStore((s) => s.users)
  const organizations = useMasterDataStore((s) => s.organizations)
  const [sheet, setSheet] = useState<{ member?: TeamMember; position?: string } | null>(null)
  const kids = useMemo(() => {
    const by = new Map<string | null, TeamMember[]>()
    for (const m of team) {
      const key = m.parentId && team.some((x) => x.id === m.parentId) ? m.parentId : null
      by.set(key, [...(by.get(key) ?? []), m])
    }
    for (const l of by.values()) l.sort((a, b) => TEAM_POSITIONS.findIndex((p) => p.key === a.positionKey) - TEAM_POSITIONS.findIndex((p) => p.key === b.positionKey) || a.sort - b.sort)
    return by
  }, [team])
  const key = (k: string) => team.find((m) => m.positionKey === k)
  const orgName = (id: string | null) => organizations.find((o) => o.id === id)?.name

  const Node = ({ m }: { m: TeamMember }) => (
    <li className="md-node">
      <div className="md-card" style={{ '--c': positionColor(m.positionKey) } as React.CSSProperties}>
        <span className="md-avatar" data-round aria-hidden>{initials(nameOf(m, users))}</span>
        <span className="min-w-0 flex-1 leading-6">
          <b className="block truncate text-[13px]">{nameOf(m, users)}</b>
          <span className="md-eyebrow block truncate">{m.positionTitle || TEAM_POSITION_LABEL[m.positionKey] || m.positionKey}{orgName(m.organizationId) ? `  |  ${orgName(m.organizationId)}` : ''}</span>
        </span>
        <button className="md-btn md-btn-ghost md-btn-icon md-btn-sm" aria-label="ویرایش" onClick={() => setSheet({ member: m })}><Pencil size={14} /></button>
      </div>
      {(kids.get(m.id)?.length ?? 0) > 0 && <ul>{kids.get(m.id)!.map((c) => <Node key={c.id} m={c} />)}</ul>}
    </li>
  )

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {[['executive', 'مجری طرح'], ['project_manager', 'مدیر پروژه']].map(([k, label], i) => {
          const m = key(k)
          return (
            <div key={k} className="md-panel md-tile md-in flex items-center gap-3 p-4" style={{ '--i': i, '--c': positionColor(k) } as React.CSSProperties}>
              <span className="md-avatar" data-round aria-hidden>{m ? initials(nameOf(m, users)) : <UserRound size={16} />}</span>
              <span className="min-w-0 flex-1"><span className="md-eyebrow block">{label}</span><b className="block truncate text-[14px]">{m ? nameOf(m, users) : 'تعیین نشده'}</b></span>
              <button className="md-btn md-btn-sm" onClick={() => setSheet(m ? { member: m } : { position: k })}>{m ? 'تغییر' : 'تعیین'}</button>
            </div>
          )
        })}
      </div>

      <SupervisionPanel team={team} onEdit={(m) => setSheet({ member: m })} onAdd={(k) => setSheet({ position: k })} users={users} />

      <div className="md-panel">
        <div className="md-panel-head">
          <div><h3 className="text-[14px] font-bold">ساختار منابع انسانی پروژه</h3><p className="md-eyebrow">هر عضو زیر مدیر مستقیم خودش قرار می‌گیرد.</p></div>
          <button className="md-btn md-btn-primary md-btn-sm" onClick={() => setSheet({})}><Plus size={14} /> افزودن عضو</button>
        </div>
        <div className="p-5">
          {team.length === 0 ? <Empty icon={<Users size={20} />} title="ساختار پروژه خالی است" text="با مجری طرح و مدیر پروژه شروع کنید؛ بقیهٔ ارکان (مدیر کارگاه، مهندسی، کنترل پروژه …) زیر آن‌ها اضافه می‌شوند." /> : <ul className="md-tree">{(kids.get(null) ?? []).map((m) => <Node key={m.id} m={m} />)}</ul>}
        </div>
      </div>
      {sheet && <MemberSheet projectId={projectId} team={team} member={sheet.member} position={sheet.position} onClose={() => setSheet(null)} />}
    </div>
  )
}

/** نظارت کارگاهی — the people the attendance module (حضور و غیاب دستگاه نظارت) checks in, with their hours. */
function SupervisionPanel({ team, users, onEdit, onAdd }: { team: TeamMember[]; users: { id: string; fullName: string; email: string }[]; onEdit: (m: TeamMember) => void; onAdd: (position: string) => void }) {
  const crew = team.filter((m) => SUPERVISION_POSITIONS.includes(m.positionKey)).sort((a, b) => SUPERVISION_POSITIONS.indexOf(a.positionKey) - SUPERVISION_POSITIONS.indexOf(b.positionKey) || nameOf(a, users).localeCompare(nameOf(b, users), 'fa'))
  const head = crew.find((m) => m.positionKey === 'supervision_head')
  return (
    <div className="md-panel">
      <div className="md-panel-head">
        <div><h3 className="flex items-center gap-1.5 text-[14px] font-bold"><ShieldCheck size={15} /> نظارت کارگاهی</h3><p className="md-eyebrow">سرپرست نظارت، ناظران و نمایندگان کارفرما؛ فهرست حضور و غیاب دستگاه نظارت از همین‌جا ساخته می‌شود.</p></div>
        <span className="flex flex-wrap gap-2">
          {!head && <button className="md-btn md-btn-sm" onClick={() => onAdd('supervision_head')}><Plus size={14} /> سرپرست نظارت</button>}
          <button className="md-btn md-btn-primary md-btn-sm" onClick={() => onAdd('site_supervisor')}><Plus size={14} /> افزودن ناظر</button>
        </span>
      </div>
      {crew.length === 0 ? <div className="p-5"><Empty icon={<ShieldCheck size={20} />} title="ناظری تعریف نشده" text="سرپرست نظارت و ناظران را اضافه کنید؛ سمت، ساعت کاری و کد ملی هر نفر را همین‌جا بنویسید تا در حضور و غیاب دیده شوند." /></div> : (
        <div className="overflow-x-auto"><table className="md-table w-full text-[12.5px]">
          <thead><tr><th>نام</th><th>سمت</th><th>ساعت کاری</th><th>سقف اضافه‌کار</th><th>حساب کاربری</th><th /></tr></thead>
          <tbody>{crew.map((m) => (
            <tr key={m.id}>
              <td><b>{nameOf(m, users)}</b>{m.phone && <div className="md-eyebrow md-num" dir="ltr" style={{ textAlign: 'right' }}>{toFa(m.phone)}</div>}</td>
              <td>{m.positionTitle || TEAM_POSITION_LABEL[m.positionKey]}{m.positionTitle && <div className="md-eyebrow">{TEAM_POSITION_LABEL[m.positionKey]}</div>}</td>
              <td className="md-num">{m.shiftStart && m.shiftEnd ? `${toFa(m.shiftStart)} تا ${toFa(m.shiftEnd)}` : <span className="md-eyebrow">پیش‌فرض پروژه</span>}</td>
              <td className="md-num">{m.overtimeCap != null ? `${toFa(m.overtimeCap)} ساعت` : <span className="md-eyebrow">پیش‌فرض</span>}</td>
              <td>{m.userId ? 'دارد — ثبت با گوشی' : <span className="md-eyebrow">ندارد — ثبت توسط سرپرست</span>}</td>
              <td><button className="md-btn md-btn-ghost md-btn-icon md-btn-sm" aria-label={`ویرایش ${nameOf(m, users)}`} onClick={() => onEdit(m)}><Pencil size={14} /></button></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  )
}

function MemberSheet({ projectId, team, member, position, onClose }: { projectId: string; team: TeamMember[]; member?: TeamMember; position?: string; onClose: () => void }) {
  const users = useMasterDataStore((s) => s.users)
  const organizations = useMasterDataStore((s) => s.organizations)
  const add = useMasterDataStore((s) => s.addTeamMember)
  const update = useMasterDataStore((s) => s.updateTeamMember)
  const remove = useMasterDataStore((s) => s.removeTeamMember)
  const [f, setF] = useState({ positionKey: member?.positionKey ?? position ?? 'site_manager', positionTitle: member?.positionTitle ?? '', userId: member?.userId ?? '', personName: member?.personName ?? '', organizationId: member?.organizationId ?? '', parentId: member?.parentId ?? 'auto', phone: member?.phone ?? '', email: member?.email ?? '', nationalId: member?.nationalId ?? '', shiftStart: member?.shiftStart ?? '', shiftEnd: member?.shiftEnd ?? '', overtimeCap: member?.overtimeCap == null ? '' : String(member.overtimeCap), startDate: member?.startDate ?? '', endDate: member?.endDate ?? '', cardNo: member?.cardNo ?? '' })
  const [err, setErr] = useState('')
  const supervision = SUPERVISION_POSITIONS.includes(f.positionKey)
  const [source, setSource] = useState<'user' | 'name'>(member && !member.userId ? 'name' : 'user')
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  // a member can report to anyone except themself and the people below them
  const below = new Set<string>()
  if (member) {
    const walk = (id: string) => team.filter((t) => t.parentId === id).forEach((t) => { below.add(t.id); walk(t.id) })
    walk(member.id)
  }
  const parents = team.filter((t) => t.id !== member?.id && !below.has(t.id))
  const autoParent = (): string | null => {
    const byKey = (k: string) => team.find((t) => t.positionKey === k && t.id !== member?.id)?.id ?? null
    if (f.positionKey === 'executive') return null
    if (f.positionKey === 'project_manager') return byKey('executive')
    if (f.positionKey === 'site_supervisor') return byKey('supervision_head') ?? byKey('project_manager') ?? byKey('executive')
    return byKey('project_manager') ?? byKey('executive')
  }
  const valid = (source === 'user' ? !!f.userId : !!f.personName.trim())
  const save = async () => {
    if (supervision) {
      if (!!f.shiftStart !== !!f.shiftEnd) return setErr('ساعت شروع و پایان کار را با هم بنویسید یا هر دو را خالی بگذارید.')
      if (f.startDate && f.endDate && f.endDate < f.startDate) return setErr('پایان حضور قبل از شروع آن است.')
      if (f.positionKey === 'supervision_head' && team.some((t) => t.positionKey === 'supervision_head' && t.id !== member?.id)) return setErr('این پروژه سرپرست نظارت دارد؛ اول سمت او را تغییر دهید.')
      if (f.nationalId && !/^\d{10}$/.test(f.nationalId.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))))) return setErr('کد ملی ۱۰ رقم است.')
    }
    setErr('')
    setBusy(true)
    const extra: Partial<TeamMember> = supervision ? { nationalId: f.nationalId.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).trim(), shiftStart: f.shiftStart || null, shiftEnd: f.shiftEnd || null, overtimeCap: f.overtimeCap.trim() === '' ? null : Math.max(0, Math.min(200, Math.round(Number(f.overtimeCap) || 0))), startDate: f.startDate || null, endDate: f.endDate || null, cardNo: f.cardNo.trim() } : {}
    const data: Partial<TeamMember> = { positionKey: f.positionKey, positionTitle: f.positionTitle.trim(), userId: source === 'user' ? f.userId : null, personName: source === 'user' ? (member?.userId === f.userId && member.personName ? member.personName : users.find((u) => u.id === f.userId)?.fullName ?? '') : f.personName.trim(), organizationId: f.organizationId || null, parentId: f.parentId === 'auto' ? autoParent() : f.parentId || null, phone: f.phone, email: f.email, ...extra }
    if (member) await update(member.id, data)
    else await add(projectId, data)
    setBusy(false)
    onClose()
  }
  return (
    <Sheet title={member ? 'ویرایش عضو' : 'عضو جدید'} hint="سمت، فرد، سازمان و مدیر مستقیم او" onClose={onClose} footer={<>{member && <span className="me-auto"><DeleteButton onConfirm={async () => { await remove(member.id); onClose() }} label="حذف از ساختار" /></span>}<button className="md-btn" onClick={onClose}>انصراف</button><button className="md-btn md-btn-primary" disabled={!valid || busy} onClick={save}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button></>}>
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="سمت"><select className="md-input" value={f.positionKey} onChange={(e) => set('positionKey', e.target.value)}>{TEAM_POSITIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></Field>
          <Field label="عنوان دلخواه (اختیاری)"><input className="md-input" value={f.positionTitle} onChange={(e) => set('positionTitle', e.target.value)} placeholder="مثلاً مدیر کارگاه بخش ۲" /></Field>
        </div>
        <div>
          <span className="md-label">فرد</span>
          <div className="md-segmented mb-2.5" role="group" aria-label="منبع فرد"><button aria-pressed={source === 'user'} onClick={() => setSource('user')}>کاربر سامانه</button><button aria-pressed={source === 'name'} onClick={() => setSource('name')}>نام آزاد</button></div>
          {source === 'user' ? <select className="md-input" value={f.userId} onChange={(e) => set('userId', e.target.value)}><option value="">انتخاب کاربر</option>{users.map((u) => <option key={u.id} value={u.id}>{u.fullName || u.email}</option>)}</select> : <input className="md-input" value={f.personName} onChange={(e) => set('personName', e.target.value)} placeholder="نام و نام خانوادگی" />}
          <p className="md-hint">مجری طرح و مدیر پروژه‌ای که کاربر سامانه باشند، روی خود پروژه هم ثبت می‌شوند و در بقیهٔ ماژول‌ها دیده می‌شوند.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="سازمان"><select className="md-input" value={f.organizationId} onChange={(e) => set('organizationId', e.target.value)}><option value="">بدون انتخاب</option>{organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
          <Field label="گزارش به"><select className="md-input" value={f.parentId} onChange={(e) => set('parentId', e.target.value)}><option value="auto">خودکار (طبق سمت)</option><option value="">بدون مدیر (سطح اول)</option>{parents.map((t) => <option key={t.id} value={t.id}>{nameOf(t, users)}</option>)}</select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="تلفن"><input className="md-input md-num" dir="ltr" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="ایمیل"><input className="md-input" dir="ltr" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        </div>
        {supervision && (
          <fieldset className="grid gap-3 rounded-xl border p-3.5" style={{ borderColor: 'var(--md-line-2)' }}>
            <legend className="px-1.5 text-[12.5px] font-bold">حضور و غیاب نظارت کارگاهی</legend>
            <div className="grid grid-cols-2 gap-3">
              <div><span className="md-label">شروع کار روزانه</span><TimeInput label="شروع کار" value={f.shiftStart} onChange={(v) => set('shiftStart', v)} /></div>
              <div><span className="md-label">پایان کار روزانه</span><TimeInput label="پایان کار" value={f.shiftEnd} onChange={(v) => set('shiftEnd', v)} /></div>
            </div>
            <p className="md-hint" style={{ marginTop: -4 }}>برای شیفت شب، پایان را صبح روز بعد بنویسید (مثلاً ۱۹:۰۰ تا ۰۷:۰۰). خالی = ساعت موظفی پروژه بدون اضافه‌کار.</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="کد ملی"><input className="md-input md-num" dir="ltr" inputMode="numeric" maxLength={10} value={f.nationalId} onChange={(e) => set('nationalId', e.target.value)} /></Field>
              <Field label="سقف اضافه‌کار ماهانه"><input className="md-input md-num" dir="ltr" inputMode="numeric" placeholder="پیش‌فرض پروژه" value={f.overtimeCap} onChange={(e) => set('overtimeCap', e.target.value)} /></Field>
              <Field label="شمارهٔ کارت ساعت"><input className="md-input md-num" dir="ltr" value={f.cardNo} onChange={(e) => set('cardNo', e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><span className="md-label">شروع حضور در پروژه</span><JalaliDateInput value={f.startDate} onChange={(v) => set('startDate', v)} /></div>
              <div><span className="md-label">پایان حضور (اختیاری)</span><JalaliDateInput value={f.endDate} onChange={(v) => set('endDate', v)} /></div>
            </div>
            <p className="md-hint" style={{ marginTop: -4 }}>اگر «کاربر سامانه» انتخاب شود، این فرد ورود و خروجش را با گوشی ثبت می‌کند؛ با «نام آزاد» فقط سرپرست نظارت برایش ثبت می‌کند.</p>
          </fieldset>
        )}
        {err && <p role="alert" className="text-[12.5px] font-bold" style={{ color: 'var(--md-bad)' }}>{err}</p>}
      </div>
    </Sheet>
  )
}
