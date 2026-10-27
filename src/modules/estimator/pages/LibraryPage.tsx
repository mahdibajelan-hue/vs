import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { BookMarked, CheckCircle2, CircleDashed, Pencil, Plus, Ruler, Search, Sigma, Trash2, TrendingUp, Waves, X } from 'lucide-react'
import { useEstimatorStore } from '../store/useEstimatorStore'
import type { EstBenchmark, EstBenchmarkDraft } from '../types'
import { benchmarkMetrics, DEFAULT_BENCH_ESCALATION, librarySummary, SETTING_LABEL, stats, TERRAIN_LABEL, toEur } from '../lib/methods'
import { BORDER, fmtEUR, fmtEURm, GRID, INK, INK_SOFT, MUTED_FG, SAFETY, SURFACE, SURFACE_2, toFa, TOOLTIP_STYLE } from '../lib/theme'
import { Btn, Card, CardTitle, Kpi, Segmented, TextField } from '../components/ui'

const SETTING_COLOR: Record<EstBenchmark['setting'], string> = { onshore: '#3987e5', offshore: '#d95926', mixed: '#9085e9' }
const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k` : Math.round(n).toLocaleString('en-US'))

/** Recent projects' estimated or final costs, brought to today's euros, averaged and plotted —
 * and the data the historical and analog methods estimate from. */
export function LibraryPage({ nowYear }: { nowYear: number }) {
  const benchmarks = useEstimatorStore((s) => s.benchmarks)
  const loading = useEstimatorStore((s) => s.loadingBenchmarks)
  const assumptions = useEstimatorStore((s) => s.assumptions)
  const fetchBenchmarks = useEstimatorStore((s) => s.fetchBenchmarks)
  const deleteBenchmark = useEstimatorStore((s) => s.deleteBenchmark)
  const rate = assumptions?.overhead.benchEscalation ?? DEFAULT_BENCH_ESCALATION
  const [setting, setSetting] = useState<'all' | EstBenchmark['setting']>('all')
  const [kind, setKind] = useState<'all' | EstBenchmark['kind']>('all')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<EstBenchmark | 'new' | null>(null)

  useEffect(() => { void fetchBenchmarks() }, [fetchBenchmarks])

  const rows = useMemo(() => benchmarks
    .filter((b) => setting === 'all' || b.setting === setting)
    .filter((b) => kind === 'all' || b.kind === kind)
    .filter((b) => !q.trim() || `${b.name} ${b.location}`.includes(q.trim()))
    .map((b) => ({ b, m: benchmarkMetrics(b, nowYear, rate) })), [benchmarks, setting, kind, q, nowYear, rate])
  // averages and distributions use only the rows the methods use; outliers stay visible on the chart and as cards
  const used = useMemo(() => rows.filter((r) => r.b.useInEstimates), [rows])
  const sum = useMemo(() => librarySummary(used.map((r) => r.b), nowYear, rate), [used, nowYear, rate])

  return (
    <div className="h-full overflow-y-auto est-scroll">
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-5 pb-24 lg:pb-8">
        <section className="est-lib-hero est-fade-in">
          <div className="min-w-0">
            <span className="est-eyebrow"><BookMarked size={12} /> کتابخانهٔ پروژه‌های مرجع</span>
            <h1>هزینهٔ واقعی پروژه‌های اخیر، مبنای برآورد بعدی</h1>
            <p>بهای تمام‌شده یا مبلغ برآوردشدهٔ پروژه‌های خط لولهٔ اخیر را ثبت کنید. همهٔ مبالغ به یورو و به قیمت امروز (با تعدیل سالانهٔ {toFa(Math.round(rate * 100))}٪ از مبانی برآورد) برگردانده می‌شوند و روش‌های «تاریخی» و «قیاسی» از همین داده‌ها برآورد می‌کنند.</p>
          </div>
          <Btn kind="primary" onClick={() => setEditing('new')}><Plus size={15} /> ثبت پروژهٔ مرجع</Btn>
        </section>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Kpi icon={<BookMarked size={16} />} label="پروژه‌های ثبت‌شده" value={toFa(rows.length)} sub={`${toFa(sum.count)} در برآورد · ${toFa(sum.actual)} تمام‌شده`} delay={0} />
          <Kpi icon={<Ruler size={16} />} label="طول کل" value={`${toFa(Math.round(sum.totalKm).toLocaleString('en-US'))} km`} tone="#3987e5" delay={40} />
          <Kpi icon={<Sigma size={16} />} label="میانهٔ هر کیلومتر" value={sum.count ? fmtEURm(sum.perKm.median) : '—'} sub="یورو، قیمت امروز" tone="#199e70" delay={80} />
          <Kpi icon={<TrendingUp size={16} />} label="میانهٔ هر اینچ‌-کیلومتر" value={sum.count ? `€${fmtK(sum.perInchKm.median)}` : '—'} sub={sum.count ? `میانگین €${fmtK(sum.perInchKm.mean)}` : undefined} tone={SAFETY} delay={120} />
          <Kpi icon={<CircleDashed size={16} />} label="خشکی (اینچ‌-کیلومتر)" value={sum.onshore.n ? `€${fmtK(sum.onshore.median)}` : '—'} sub={`${toFa(sum.onshore.n)} پروژه`} tone={SETTING_COLOR.onshore} delay={160} />
          <Kpi icon={<Waves size={16} />} label="دریایی (اینچ‌-کیلومتر)" value={sum.offshore.n ? `€${fmtK(sum.offshore.median)}` : '—'} sub={`${toFa(sum.offshore.n)} پروژه`} tone={SETTING_COLOR.offshore} delay={200} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={setting} onChange={setSetting} options={[['all', 'همه'], ['onshore', 'خشکی'], ['offshore', 'دریایی'], ['mixed', 'ترکیبی']]} />
          <Segmented value={kind} onChange={setKind} options={[['all', 'همه'], ['actual', 'تمام‌شده'], ['estimate', 'برآوردی']]} />
          <label className="est-search ms-auto"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی نام یا محل" /></label>
        </div>

        {loading && !benchmarks.length ? (
          <div className="grid gap-3">{[0, 1, 2].map((i) => <div key={i} className="est-skel" />)}</div>
        ) : !benchmarks.length ? (
          <div className="est-empty est-fade-in">
            <BookMarked size={30} style={{ color: SAFETY }} />
            <p className="text-sm font-bold" style={{ color: INK }}>کتابخانه هنوز خالی است</p>
            <p className="text-xs max-w-md leading-relaxed" style={{ color: MUTED_FG }}>برای هر پروژهٔ اخیر نام، طول، قطر، نوع مسیر، سال هزینه و مبلغ (به یورو، دلار یا ریال با نرخ همان زمان) را وارد کنید. با دو سه پروژه، روش‌های تاریخی و قیاسی فعال می‌شوند.</p>
            <Btn kind="primary" onClick={() => setEditing('new')}><Plus size={15} /> ثبت اولین پروژهٔ مرجع</Btn>
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <Card>
                <CardTitle icon={<TrendingUp size={15} />} title="قطر در برابر هزینهٔ هر کیلومتر" hint="هر نقطه یک پروژه، به یورو و به قیمت امروز؛ اندازهٔ نقطه متناسب با طول خط." />
                <div dir="ltr">
                  <ResponsiveContainer width="100%" height={270}>
                    <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                      <XAxis type="number" dataKey="d" name="قطر" unit='"' tick={{ fontSize: 11, fill: MUTED_FG }} domain={['dataMin - 4', 'dataMax + 4']} />
                      <YAxis type="number" dataKey="k" name="€/km" tickFormatter={(v) => fmtEURm(v)} tick={{ fontSize: 11, fill: MUTED_FG }} width={52} />
                      <ZAxis type="number" dataKey="l" range={[50, 420]} />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={TOOLTIP_STYLE}
                        content={({ payload }) => {
                          const p = payload?.[0]?.payload as { n: string; d: number; k: number; l: number } | undefined
                          return p ? <div style={TOOLTIP_STYLE} dir="rtl"><b>{p.n}</b><div className="est-mono text-xs mt-1">{p.d}″ · {Math.round(p.l)} km · {fmtEURm(p.k)}/km</div></div> : null
                        }} />
                      {(['onshore', 'offshore', 'mixed'] as const).map((s) => (
                        <Scatter key={s} name={SETTING_LABEL[s]} fill={SETTING_COLOR[s]} fillOpacity={0.85} animationDuration={700}
                          data={rows.filter((r) => r.b.setting === s).map((r) => ({ n: r.b.name, d: r.b.diameterIn, k: r.m.perKm, l: r.b.lengthKm }))} />
                      ))}
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-3 justify-center text-[11px]" style={{ color: INK_SOFT }}>
                  {(['onshore', 'offshore', 'mixed'] as const).map((s) => <span key={s} className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SETTING_COLOR[s] }} />{SETTING_LABEL[s]}</span>)}
                </div>
              </Card>

              <Card delay={60}>
                <CardTitle icon={<Sigma size={15} />} title="هزینهٔ هر اینچ‌-کیلومتر" hint="فقط پروژه‌هایی که در برآورد استفاده می‌شوند · خط نازک: کمینه تا بیشینه · نوار: نیمهٔ میانی · خط سفید: میانه" />
                <div className="space-y-5 mt-2">
                  {(['onshore', 'offshore', 'mixed'] as const).map((s) => {
                    const st = stats(used.filter((r) => r.b.setting === s).map((r) => r.m.perInchKm))
                    const all = stats(used.map((r) => r.m.perInchKm))
                    const span = all.max - all.min || 1
                    const x = (v: number) => ((v - all.min) / span) * 100
                    return (
                      <div key={s}>
                        <div className="flex justify-between text-[11.5px] mb-1.5">
                          <span style={{ color: INK }}>{SETTING_LABEL[s]} <span style={{ color: MUTED_FG }}>({toFa(st.n)})</span></span>
                          <span className="est-mono" style={{ color: st.n ? INK : MUTED_FG }}>{st.n ? `€${fmtK(st.median)}` : '—'}</span>
                        </div>
                        <div className="est-box" dir="ltr">
                          {st.n > 0 && <>
                            <span className="est-box-whisker" style={{ left: `${x(st.min)}%`, width: `${Math.max(0.5, x(st.max) - x(st.min))}%` }} />
                            <span className="est-box-iqr" style={{ left: `${x(st.p25)}%`, width: `${Math.max(1.5, x(st.p75) - x(st.p25))}%`, background: SETTING_COLOR[s] }} />
                            <span className="est-box-med" style={{ left: `${x(st.median)}%` }} />
                          </>}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10.5px] mt-5 leading-relaxed" style={{ color: MUTED_FG }}>«اینچ‌-کیلومتر» یعنی قطر (اینچ) × طول (کیلومتر)؛ با آن خطوط با قطرهای متفاوت را می‌توان مستقیم مقایسه کرد.</p>
              </Card>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map(({ b, m }, i) => (
                <article key={b.id} className={`est-bm est-fade-in ${b.useInEstimates ? '' : 'is-out'}`} style={{ animationDelay: `${Math.min(i, 10) * 35}ms`, ['--sc' as string]: SETTING_COLOR[b.setting] }}>
                  <header className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold truncate" style={{ color: INK }}>{b.name}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: MUTED_FG }}>{b.location || '—'} · سال {toFa(b.costYear)}</p>
                    </div>
                    <span className={`est-kind ${b.kind === 'actual' ? 'is-actual' : ''}`}>{b.kind === 'actual' ? <><CheckCircle2 size={11} /> تمام‌شده</> : <><CircleDashed size={11} /> برآوردی</>}</span>
                  </header>
                  <div className="flex flex-wrap gap-1.5 my-2.5">
                    <span className="est-pill" style={{ color: SETTING_COLOR[b.setting] }}>{SETTING_LABEL[b.setting]}</span>
                    {b.setting !== 'offshore' && <span className="est-pill">{TERRAIN_LABEL[b.terrain]}</span>}
                    <span className="est-pill est-mono" dir="ltr">{b.diameterIn}″ · {b.lengthKm} km</span>
                    {b.hasCompressor && <span className="est-pill">با تقویت فشار</span>}
                    {!b.useInEstimates && <span className="est-pill" style={{ color: '#f0b45a', borderColor: 'rgba(240,180,90,.4)' }}>خارج از برآورد</span>}
                  </div>
                  {b.notes && <p className="est-bm-notes">{b.notes}</p>}
                  <div className="grid grid-cols-3 gap-2 pt-2.5" style={{ borderTop: `1px dashed ${BORDER}` }}>
                    <Fig label="به قیمت امروز" value={fmtEURm(m.eurNow)} strong />
                    <Fig label="هر کیلومتر" value={fmtEURm(m.perKm)} />
                    <Fig label="هر اینچ‌-کیلومتر" value={`€${fmtK(m.perInchKm)}`} />
                  </div>
                  <div className="est-bm-actions">
                    <button type="button" className="est-icon-btn" onClick={() => setEditing(b)} title="ویرایش" aria-label={`ویرایش ${b.name}`}><Pencil size={14} /></button>
                    <button type="button" className="est-icon-btn is-danger" onClick={() => { if (confirm(`«${b.name}» از کتابخانه حذف شود؟`)) void deleteBenchmark(b.id) }} title="حذف" aria-label={`حذف ${b.name}`}><Trash2 size={14} /></button>
                  </div>
                </article>
              ))}
              {!rows.length && <p className="text-xs" style={{ color: MUTED_FG }}>پروژه‌ای با این فیلتر پیدا نشد.</p>}
            </div>
          </>
        )}
      </div>
      {editing && <BenchmarkForm initial={editing === 'new' ? null : editing} nowYear={nowYear} onClose={() => setEditing(null)} />}
      <style>{LIB_STYLE}</style>
    </div>
  )
}

function Fig({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px]" style={{ color: MUTED_FG }}>{label}</div>
      <div className="est-mono text-[13px] font-bold truncate" style={{ color: strong ? SAFETY : INK }}>{value}</div>
    </div>
  )
}

function BenchmarkForm({ initial, nowYear, onClose }: { initial: EstBenchmark | null; nowYear: number; onClose: () => void }) {
  const saveBenchmark = useEstimatorStore((s) => s.saveBenchmark)
  const [d, setD] = useState<EstBenchmarkDraft>(initial ?? {
    name: '', location: '', kind: 'actual', setting: 'onshore', terrain: 'mixed', lengthKm: 0, diameterIn: 0, hasCompressor: false,
    costYear: nowYear, amount: 0, currency: 'EUR', fxRialPerEur: null, fxEurPerUsd: 0.92, notes: '', useInEstimates: true,
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof EstBenchmarkDraft>(k: K, v: EstBenchmarkDraft[K]) => setD((x) => ({ ...x, [k]: v }))
  const eur = toEur(d.amount, d.currency, d.fxRialPerEur, d.fxEurPerUsd)

  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])

  async function submit() {
    if (!d.name.trim()) return setErr('نام پروژه را وارد کنید.')
    if (!(d.lengthKm > 0) || !(d.diameterIn > 0)) return setErr('طول و قطر خط باید بزرگ‌تر از صفر باشد.')
    if (!(d.amount > 0)) return setErr('مبلغ را وارد کنید.')
    if (d.currency === 'IRR' && !(d.fxRialPerEur && d.fxRialPerEur > 0)) return setErr('برای مبلغ ریالی، نرخ یوروی همان زمان را وارد کنید.')
    if (d.costYear < 1350 || d.costYear > nowYear + 1) return setErr('سال هزینه را به شمسی وارد کنید (مثلاً ۱۴۰۲).')
    setBusy(true); setErr('')
    const ok = await saveBenchmark({ ...d, name: d.name.trim(), costEur: eur }, initial?.id)
    setBusy(false)
    if (ok) onClose(); else setErr('ذخیره نشد؛ دوباره تلاش کنید.')
  }

  const num = (label: string, v: number | null, on: (n: number) => void, unit?: string) => (
    <label className="block">
      <span className="flex justify-between text-xs font-medium mb-1" style={{ color: INK_SOFT }}>{label}{unit && <small style={{ color: MUTED_FG }}>{unit}</small>}</span>
      <input type="number" dir="ltr" value={v ?? ''} onChange={(e) => on(parseFloat(e.target.value) || 0)} className="est-input est-mono w-full rounded-lg px-2.5 py-2 text-sm" style={{ background: SURFACE_2, border: `1px solid ${BORDER}`, color: INK, textAlign: 'left' }} />
    </label>
  )

  return createPortal(
    <div className="est-font est-drawer-back" dir="rtl" onClick={onClose}>
      <aside className="est-drawer" role="dialog" aria-modal="true" aria-labelledby="est-bm-title" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between gap-2 mb-4">
          <h2 id="est-bm-title" className="text-base font-extrabold" style={{ color: INK }}>{initial ? 'ویرایش پروژهٔ مرجع' : 'ثبت پروژهٔ مرجع'}</h2>
          <Btn kind="quiet" onClick={onClose} title="بستن"><X size={16} /></Btn>
        </header>
        <div className="space-y-3">
          <TextField label="نام پروژه" value={d.name} onChange={(v) => set('name', v)} placeholder="مثلاً خط انتقال گاز ۴۲ اینچ…" autoFocus />
          <TextField label="محل / استان" value={d.location} onChange={(v) => set('location', v)} placeholder="اختیاری" />
          <div className="grid grid-cols-2 gap-3">
            <div><span className="block text-xs font-medium mb-1" style={{ color: INK_SOFT }}>نوع هزینه</span><Segmented full value={d.kind} onChange={(v) => set('kind', v)} options={[['actual', 'تمام‌شده'], ['estimate', 'برآوردی']]} /></div>
            <label className="block"><span className="block text-xs font-medium mb-1" style={{ color: INK_SOFT }}>تقویت فشار / تلمبه‌خانه دارد؟</span><Segmented full value={d.hasCompressor ? 'y' : 'n'} onChange={(v) => set('hasCompressor', v === 'y')} options={[['n', 'خیر'], ['y', 'بله']]} /></label>
          </div>
          <div><span className="block text-xs font-medium mb-1" style={{ color: INK_SOFT }}>مسیر</span><Segmented full value={d.setting} onChange={(v) => set('setting', v)} options={[['onshore', 'خشکی'], ['offshore', 'دریایی'], ['mixed', 'هر دو']]} /></div>
          {d.setting !== 'offshore' && <div><span className="block text-xs font-medium mb-1" style={{ color: INK_SOFT }}>توپوگرافی غالب</span><Segmented full value={d.terrain} onChange={(v) => set('terrain', v)} options={[['flat', 'دشت'], ['mixed', 'ترکیبی'], ['mountain', 'کوهستانی']]} /></div>}
          <div className="grid grid-cols-3 gap-3">
            {num('طول', d.lengthKm, (n) => set('lengthKm', n), 'km')}
            {num('قطر', d.diameterIn, (n) => set('diameterIn', n), 'اینچ')}
            {num('سال هزینه', d.costYear, (n) => set('costYear', Math.round(n)), 'شمسی')}
          </div>
          <div><span className="block text-xs font-medium mb-1" style={{ color: INK_SOFT }}>ارز مبلغ</span><Segmented full value={d.currency} onChange={(v) => set('currency', v)} options={[['EUR', 'یورو'], ['USD', 'دلار'], ['IRR', 'ریال']]} /></div>
          <div className="grid grid-cols-2 gap-3">
            {num('مبلغ کل', d.amount, (n) => set('amount', n), d.currency === 'IRR' ? 'ریال' : d.currency === 'USD' ? 'دلار' : 'یورو')}
            {d.currency === 'IRR' && num('نرخ یورو در آن زمان', d.fxRialPerEur, (n) => set('fxRialPerEur', n), 'ریال')}
            {d.currency === 'USD' && num('برابری یورو به دلار', d.fxEurPerUsd, (n) => set('fxEurPerUsd', n), 'یورو/دلار')}
          </div>
          <div className="est-convert">
            <span>معادل یورویی</span><b className="est-mono">{eur > 0 ? fmtEUR(eur) : '—'}</b>
            {eur > 0 && d.lengthKm > 0 && d.diameterIn > 0 && <small className="est-mono">{fmtEURm(eur / d.lengthKm)}/km · €{fmtK(eur / d.lengthKm / d.diameterIn)}/inch-km</small>}
          </div>
          <div><span className="block text-xs font-medium mb-1" style={{ color: INK_SOFT }}>در روش‌های تاریخی و قیاسی استفاده شود؟</span><Segmented full value={d.useInEstimates ? 'y' : 'n'} onChange={(v) => set('useInEstimates', v === 'y')} options={[['y', 'بله'], ['n', 'خیر — دادهٔ پرت یا غیرقابل‌مقایسه']]} /></div>
          <label className="block"><span className="block text-xs font-medium mb-1" style={{ color: INK_SOFT }}>توضیحات</span>
            <textarea value={d.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className="est-input w-full rounded-lg px-3 py-2 text-sm" style={{ background: SURFACE_2, border: `1px solid ${BORDER}`, color: INK }} placeholder="دامنه، شرایط خاص، منبع عدد…" />
          </label>
          {err && <p role="alert" className="text-xs font-semibold" style={{ color: '#f08a8a' }}>{err}</p>}
        </div>
        <footer className="flex justify-end gap-2 mt-5">
          <Btn kind="quiet" onClick={onClose}>انصراف</Btn>
          <Btn kind="primary" disabled={busy} onClick={submit}>{busy ? 'در حال ذخیره…' : initial ? 'ذخیرهٔ تغییرات' : 'افزودن به کتابخانه'}</Btn>
        </footer>
      </aside>
    </div>,
    document.body,
  )
}

const LIB_STYLE = `
  .est-lib-hero { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 1rem; padding: 1.4rem 1.5rem; border-radius: 22px; border: 1px solid ${BORDER}; background: linear-gradient(135deg, rgba(25,158,112,.13), rgba(14,24,38,.92) 60%); }
  .est-lib-hero > div { max-width: 68ch; }
  .est-lib-hero h1 { font-size: clamp(1.25rem, 2.3vw, 1.7rem); font-weight: 900; color: ${INK}; margin: .55rem 0 .35rem; line-height: 1.4; }
  .est-lib-hero p { font-size: 12.5px; line-height: 2; color: ${INK_SOFT}; }
  .est-eyebrow { display: inline-flex; align-items: center; gap: .35rem; font-size: 11px; font-weight: 700; color: ${SAFETY}; background: rgba(242,183,5,.08); border: 1px solid rgba(242,183,5,.25); padding: .25rem .65rem; border-radius: 99px; }
  .est-search { display: flex; align-items: center; gap: .4rem; color: ${MUTED_FG}; background: ${SURFACE}; border: 1px solid ${BORDER}; border-radius: 10px; padding: .45rem .7rem; min-width: 220px; }
  .est-search input { background: transparent; outline: none; color: ${INK}; font-size: 12px; flex: 1; }
  .est-search:focus-within { border-color: ${SAFETY}; }
  .est-empty { display: grid; justify-items: center; gap: .6rem; text-align: center; padding: 2.4rem 1rem; border-radius: 20px; border: 1px dashed ${BORDER}; background: ${SURFACE}; }
  .est-skel { height: 120px; border-radius: 16px; background: linear-gradient(90deg, ${SURFACE} 0%, ${SURFACE_2} 50%, ${SURFACE} 100%); background-size: 200% 100%; animation: est-skel 1.3s ease-in-out infinite; }
  @keyframes est-skel { to { background-position: -200% 0; } }
  .est-box { position: relative; height: 16px; border-radius: 6px; background: rgba(255,255,255,.03); }
  .est-box-whisker { position: absolute; top: 7px; height: 2px; background: ${MUTED_FG}; }
  .est-box-iqr { position: absolute; top: 2px; bottom: 2px; border-radius: 4px; opacity: .85; transform-origin: left; animation: est-grow .7s var(--ease) both; }
  .est-box-med { position: absolute; top: -2px; bottom: -2px; width: 3px; margin-left: -1.5px; border-radius: 2px; background: #fff; }
  .est-bm { position: relative; padding: 1rem 1.05rem; border-radius: 16px; background: ${SURFACE}; border: 1px solid ${BORDER}; border-top: 3px solid var(--sc); transition: border-color .18s ease, transform .2s var(--ease); }
  .est-bm:hover { transform: translateY(-2px); }
  .est-bm.is-out { opacity: .72; border-top-style: dashed; }
  .est-bm-notes { font-size: 10.5px; line-height: 1.8; color: ${MUTED_FG}; margin: 0 0 .6rem; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .est-bm-notes:hover { -webkit-line-clamp: unset; }
  .est-bm-actions { position: absolute; left: .55rem; bottom: .55rem; display: flex; gap: .1rem; }
  @media (hover: hover) { .est-bm-actions { opacity: 0; transition: opacity .15s ease; } .est-bm:hover .est-bm-actions, .est-bm-actions:focus-within { opacity: 1; } }
  .est-kind { display: inline-flex; align-items: center; gap: .25rem; font-size: 10.5px; font-weight: 700; padding: .15rem .5rem; border-radius: 99px; color: ${INK_SOFT}; background: rgba(255,255,255,.05); border: 1px solid ${BORDER}; white-space: nowrap; }
  .est-kind.is-actual { color: #34d399; background: rgba(25,158,112,.12); border-color: rgba(52,211,153,.35); }
  .est-pill { font-size: 10.5px; font-weight: 600; padding: .12rem .5rem; border-radius: 99px; background: ${SURFACE_2}; border: 1px solid ${BORDER}; color: ${INK_SOFT}; }
  .est-icon-btn { padding: .45rem; border-radius: 9px; color: ${MUTED_FG}; transition: color .15s ease, background .15s ease; }
  .est-icon-btn:hover { color: ${INK}; background: rgba(255,255,255,.06); }
  .est-icon-btn.is-danger:hover { color: #e66767; }
  .est-drawer-back { position: fixed; inset: 0; z-index: 80; background: rgba(3,7,13,.62); backdrop-filter: blur(3px); display: flex; justify-content: flex-start; animation: est-fade .2s ease both; }
  @keyframes est-fade { from { opacity: 0; } }
  .est-drawer { width: min(100%, 460px); height: 100%; overflow-y: auto; padding: 1.3rem; background: ${SURFACE}; border-inline-end: 1px solid ${BORDER}; box-shadow: 0 0 60px rgba(0,0,0,.6); animation: est-drawer-in .32s var(--ease) both; }
  @keyframes est-drawer-in { from { transform: translateX(40px); opacity: 0; } }
  .est-convert { display: grid; gap: .15rem; padding: .75rem .9rem; border-radius: 12px; background: rgba(242,183,5,.07); border: 1px solid rgba(242,183,5,.28); }
  .est-convert span { font-size: 11px; color: ${MUTED_FG}; }
  .est-convert b { font-size: 1.2rem; color: ${SAFETY}; }
  .est-convert small { font-size: 11px; color: ${INK_SOFT}; }
  @media (prefers-reduced-motion: reduce) { .est-skel, .est-drawer, .est-drawer-back { animation: none; } }
`
