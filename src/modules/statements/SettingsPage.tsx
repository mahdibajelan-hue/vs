import { useEffect, useState, type CSSProperties } from 'react'
import { Plus, Save, Trash2, X } from 'lucide-react'
import { usePstStore, type Cfg } from './store/usePstStore'
import { DEFAULT_PAY_STEPS, MAT_STAGES, MAT_STAGE_FA, PART_META, stepsTotal, type MatStage, type PayStep } from './lib/stmtCore'
import { fa, short } from './ui'

const STAGE_COLORS: Record<MatStage, string> = { po_issue: '#6366f1', manufacturing: '#8b5cf6', inspection: '#a855f7', release: '#d946ef', shipping: '#0ea5e9', site_receipt: '#f59e0b', entry_inspection: '#10b981' }
const num = (v: string) => (v.trim() === '' ? null : Number(v))

export function SettingsPage({ contractId, onContract }: { contractId: string; onContract: (id: string) => void }) {
  const st = usePstStore()
  const c = st.contracts.find((x) => x.id === contractId)
  const [f, setF] = useState<Cfg | null>(null)
  useEffect(() => { if (c) setF(st.cfgOf(c.id)) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [contractId, st.cfg])
  if (!c || !f) return null
  const splitSum = f.engSplit.reduce((s, x) => s + x.pct, 0)
  const seqs = st.seqs.filter((s) => s.contractId === c.id)
  const capField = (k: 'capE' | 'capP' | 'capC', p: 'E' | 'P' | 'C') => (
    <label className="ps-field"><span style={{ color: PART_META[p].color }}>سقف بخش {PART_META[p].title} ({p}) — ریال</span><input inputMode="numeric" value={f[k] ?? ''} placeholder={`خالی = سقف کل قرارداد (${short(c.cap)})`} onChange={(e) => setF({ ...f, [k]: num(e.target.value) })} dir="ltr" /></label>
  )
  return (
    <div className="ps-stack">
      <section className="ps-card">
        <header className="ps-card-head"><b>قرارداد</b></header>
        <select value={contractId} onChange={(e) => onContract(e.target.value)} aria-label="قرارداد">{st.contracts.map((x) => <option key={x.id} value={x.id}>{x.no} — {x.title}</option>)}</select>
        <p className="ps-hint">مبلغ قرارداد {short(c.value)} ریال{c.amendments ? ` + الحاقیه‌ها ${short(c.amendments)}` : ''} = سقف کل {short(c.cap)} ریال · پیش‌پرداخت {fa(c.advPct)}٪ · حسن انجام کار قرارداد {fa(c.retPct)}٪ (از ماژول قراردادها و مالی).{!f.saved && ' — هنوز تنظیمی ذخیره نشده و مقادیر پیش‌فرض نمایش داده می‌شود.'}</p>
      </section>

      <section className="ps-card">
        <header className="ps-card-head"><b>سقف هر بخش و نرخ کسور</b></header>
        <div className="ps-grid">
          {capField('capE', 'E')}{capField('capP', 'P')}{capField('capC', 'C')}
        </div>
        <div className="ps-grid">
          {([['advRecoveryPct', 'استهلاک پیش‌پرداخت از هر صورت‌وضعیت ٪'], ['retPct', 'حسن انجام کار ٪'], ['taxPct', 'مالیات ٪'], ['insPct', 'بیمه ٪']] as const).map(([k, l]) => (
            <label key={k} className="ps-field"><span>{l}</span><input type="number" step="0.1" min={0} max={100} value={f[k]} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} dir="ltr" /></label>
          ))}
        </div>
        <p className="ps-hint">استهلاک پیش‌پرداخت تا جایی کسر می‌شود که کل پیش‌پرداخت قرارداد ({short((c.value * c.advPct) / 100)} ریال) مستهلک شود.</p>
      </section>

      <section className="ps-card" style={{ '--pc': PART_META.E.color } as CSSProperties}>
        <header className="ps-card-head"><b style={{ color: PART_META.E.color }}>E — مهندسی: سهم هر مرحلهٔ مدرک</b><span className={`pst-total ${Math.abs(splitSum - 100) < 0.01 ? 'is-ok' : 'is-bad'}`}>جمع {fa(splitSum)}٪</span></header>
        <div className="ps-grid">
          {f.engSplit.map((s, i) => <label key={s.key} className="ps-field"><span>{s.label}</span><input type="number" min={0} max={100} value={s.pct} onChange={(e) => setF({ ...f, engSplit: f.engSplit.map((x, j) => (j === i ? { ...x, pct: Number(e.target.value) } : x)) })} dir="ltr" /></label>)}
          <label className="ps-field"><span>مدارک این قرارداد در فهرست مدارک</span><select value={f.eDocContract ?? ''} onChange={(e) => setF({ ...f, eDocContract: e.target.value || null })}><option value="">برچسب «{c.no}» (و مدارک بدون برچسب)</option>{st.lookups.docContracts.map((d) => <option key={d} value={d}>برچسب «{d}»</option>)}</select></label>
        </div>
        <p className="ps-hint">مبلغ هر مدرک = قیمت مدرک در فهرست مدارک ماژول پیشرفت مهندسی × جمع سهم مراحلی که تا پایان ماه انجام شده است (تاریخ واقعی تهیه/ارسال و تاریخ واقعی تأیید). نسخه‌های جایگزین‌شده (superseded) دوباره پرداخت نمی‌شوند.</p>
      </section>

      <section className="ps-card">
        <header className="ps-card-head"><b>محدودهٔ منبع C و P (اختیاری)</b></header>
        <div className="ps-grid">
          <div className="ps-field"><span style={{ color: PART_META.C.color }}>C — فهرست‌بهای این قرارداد</span><Multi options={st.lookups.books.map((b) => ({ id: b.id, label: b.title }))} value={f.cBooks ?? []} onChange={(v) => setF({ ...f, cBooks: v })} empty="همهٔ ردیف‌های پیمان پروژه" /></div>
          <div className="ps-field"><span style={{ color: PART_META.P.color }}>P — بسته‌های کالای این قرارداد</span><Multi options={st.lookups.packages.map((k) => ({ id: k.id, label: `${k.code} — ${k.title}` }))} value={f.pPackages ?? []} onChange={(v) => setF({ ...f, pPackages: v })} empty="همهٔ اقلام کالای پروژه" /></div>
        </div>
      </section>

      <div className="pst-bar-actions"><span className="sp" /><button type="button" className="ps-btn is-primary" onClick={() => void st.saveCfg(f)}><Save size={14} /> ذخیرهٔ تنظیمات قرارداد</button></div>

      <section className="ps-card" style={{ '--pc': PART_META.P.color } as CSSProperties}>
        <header className="ps-card-head"><b style={{ color: PART_META.P.color }}>P — توالی پرداخت مرحله‌ای کالا</b></header>
        <p className="ps-hint" style={{ lineHeight: 2 }}>هر توالی می‌گوید چند درصد از ارزش هر قلم در کدام مرحله پرداخت می‌شود؛ مبلغ = درصد مرحله × مقداری از قلم که به آن مرحله رسیده × قیمت واحد (میانگین قیمت سفارش‌های خرید، یا قیمت قلم). اولویت: توالی خود قلم ← توالی گروه کالا ← توالی پیش‌فرض قرارداد.</p>
        {seqs.map((s) => <SeqEditor key={s.id} contractId={c.id} seq={s} />)}
        <SeqEditor contractId={c.id} />
      </section>
    </div>
  )
}

