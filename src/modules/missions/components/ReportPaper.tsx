import { FarinMark } from '../../../components/common/Logo'
import { faNum, shamsi, shamsiLong } from '../lib/fa'
import { OVERALL_STATUS_LABEL } from '../lib/reportBuilder'
import { FINDING_KIND_SHORT, VISIT_TYPE_LABEL, type Mission, type Report, type ReportContent } from '../types'

const STATUS_COLOR = { on_track: '#047857', attention: '#b45309', critical: '#b91c1c' } as const

/**
 * The official, printable management report. Deliberately a light "paper" regardless of app theme:
 * it is the artefact that gets read by senior managers and printed/PDF'd.
 */
export function ReportPaper({ mission, content, report, projectName }: { mission: Mission; content: ReportContent; report: Report | null; projectName: string }) {
  const c = content
  const gap = c.progress.planned != null && c.progress.actual != null ? c.progress.planned - c.progress.actual : null
  return (
    <article className="ms-paper" aria-label="گزارش بازدید پروژه">
      <header className="flex items-start justify-between gap-4 border-b-2 pb-4" style={{ borderColor: '#1c1917' }}>
        <div>
          <p className="ms-paper-k">گزارش رسمی بازدید پروژه</p>
          <h1 className="mt-1 text-[22px] font-black leading-9" style={{ color: '#1c1917' }}>{projectName}</h1>
          <p className="ms-paper-k">{mission.code} · {VISIT_TYPE_LABEL[mission.visitType]} · {shamsiLong(mission.startDate)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <FarinMark size={40} />
          <span className="rounded-full px-3 py-0.5 text-[11px] font-extrabold text-white" style={{ background: STATUS_COLOR[c.overallStatus] }}>وضعیت کلی: {OVERALL_STATUS_LABEL[c.overallStatus]}</span>
        </div>
      </header>

      <section className="mt-5 rounded-lg border p-4" style={{ borderColor: '#d6d3d1', background: '#f5f3ee' }}>
        <h2 style={{ margin: 0, border: 'none', paddingBottom: 0, fontSize: 14 }}>خلاصه مدیریتی</h2>
        <p style={{ marginTop: 6 }}>{c.executiveSummary}</p>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="پیشرفت واقعی" value={c.progress.actual != null ? `${faNum(c.progress.actual)}٪` : '—'} />
        <Stat label="پیشرفت برنامه‌ای" value={c.progress.planned != null ? `${faNum(c.progress.planned)}٪` : '—'} sub={gap != null ? (gap > 0 ? `${faNum(gap)} واحد عقب` : gap < 0 ? `${faNum(-gap)} واحد جلوتر` : 'مطابق برنامه') : undefined} />
        <Stat label="مسئله / ریسک" value={`${faNum(c.counts.issue)} / ${faNum(c.counts.risk)}`} />
        <Stat label="اقدام / تعهد / تصمیم" value={`${faNum(c.counts.action)} / ${faNum(c.counts.commitment)} / ${faNum(c.counts.decision)}`} />
      </div>

      {c.sections.map((s) => (
        <section key={s.key}>
          <h2>{s.title}</h2>
          {s.body && <p>{s.body}</p>}
          {s.bullets && s.bullets.length > 0 && (
            <ul>
              {s.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <footer className="mt-8 grid grid-cols-2 gap-6 border-t pt-4 text-[12px]" style={{ borderColor: '#d6d3d1', color: '#57534e' }}>
        <div>
          <p>تهیه‌کننده: <b style={{ color: '#1c1917' }}>{mission.requesterName}</b></p>
          <p>تاریخ ارسال: {shamsi(mission.reportSubmittedAt)}</p>
        </div>
        <div>
          <p>تأییدکننده: <b style={{ color: '#1c1917' }}>{mission.approverName || '—'}</b></p>
          <p>تأیید نهایی: {mission.finalApprovedAt ? shamsi(mission.finalApprovedAt) : 'در انتظار'}</p>
        </div>
        <p className="col-span-2 ms-paper-k">
          نسخه {faNum(report?.version ?? 1)} · امتیاز کیفیت گزارش: {mission.qualityScore != null ? faNum(Math.round(mission.qualityScore)) : '—'} از ۱۰۰ · تهیه‌شده با دستیار گزارش‌گیری ({c.generatedBy === 'rules' ? 'موتور قواعد' : 'هوش مصنوعی'}) و تأییدشده توسط بازدیدکننده. انواع موارد: {Object.entries(FINDING_KIND_SHORT).slice(0, 5).map(([, v]) => v).join('، ')}.
        </p>
      </footer>
    </article>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: '#d6d3d1' }}>
      <p className="ms-paper-k">{label}</p>
      <p className="text-[20px] font-black leading-8" style={{ color: '#1c1917' }}>{value}</p>
      {sub && <p className="ms-paper-k">{sub}</p>}
    </div>
  )
}
