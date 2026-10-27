import { useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Clock, Eye, FileStack, GitCompare, Minus, Trash2, X } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import type { EstEstimateRecord, EstProject } from '../types'
import { compareResults, MATURITY, maturityOf } from '../lib/calc'
import { BORDER, fmtEUR, fmtEURm, fmtPct, fmtRialBn, INK, INK_SOFT, MUTED_FG, SAFETY, SECTION_COLOR, STATUS, SURFACE, SURFACE_2 } from '../lib/theme'
import { Btn, Card, CardTitle } from '../components/ui'

/** older rows were saved with an ISO timestamp as their label */
export function versionName(e: EstEstimateRecord) {
  return !e.label || /^\d{4}-\d{2}-\d{2}T/.test(e.label) ? 'محاسبهٔ ذخیره‌شده' : e.label
}

export function HistoryPage({
  project, estimates, loading, onOpen, onDelete,
}: {
  project: EstProject
  estimates: EstEstimateRecord[]
  loading: boolean
  onOpen: (e: EstEstimateRecord) => void
  onDelete: (id: string) => void
}) {
  const [picked, setPicked] = useState<string[]>([])
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p.slice(-1), id]))
  // oldest first inside the comparison, so the delta reads «what changed since»
  const pair = useMemo(() => picked.map((id) => estimates.find((e) => e.id === id)).filter(Boolean).sort((a, b) => a!.createdAt.localeCompare(b!.createdAt)) as EstEstimateRecord[], [picked, estimates])

  return (
    <div className="h-full overflow-y-auto est-font est-scroll">
      <div className="mx-auto max-w-5xl px-4 py-6 space-y-4 pb-24 lg:pb-8">
        <div className="flex flex-wrap items-end justify-between gap-3 est-fade-in">
          <div>
            <p className="text-[11px] font-semibold" style={{ color: SAFETY }}>نسخه‌های برآورد</p>
            <h1 className="text-lg font-extrabold" style={{ color: INK }}>{project.name}</h1>
            <p className="text-[11.5px] mt-1" style={{ color: MUTED_FG }}>هر «ذخیرهٔ نسخه» یک عکس ثابت از ورودی‌ها و نتیجه است. دو نسخه را علامت بزنید تا تغییر هر سرفصل را ببینید.</p>
          </div>
          {picked.length > 0 && <Btn kind="quiet" onClick={() => setPicked([])}><X size={14} /> پاک کردن انتخاب</Btn>}
        </div>

        {pair.length === 2 && <Comparison a={pair[0]} b={pair[1]} />}

        {loading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="est-skel" />)}</div>
        ) : estimates.length === 0 ? (
          <Card className="text-center py-10">
            <FileStack size={30} className="mx-auto mb-3" style={{ color: MUTED_FG }} />
            <p className="text-sm font-bold" style={{ color: INK }}>هنوز نسخه‌ای ذخیره نشده است</p>
            <p className="text-xs mt-1" style={{ color: MUTED_FG }}>در صفحهٔ «برآورد و گزارش» دکمهٔ «ذخیرهٔ نسخه» را بزنید؛ هر نسخه نام و تاریخ می‌گیرد.</p>
          </Card>
        ) : (
          <ol className="est-timeline">
            {estimates.map((e, i) => {
              const prev = estimates[i + 1]
              const delta = prev ? e.grandTotalEur - prev.grandTotalEur : 0
              const on = picked.includes(e.id)
              return (
                <li key={e.id} className={`est-ver est-fade-in ${on ? 'is-on' : ''}`} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                  <span className="est-ver-dot" aria-hidden />
                  <label className="est-ver-pick" title="انتخاب برای مقایسه">
                    <input type="checkbox" checked={on} onChange={() => toggle(e.id)} aria-label={`انتخاب ${versionName(e)} برای مقایسه`} />
                  </label>
                  <button type="button" onClick={() => onOpen(e)} className="flex-1 min-w-0 text-right">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold truncate" style={{ color: INK }}>{versionName(e)}</span>
                      {i === 0 && <span className="est-tag">آخرین</span>}
                      <span className="est-tag is-soft">{MATURITY[maturityOf(e.inputs)].label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] est-mono mt-1" style={{ color: MUTED_FG }}><Clock size={11} /> {formatJalali(e.createdAt)}</div>
                  </button>
                  <div className="text-left shrink-0">
                    <div className="est-mono text-sm font-bold" style={{ color: INK }}>{fmtEUR(e.grandTotalEur)}</div>
                    <div className="est-mono text-[11px]" style={{ color: MUTED_FG }}>≈ {fmtRialBn(e.grandTotalRial)}</div>
                    {prev && <Delta v={delta} base={prev.grandTotalEur} />}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button type="button" onClick={() => onOpen(e)} className="est-icon-btn" title="باز کردن گزارش این نسخه" aria-label="باز کردن"><Eye size={15} /></button>
                    <button type="button" onClick={() => { if (confirm(`نسخهٔ «${versionName(e)}» حذف شود؟`)) onDelete(e.id) }} className="est-icon-btn is-danger" title="حذف نسخه" aria-label="حذف"><Trash2 size={15} /></button>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
      <style>{HISTORY_STYLE}</style>
    </div>
  )
}

function Delta({ v, base }: { v: number; base: number }) {
  if (Math.abs(v) < 1) return <div className="flex items-center justify-end gap-0.5 text-[11px]" style={{ color: MUTED_FG }}><Minus size={11} /> بدون تغییر</div>
  const up = v > 0
  return (
    <div dir="ltr" className="flex items-center justify-start gap-0.5 text-[11px] est-mono" style={{ color: up ? STATUS.serious : STATUS.good }}>
      {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{up ? '+' : '−'}{fmtEURm(Math.abs(v))} ({fmtPct(Math.abs(v) / (base || 1))})
    </div>
  )
}

function Comparison({ a, b }: { a: EstEstimateRecord; b: EstEstimateRecord }) {
  const c = compareResults(a.results, b.results)
  const eurA = a.fxEurPerUsd || a.inputs.overhead.fxEurPerUsd, eurB = b.fxEurPerUsd || b.inputs.overhead.fxEurPerUsd
  const rows = [...c.sections.map((r) => ({ ...r, color: SECTION_COLOR[r.key] })), ...c.lines.map((r) => ({ ...r, color: '#6B7A8F' }))]
    .map((r) => ({ ...r, ea: r.a * eurA, eb: r.b * eurB, d: r.b * eurB - r.a * eurA }))
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.d)))
  const dGrand = b.grandTotalEur - a.grandTotalEur
  return (
    <Card>
      <CardTitle icon={<GitCompare size={15} />} title="مقایسهٔ دو نسخه" hint={<>از «{versionName(a)}» ({formatJalali(a.createdAt)}) تا «{versionName(b)}» ({formatJalali(b.createdAt)})</>} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Box label={versionName(a)} value={fmtEUR(a.grandTotalEur)} />
        <Box label={versionName(b)} value={fmtEUR(b.grandTotalEur)} />
        <Box label="تغییر جمع کل" value={`${dGrand >= 0 ? '+' : '−'}${fmtEUR(Math.abs(dGrand))}`} tone={dGrand > 0 ? STATUS.serious : dGrand < 0 ? STATUS.good : undefined} sub={fmtPct(Math.abs(dGrand) / (a.grandTotalEur || 1))} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 560 }}>
          <thead>
            <tr className="text-xs" style={{ borderBottom: `1px solid ${BORDER}`, color: MUTED_FG }}>
              <th className="text-right py-1.5 font-medium">سرفصل</th>
              <th className="text-left py-1.5 font-medium">نسخهٔ قبل</th>
              <th className="text-left py-1.5 font-medium">نسخهٔ بعد</th>
              <th className="py-1.5 font-medium" style={{ width: '34%' }}>تغییر</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} style={{ borderBottom: `1px solid ${BORDER}` }}>
                <td className="py-1.5 pr-2" style={{ color: INK_SOFT, borderRight: `3px solid ${r.color}` }}>{r.label}</td>
                <td className="py-1.5 text-left est-mono text-xs" style={{ color: MUTED_FG }}>{r.ea ? fmtEURm(r.ea) : '—'}</td>
                <td className="py-1.5 text-left est-mono text-xs" style={{ color: INK }}>{r.eb ? fmtEURm(r.eb) : '—'}</td>
                <td className="py-1.5">
                  <div className="est-diverge" dir="ltr">
                    <span className="est-diverge-mid" />
                    {Math.abs(r.d) >= 1 && <span className="est-diverge-bar est-grow" style={{ width: `${(Math.abs(r.d) / max) * 50}%`, [r.d > 0 ? 'left' : 'right']: '50%', background: r.d > 0 ? STATUS.serious : STATUS.good, transformOrigin: r.d > 0 ? 'left' : 'right' }} />}
                  </div>
                  <div dir="ltr" className="est-mono text-[10.5px] text-center mt-0.5" style={{ color: Math.abs(r.d) < 1 ? MUTED_FG : r.d > 0 ? STATUS.serious : STATUS.good }}>{Math.abs(r.d) < 1 ? '—' : `${r.d > 0 ? '+' : '−'}${fmtEURm(Math.abs(r.d))}`}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10.5px] mt-2" style={{ color: MUTED_FG }}>نارنجی یعنی افزایش و سبز یعنی کاهش نسبت به نسخهٔ قبلی؛ تغییر نرخ ارز بین دو نسخه هم در مبالغ یورویی دیده می‌شود.</p>
    </Card>
  )
}

