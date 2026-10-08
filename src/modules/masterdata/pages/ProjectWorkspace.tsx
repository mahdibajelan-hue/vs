import { useEffect, useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { useMasterDataStore } from '../store/useMasterDataStore'
import { PROJECT_LIFECYCLE_STATUSES, PROJECT_STATUS_LABEL_FA, type MasterProject, type ProjectLifecycleStatus } from '../types'
import { DeleteButton, Field, faNum } from '../components/md'
import { PartiesEditor } from '../components/PartiesEditor'
import { TeamTab } from '../components/TeamTab'
import { ProjectIdentityPage } from './ProjectIdentityPage'

type Tab = 'identity' | 'parties' | 'team' | 'advanced'
const TABS: { id: Tab; label: string }[] = [
  { id: 'identity', label: 'شناسنامه' },
  { id: 'parties', label: 'ارکان پروژه' },
  { id: 'team', label: 'ساختار و تیم' },
  { id: 'advanced', label: 'فازها و وابستگی‌ها' },
]

/** One project: its identity card with a short description, the organizations around it, and its human-resources structure. */
export function ProjectWorkspace({ projectId, onBack, initialTab = 'identity' }: { projectId: string; onBack: () => void; initialTab?: Tab }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId))
  const [tab, setTab] = useState<Tab>(initialTab)
  if (!project) return <div className="p-8 text-center md-eyebrow">پروژه پیدا نشد.</div>
  if (tab === 'advanced') return <ProjectIdentityPage projectId={projectId} onBack={() => setTab('identity')} />
  return (
    <div className="mx-auto max-w-[1040px]">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button className="md-btn md-btn-sm" onClick={onBack}><ArrowRight size={14} /> پروژه‌ها</button>
        <div className="min-w-0"><h2 className="truncate text-[19px] font-extrabold leading-9">{project.officialName}</h2><p className="md-eyebrow md-num" dir="ltr" style={{ textAlign: 'right' }}>{project.projectCode || project.projectIdCode}</p></div>
      </div>
      <div className="md-nav mb-5" role="tablist" aria-label="بخش‌های پروژه">
        {TABS.map((t) => <button key={t.id} role="tab" className="md-nav-item" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}{tab === t.id && <span className="md-nav-ind" style={{ insetInline: 12 }} />}</button>)}
      </div>
      <div key={tab} className="md-in">
        {tab === 'identity' && <IdentityTab project={project} />}
        {tab === 'parties' && <PartiesEditor projectId={projectId} />}
        {tab === 'team' && <TeamTab projectId={projectId} />}
      </div>
    </div>
  )
}

type Draft = {
  officialName: string; shortName: string; projectCode: string; status: ProjectLifecycleStatus; projectType: string; projectCategory: string; portfolioId: string; programId: string
  description: string; location: string; scopeSummary: string; objectives: string
  contractNumber: string; contractType: string; contractValue: string; contractStartDate: string; contractualCompletionDate: string
  plannedStartDate: string; plannedFinishDate: string; actualStartDate: string; actualFinishDate: string
}
const draftOf = (p: MasterProject): Draft => ({ officialName: p.officialName, shortName: p.shortName, projectCode: p.projectCode, status: p.status, projectType: p.projectType, projectCategory: p.projectCategory, portfolioId: p.portfolioId ?? '', programId: p.programId ?? '', description: p.description, location: p.location, scopeSummary: p.scopeSummary, objectives: p.objectives, contractNumber: p.contractNumber, contractType: p.contractType, contractValue: p.contractValue == null ? '' : String(p.contractValue), contractStartDate: p.contractStartDate ?? '', contractualCompletionDate: p.contractualCompletionDate ?? '', plannedStartDate: p.plannedStartDate ?? '', plannedFinishDate: p.plannedFinishDate ?? '', actualStartDate: p.actualStartDate ?? '', actualFinishDate: p.actualFinishDate ?? '' })

