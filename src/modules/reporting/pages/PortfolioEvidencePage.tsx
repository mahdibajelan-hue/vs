import { useEffect, useMemo, useState } from 'react'
import { Layers, Loader2 } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { loadEvidenceReport } from '../lib/evidenceLoader'
import type { EvidenceReport } from '../lib/evidenceReport'
import { rollupEvidence } from '../lib/portfolioEvidence'
import '../components/evidence.css'

const fa = (n: number) => n.toLocaleString('fa-IR')
const CONF_FA = { high: 'اطمینان بالا', medium: 'اطمینان متوسط', low: 'اطمینان پایین' } as const

/** The evidence report of every project in a portfolio or program, rolled up — each line names the project it comes from. */
export function PortfolioEvidencePage() {
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const projects = useMasterDataStore((s) => s.projects)
  const [portfolioId, setPortfolioId] = useState<string>('')
  const [programId, setProgramId] = useState<string>('')
  const [reports, setReports] = useState<Map<string, { report: EvidenceReport; hasMetrics: boolean }>>(new Map())
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })

  const scope = useMemo(() => projects.filter((p) => (programId ? p.programId === programId : portfolioId ? p.portfolioId === portfolioId : true)), [projects, portfolioId, programId])

  useEffect(() => {
    let live = true
    const todo = scope.filter((p) => !reports.has(p.id))
    setProgress({ done: scope.length - todo.length, total: scope.length })
    let i = 0
    const worker = async () => {
      while (i < todo.length && live) {
        const p = todo[i++]
        try {
          const { report, input } = await loadEvidenceReport(p.id, p.officialName)
          if (!live) return
          setReports((m) => new Map(m).set(p.id, { report, hasMetrics: !!input.metrics }))
        } catch { /* a project that fails stays out of the roll-up and is counted below */ }
        if (live) setProgress((x) => ({ ...x, done: x.done + 1 }))
      }
    }
    void Promise.all([worker(), worker(), worker()])
    return () => { live = false }
  }, [scope]) // eslint-disable-line react-hooks/exhaustive-deps

  const list = scope.filter((p) => reports.has(p.id)).map((p) => ({ projectId: p.id, ...reports.get(p.id)! }))
  const r = useMemo(() => rollupEvidence(list), [list.length, scope]) // eslint-disable-line react-hooks/exhaustive-deps
  const loading = progress.done < progress.total
  const maxKind = Math.max(1, ...r.byKind.map((k) => k.projects))

  return (
    <div className="mx-auto max-w-5xl space-y-3" dir="rtl">
      <div className="glass-panel flex flex-wrap items-center gap-2 rounded-2xl p-3">
        <Layers size={15} className="text-sky-300" />
        <select value={portfolioId} onChange={(e) => { setPortfolioId(e.target.value); setProgramId('') }} className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs">
          <option value="">همهٔ پورتفولیوها</option>
          {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={programId} onChange={(e) => setProgramId(e.target.value)} className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs">
          <option value="">همهٔ طرح‌ها</option>
          {programs.filter((p) => !portfolioId || p.portfolioId === portfolioId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {loading && <span className="flex items-center gap-1 text-[11px] text-muted"><Loader2 size={12} className="animate-spin" /> گزارش پروژه‌ها {fa(progress.done)} از {fa(progress.total)}</span>}
        <span className="ms-auto text-[11px] text-muted">همان موتور گزارش پروژه، برای هر پروژه جدا؛ در سطح سبد چیزی دوباره محاسبه نمی‌شود.</span>
      </div>

      <div className="ev">
        <div className="ev-headline"><b>در یک نگاه — {fa(r.projects)} پروژه{r.projects < scope.length ? ` (از ${fa(scope.length)})` : ''}</b><ul>{r.headline.map((h, i) => <li key={i}>{h}</li>)}</ul></div>

        <section className="ev-q">
          <header><span className="ev-n">{fa(1)}</span><div><h3>انحراف‌های مهم بر حسب نوع</h3><p>تعداد پروژه‌هایی که دست‌کم یک یافتهٔ «مهم» از هر نوع دارند.</p></div></header>
          {!r.byKind.length ? <p className="ev-empty">انحراف مهمی ثبت نشد.</p> : (
            <ul className="ev-list">{r.byKind.map((k) => (
              <li key={k.kind}><div className="ev-frow"><b>{k.label}</b><span className="ev-muted">{fa(k.projects)} پروژه · {fa(k.findings)} یافته</span></div>
                <div style={{ height: 6, borderRadius: 99, background: 'var(--border-soft)', marginTop: 6 }}><div style={{ width: `${(k.projects / maxKind) * 100}%`, height: 6, borderRadius: 99, background: '#ef4444' }} /></div></li>
            ))}</ul>
          )}
        </section>

        <section className="ev-q">
          <header><span className="ev-n">{fa(2)}</span><div><h3>پروژه‌هایی که توجه می‌خواهند</h3><p>به ترتیب تعداد یافتهٔ مهم؛ متن هر یافته از گزارش همان پروژه است.</p></div></header>
          {!r.hotspots.length ? <p className="ev-empty">هیچ پروژه‌ای یافتهٔ مهم ندارد.</p> : (
            <ol className="ev-findings">{r.hotspots.map((h) => (
              <li key={h.projectId} className="is-material">
                <div className="ev-frow"><b>{h.project}</b><span className="ev-tag" style={{ ['--c' as string]: h.confidence === 'low' ? '#ef4444' : h.confidence === 'medium' ? '#f59e0b' : '#22c55e' }}>{CONF_FA[h.confidence]}</span>{h.decisionsOverdue > 0 && <span className="ev-tag" style={{ ['--c' as string]: '#ef4444' }}>{fa(h.decisionsOverdue)} تصمیم معوق</span>}</div>
                <ul className="ev-src">{h.material.slice(0, 4).map((f) => <li key={f.id}><b>{f.title}:</b> {f.statement}</li>)}{h.material.length > 4 && <li>و {fa(h.material.length - 4)} یافتهٔ مهم دیگر</li>}</ul>
              </li>
            ))}</ol>
          )}
        </section>

        <section className="ev-q">
          <header><span className="ev-n">{fa(3)}</span><div><h3>علت‌های مشترک</h3><p>شاهدی که در گزارش بیش از یک پروژه آمده (همان علت توقف یا همان مانع گیت) — نشانهٔ مسئلهٔ سطح سبد.</p></div></header>
          {!r.sharedCauses.length ? <p className="ev-empty">علت مشترکی بین پروژه‌ها دیده نشد.</p> : (
            <ul className="ev-list">{r.sharedCauses.slice(0, 8).map((c) => <li key={c.text}><b>«{c.text}»</b> <span className="ev-muted">— {c.projects.join('، ')}</span></li>)}</ul>
          )}
        </section>

        <section className="ev-q">
          <header><span className="ev-n">{fa(4)}</span><div><h3>تصمیم‌های لازم</h3><p>از همهٔ پروژه‌ها؛ معوق‌ها اول.</p></div></header>
          {!r.decisions.length ? <p className="ev-empty">تصمیمی در انتظار نیست.</p> : (
            <ul className="ev-list">{r.decisions.slice(0, 15).map((d, i) => (
              <li key={i}><div className="ev-frow"><b>{d.title}</b><span className="ev-muted">{d.project}</span>{d.overdue && <span className="ev-tag" style={{ ['--c' as string]: '#ef4444' }}>موعد گذشته</span>}<span className="ev-tag" style={{ ['--c' as string]: d.level === 'portfolio' ? '#a78bfa' : d.level === 'gate' ? '#0ea5e9' : '#94a3b8' }}>{d.level === 'portfolio' ? 'سطح سبد' : d.level === 'gate' ? 'کمیتهٔ گیت' : 'پروژه'}</span></div></li>
            ))}</ul>
          )}
        </section>

        <section className="ev-q">
          <header><span className="ev-n">{fa(5)}</span><div><h3>اقدام‌های فوری</h3><p>توصیه‌های «فوری» گزارش هر پروژه.</p></div></header>
          {!r.recommendations.length ? <p className="ev-empty">اقدام فوری‌ای نیست.</p> : (
            <ol className="ev-recs">{r.recommendations.slice(0, 15).map((x, i) => <li key={i}>{x.text} <span className="ev-muted">— {x.project}{x.owner ? ` · مسئول: ${x.owner}` : ''}</span></li>)}</ol>
          )}
        </section>

        <section className="ev-q">
          <header><span className="ev-n">{fa(6)}</span><div><h3>قابلیت اتکا</h3></div></header>
          <p className="ev-muted">{fa(r.withData)} پروژه شاخص‌های پیشرفت دارند · اطمینان بالا {fa(r.confidence.high)} · متوسط {fa(r.confidence.medium)} · پایین {fa(r.confidence.low)}{scope.length > list.length && !loading ? ` · ${fa(scope.length - list.length)} پروژه بارگذاری نشد` : ''}</p>
        </section>
      </div>
    </div>
  )
}
