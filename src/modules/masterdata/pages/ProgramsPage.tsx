import { useState } from 'react'
import { FolderTree, Plus } from 'lucide-react'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { useMasterDataStore } from '../store/useMasterDataStore'
import { PORTFOLIO_PROGRAM_STATUSES, PORTFOLIO_PROGRAM_STATUS_LABEL_FA, type PortfolioProgramStatus, type Program } from '../types'
import { DeleteButton, Empty, Field, PageHead, Sheet, faNum, initials } from '../components/md'

const TONE: Record<PortfolioProgramStatus, 'ok' | 'warn' | undefined> = { active: 'ok', on_hold: 'warn', closed: undefined }

/** Phase 3 of the set-up: a program (طرح) belongs to a portfolio and collects its projects. */
export function ProgramsPage() {
  const programs = useMasterDataStore((s) => s.programs)
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const projects = useMasterDataStore((s) => s.projects)
  const users = useMasterDataStore((s) => s.users)
  const create = useMasterDataStore((s) => s.createProgram)
  const update = useMasterDataStore((s) => s.updateProgram)
  const remove = useMasterDataStore((s) => s.deleteProgram)
  const [sheet, setSheet] = useState<Program | 'new' | null>(null)
  const nameOf = (id: string | null) => users.find((u) => u.id === id)?.fullName
  return (
    <div className="mx-auto max-w-[1040px]">
      <PageHead title="طرح‌ها" hint="هر طرح زیر یک پورتفولیو قرار می‌گیرد و مدیر طرح و حامی خودش را دارد." actions={<button className="md-btn md-btn-primary" onClick={() => setSheet('new')}><Plus size={15} /> طرح جدید</button>} />
      <div className="md-panel overflow-hidden">
        {programs.length === 0 ? <Empty icon={<FolderTree size={20} />} title="هنوز طرحی ثبت نشده" text={portfolios.length ? 'اولین طرح را زیر یکی از پورتفولیوها بسازید.' : 'ابتدا یک پورتفولیو تعریف کنید.'} /> : programs.map((g, i) => (
          <button key={g.id} className="md-row md-in" style={{ '--i': i } as React.CSSProperties} onClick={() => setSheet(g)}>
            <span className="md-avatar" aria-hidden>{initials(g.name)}</span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2"><b className="truncate text-[13.5px]">{g.name}</b>{g.code && <span className="md-eyebrow md-num" dir="ltr">{g.code}</span>}<span className="md-badge" data-tone={TONE[g.status]}>{PORTFOLIO_PROGRAM_STATUS_LABEL_FA[g.status]}</span></span>
              <span className="md-eyebrow block truncate">{portfolios.find((p) => p.id === g.portfolioId)?.name ?? 'بدون پورتفولیو'}{nameOf(g.programManagerId) ? `  |  مدیر طرح: ${nameOf(g.programManagerId)}` : ''}</span>
            </span>
            <span className="md-eyebrow md-num shrink-0">{faNum(projects.filter((j) => j.programId === g.id).length)} پروژه</span>
          </button>
        ))}
      </div>
      {sheet && <ProgramSheet initial={sheet === 'new' ? undefined : sheet} onClose={() => setSheet(null)} onSave={async (d) => { if (sheet === 'new') await create(d); else await update(sheet.id, d); setSheet(null) }} onDelete={sheet === 'new' ? undefined : async () => { await remove(sheet.id); setSheet(null) }} />}
    </div>
  )
}

function ProgramSheet({ initial, onClose, onSave, onDelete }: { initial?: Program; onClose: () => void; onSave: (d: Partial<Program>) => Promise<void>; onDelete?: () => void }) {
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const users = useMasterDataStore((s) => s.users)
  const [f, setF] = useState({ code: initial?.code ?? '', name: initial?.name ?? '', description: initial?.description ?? '', portfolioId: initial?.portfolioId ?? '', programManagerId: initial?.programManagerId ?? '', sponsorId: initial?.sponsorId ?? '', status: initial?.status ?? ('active' as PortfolioProgramStatus), startDate: initial?.startDate ?? '', plannedFinish: initial?.plannedFinish ?? '', strategicObjectives: initial?.strategicObjectives ?? '' })
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const userOpts = <>{<option value="">بدون انتخاب</option>}{users.map((u) => <option key={u.id} value={u.id}>{u.fullName || u.email}</option>)}</>
  return (
    <Sheet title={initial ? 'ویرایش طرح' : 'طرح جدید'} onClose={onClose} footer={<>{onDelete && <span className="me-auto"><DeleteButton onConfirm={onDelete} label="حذف" /></span>}<button className="md-btn" onClick={onClose}>انصراف</button><button className="md-btn md-btn-primary" disabled={!f.name.trim() || busy} onClick={async () => { setBusy(true); await onSave({ ...f, portfolioId: f.portfolioId || null, programManagerId: f.programManagerId || null, sponsorId: f.sponsorId || null, startDate: f.startDate || null, plannedFinish: f.plannedFinish || null }); setBusy(false) }}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button></>}>
      <div className="grid gap-4">
        <div className="grid grid-cols-[110px_1fr] gap-3"><Field label="کد"><input className="md-input md-num" dir="ltr" value={f.code} onChange={(e) => set('code', e.target.value)} /></Field><Field label="نام طرح"><input className="md-input" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field></div>
        <Field label="پورتفولیو"><select className="md-input" value={f.portfolioId} onChange={(e) => set('portfolioId', e.target.value)}><option value="">بدون انتخاب</option>{portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="توضیحات"><textarea className="md-input" value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="مدیر طرح"><select className="md-input" value={f.programManagerId} onChange={(e) => set('programManagerId', e.target.value)}>{userOpts}</select></Field>
          <Field label="حامی (Sponsor)"><select className="md-input" value={f.sponsorId} onChange={(e) => set('sponsorId', e.target.value)}>{userOpts}</select></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="وضعیت"><select className="md-input" value={f.status} onChange={(e) => set('status', e.target.value as PortfolioProgramStatus)}>{PORTFOLIO_PROGRAM_STATUSES.map((s) => <option key={s} value={s}>{PORTFOLIO_PROGRAM_STATUS_LABEL_FA[s]}</option>)}</select></Field>
          <div><span className="md-label">شروع</span><JalaliDateInput value={f.startDate} onChange={(v) => set('startDate', v)} /></div>
          <div><span className="md-label">پایان برنامه‌ای</span><JalaliDateInput value={f.plannedFinish} onChange={(v) => set('plannedFinish', v)} /></div>
        </div>
        <Field label="اهداف راهبردی"><textarea className="md-input" value={f.strategicObjectives} onChange={(e) => set('strategicObjectives', e.target.value)} /></Field>
      </div>
    </Sheet>
  )
}
