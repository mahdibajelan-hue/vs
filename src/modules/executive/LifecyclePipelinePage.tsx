import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ArrowRight, CheckCircle2, ChevronDown, Circle, CircleDot, FileSpreadsheet, Loader2, Printer, Search, ExternalLink } from 'lucide-react'
import { formatJalali } from '../../lib/jalali'
import { useModuleStore } from '../../store/useModuleStore'
import { hasModuleAccess, useModuleAccessStore } from '../../store/useModuleAccessStore'
import { downloadXlsx, printTable } from '../risk/lib/riskExport'
import { buildPipeline, countByPhase, STALE_DAYS, type PipelineLine } from './lib/lifecyclePipeline'
import { loadPipelineSource, type PipelineSource } from './lib/pipelineData'
import './pipeline.css'

const fa = (x: number) => x.toLocaleString('fa-IR')
const faDate = (iso: string) => formatJalali(iso.slice(0, 10)).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])
/** one colour per phase family: definition → procurement of services → design → contracting → build → close */
const PHASE_COLOR: Record<string, string> = { G1: '#64748b', G2: '#0ea5e9', G3: '#8b5cf6', G4: '#6366f1', G5: '#f59e0b', G6: '#f97316', G7: '#14b8a6', G8: '#22c55e', G9: '#10b981', done: '#94a3b8', nodata: '#475569' }

/**
 * پروژه‌ها در مراحل چرخهٔ عمر (Stage-Gate، G1…G9): how many projects stand in each phase, the step each one is on
 * and its last recorded action — computed from the steps, outputs, criteria and gate decisions of the Stage-Gate module.
 */