function IdentityTab({ project }: { project: MasterProject }) {
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const update = useMasterDataStore((s) => s.updateProject)
  const remove = useMasterDataStore((s) => s.deleteProject)
  const [d, setD] = useState<Draft>(() => draftOf(project))
  const [busy, setBusy] = useState(false)
  useEffect(() => setD(draftOf(project)), [project])
  const dirty = useMemo(() => JSON.stringify(d) !== JSON.stringify(draftOf(project)), [d, project])
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v, ...(k === 'portfolioId' ? { programId: '' } : {}) }))
  const save = async () => {
    setBusy(true)
    await update(project.id, { officialName: d.officialName.trim(), shortName: d.shortName.trim(), projectCode: d.projectCode.trim(), status: d.status, projectType: d.projectType, projectCategory: d.projectCategory, portfolioId: d.portfolioId || null, programId: d.programId || null, description: d.description, location: d.location, scopeSummary: d.scopeSummary, objectives: d.objectives, contractNumber: d.contractNumber, contractType: d.contractType, contractValue: d.contractValue === '' ? null : Number(d.contractValue), contractStartDate: d.contractStartDate || null, contractualCompletionDate: d.contractualCompletionDate || null, plannedStartDate: d.plannedStartDate || null, plannedFinishDate: d.plannedFinishDate || null, actualStartDate: d.actualStartDate || null, actualFinishDate: d.actualFinishDate || null })
    setBusy(false)
  }
  const progs = programs.filter((g) => !d.portfolioId || g.portfolioId === d.portfolioId)
  const date = (k: keyof Draft, label: string) => <div><span className="md-label">{label}</span><JalaliDateInput value={d[k] as string} onChange={(v) => set(k, v as never)} /></div>
  return (
    <div className="grid gap-5 pb-24">
      <section className="md-panel">
        <div className="md-panel-head"><div><h3 className="text-[14px] font-bold">هویت پروژه</h3><p className="md-eyebrow">نام رسمی، کد و جایگاه پروژه در سلسله‌مراتب.</p></div></div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="نام رسمی" className="sm:col-span-2"><input className="md-input" value={d.officialName} onChange={(e) => set('officialName', e.target.value)} /></Field>
          <Field label="نام کوتاه"><input className="md-input" value={d.shortName} onChange={(e) => set('shortName', e.target.value)} /></Field>
          <Field label="کد پروژه" hint={`شناسهٔ سامانه: ${project.projectIdCode}`}><input className="md-input md-num" dir="ltr" value={d.projectCode} onChange={(e) => set('projectCode', e.target.value)} /></Field>
          <Field label="وضعیت"><select className="md-input" value={d.status} onChange={(e) => set('status', e.target.value as ProjectLifecycleStatus)}>{PROJECT_LIFECYCLE_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL_FA[s]}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="نوع پروژه"><input className="md-input" value={d.projectType} onChange={(e) => set('projectType', e.target.value)} placeholder="مثلاً خط لوله" /></Field><Field label="دسته"><input className="md-input" value={d.projectCategory} onChange={(e) => set('projectCategory', e.target.value)} /></Field></div>
          <Field label="پورتفولیو"><select className="md-input" value={d.portfolioId} onChange={(e) => set('portfolioId', e.target.value)}><option value="">بدون انتخاب</option>{portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="طرح"><select className="md-input" value={d.programId} onChange={(e) => set('programId', e.target.value)}><option value="">بدون انتخاب</option>{progs.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
        </div>
      </section>

      <section className="md-panel">
        <div className="md-panel-head"><div><h3 className="text-[14px] font-bold">شرح مختصر</h3><p className="md-eyebrow">آنچه یک مدیر تازه‌وارد باید دربارهٔ پروژه بداند.</p></div></div>
        <div className="grid gap-4 p-5">
          <Field label="شرح مختصر پروژه" hint="دو تا چهار جمله دربارهٔ اینکه پروژه چیست و چرا انجام می‌شود."><textarea className="md-input" value={d.description} onChange={(e) => set('description', e.target.value)} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="موقعیت و محدودهٔ جغرافیایی"><input className="md-input" value={d.location} onChange={(e) => set('location', e.target.value)} placeholder="استان، شهر یا مسیر" /></Field>
            <Field label="دامنهٔ کار"><input className="md-input" value={d.scopeSummary} onChange={(e) => set('scopeSummary', e.target.value)} placeholder="مثلاً ۱۰۰ کیلومتر خط ۳۶ اینچ" /></Field>
          </div>
          <Field label="اهداف پروژه"><textarea className="md-input" value={d.objectives} onChange={(e) => set('objectives', e.target.value)} /></Field>
        </div>
      </section>

      <section className="md-panel">
        <div className="md-panel-head"><div><h3 className="text-[14px] font-bold">قرارداد و برنامه</h3><p className="md-eyebrow">مبلغ به ریال؛ تاریخ‌ها شمسی.</p></div></div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="شمارهٔ قرارداد"><input className="md-input md-num" dir="ltr" value={d.contractNumber} onChange={(e) => set('contractNumber', e.target.value)} /></Field>
          <Field label="نوع قرارداد"><input className="md-input" value={d.contractType} onChange={(e) => set('contractType', e.target.value)} placeholder="مثلاً EPC" /></Field>
          <Field label="مبلغ قرارداد (ریال)" hint={d.contractValue ? `${faNum(Number(d.contractValue))} ریال` : undefined}><input className="md-input md-num" dir="ltr" inputMode="numeric" value={d.contractValue} onChange={(e) => set('contractValue', e.target.value.replace(/[^\d]/g, ''))} /></Field>
          <span />
          {date('contractStartDate', 'شروع قرارداد')}
          {date('contractualCompletionDate', 'پایان قراردادی')}
          {date('plannedStartDate', 'شروع برنامه‌ای')}
          {date('plannedFinishDate', 'پایان برنامه‌ای')}
          {date('actualStartDate', 'شروع واقعی')}
          {date('actualFinishDate', 'پایان واقعی')}
        </div>
      </section>

      <div className="flex justify-start"><DeleteButton onConfirm={async () => { await remove(project.id) }} label="حذف پروژه" /></div>
      <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-[14px] px-4 py-2.5" style={{ background: 'var(--md-surface)', border: '1px solid var(--md-line-2)', boxShadow: '0 18px 40px -18px rgba(0,0,0,.6)', transition: 'transform 220ms var(--md-ease), opacity 160ms ease', transform: dirty ? 'translate(-50%,0)' : 'translate(-50%,16px)', opacity: dirty ? 1 : 0, pointerEvents: dirty ? 'auto' : 'none' }}>
        <span className="text-[12.5px]">تغییرات ذخیره نشده</span>
        <button className="md-btn md-btn-sm" onClick={() => setD(draftOf(project))}>بازگردانی</button>
        <button className="md-btn md-btn-sm md-btn-primary" disabled={busy || !d.officialName.trim()} onClick={save}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ تغییرات'}</button>
      </div>
    </div>
  )
}
