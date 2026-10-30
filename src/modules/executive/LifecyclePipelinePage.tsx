import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Activity, ArrowRight, CheckCircle2, ChevronDown, Circle, CircleDot, Clock3, ExternalLink, FileSpreadsheet, Flag, Hourglass, Layers, Loader2, Printer, Search, TimerOff } from 'lucide-react'
import { formatJalali } from '../../lib/jalali'
import { useModuleStore } from '../../store/useModuleStore'
import { hasModuleAccess, useModuleAccessStore } from '../../store/useModuleAccessStore'
import { downloadXlsx, printTable } from '../risk/lib/riskExport'
import { buildPipeline, countByPhase, STALE_DAYS, type PipelineLine } from './lib/lifecyclePipeline'
import { loadPipelineSource, type PipelineSource } from './lib/pipelineData'
import { BarList, Donut, Gauge, KpiTile, Num, PHASE_COLOR, Ring, Seg, StackBar } from './components/viz'
import './pipeline.css'

const fa = (x: number) => x.toLocaleString('fa-IR')
const faDate = (iso: string) => formatJalali(iso.slice(0, 10)).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])
const shareBands = [{ to: 15, color: '#22c55e' }, { to: 35, color: '#f59e0b' }, { to: 100, color: '#ef4444' }]
type Sort = 'phase' | 'days' | 'idle'

/**
 * پروژه‌ها در مراحل چرخهٔ عمر (Stage-Gate، G1…G9): the journey rail shows how many projects stand at each gate; the
 * charts below it pick a phase or a warning; the cards narrow to that pick and each opens to its steps and last action.
 */
