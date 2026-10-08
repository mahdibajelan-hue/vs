import { useState } from 'react'
import { Briefcase, Plus } from 'lucide-react'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { useMasterDataStore } from '../store/useMasterDataStore'
import { PORTFOLIO_PROGRAM_STATUSES, PORTFOLIO_PROGRAM_STATUS_LABEL_FA, type Portfolio, type PortfolioProgramStatus } from '../types'
import { DeleteButton, Empty, Field, PageHead, Sheet, faNum, initials } from '../components/md'

const TONE: Record<PortfolioProgramStatus, 'ok' | 'warn' | undefined> = { active: 'ok', on_hold: 'warn', closed: undefined }

/** Phase 2 of the set-up: portfolios group programs and projects under one owner. */
export function PortfoliosPage() {
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const projects = useMasterDataStore((s) => s.projects)
  const create = useMasterDataStore((s) => s.createPortfolio)
  const update = useMasterDataStore((s) => s.updatePortfolio)
  const remove = useMasterDataStore((s) => s.deletePortfolio)
  const [sheet, setSheet] = useState<Portfolio | 'new' | null>(null)
  return (
    <div className="mx-auto max-w-[1040px]">
      <PageHead title="پورتفولیوها" hint="بالاترین سطح گروه‌بندی: هر پورتفولیو چند طرح دارد و هر طرح چند پروژه." actions={<button className="md-btn md-btn-primary" onClick={() => setSheet('new')}><Plus size={15} /> پورتفولیوی جدید</button>} />
      <div className="md-panel overflow-hidden">
        {portfolios.length === 0 ? <Empty icon={<Briefcase size={20} />} title="هنوز پورتفولیویی ثبت نشده" text="یک پورتفولیو بسازید تا طرح‌ها و پروژه‌ها زیر آن قرار بگیرند." /> : portfolios.map((p, i) => (
          <button key={p.id} className="md-row md-in" style={{ '--i': i } as React.CSSProperties} onClick={() => setSheet(p)}>
            <span className="md-avatar" aria-hidden>{initials(p.name)}</span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2"><b className="truncate text-[13.5px]">{p.name}</b>{p.code && <span className="md-eyebrow md-num" dir="ltr">{p.code}</span>}<span className="md-badge" data-tone={TONE[p.status]}>{PORTFOLIO_PROGRAM_STATUS_LABEL_FA[p.status]}</span></span>
              <span className="md-eyebrow block truncate">{p.description || 'بدون توضیح'}</span>
            </span>
            <span className="md-eyebrow md-num shrink-0">{faNum(programs.filter((g) => g.portfolioId === p.id).length)} طرح · {faNum(projects.filter((j) => j.portfolioId === p.id).length)} پروژه</span>
          </button>
        ))}
      </div>
      {sheet && <PortfolioSheet initial={sheet === 'new' ? undefined : sheet} onClose={() => setSheet(null)} onSave={async (d) => { if (sheet === 'new') await create(d); else await update(sheet.id, d); setSheet(null) }} onDelete={sheet === 'new' ? undefined : async () => { await remove(sheet.id); setSheet(null) }} />}
    </div>
  )
}

function PortfolioSheet({ initial, onClose, onSave, onDelete }: { initial?: Portfolio; onClose: () => void; onSave: (d: Partial<Portfolio>) => Promise<void>; onDelete?: () => void }) {
  const organizations = useMasterDataStore((s) => s.organizations)
  const users = useMasterDataStore((s) => s.users)
  const [f, setF] = useState({ code: initial?.code ?? '', name: initial?.name ?? '', description: initial?.description ?? '', organizationId: initial?.organizationId ?? '', ownerId: initial?.ownerId ?? '', status: initial?.status ?? ('active' as PortfolioProgramStatus), startDate: initial?.startDate ?? '', endDate: initial?.endDate ?? '', strategicObjectives: initial?.strategicObjectives ?? '' })
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  return (
    <Sheet title={initial ? 'ویرایش پورتفولیو' : 'پورتفولیوی جدید'} onClose={onClose} footer={<>{onDelete && <span className="me-auto"><DeleteButton onConfirm={onDelete} label="حذف" /></span>}<button className="md-btn" onClick={onClose}>انصراف</button><button className="md-btn md-btn-primary" disabled={!f.name.trim() || busy} onClick={async () => { setBusy(true); await onSave({ ...f, organizationId: f.organizationId || null, ownerId: f.ownerId || null, startDate: f.startDate || null, endDate: f.endDate || null }); setBusy(false) }}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button></>}>
      <div className="grid gap-4">
        <div className="grid grid-cols-[110px_1fr] gap-3"><Field label="کد"><input className="md-input md-num" dir="ltr" value={f.code} onChange={(e) => set('code', e.target.value)} /></Field><Field label="نام پورتفولیو"><input className="md-input" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field></div>
        <Field label="توضیحات"><textarea className="md-input" value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="سازمان مالک"><select className="md-input" value={f.organizationId} onChange={(e) => set('organizationId', e.target.value)}><option value="">بدون انتخاب</option>{organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
          <Field label="مدیر پورتفولیو"><select className="md-input" value={f.ownerId} onChange={(e) => set('ownerId', e.target.value)}><option value="">بدون انتخاب</option>{users.map((u) => <option key={u.id} value={u.id}>{u.fullName || u.email}</option>)}</select></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="وضعیت"><select className="md-input" value={f.status} onChange={(e) => set('status', e.target.value as PortfolioProgramStatus)}>{PORTFOLIO_PROGRAM_STATUSES.map((s) => <option key={s} value={s}>{PORTFOLIO_PROGRAM_STATUS_LABEL_FA[s]}</option>)}</select></Field>
          <div><span className="md-label">شروع</span><JalaliDateInput value={f.startDate} onChange={(v) => set('startDate', v)} /></div>
          <div><span className="md-label">پایان</span><JalaliDateInput value={f.endDate} onChange={(v) => set('endDate', v)} /></div>
        </div>
        <Field label="اهداف راهبردی"><textarea className="md-input" value={f.strategicObjectives} onChange={(e) => set('strategicObjectives', e.target.value)} /></Field>
      </div>
    </Sheet>
  )
}
