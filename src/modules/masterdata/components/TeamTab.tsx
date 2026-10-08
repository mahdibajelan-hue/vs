import { useMemo, useState } from 'react'
import { Pencil, Plus, UserRound, Users } from 'lucide-react'
import { useMasterDataStore } from '../store/useMasterDataStore'
import { TEAM_POSITIONS, TEAM_POSITION_LABEL, type TeamMember } from '../types'
import { DeleteButton, Empty, Field, Sheet, initials } from './md'

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
      <div className="md-card">
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
            <div key={k} className="md-panel md-in flex items-center gap-3 p-4" style={{ '--i': i } as React.CSSProperties}>
              <span className="md-avatar" data-round aria-hidden>{m ? initials(nameOf(m, users)) : <UserRound size={16} />}</span>
              <span className="min-w-0 flex-1"><span className="md-eyebrow block">{label}</span><b className="block truncate text-[14px]">{m ? nameOf(m, users) : 'تعیین نشده'}</b></span>
              <button className="md-btn md-btn-sm" onClick={() => setSheet(m ? { member: m } : { position: k })}>{m ? 'تغییر' : 'تعیین'}</button>
            </div>
          )
        })}
      </div>

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

function MemberSheet({ projectId, team, member, position, onClose }: { projectId: string; team: TeamMember[]; member?: TeamMember; position?: string; onClose: () => void }) {
  const users = useMasterDataStore((s) => s.users)
  const organizations = useMasterDataStore((s) => s.organizations)
  const add = useMasterDataStore((s) => s.addTeamMember)
  const update = useMasterDataStore((s) => s.updateTeamMember)
  const remove = useMasterDataStore((s) => s.removeTeamMember)
  const [f, setF] = useState({ positionKey: member?.positionKey ?? position ?? 'site_manager', positionTitle: member?.positionTitle ?? '', userId: member?.userId ?? '', personName: member?.personName ?? '', organizationId: member?.organizationId ?? '', parentId: member?.parentId ?? 'auto', phone: member?.phone ?? '', email: member?.email ?? '' })
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
    return byKey('project_manager') ?? byKey('executive')
  }
  const valid = (source === 'user' ? !!f.userId : !!f.personName.trim())
  const save = async () => {
    setBusy(true)
    const data: Partial<TeamMember> = { positionKey: f.positionKey, positionTitle: f.positionTitle.trim(), userId: source === 'user' ? f.userId : null, personName: source === 'user' ? (users.find((u) => u.id === f.userId)?.fullName ?? '') : f.personName.trim(), organizationId: f.organizationId || null, parentId: f.parentId === 'auto' ? autoParent() : f.parentId || null, phone: f.phone, email: f.email }
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
      </div>
    </Sheet>
  )
}
