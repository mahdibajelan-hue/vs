import { useEffect, useState, type ReactNode } from 'react'
import { FarinMark, cleanSignatureImage } from '../platform'
import { faNum, shamsi, shamsiLong } from '../lib/fa'
import { OVERALL_STATUS_LABEL } from '../lib/reportBuilder'
import { DISCIPLINE_LABEL } from '../lib/discipline'
import { buildVisuals, KIND_COLOR, SEVERITY_COLOR, SEVERITY_FA, type IssueRow, type OwnedRow } from '../lib/reportVisuals'
import { Bars, Donut, ProgressCompare, QualityRing, RiskMatrix, SeverityStack } from './ReportCharts'
import { OBJECTIVE_STATUS_LABEL, VISIT_TYPE_LABEL, type Finding, type Mission, type Objective, type Report, type ReportContent } from '../types'

const STATUS_COLOR = { on_track: '#047857', attention: '#b45309', critical: '#b91c1c' } as const
const OBJ_COLOR: Record<string, string> = { achieved: '#059669', partial: '#d97706', not_achieved: '#b91c1c', follow_up: '#7c3aed', pending: '#78716c' }

/**
 * The official, printable management report. Deliberately a light "paper" regardless of app theme:
 * it is the artefact that gets read by senior managers and printed/PDF'd.
 *
 * Layout: cover band → mission card → executive summary → KPI strip → visual overview (charts) → numbered
 * sections, with decisions & resolutions, actions, issues and risks as tables carrying owner and due date →
 * signature block. Charts and tables are drawn from the live findings, so they always match the findings list.
 */
