import { useEffect, useMemo, useState } from 'react'
import { ArrowDownToLine, CalendarDays, CheckCircle2, ClipboardList, Eye, FileCheck, FilePen, Flame, GitMerge, Grid3x3, Layers, Link2, Lock, Mountain, PaintRoller, Paintbrush, Plus, Radiation, RotateCcw, Route, ScanLine, Search, ShieldCheck, Shovel, Spline, Truck, Wrench, Zap, type LucideIcon } from 'lucide-react'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { useLookupOptions } from '../../material/lib/control/lookups'
import { FORMS, FORM_BY_KEY, FORM_GROUP_LABEL_FA, inScope, type FormGroup } from '../lib/formCatalog'
import { dayBoard, dayCell, isClosed, type DayCell } from '../lib/dayBoard'
import { REPORT_STATUS_LABEL_FA } from '../types'
import { fa } from '../components/common'
import type { ExecutionModel } from '../lib/useExecutionModel'

/** a picture of each site minute's subject */
const FORM_ICON: Record<string, LucideIcon> = { pipe_entry: Truck, pipe_permit: FileCheck, string: Route, bend: Spline, fitup: Link2, welding: Flame, weld_repair: Wrench, tie_in: GitMerge,
  rt_request: ScanLine, rt_request_rp: ScanLine, rt_report: Radiation, coating_line: PaintRoller, coating_daily: Paintbrush, fj_coating: Layers, bond_test: Zap, lowering: ArrowDownToLine,
  sand: Mountain, backfill: Shovel, rock_shield: ShieldCheck, geotextile: Grid3x3 }
const GROUP_COLOR: Record<string, string> = { pipeline: '#0f766e', weld: '#c2410c', rt: '#7c3aed', coating: '#0e7490', ground: '#a16207', qc: '#64748b' }
/** the three states a day's minute can be in — every tile of a state wears the same colour */
type Bucket = 'todo' | 'mid' | 'done'
const BUCKET: { k: Bucket; title: string; hint: string }[] = [
  { k: 'mid', title: 'نیمه‌کاره و در جریان', hint: 'پیش‌نویس، در انتظار بررسی نظارت یا برگشت‌خورده' },
  { k: 'todo', title: 'ثبت‌نشده', hint: 'هنوز برای این روز ثبت نشده' },
  { k: 'done', title: 'تأییدشده', hint: 'تأیید نهایی دستگاه نظارت' },
]
const bucketOf = (st: DayCell['state']): Bucket => (st === 'todo' ? 'todo' : st === 'approved' ? 'done' : 'mid')
const STATE_FA = { todo: 'ثبت نشده', open: 'پیش‌نویس — ادامهٔ ثبت', sent: 'ارسال‌شده برای نظارت', approved: 'تأییدشده', rejected: 'ردشده — ثبت دوباره' } as const

/**
 * The day's report: pick the day (today by default) and the front, then fill the daily work report (site condition,
 * manpower, machinery, stoppages, narrative, next day) and the site minutes (صورتجلسات کارگاهی) one tile each.
 * A tile is closed once its report is sent, so a day never gets two reports of the same kind, and the counter shows
 * how many of the day's minutes are done.
 */
