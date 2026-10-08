import { useMemo, useState } from 'react'
import { FolderKanban, Plus } from 'lucide-react'
import { useMasterDataStore } from '../store/useMasterDataStore'
import { PROJECT_LIFECYCLE_STATUSES, PROJECT_STATUS_LABEL_FA, PROJECT_STATUS_TONE } from '../types'
import { Empty, Field, PageHead, SearchBox, Sheet, initials } from '../components/md'

const TONE = { neutral: undefined, green: 'ok', amber: 'warn', red: 'bad' } as const

/** Phase 4 of the set-up: the projects themselves. Opening one leads to its workspace (identity, organizations, team). */
export function ProjectsPage({ onOpen }: { onOpen: (id: string) => void }) {
  const projects = useMasterDataStore((s) => s.projects)
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const parties = useMasterDataStore((s) => s.parties)
  const organizations = useMasterDataStore((s) => s.organizations)
  const team = useMasterDataStore((s) => s.team)
  const users = useMasterDataStore((s) => s.users)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<string>('all')
  const [creating, setCreating] = useState(false)
  const shown = useMemo(() => projects.filter((p) => (status === 'all' || p.status === status) && (!q.trim() || `${p.officialName} ${p.shortName} ${p.projectCode} ${p.projectIdCode}`.toLowerCase().includes(q.trim().toLowerCase()))), [projects, q, status])
  const partyName = (pid: string, role: string) => parties.filter((x) => x.projectId === pid && x.role === role).map((x) => organizations.find((o) => o.id === x.organizationId)?.shortName || organizations.find((o) => o.id === x.organizationId)?.name).filter(Boolean).join('، ')
  const pm = (pid: string) => { const m = team.find((t) => t.projectId === pid && t.positionKey === 'project_manager'); return m ? m.personName || users.find((u) => u.id === m.userId)?.fullName : '' }
  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHead title="پروژه‌ها" hint="فهرست همهٔ پروژه‌ها با سلسله‌مراتب، ارکان و مدیر هر کدام. برای تکمیل شناسنامه و ساختار، پروژه را باز کنید." actions={<button className="md-btn md-btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> پروژهٔ جدید</button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="جستجوی نام یا کد پروژه" />
        <select className="md-input" style={{ width: 'auto', minHeight: 36 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="وضعیت"><option value="all">همهٔ وضعیت‌ها</option>{PROJECT_LIFECYCLE_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL_FA[s]}</option>)}</select>
      </div>
      <div className="md-panel overflow-hidden">
        {shown.length === 0 ? <Empty icon={<FolderKanban size={20} />} title={projects.length ? 'پروژه‌ای با این فیلتر نیست' : 'هنوز پروژه‌ای ثبت نشده'} text={projects.length ? undefined : 'پروژه را زیر یک طرح بسازید، سپس ارکان و ساختار آن را تکمیل کنید.'} /> : shown.map((p, i) => {
          const path = [portfolios.find((x) => x.id === p.portfolioId)?.name, programs.find((x) => x.id === p.programId)?.name].filter(Boolean).join(' / ')
          return (
            <button key={p.id} className="md-row md-in" style={{ '--i': i } as React.CSSProperties} onClick={() => onOpen(p.id)}>
              <span className="md-avatar" aria-hidden>{initials(p.shortName || p.officialName)}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2"><b className="truncate text-[13.5px]">{p.officialName}</b><span className="md-eyebrow md-num" dir="ltr">{p.projectCode || p.projectIdCode}</span><span className="md-badge" data-tone={TONE[PROJECT_STATUS_TONE[p.status]]}>{PROJECT_STATUS_LABEL_FA[p.status]}</span></span>
                <span className="md-eyebrow block truncate">{path || 'بدون پورتفولیو و طرح'}</span>
              </span>
              <span className="hidden w-[300px] shrink-0 md:block"><span className="md-eyebrow block truncate">کارفرما: {partyName(p.id, 'employer') || '-'}</span><span className="md-eyebrow block truncate">پیمانکار: {partyName(p.id, 'contractor') || '-'}</span></span>
              <span className="hidden w-[130px] shrink-0 md:block"><span className="md-eyebrow block">مدیر پروژه</span><span className="block truncate text-[12.5px] font-semibold">{pm(p.id) || '-'}</span></span>
            </button>
          )
        })}
      </div>
      {creating && <NewProject onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); onOpen(id) }} />}
    </div>
  )
}

function NewProject({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const create = useMasterDataStore((s) => s.createProject)
  const [f, setF] = useState({ officialName: '', shortName: '', projectCode: '', portfolioId: '', programId: '' })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v, ...(k === 'portfolioId' ? { programId: '' } : {}) }))
  const options = programs.filter((g) => !f.portfolioId || g.portfolioId === f.portfolioId)
  return (
    <Sheet title="پروژهٔ جدید" hint="فقط موارد اصلی؛ شناسنامه کامل پس از ساخت تکمیل می‌شود." onClose={onClose} footer={<><button className="md-btn" onClick={onClose}>انصراف</button><button className="md-btn md-btn-primary" disabled={!f.officialName.trim() || busy} onClick={async () => { setBusy(true); const id = await create({ officialName: f.officialName.trim(), shortName: f.shortName.trim(), projectCode: f.projectCode.trim(), portfolioId: f.portfolioId || null, programId: f.programId || null }); setBusy(false); if (id) onCreated(id) }}>{busy ? 'در حال ساخت…' : 'ساخت پروژه'}</button></>}>
      <div className="grid gap-4">
        <Field label="نام رسمی پروژه"><input className="md-input" value={f.officialName} onChange={(e) => set('officialName', e.target.value)} autoFocus /></Field>
        <div className="grid grid-cols-[1fr_130px] gap-3"><Field label="نام کوتاه"><input className="md-input" value={f.shortName} onChange={(e) => set('shortName', e.target.value)} /></Field><Field label="کد پروژه"><input className="md-input md-num" dir="ltr" value={f.projectCode} onChange={(e) => set('projectCode', e.target.value)} /></Field></div>
        <Field label="پورتفولیو"><select className="md-input" value={f.portfolioId} onChange={(e) => set('portfolioId', e.target.value)}><option value="">بدون انتخاب</option>{portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="طرح"><select className="md-input" value={f.programId} onChange={(e) => set('programId', e.target.value)}><option value="">بدون انتخاب</option>{options.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
      </div>
    </Sheet>
  )
}
