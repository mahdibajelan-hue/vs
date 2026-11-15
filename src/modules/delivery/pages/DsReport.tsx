import { Printer, Sparkles } from 'lucide-react'
import type { Result } from '../lib/engine'
import type { Answers } from '../lib/questions'
import { buildReport, narrativeItems, openReport, type Block, type ReportMeta } from '../lib/report'
import type { Version } from '../repo'
import { fa } from '../lib/useLive'

function B({ b }: { b: Block }) {
  if ('p' in b) return <p>{b.p}</p>
  if ('note' in b) return <p className="ds-muted">{b.note}</p>
  if ('ul' in b) return b.ul.length ? <ul>{b.ul.map((x, i) => <li key={i}>{x}</li>)}</ul> : null
  if ('bars' in b) return <ul className="ds-rbars">{b.bars.map((x) => <li key={x.label} className={x.tone ? `is-${x.tone}` : ''}><span>{x.label}</span><i><b style={{ width: `${Math.max(2, (x.value / x.max) * 100)}%` }} /></i><em>{fa(x.value, 1)}</em></li>)}</ul>
  return (
    <div className="ds-scroll"><table className="ds-tbl">
      <thead><tr>{b.table.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>{b.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>)}</tr>)}</tbody>
    </table></div>
  )
}

export function DsReport({ r, answers, meta, version, canNarrate, busy, onNarrate, canExport, saved }: { r: Result; answers: Answers; meta: ReportMeta; version: Version | null; canNarrate: boolean; busy: boolean; onNarrate: () => void; canExport: boolean; saved: boolean }) {
  const sections = buildReport(r, answers, meta)
  const narrative = saved ? version?.narrative ?? null : null
  return (
    <div className="ds-report">
      <div className="ds-report-bar">
        <p>{saved ? `گزارش نسخهٔ ${fa(meta.version)} (ثبت‌شده و غیرقابل‌تغییر).` : 'پیش‌نمایش پیش‌نویس — برای گزارش رسمی، ابتدا تحلیل را در «تصمیم و نسخه‌ها» ثبت کنید.'}</p>
        <div>
          <button type="button" className="ds-btn is-ghost" disabled={!saved || !canNarrate || busy || !!version?.narrative} onClick={onNarrate} title={version?.narrative ? 'خلاصهٔ هوشمند این نسخه پیش‌تر ساخته شده است' : undefined}><Sparkles size={15} aria-hidden />خلاصهٔ هوشمند</button>
          <button type="button" className="ds-btn" disabled={!canExport} onClick={() => { if (!openReport(sections, meta, narrative)) alert('پنجرهٔ چاپ باز نشد؛ اجازهٔ پنجرهٔ بازشو را بدهید.') }}><Printer size={15} aria-hidden />چاپ / PDF</button>
        </div>
      </div>
      <article className="ds-doc">
        <header className="ds-doc-h"><small>{meta.projectName}</small><h2>گزارش توجیهی انتخاب روش و راهبرد اجرای پروژه</h2><p>{meta.studyTitle} · نسخهٔ {fa(meta.version)} · {meta.status} · {meta.date} · موتور {meta.engine}</p></header>
        {sections.map((s) => (
          <section key={s.n}>
            <h3><span>{fa(s.n)}</span>{s.title}</h3>
            {s.n === 1 && narrative && narrative.sentences.length > 0 && (
              <aside className="ds-ai" aria-label="متن دستیار هوشمند">
                <h4><Sparkles size={13} aria-hidden />بازنویسی دستیار هوشمند</h4>
                <p className="ds-muted">فقط یافته‌های موتور را بازنویسی می‌کند؛ هر جمله به شناسهٔ یافته ارجاع دارد و جمله‌های بدون پشتوانه کنار گذاشته شده‌اند ({fa(narrative.rejected)}).</p>
                {narrative.sentences.map((x, i) => <p key={i}>{x.text} <small>[{x.refs.join('، ')}]</small></p>)}
              </aside>
            )}
            {s.blocks.map((b, i) => <B key={i} b={b} />)}
          </section>
        ))}
      </article>
      <p className="ds-muted">شناسه‌های یافته که دستیار هوشمند می‌تواند به آن‌ها ارجاع دهد: {narrativeItems(r).map((x) => x.id).join('، ')}.</p>
    </div>
  )
}