export function LifecyclePipelinePage({ onBack }: { onBack: () => void }) {
  const [src, setSrc] = useState<PipelineSource | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [staleOnly, setStaleOnly] = useState(false)
  const [overOnly, setOverOnly] = useState(false)
  const [sort, setSort] = useState<Sort>('phase')
  const [open, setOpen] = useState<string | null>(null)
  const canOpenSg = useModuleAccessStore((s) => hasModuleAccess(s.accessibleModules, 'stagegate'))

  useEffect(() => { loadPipelineSource().then((r) => (r.data ? setSrc(r.data) : setError(r.error ?? 'خطا در دریافت داده'))) }, [])

  const lines = useMemo(() => (src ? buildPipeline(src) : []), [src])
  const phases = useMemo(() => (src ? [...src.phases].sort((a, b) => a.sort - b.sort) : []), [src])
  const counts = useMemo(() => countByPhase(lines, phases), [lines, phases])
  const title = (code: string) => (code === 'done' ? 'پایان چرخه' : code === 'nodata' ? 'بدون دادهٔ گیت' : phases.find((p) => p.code === code)?.title ?? code)
  const codeLabel = (code: string) => (code === 'done' ? '✓' : code === 'nodata' ? '؟' : code)
  const who = (by: string | null) => (!by ? '' : src?.names.get(by.toLowerCase()) ?? by.split('@')[0])
  const overStd = (l: PipelineLine) => { const d = src?.standardDays.get(l.phase); return !!d && l.daysInPhase != null && l.daysInPhase > d }
  const active = (l: PipelineLine) => l.phase !== 'done' && l.phase !== 'nodata'
  const stale = (l: PipelineLine) => active(l) && (l.daysSinceAction == null || l.daysSinceAction > STALE_DAYS)

  const order = useMemo(() => new Map(counts.map((c, i) => [c.code, i])), [counts])
  const needle = q.trim()
  const shown = lines
    .filter((l) => (!phase || l.phase === phase) && (!staleOnly || stale(l)) && (!overOnly || overStd(l)) && (!needle || l.project.includes(needle)))
    .sort((a, b) => sort === 'days' ? (b.daysInPhase ?? -1) - (a.daysInPhase ?? -1)
      : sort === 'idle' ? (b.daysSinceAction ?? 1e6) - (a.daysSinceAction ?? 1e6)
      : (order.get(a.phase) ?? 99) - (order.get(b.phase) ?? 99) || a.project.localeCompare(b.project, 'fa'))
  const activeLines = lines.filter(active)
  const staleCount = lines.filter(stale).length
  const overCount = lines.filter(overStd).length
  const doneCount = lines.filter((l) => l.phase === 'done').length
  const idleDays = activeLines.map((l) => l.daysSinceAction).filter((d): d is number => d != null)
  const avgIdle = idleDays.length ? idleDays.reduce((a, b) => a + b, 0) / idleDays.length : null
  const maxCount = Math.max(1, ...counts.map((c) => c.count))
  const phaseParts = counts.filter((c) => c.count).map(({ code, count }) => ({ key: code, label: `${code === 'done' || code === 'nodata' ? '' : code + ' · '}${title(code)}`, value: count, color: PHASE_COLOR[code] ?? '#64748b' }))
  const longest = [...activeLines].filter((l) => l.daysInPhase != null).sort((a, b) => (b.daysInPhase ?? 0) - (a.daysInPhase ?? 0)).slice(0, 7)

  const exportRows = () => shown.map((l) => [
    l.project, `${active(l) ? l.phase + ' — ' : ''}${title(l.phase)}${l.phase === 'nodata' && src?.stageText.get(l.project) ? ` (در Stage-Gate: ${src.stageText.get(l.project)})` : ''}`,
    l.stepIndex != null ? `${l.stepIndex + 1}. ${l.steps[l.stepIndex].title}` : '—', `${l.stepsDone} از ${l.steps.length}`,
    l.daysInPhase ?? '', l.enteredAt ? formatJalali(l.enteredAt.slice(0, 10)) : '',
    l.lastAction?.text ?? 'اقدامی ثبت نشده', l.lastAction ? formatJalali(l.lastAction.at.slice(0, 10)) : '', who(l.lastAction?.by ?? null),
    [stale(l) ? 'راکد' : '', overStd(l) ? 'بیش از مدت استاندارد' : ''].filter(Boolean).join('، '),
  ])
  const HEAD = ['پروژه', 'مرحله', 'گام جاری', 'گام‌های انجام‌شده', 'روز در مرحله', 'ورود به مرحله', 'آخرین اقدام', 'تاریخ اقدام', 'اقدام‌کننده', 'هشدار']
  const filterChips = [phase ? `مرحله: ${phase} ${title(phase)}` : '', staleOnly ? 'فقط راکدها' : '', overOnly ? 'فقط بیش از مدت استاندارد' : '', needle ? `جستجو: ${needle}` : ''].filter(Boolean)
  const openInSg = (name: string) => useModuleStore.getState().enterModule('stagegate', 'portfolio', name)
  const pickPhase = (code: string | null) => { setPhase(code); setOpen(null) }
  const focusCard = (name: string) => {
    setPhase(null); setStaleOnly(false); setOverOnly(false); setQ(''); setOpen(name)
    requestAnimationFrame(() => document.getElementById(`lpp-card-${CSS.escape(name)}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }
  const anyFilter = !!(phase || staleOnly || overOnly || needle)

  return (
    <div className="lpp" dir="rtl">
      <div className="lpp-head">
        <div>
          <button type="button" className="lpp-back" onClick={onBack}><ArrowRight size={14} aria-hidden /> داشبورد پرتفولیو</button>
          <h1>پروژه‌ها در مراحل چرخهٔ عمر</h1>
          <p>مدل Stage-Gate، از G1 تا G9. گام جاری و آخرین اقدام به‌طور خودکار از گام‌ها، خروجی‌ها، معیارها و تصمیم‌های گیت ماژول Stage-Gate خوانده می‌شود. روی هر مرحله یا نمودار بزنید تا فهرست پروژه‌ها به همان گروه محدود شود.</p>
        </div>
        {src && (
          <div className="lpp-tools">
            <button type="button" className="lpp-btn" onClick={() => void downloadXlsx('مراحل-چرخه-عمر.xlsx', [{ name: 'مراحل چرخه عمر', headers: HEAD, rows: exportRows() }])}><FileSpreadsheet size={14} aria-hidden /> Excel</button>
            <button type="button" className="lpp-btn" onClick={() => printTable('پروژه‌ها در مراحل چرخهٔ عمر', 'Stage-Gate، G1 تا G9', filterChips, HEAD, exportRows())}><Printer size={14} aria-hidden /> چاپ</button>
          </div>
        )}
      </div>

      {error ? <div className="lpp-empty">{error}</div> : !src ? (
        <div className="lpp-skel" aria-label="در حال بارگذاری"><Loader2 size={18} className="animate-spin" aria-hidden /><i /><i /><i /></div>
      ) : (
        <>
          <div className="vz-kpis">
            <KpiTile i={0} icon={<Layers size={15} />} label="پروژه در سبد" tone="#6366f1" value={<Num value={lines.length} />} sub={`${fa(activeLines.length)} پروژه در یکی از گیت‌ها`} onClick={() => { pickPhase(null); setStaleOnly(false); setOverOnly(false) }} active={!anyFilter} />
            <KpiTile i={1} icon={<Flag size={15} />} label="پایان چرخه" tone="#10b981" value={<Num value={doneCount} />} sub="همهٔ گیت‌ها تصویب شده" onClick={doneCount ? () => pickPhase(phase === 'done' ? null : 'done') : undefined} active={phase === 'done'} />
            <KpiTile i={2} icon={<TimerOff size={15} />} label="راکد" tone="#f43f5e" value={<Num value={staleCount} />} sub={`بیش از ${fa(STALE_DAYS)} روز بدون اقدام`} onClick={() => setStaleOnly((v) => !v)} active={staleOnly} />
            <KpiTile i={3} icon={<Hourglass size={15} />} label="بیش از مدت استاندارد" tone="#f59e0b" value={<Num value={overCount} />} sub="ماندن در مرحله فراتر از مدت تعریف‌شده" onClick={() => setOverOnly((v) => !v)} active={overOnly} />
            <KpiTile i={4} icon={<Clock3 size={15} />} label="میانگین فاصله از آخرین اقدام" tone="#0ea5e9" value={avgIdle == null ? '—' : <><Num value={avgIdle} /> <small className="lpp-unit">روز</small></>} sub="برای پروژه‌های در جریان" />
          </div>

          <section className="lpp-rail-card" aria-label="مسیر مراحل چرخهٔ عمر">
            <header className="lpp-sec-h"><h2>مسیر گیت‌ها</h2><span>اندازهٔ هر ایستگاه به تعداد پروژه‌های آن مرحله بستگی دارد</span></header>
            <div className="lpp-rail" role="group" aria-label="تعداد پروژه در هر مرحله">
              {counts.map(({ code, count }, i) => {
                const k = count ? 0.55 + 0.45 * (count / maxCount) : 0.45
                return (
                  <button key={code} type="button" aria-pressed={phase === code} aria-label={`${title(code)}: ${fa(count)} پروژه`}
                    className={`lpp-stop${phase === code ? ' is-on' : ''}${count ? '' : ' is-zero'}${phase && phase !== code ? ' is-dim' : ''}`}
                    style={{ '--c': PHASE_COLOR[code] ?? '#64748b', '--next': PHASE_COLOR[counts[i + 1]?.code] ?? 'transparent', '--k': k, '--i': i } as CSSProperties} onClick={() => pickPhase(phase === code ? null : code)}>
                    <span className="lpp-stop-code">{codeLabel(code)}</span>
                    <span className="lpp-stop-dot"><b>{fa(count)}</b></span>
                    <span className="lpp-stop-t">{title(code)}</span>
                  </button>
                )
              })}
            </div>
            <StackBar parts={phaseParts} picked={phase} onPick={pickPhase} height={10} />
          </section>

          <div className="vz-grid-3 lpp-charts">
            <section className="lpp-panel">
              <header className="lpp-sec-h"><h2>سهم هر مرحله</h2></header>
              <Donut parts={phaseParts} sub="پروژه" picked={phase} onPick={pickPhase} size={150} />
            </section>
            <section className="lpp-panel">
              <header className="lpp-sec-h"><h2>سلامت جریان</h2><span>از پروژه‌های در جریان</span></header>
              <div className="vz-gauges">
                <Gauge label="راکد" value={activeLines.length ? (staleCount / activeLines.length) * 100 : null} bands={shareBands} target={15} size={150}
                  display={activeLines.length ? `${fa(Math.round((staleCount / activeLines.length) * 100))}٪` : '—'} sub={`${fa(staleCount)} از ${fa(activeLines.length)}`} onClick={() => setStaleOnly((v) => !v)} />
                <Gauge label="بیش از مدت استاندارد" value={activeLines.length ? (overCount / activeLines.length) * 100 : null} bands={shareBands} target={15} size={150}
                  display={activeLines.length ? `${fa(Math.round((overCount / activeLines.length) * 100))}٪` : '—'} sub={`${fa(overCount)} از ${fa(activeLines.length)}`} onClick={() => setOverOnly((v) => !v)} />
              </div>
            </section>
            <section className="lpp-panel">
              <header className="lpp-sec-h"><h2>طولانی‌ترین ماندگاری در مرحله</h2></header>
              {longest.length ? (
                <BarList onPick={focusCard} picked={open}
                  items={longest.map((l) => {
                    const std = src.standardDays.get(l.phase)
                    return { key: l.project, label: l.project, value: l.daysInPhase ?? 0, display: `${fa(l.daysInPhase ?? 0)} روز`, color: overStd(l) ? '#f43f5e' : PHASE_COLOR[l.phase], note: `${l.phase} · ${title(l.phase)}${std ? ` · استاندارد ${fa(std)} روز` : ''}` }
                  })} />
              ) : <p className="lpp-muted">هنوز تاریخ ورود به مرحله برای پروژه‌ای ثبت نشده است.</p>}
            </section>
          </div>

          <div className="lpp-bar">
            <span className="lpp-sum"><Activity size={14} aria-hidden /> {fa(shown.length)} از {fa(lines.length)} پروژه</span>
            {phase && <button type="button" className="lpp-chip is-on" onClick={() => pickPhase(null)}>{phase === 'done' || phase === 'nodata' ? title(phase) : phase} ✕</button>}
            {staleOnly && <button type="button" className="lpp-chip is-on" onClick={() => setStaleOnly(false)}>راکد ✕</button>}
            {overOnly && <button type="button" className="lpp-chip is-on" onClick={() => setOverOnly(false)}>بیش از مدت استاندارد ✕</button>}
            <Seg label="مرتب‌سازی" value={sort} onChange={setSort} options={[{ key: 'phase', label: 'مرحله' }, { key: 'days', label: 'ماندگاری' }, { key: 'idle', label: 'بی‌اقدامی' }]} />
            <label className="lpp-search"><Search size={14} aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی نام پروژه" aria-label="جستجوی پروژه" /></label>
          </div>

          {!shown.length ? <div className="lpp-empty">پروژه‌ای با این فیلترها نیست.</div> : (
            <ul className="lpp-cards">
              {shown.map((l, i) => {
                const c = PHASE_COLOR[l.phase] ?? '#64748b'
                const isOpen = open === l.project
                const std = src.standardDays.get(l.phase)
                const pct = l.steps.length ? (l.stepsDone / l.steps.length) * 100 : l.phase === 'done' ? 100 : null
                const fill = std && l.daysInPhase != null ? Math.min(1, l.daysInPhase / (std * 1.5)) : null
                return (
                  <li key={l.project} id={`lpp-card-${l.project}`} className={`lpp-card${isOpen ? ' is-open' : ''}${stale(l) ? ' is-stale' : ''}`} style={{ '--c': c, '--i': Math.min(i, 14) } as CSSProperties}>
                    <button type="button" className="lpp-card-main" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : l.project)}>
                      <Ring pct={pct} color={c} size={52} stroke={6}>
                        <small>{l.steps.length ? `${fa(l.stepsDone)}/${fa(l.steps.length)}` : codeLabel(l.phase)}</small>
                      </Ring>
                      <span className="lpp-card-id">
                        <b>{l.project}</b>
                        <span className="lpp-phase"><i>{codeLabel(l.phase)}</i>{title(l.phase)}</span>
                      </span>
                      <ChevronDown size={16} className="lpp-caret" aria-hidden />
                    </button>
                    <div className="lpp-card-step">
                      {l.stepIndex != null ? <>گام جاری: <b>{fa(l.stepIndex + 1)}. {l.steps[l.stepIndex].title}</b></>
                        : <span className="lpp-muted">{!active(l) ? (l.phase === 'nodata' && src.stageText.get(l.project) ? `در Stage-Gate: ${src.stageText.get(l.project)}` : '—') : l.steps.length ? 'همهٔ گام‌ها انجام شده؛ منتظر تصمیم گیت' : 'گامی تعریف نشده'}</span>}
                    </div>
                    {l.daysInPhase != null && (
                      <div className={`lpp-dur${overStd(l) ? ' is-over' : ''}`}>
                        <span>{fa(l.daysInPhase)} روز در این مرحله{std ? <small> · استاندارد {fa(std)}</small> : null}</span>
                        {fill != null && <span className="lpp-dur-t"><i style={{ transform: `scaleX(${fill})` }} /><em style={{ insetInlineStart: `${(1 / 1.5) * 100}%` }} /></span>}
                      </div>
                    )}
                    <div className="lpp-card-act">
                      {l.lastAction ? <><span>{l.lastAction.text}</span><small>{faDate(l.lastAction.at)}{who(l.lastAction.by) ? ` · ${who(l.lastAction.by)}` : ''}{l.lastAction.phase !== l.phase ? ` · ${l.lastAction.phase}` : ''}</small></>
                        : <span className="lpp-muted">اقدامی ثبت نشده</span>}
                      {stale(l) && <span className="lpp-tag">راکد</span>}
                    </div>
                    {isOpen && (
                      <div className="lpp-detail-in">
                        <div>
                          <p className="lpp-detail-h">{l.phase === 'nodata' ? 'برای این پروژه هنوز گیت، گام یا خروجی‌ای در Stage-Gate ثبت نشده است.' : <>گام‌های {l.phase === 'done' ? '' : `${l.phase} — `}{title(l.phase)}</>}</p>
                          {l.steps.length ? (
                            <ol className="lpp-steps">
                              {l.steps.map((s, k) => (
                                <li key={k} className={`is-${s.status}`} style={{ '--i': k } as CSSProperties}>
                                  {s.status === 'done' ? <CheckCircle2 size={15} aria-hidden /> : s.status === 'active' ? <CircleDot size={15} aria-hidden /> : <Circle size={15} aria-hidden />}
                                  <span>{s.title}</span>
                                  {s.status === 'active' && <em>گام جاری</em>}
                                </li>
                              ))}
                            </ol>
                          ) : l.phase === 'nodata' ? null : <p className="lpp-muted">{l.phase === 'done' ? 'همهٔ گیت‌ها تصویب شده است.' : 'برای این مرحله گامی تعریف نشده است.'}</p>}
                        </div>
                        <div className="lpp-detail-side">
                          {l.enteredAt && <p>ورود به مرحله: <b>{faDate(l.enteredAt)}</b></p>}
                          {l.daysSinceAction != null && <p>از آخرین اقدام: <b>{fa(l.daysSinceAction)} روز</b></p>}
                          {canOpenSg && <button type="button" className="lpp-btn" onClick={() => openInSg(l.project)}><ExternalLink size={13} aria-hidden /> باز کردن در Stage-Gate</button>}
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <p className="lpp-foot">«راکد» یعنی بیش از {fa(STALE_DAYS)} روز اقدامی ثبت نشده است. مرحلهٔ جاری، مرحلهٔ بعد از آخرین گیت تصویب‌شده است. «بدون دادهٔ گیت» یعنی هنوز هیچ گیت، گام یا خروجی‌ای برای پروژه در Stage-Gate ثبت نشده.</p>
        </>
      )}
    </div>
  )
}