function Box({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: SURFACE_2, border: `1px solid ${BORDER}` }}>
      <div className="text-[11px] truncate" style={{ color: MUTED_FG }}>{label}</div>
      <div dir="ltr" className="est-mono text-base font-bold text-right" style={{ color: tone ?? INK }}>{value}</div>
      {sub && <div className="est-mono text-[11px]" style={{ color: tone ?? MUTED_FG }}>{sub}</div>}
    </div>
  )
}

const HISTORY_STYLE = `
  .est-timeline { position: relative; display: grid; gap: .6rem; padding-inline-start: 1.1rem; }
  .est-timeline::before { content: ''; position: absolute; inset-inline-start: .3rem; top: .6rem; bottom: .6rem; width: 2px; background: linear-gradient(${SAFETY}, ${BORDER}); border-radius: 2px; }
  .est-ver { position: relative; display: flex; align-items: center; gap: .75rem; padding: .85rem 1rem; border-radius: 16px; background: ${SURFACE}; border: 1px solid ${BORDER}; transition: border-color .15s ease; }
  .est-ver:hover { border-color: #2c4058; }
  .est-ver.is-on { border-color: ${SAFETY}; box-shadow: 0 0 0 3px rgba(242,183,5,.08); }
  .est-ver-dot { position: absolute; inset-inline-start: -1.05rem; top: 50%; width: 11px; height: 11px; margin-top: -5.5px; border-radius: 99px; background: ${SURFACE}; border: 2px solid ${SAFETY}; }
  .est-ver-pick input { width: 16px; height: 16px; accent-color: ${SAFETY}; cursor: pointer; }
  .est-tag { font-size: 10px; font-weight: 700; padding: .1rem .45rem; border-radius: 99px; color: #1A1400; background: ${SAFETY}; }
  .est-tag.is-soft { color: ${INK_SOFT}; background: rgba(255,255,255,.05); border: 1px solid ${BORDER}; }
  .est-icon-btn { padding: .45rem; border-radius: 9px; color: ${MUTED_FG}; transition: color .15s ease, background .15s ease; }
  .est-icon-btn:hover { color: ${INK}; background: rgba(255,255,255,.05); }
  .est-icon-btn.is-danger:hover { color: #e66767; }
  .est-skel { height: 64px; border-radius: 16px; background: linear-gradient(90deg, ${SURFACE} 0%, ${SURFACE_2} 50%, ${SURFACE} 100%); background-size: 200% 100%; animation: est-skel 1.3s ease-in-out infinite; }
  @keyframes est-skel { to { background-position: -200% 0; } }
  .est-diverge { position: relative; height: 10px; border-radius: 99px; background: ${SURFACE_2}; }
  .est-diverge-mid { position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: ${MUTED_FG}; }
  .est-diverge-bar { position: absolute; top: 0; bottom: 0; border-radius: 99px; }
  @media (prefers-reduced-motion: reduce) { .est-skel { animation: none; } }
`