export function LifecyclePipelinePage({ onBack }: { onBack: () => void }) {
  const [src, setSrc] = useState<PipelineSource | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [staleOnly, setStaleOnly] = useState(false)
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
  const stale = (l: PipelineLine) => l.phase !== 'done' && l.phase !== 'nodata' && (l.daysSinceAction == null || l.daysSinceAction > STALE_DAYS)

  const needle = q.trim()
  const shown = lines.filter((l) => (!phase || l.phase === phase) && (!staleOnly || stale(l)) && (!needle || l.project.includes(needle)))
  const staleCount = lines.filter(stale).length
  const overCount = lines.filter(overStd).length

  const exportRows = () => shown.map((l) => [
    l.project, `${l.phase === 'done' || l.phase === 'nodata' ? '' : l.phase + ' — '}${title(l.phase)}${l.phase === 'nodata' && src?.stageText.get(l.project) ? ` (در Stage-Gate: ${src.stageText.get(l.project)})` : ''}`,
    l.stepIndex != null ? `${l.stepIndex + 1}. ${l.steps[l.stepIndex].title}` : '—', `${l.stepsDone} از ${l.steps.length}`,
    l.daysInPhase ?? '', l.enteredAt ? formatJalali(l.enteredAt.slice(0, 10)) : '',
    l.lastAction?.text ?? 'اقدامی ثبت نشده', l.lastAction ? formatJalali(l.lastAction.at.slice(0, 10)) : '', who(l.lastAction?.by ?? null),
    [stale(l) ? 'راکد' : '', overStd(l) ? 'بیش از مدت استاندارد' : ''].filter(Boolean).join('، '),
  ])
  const HEAD = ['پروژه', 'مرحله', 'گام جاری', 'گام‌های انجام‌شده', 'روز در مرحله', 'ورود به مرحله', 'آخرین اقدام', 'تاریخ اقدام', 'اقدام‌کننده', 'هشدار']
  const filterChips = [phase ? `مرحله: ${phase} ${title(phase)}` : '', staleOnly ? 'فقط راکدها' : '', needle ? `جستجو: ${needle}` : ''].filter(Boolean)
  const openInSg = (name: string) => useModuleStore.getState().enterModule('stagegate', 'portfolio', name)

  return (
    <div className="lpp" dir="rtl">
      <div className="lpp-head">
        <div>
          <button type="button" className="lpp-back" onClick={onBack}><ArrowRight size={14} aria-hidden /> داشبورد پرتفولیو</button>
          <h1>پروژه‌ها در مراحل چرخهٔ عمر</h1>
          <p>مدل Stage-Gate، از G1 تا G9. گام جاری و آخرین اقدام به‌طور خودکار از گام‌ها، خروجی‌ها، معیارها و تصمیم‌های گیت ماژول Stage-Gate خوانده می‌شود.</p>
        </div>
        {src && (
          <div className="lpp-tools">
            <button type="button" className="lpp-btn" onClick={() => void downloadXlsx('مراحل-چرخه-عمر.xlsx', [{ name: 'مراحل چرخه عمر', headers: HEAD, rows: exportRows() }])}><FileSpreadsheet size={14} aria-hidden /> Excel</button>
            <button type="button" className="lpp-btn" onClick={() => printTable('پروژه‌ها در مراحل چرخهٔ عمر', 'Stage-Gate، G1 تا G9', filterChips, HEAD, exportRows())}><Printer size={14} aria-hidden /> چاپ</button>
          </div>
        )}
      </div>

      {error ? <div className="lpp-empty">{error}</div> : !src ? (
        <div className="lpp-empty"><Loader2 size={18} className="animate-spin" aria-label="در حال بارگذاری" /></div>
      ) : (
        <>
          <div className="lpp-funnel" role="group" aria-label="تعداد پروژه در هر مرحله">
            {counts.map(({ code, count }) => (
              <button
                key={code} type="button" aria-pressed={phase === code}
                className={`lpp-stage ${phase === code ? 'is-on' : ''} ${count ? '' : 'is-zero'} ${code === 'nodata' ? 'is-nodata' : ''}`}
                style={{ '--c': PHASE_COLOR[code] ?? '#64748b' } as CSSProperties}
                onClick={() => setPhase(phase === code ? null : code)}
              >
                <span className="lpp-stage-code">{codeLabel(code)}</span>
                <span className="lpp-stage-count">{fa(count)}</span>
                <span className="lpp-stage-title">{title(code)}</span>
              </button>
            ))}
          </div>

          <div className="lpp-bar">
            <span className="lpp-sum">{fa(lines.length)} پروژه</span>
            <button type="button" className={`lpp-chip ${staleOnly ? 'is-on' : ''}`} onClick={() => setStaleOnly((v) => !v)} title={`بیش از ${fa(STALE_DAYS)} روز بدون اقدام ثبت‌شده`}>
              راکد: {fa(staleCount)}
            </button>
            <span className="lpp-chip is-static" title="ماندن در مرحله بیش از مدت استاندارد تعریف‌شده در Stage-Gate">بیش از مدت استاندارد: {fa(overCount)}</span>
            {phase && <button type="button" className="lpp-chip is-on" onClick={() => setPhase(null)}>{phase === 'done' || phase === 'nodata' ? title(phase) : phase} ✕</button>}
            <label className="lpp-search"><Search size={14} aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی نام پروژه" aria-label="جستجوی پروژه" /></label>
          </div>

          {!shown.length ? <div className="lpp-empty">پروژه‌ای با این فیلترها نیست.</div> : (
            <div className="lpp-table-wrap">
              <table className="lpp-table">
                <thead>
                  <tr><th>پروژه</th><th>مرحله</th><th>گام جاری</th><th>در این مرحله</th><th>آخرین اقدام</th><th aria-label="جزئیات" /></tr>
                </thead>
                <tbody>
                  {shown.map((l) => {
                    const c = PHASE_COLOR[l.phase] ?? '#64748b'
                    const isOpen = open === l.project
                    const std = src.standardDays.get(l.phase)
                    return (
                      <Fragment key={l.project}>
                        <tr className={`lpp-row ${isOpen ? 'is-open' : ''}`} onClick={() => setOpen(isOpen ? null : l.project)}>
                          <td className="lpp-name">{l.project}</td>
                          <td>
                            <span className="lpp-phase" style={{ '--c': c } as CSSProperties}><b>{codeLabel(l.phase)}</b>{title(l.phase)}</span>
                            {l.phase === 'nodata' && src.stageText.get(l.project) && <small className="lpp-hint">در Stage-Gate: {src.stageText.get(l.project)}</small>}
                          </td>
                          <td>
                            {l.stepIndex != null ? (
                              <div className="lpp-step">
                                <span>{fa(l.stepIndex + 1)}. {l.steps[l.stepIndex].title}</span>
                                <span className="lpp-dots" aria-label={`${fa(l.stepsDone)} از ${fa(l.steps.length)} گام انجام شده`}>
                                  {l.steps.map((s, i) => <i key={i} className={`is-${s.status}`} style={{ '--c': c } as CSSProperties} />)}
                                </span>
                              </div>
                            ) : <span className="lpp-muted">{l.phase === 'done' || l.phase === 'nodata' ? '—' : l.steps.length ? 'همهٔ گام‌ها انجام شده؛ منتظر تصمیم گیت' : 'گامی تعریف نشده'}</span>}
                          </td>
                          <td>
                            {l.daysInPhase != null ? <span className={overStd(l) ? 'lpp-warn' : ''}>{fa(l.daysInPhase)} روز{std ? <small> / استاندارد {fa(std)}</small> : null}</span> : <span className="lpp-muted">—</span>}
                          </td>
                          <td>
                            {l.lastAction ? (
                              <div className="lpp-action">
                                <span>{l.lastAction.text}</span>
                                <small>{faDate(l.lastAction.at)}{who(l.lastAction.by) ? ` · ${who(l.lastAction.by)}` : ''}{l.lastAction.phase !== l.phase ? ` · ${l.lastAction.phase}` : ''}</small>
                              </div>
                            ) : <span className="lpp-muted">اقدامی ثبت نشده</span>}
                            {stale(l) && <span className="lpp-tag">راکد</span>}
                          </td>
                          <td><ChevronDown size={16} className="lpp-caret" aria-hidden /></td>
                        </tr>
                        {isOpen && (
                          <tr className="lpp-detail">
                            <td colSpan={6}>
                              <div className="lpp-detail-in">
                                <div>
                                  <p className="lpp-detail-h">{l.phase === 'nodata' ? 'برای این پروژه هنوز گیت، گام یا خروجی‌ای در Stage-Gate ثبت نشده است.' : <>گام‌های {l.phase === 'done' ? '' : `${l.phase} — `}{title(l.phase)}</>}</p>
                                  {l.steps.length ? (
                                    <ol className="lpp-steps">
                                      {l.steps.map((s, i) => (
                                        <li key={i} className={`is-${s.status}`}>
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
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="lpp-foot">«راکد» یعنی بیش از {fa(STALE_DAYS)} روز اقدامی ثبت نشده است. مرحلهٔ جاری، مرحلهٔ بعد از آخرین گیت تصویب‌شده است. «بدون دادهٔ گیت» یعنی هنوز هیچ گیت، گام یا خروجی‌ای برای پروژه در Stage-Gate ثبت نشده.</p>
        </>
      )}
    </div>
  )
}