export function ReportPaper({
  mission,
  content,
  report,
  projectName,
  findings,
  objectives,
}: {
  mission: Mission
  content: ReportContent
  report: Report | null
  projectName: string
  findings: Finding[]
  objectives: Objective[]
}) {
  const c = content
  const v = buildVisuals(findings, objectives)
  // A lawyer's or HSE officer's visit is not about physical progress — don't show an empty progress gauge for them.
  const hasProgress = c.progress.actual != null || c.progress.planned != null || !['hse', 'legal', 'finance', 'hr_admin'].includes(mission.discipline)
  const sig = report?.signature ?? null
  const narrative = (key: string) => c.sections.find((s) => s.key === key)
  let n = 0
  const H = (title: string, extra?: ReactNode) => (
    <h2 className="ms-paper-h">
      <span className="ms-paper-num">{faNum(++n)}</span>
      {title}
      {extra}
    </h2>
  )

  return (
    <article className="ms-paper" aria-label="گزارش بازدید پروژه">
      {/* ------------------------------------------------------------------ cover band */}
      <header className="ms-paper-cover">
        <div className="min-w-0">
          <p className="ms-paper-eyebrow">گزارش رسمی بازدید پروژه</p>
          <h1 className="ms-paper-title">{projectName}</h1>
          <p className="ms-paper-sub">{mission.code} · {VISIT_TYPE_LABEL[mission.visitType]} · {shamsiLong(mission.startDate)}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="ms-paper-logo"><FarinMark size={34} /></span>
          <span className="ms-paper-status" style={{ background: STATUS_COLOR[c.overallStatus] }}>وضعیت کلی: {OVERALL_STATUS_LABEL[c.overallStatus]}</span>
        </div>
      </header>

      <dl className="ms-paper-meta">
        <div><dt>حوزه کاری</dt><dd>{DISCIPLINE_LABEL[mission.discipline] ?? '—'}</dd></div>
        {mission.companions.length > 0 && <div><dt>همراهان</dt><dd>{mission.companions.join('، ')}</dd></div>}
        <div><dt>مسیر سفر</dt><dd>{mission.originCity && mission.destinationCity ? `${mission.originCity} ← ${mission.destinationCity}` : mission.destination || '—'}</dd></div>
        <div><dt>بازدیدکننده</dt><dd>{mission.requesterName}{mission.requesterPosition ? ` — ${mission.requesterPosition}` : ''}</dd></div>
        <div><dt>مقصد</dt><dd>{mission.destination || '—'}</dd></div>
        <div><dt>تاریخ بازدید</dt><dd>{shamsiLong(mission.startDate)} تا {shamsiLong(mission.endDate)}</dd></div>
        <div><dt>ملاقات‌شوندگان</dt><dd>{mission.visitees.length ? mission.visitees.map((x) => [x.name, x.org].filter(Boolean).join(' / ')).join('، ') : '—'}</dd></div>
      </dl>

      <section className="ms-paper-summary">
        <h2 style={{ margin: 0, border: 'none', padding: 0, fontSize: 14 }}>خلاصه مدیریتی</h2>
        <p style={{ marginTop: 6, marginBottom: 0 }}>{c.executiveSummary}</p>
      </section>

      {/* ------------------------------------------------------------------ KPI strip */}
      <div className="ms-paper-kpis">
        {hasProgress && <Kpi label="پیشرفت واقعی" value={c.progress.actual != null ? `${faNum(c.progress.actual)}٪` : '—'} sub={c.progress.planned != null ? `برنامه ${faNum(c.progress.planned)}٪` : undefined} />}
        <Kpi label="مسئله / ریسک" value={`${faNum(v.kinds[0].count)} / ${faNum(v.kinds[1].count)}`} sub={v.severity.critical + v.severity.high ? `${faNum(v.severity.critical + v.severity.high)} مورد مهم` : 'بدون مورد مهم'} />
        <Kpi label="مصوبه / اقدام" value={`${faNum(v.decisions.length)} / ${faNum(v.actions.length)}`} sub={`${faNum([...v.decisions, ...v.actions].filter((r) => !r.owner || (!r.dueIso && !r.dueText)).length)} بدون مسئول یا موعد`} />
        <Kpi label="تحقق اهداف" value={v.objectives.total ? `${faNum(v.objectives.percent)}٪` : '—'} sub={v.objectives.total ? `${faNum(v.objectives.achieved)} از ${faNum(v.objectives.total)} کامل` : undefined} />
        <div className="ms-paper-kpi" style={{ alignItems: 'center' }}>
          <p className="ms-paper-k">کیفیت گزارش</p>
          <QualityRing value={mission.qualityScore} />
        </div>
      </div>

      {/* ------------------------------------------------------------------ charts */}
      <section>
        <h2 className="ms-paper-h ms-paper-h-plain">نمای تصویری بازدید</h2>
        <div className="ms-paper-charts">
          {hasProgress && <Chart title="پیشرفت واقعی در برابر برنامه"><ProgressCompare planned={c.progress.planned} actual={c.progress.actual} /></Chart>}
          <Chart title="تحقق اهداف مأموریت">
            {v.objectives.total ? (
              <Donut
                center={`${faNum(v.objectives.percent)}٪`}
                sub="تحقق"
                segments={[
                  { label: 'کامل', value: v.objectives.achieved, color: OBJ_COLOR.achieved },
                  { label: 'نسبی', value: v.objectives.partial, color: OBJ_COLOR.partial },
                  { label: 'محقق نشد', value: v.objectives.notAchieved, color: OBJ_COLOR.not_achieved },
                  { label: 'سایر', value: v.objectives.other, color: OBJ_COLOR.pending },
                ].filter((s) => s.value > 0)}
              />
            ) : <p className="ms-paper-k">هدفی ثبت نشده بود.</p>}
          </Chart>
          <Chart title="یافته‌ها بر حسب نوع"><Bars rows={v.kinds.map((k) => ({ label: k.label, value: k.count, color: k.color }))} /></Chart>
          <Chart title="شدت مسائل و ریسک‌ها"><SeverityStack counts={v.severity} /></Chart>
          {v.disciplines.length > 0 && (
            <Chart title="مسائل و ریسک‌ها به تفکیک حوزه">
              <Bars rows={v.disciplines.map((d) => ({ label: d.label, value: d.issues + d.risks, color: '#57534e' }))} />
            </Chart>
          )}
          <Chart title="ماتریس احتمال × اثر" wide>
            <div className="flex items-center gap-3">
              <RiskMatrix points={v.matrix} />
              <ol className="ms-paper-legend">
                {v.matrix.slice(0, 8).map((p) => (
                  <li key={p.n}><span style={{ background: KIND_COLOR[p.kind] }}>{faNum(p.n)}</span>{p.title.length > 38 ? p.title.slice(0, 38) + '…' : p.title}</li>
                ))}
              </ol>
            </div>
          </Chart>
        </div>
      </section>

      {/* ------------------------------------------------------------------ narrative + tables */}
      {narrative('progress') && (
        <section>
          {H('وضعیت پیشرفت پروژه')}
          <p>{narrative('progress')!.body}</p>
        </section>
      )}

      {narrative('findings') && (
        <section>
          {H('یافته‌های بازدید به تفکیک حوزه')}
          {narrative('findings')!.body && <p>{narrative('findings')!.body}</p>}
          {narrative('findings')!.bullets && <ul>{narrative('findings')!.bullets!.map((b, i) => <li key={i}>{b}</li>)}</ul>}
        </section>
      )}

      <section>
        {H('تصمیمات و مصوبات', <span className="ms-paper-count">{faNum(v.decisions.length)} مورد</span>)}
        {v.decisions.length ? <OwnedTable rows={v.decisions} first="مصوبه یا تعهد" showKind /> : <p>تصمیم یا توافق مشخصی در این بازدید ثبت نشد.</p>}
      </section>

      <section>
        {H('اقدامات موردنیاز', <span className="ms-paper-count">{faNum(v.actions.length)} مورد</span>)}
        {v.actions.length ? <OwnedTable rows={v.actions} first="اقدام" /> : <p>اقدام جدیدی ثبت نشد.</p>}
      </section>

      <section>
        {H('مسائل و موانع', <span className="ms-paper-count">{faNum(v.issues.length)} مورد</span>)}
        {v.issues.length ? <IssueTable rows={v.issues} base={0} /> : <p>مسئله یا مانع جدیدی گزارش نشد.</p>}
      </section>

      <section>
        {H('ریسک‌ها', <span className="ms-paper-count">{faNum(v.risks.length)} مورد</span>)}
        {v.risks.length ? <IssueTable rows={v.risks} base={v.issues.length} risk /> : <p>ریسک جدیدی شناسایی نشد.</p>}
      </section>

      <section>
        {H('میزان تحقق اهداف مأموریت')}
        {objectives.length ? (
          <table className="ms-paper-table">
            <thead><tr><th style={{ width: 28 }}>#</th><th>هدف</th><th style={{ width: 92 }}>وضعیت</th><th>توضیح</th></tr></thead>
            <tbody>
              {objectives.map((o, i) => (
                <tr key={o.id}>
                  <td className="ms-paper-c">{faNum(i + 1)}</td>
                  <td><b>{o.title}</b>{o.measure && <span className="ms-paper-k block">معیار: {o.measure}</span>}</td>
                  <td><span className="ms-paper-chip" style={{ background: OBJ_COLOR[o.status] ?? OBJ_COLOR.pending }}>{OBJECTIVE_STATUS_LABEL[o.status]}</span></td>
                  <td>{o.resultNote || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p>هدفی ثبت نشده بود.</p>}
      </section>

      {narrative('recommendations') && (
        <section>
          {H('پیشنهادات')}
          {narrative('recommendations')!.bullets?.length ? <ul>{narrative('recommendations')!.bullets!.map((b, i) => <li key={i}>{b}</li>)}</ul> : <p>{narrative('recommendations')!.body}</p>}
        </section>
      )}

      {narrative('evidence') && (
        <section>
          {H('مستندات و تصاویر')}
          <p>{narrative('evidence')!.body}</p>
          {narrative('evidence')!.bullets?.length ? <ul>{narrative('evidence')!.bullets!.map((b, i) => <li key={i}>{b}</li>)}</ul> : null}
        </section>
      )}

      {/* ------------------------------------------------------------------ signatures */}
      <section className="ms-paper-sign">
        <div className="ms-paper-signbox">
          <p className="ms-paper-k">تهیه‌کننده</p>
          <div className="ms-paper-signimg">
            {sig ? <SignatureImage src={sig.image} name={sig.name} /> : <span className="ms-paper-k">محل امضا — پس از ارسال گزارش درج می‌شود</span>}
          </div>
          <p style={{ margin: 0 }}><b>{sig?.name ?? mission.requesterName}</b></p>
          <p className="ms-paper-k" style={{ margin: 0 }}>{sig?.position ?? mission.requesterPosition}{sig ? ` · ${shamsi(sig.signedAt)}` : mission.reportSubmittedAt ? ` · ${shamsi(mission.reportSubmittedAt)}` : ''}</p>
        </div>
        <div className="ms-paper-signbox">
          <p className="ms-paper-k">تأییدکننده (مجری طرح)</p>
          <div className="ms-paper-signimg">
            {mission.finalApprovedAt ? <span className="ms-paper-stamp">تأیید شد<br />{shamsi(mission.finalApprovedAt)}</span> : <span className="ms-paper-k">در انتظار تأیید</span>}
          </div>
          <p style={{ margin: 0 }}><b>{mission.approverName || '—'}</b></p>
        </div>
      </section>

      <footer className="ms-paper-foot">
        نسخه {faNum(report?.version ?? 1)} · امتیاز کیفیت گزارش: {mission.qualityScore != null ? faNum(Math.round(mission.qualityScore)) : '—'} از ۱۰۰ · تهیه‌شده با دستیار گزارش‌گیری ({c.generatedBy === 'rules' ? 'موتور قواعد' : 'هوش مصنوعی'}) و تأییدشده توسط بازدیدکننده · {mission.code}
      </footer>
    </article>
  )
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="ms-paper-kpi">
      <p className="ms-paper-k">{label}</p>
      <p className="ms-paper-kv">{value}</p>
      {sub && <p className="ms-paper-k" style={{ margin: 0 }}>{sub}</p>}
    </div>
  )
}

function Chart({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="ms-paper-chart" style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <p className="ms-paper-chart-t">{title}</p>
      {children}
    </div>
  )
}

function DueCell({ iso, text, optional }: { iso: string | null; text: string; optional?: boolean }) {
  if (iso) return <>{shamsiLong(iso)}</>
  if (text) return <>{text}</>
  return optional ? <>—</> : <span className="ms-paper-missing">تعیین نشده</span>
}

function OwnedTable({ rows, first, showKind }: { rows: OwnedRow[]; first: string; showKind?: boolean }) {
  return (
    <table className="ms-paper-table">
      <thead>
        <tr>
          <th style={{ width: 28 }}>#</th>
          <th>{first}</th>
          {showKind && <th style={{ width: 64 }}>نوع</th>}
          <th style={{ width: 150 }}>مسئول اقدام</th>
          <th style={{ width: 120 }}>مهلت اجرا</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id}>
            <td className="ms-paper-c">{faNum(i + 1)}</td>
            <td><b>{r.title}</b>{r.note && <span className="ms-paper-k block">{r.note}</span>}</td>
            {showKind && <td><span className="ms-paper-chip" style={{ background: KIND_COLOR[r.kind] }}>{r.kind === 'decision' ? 'مصوبه' : 'تعهد'}</span></td>}
            <td>{r.owner || <span className="ms-paper-missing">تعیین نشده</span>}</td>
            <td><DueCell iso={r.dueIso} text={r.dueText} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function IssueTable({ rows, base, risk }: { rows: IssueRow[]; base: number; risk?: boolean }) {
  return (
    <table className="ms-paper-table">
      <thead>
        <tr>
          <th style={{ width: 28 }}>#</th>
          <th>{risk ? 'ریسک' : 'مسئله'}</th>
          <th style={{ width: 62 }}>شدت</th>
          <th>{risk ? 'پیامد' : 'علت و اثر'}</th>
          <th style={{ width: 110 }}>{risk ? 'مالک' : 'طرف مسئول'}</th>
          <th style={{ width: 100 }}>{risk ? 'کنترل تا' : 'تاریخ رفع'}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id}>
            <td className="ms-paper-c">{faNum(base + i + 1)}</td>
            <td><b>{r.title}</b></td>
            <td><span className="ms-paper-chip" style={{ background: SEVERITY_COLOR[r.severity] }}>{SEVERITY_FA[r.severity]}</span></td>
            <td>{[r.cause && `علت: ${r.cause}`, r.impact && `اثر: ${r.impact}`].filter(Boolean).join(' · ') || '—'}</td>
            <td>{r.owner || '—'}</td>
            <td><DueCell iso={r.dueIso} text={r.dueText} optional={risk} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** The frozen signature, with any black slabs left by older uploads (transparent margins flattened to black) removed on the fly. */
function SignatureImage({ src, name }: { src: string; name: string }) {
  const [clean, setClean] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setClean(null)
    cleanSignatureImage(src)
      .then((c) => live && c && setClean(c))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [src])
  return <img src={clean ?? src} alt={`امضای ${name}`} />
}
