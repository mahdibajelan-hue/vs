import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, ClipboardList, Eye, FilePen, Lock, Plus, RotateCcw } from 'lucide-react'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { useLookupOptions } from '../../material/lib/control/lookups'
import { FORMS, FORM_BY_KEY, FORM_GROUP_LABEL_FA, inScope, type FormGroup } from '../lib/formCatalog'
import { dayBoard, dayCell, isClosed, type DayCell } from '../lib/dayBoard'
import { REPORT_STATUS_LABEL_FA } from '../types'
import { fa } from '../components/common'
import type { ExecutionModel } from '../lib/useExecutionModel'

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
  const groups = (Object.keys(FORM_GROUP_LABEL_FA) as FormGroup[]).map((g) => ({ g, cells: board.cells.filter((c) => FORM_BY_KEY[c.formKey]?.group === g) })).filter((x) => x.cells.length)
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
        <p className="im-helper" style={{ margin: 0 }}>هر صورتجلسه روزی یک‌بار برای هر جبهه؛ پس از ارسال فقط قابل مشاهده است.</p>
        {groups.map(({ g, cells }) => (
          <div key={g} style={{ display: 'grid', gap: 8 }}>
            <div className="dv-group">{FORM_GROUP_LABEL_FA[g]}</div>
            <div className="dv-grid">
              {cells.map((c) => { const f = FORM_BY_KEY[c.formKey]; const closed = isClosed(c.state)
                return (
                  <button key={c.formKey} type="button" className={`dv-tile dv-${c.state}`} onClick={() => act(c)} disabled={!c.report && !canRecord} title={closed ? 'ارسال شده — فقط مشاهده' : undefined}>
                    <span className="dv-ico"><Icon c={c} /></span>
                    <span className="dv-main"><b>{f.title}</b></span>
                    <span className="dv-state">{c.report && c.state !== 'rejected' ? `${c.report.reportNo} · ` : ''}{STATE_FA[c.state]}</span>
                  </button>
                ) })}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