function Multi({ options, value, onChange, empty }: { options: { id: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; empty: string }) {
  return (
    <div style={{ display: 'grid', gap: '.3rem', maxHeight: '11rem', overflow: 'auto', padding: '.4rem .5rem', border: '1px solid var(--border-soft)', borderRadius: '.6rem' }}>
      <small style={{ color: 'var(--text-muted)' }}>{value.length ? `${fa(value.length)} مورد انتخاب شده` : `هیچ‌کدام = ${empty}`}</small>
      {options.map((o) => <label key={o.id} className="ps-checkbox"><input type="checkbox" checked={value.includes(o.id)} onChange={(e) => onChange(e.target.checked ? [...value, o.id] : value.filter((x) => x !== o.id))} /> {o.label}</label>)}
      {!options.length && <small style={{ color: 'var(--text-muted)' }}>موردی تعریف نشده است.</small>}
    </div>
  )
}

function SeqEditor({ contractId, seq }: { contractId: string; seq?: { id: string; title: string; groupId: string | null; materialId: string | null; steps: PayStep[] } }) {
  const st = usePstStore()
  const [open, setOpen] = useState(!!seq)
  const [f, setF] = useState(() => seq ?? { title: '', groupId: null as string | null, materialId: null as string | null, steps: DEFAULT_PAY_STEPS })
  const scope = f.materialId ? 'material' : f.groupId ? 'group' : 'default'
  const total = stepsTotal(f.steps)
  if (!open) return <div><button type="button" className="ps-btn" onClick={() => setOpen(true)}><Plus size={14} /> توالی پرداخت جدید</button></div>
  return (
    <div className="pst-seq">
      <div className="ps-grid">
        <label className="ps-field"><span>عنوان</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="مثلاً: لوله — پیش‌پرداخت ساخت" /></label>
        <label className="ps-field"><span>دامنه</span><select value={scope} onChange={(e) => setF({ ...f, groupId: e.target.value === 'group' ? st.lookups.groups[0]?.id ?? null : null, materialId: e.target.value === 'material' ? st.lookups.materials[0]?.id ?? null : null })}><option value="default">پیش‌فرض قرارداد (همهٔ اقلام)</option><option value="group">یک گروه کالا</option><option value="material">یک قلم کالا</option></select></label>
        {scope === 'group' && <label className="ps-field"><span>گروه کالا</span><select value={f.groupId ?? ''} onChange={(e) => setF({ ...f, groupId: e.target.value })}>{st.lookups.groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select></label>}
        {scope === 'material' && <label className="ps-field"><span>قلم کالا</span><select value={f.materialId ?? ''} onChange={(e) => setF({ ...f, materialId: e.target.value })}>{st.lookups.materials.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.title}</option>)}</select></label>}
      </div>
      <div className="pst-seq-bar" aria-hidden>{f.steps.map((s, i) => <i key={i} style={{ width: `${Math.max(0, s.pct)}%`, background: STAGE_COLORS[s.stage] }}>{s.pct >= 8 ? `${fa(s.pct)}٪` : ''}</i>)}</div>
      {f.steps.map((s, i) => (
        <div key={i} className="pst-step">
          <select value={s.stage} onChange={(e) => setF({ ...f, steps: f.steps.map((x, j) => (j === i ? { ...x, stage: e.target.value as MatStage } : x)) })} aria-label="مرحله">{MAT_STAGES.map((m) => <option key={m.key} value={m.key}>{m.label} — {m.source}</option>)}</select>
          <input type="number" min={0} max={100} value={s.pct} onChange={(e) => setF({ ...f, steps: f.steps.map((x, j) => (j === i ? { ...x, pct: Number(e.target.value) } : x)) })} aria-label={`درصد ${MAT_STAGE_FA[s.stage]}`} dir="ltr" />
          <button type="button" className="ps-btn is-ghost" onClick={() => setF({ ...f, steps: f.steps.filter((_, j) => j !== i) })} aria-label="حذف مرحله"><X size={14} /></button>
        </div>
      ))}
      <div className="pst-bar-actions">
        <button type="button" className="ps-btn" onClick={() => setF({ ...f, steps: [...f.steps, { stage: MAT_STAGES.find((m) => !f.steps.some((x) => x.stage === m.key))?.key ?? 'site_receipt', pct: Math.max(0, 100 - total) }] })}><Plus size={14} /> افزودن مرحله</button>
        <span className={`pst-total ${Math.abs(total - 100) < 0.01 ? 'is-ok' : 'is-bad'}`}>جمع {fa(total)}٪{Math.abs(total - 100) >= 0.01 ? ' — باید ۱۰۰٪ باشد' : ''}</span>
        <span className="sp" />
        {seq && <button type="button" className="ps-btn is-ghost" onClick={() => { if (window.confirm('این توالی حذف شود؟')) void st.removeSeq(seq.id) }}><Trash2 size={14} /> حذف</button>}
        {!seq && <button type="button" className="ps-btn is-ghost" onClick={() => setOpen(false)}>انصراف</button>}
        <button type="button" className="ps-btn is-primary" disabled={Math.abs(total - 100) >= 0.01 || !f.steps.length} onClick={async () => { if (await st.saveSeq(contractId, { id: seq?.id, title: f.title.trim() || (scope === 'default' ? 'پیش‌فرض قرارداد' : ''), groupId: scope === 'group' ? f.groupId : null, materialId: scope === 'material' ? f.materialId : null, steps: f.steps }) && !seq) setOpen(false) }}><Save size={14} /> ذخیرهٔ توالی</button>
      </div>
    </div>
  )
}