export function DayView({ model: m, canRecord, onOpen, onCreate }: { model: ExecutionModel; canRecord: boolean; onOpen: (id: string) => void; onCreate: (formKey: string, date: string, front: string) => void }) {
  const [date, setDate] = useState(m.today)
  const fronts = useLookupOptions(m.projectId, 'front')
  const [front, setFront] = useState(() => m.settings.expectedFronts[0] ?? fronts[0]?.value ?? '')
  useEffect(() => { if (!front && fronts.length) setFront(fronts[0].value) }, [fronts, front])
  const enabled = m.settings.enabledForms
  const forms = useMemo(() => FORMS.filter((f) => f.kind === 'daily' && inScope(f.key, 'execution') && (!enabled.length || enabled.includes(f.key))), [enabled])
  const board = useMemo(() => dayBoard(m.reports, forms.map((f) => f.key), date, front), [m.reports, forms, date, front])
  const work = useMemo(() => dayCell(m.reports, 'work', date, front), [m.reports, date, front])
  const [q, setQ] = useState(''), [cat, setCat] = useState<FormGroup | ''>(''), [bk, setBk] = useState<Bucket | ''>('')
  const allGroups = (Object.keys(FORM_GROUP_LABEL_FA) as FormGroup[]).filter((g) => board.cells.some((c) => FORM_BY_KEY[c.formKey]?.group === g))
  const match = (k: string) => { const f = FORM_BY_KEY[k]; const t = q.trim().toLowerCase(); return (!cat || f.group === cat) && (!t || f.title.toLowerCase().includes(t) || f.en.toLowerCase().includes(t)) }
  const shown = board.cells.filter((c) => match(c.formKey))
  const counts = { todo: 0, mid: 0, done: 0 } as Record<Bucket, number>
  for (const c of shown) counts[bucketOf(c.state)] += 1
  const buckets = BUCKET.filter((b) => !bk || b.k === bk).map((b) => ({ ...b, cells: shown.filter((c) => bucketOf(c.state) === b.k) })).filter((b) => b.cells.length)
  const pct = board.total ? Math.round((board.closed / board.total) * 100) : 0

  const act = (c: DayCell) => {
    if (c.report && c.state !== 'rejected') onOpen(c.report.id)
    else if (canRecord) onCreate(c.formKey, date, front)
  }
  const Icon = ({ c }: { c: DayCell }) => c.state === 'approved' ? <CheckCircle2 size={18} /> : c.state === 'sent' ? <Lock size={18} /> : c.state === 'open' ? <FilePen size={18} /> : c.state === 'rejected' ? <RotateCcw size={18} /> : <Plus size={18} />

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="im-card dv-bar">
        <label><CalendarDays size={15} aria-hidden /> تاریخ گزارش<JalaliDateInput value={date} onChange={(x) => x && setDate(x)} /></label>
        <label>جبههٔ کاری<select value={front} onChange={(e) => setFront(e.target.value)}>{!fronts.some((o) => o.value === front) && <option value={front}>{front || '—'}</option>}{fronts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        {date !== m.today && <button className="im-btn im-btn-sm" onClick={() => setDate(m.today)}>امروز</button>}
        <div className="dv-meter" aria-label={`صورتجلسات ثبت‌شده: ${board.closed} از ${board.total}`}>
          <span>صورتجلسات ارسال‌شدهٔ این روز</span>
          <b>{fa(board.closed)} <em>از {fa(board.total)}</em></b>
          <i><s style={{ width: `${pct}%` }} /></i>
          {board.open > 0 && <small>{fa(board.open)} پیش‌نویس در دست تکمیل</small>}
        </div>
      </div>

      <section className="dv-sec">
        <h3><ClipboardList size={17} aria-hidden /> گزارش وضعیت کارگاه</h3>
        <button type="button" className={`dv-work dv-${work.state}`} onClick={() => act(work)} disabled={!work.report && !canRecord}>
          <span className="dv-ico"><Icon c={work} /></span>
          <span className="dv-main"><b>گزارش وضعیت کارگاه</b><small>وضعیت سایت · نیروی انسانی · ماشین‌آلات · توقف‌ها و HSE · شرح عملیات · برنامهٔ روز آتی</small></span>
          <span className="dv-state">{work.report ? `${work.report.reportNo} · ${REPORT_STATUS_LABEL_FA[work.report.status]}` : STATE_FA[work.state]}</span>
        </button>
      </section>

      <section className="dv-sec">
        <h3><Eye size={17} aria-hidden /> صورتجلسات کارگاهی</h3>
        <div className="dv-find">
          <label className="dv-search"><Search size={15} aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجوی صورتجلسه (مثلاً جوش، ریسه، RT)…" aria-label="جست‌وجوی صورتجلسه" /></label>
          <div className="dv-cats" role="group" aria-label="دسته‌بندی صورتجلسات">
            <button type="button" className={!cat ? 'on' : undefined} onClick={() => setCat('')}>همه</button>
            {allGroups.map((g) => <button key={g} type="button" className={cat === g ? 'on' : undefined} style={{ ['--c' as string]: GROUP_COLOR[g] }} onClick={() => setCat(cat === g ? '' : g)}>{FORM_GROUP_LABEL_FA[g].replace(/\s*\(.*\)/, '')}</button>)}
          </div>
        </div>
        <div className="dv-buckets" role="group" aria-label="وضعیت صورتجلسات">
          <button type="button" className={!bk ? 'on' : undefined} onClick={() => setBk('')}>همه <em>{fa(shown.length)}</em></button>
          {BUCKET.map((b) => <button key={b.k} type="button" className={`dv-b-${b.k}${bk === b.k ? ' on' : ''}`} onClick={() => setBk(bk === b.k ? '' : b.k)} aria-pressed={bk === b.k}><i aria-hidden />{b.title} <em>{fa(counts[b.k])}</em></button>)}
        </div>
        {buckets.length === 0 && <p className="im-helper" style={{ margin: 0 }}>صورتجلسه‌ای با این شرایط پیدا نشد.</p>}
        {buckets.map((b) => (
          <div key={b.k} className={`dv-bucket dv-b-${b.k}`}>
            <div className="dv-bucket-h"><b>{b.title}</b><em>{fa(b.cells.length)}</em><small>{b.hint}</small></div>
            <div className="dv-grid">
              {b.cells.map((c) => { const f = FORM_BY_KEY[c.formKey]; const closed = isClosed(c.state); const Sub = FORM_ICON[c.formKey] ?? ClipboardList
                return (
                  <button key={c.formKey} type="button" className={`dv-tile dv-${c.state}`} onClick={() => act(c)} disabled={!c.report && !canRecord} title={closed ? 'ارسال شده — فقط مشاهده' : undefined}>
                    <span className="dv-subj"><Sub size={22} strokeWidth={1.7} aria-hidden /></span>
                    <span className="dv-main"><b>{f.title}</b><small style={{ ['--g' as string]: GROUP_COLOR[f.group] }} className="dv-gtag">{FORM_GROUP_LABEL_FA[f.group].replace(/\s*\(.*\)/, '')}</small></span>
                    <span className="dv-state"><Icon c={c} />{c.report && c.state !== 'rejected' ? `${c.report.reportNo} · ` : ''}{STATE_FA[c.state]}</span>
                  </button>
                ) })}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
