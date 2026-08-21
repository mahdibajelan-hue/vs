import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import { Printer, RotateCcw, ChevronDown, Gauge, Copy, Check } from 'lucide-react'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'

/* ---------------------------------------------------------------
   خط لوله — ماشین‌حساب برآورد مالی پروژه (Class 3 / EPC)
   طراحی: پالت "نوار هشدار خط لوله" — استیل‌بلو + زرد ایمنی
------------------------------------------------------------------*/

const INK = '#16232E'
const STEEL = '#1B4B66'
const STEEL_DARK = '#0F2F41'
const SAFETY = '#F2B705'
const TEAL = '#2A8C82'
const BURNT = '#B44711'
const PAPER = '#F3F5F7'
const LINE = '#D8DEE4'

const fmtUSD = (n: number) => '$' + Math.round(n).toLocaleString('en-US')
const fmtUSDm = (n: number) => (n / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'M'
const fmtToman = (n: number) => Math.round(n).toLocaleString('en-US')
const fmtPct = (n: number) => (n * 100).toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%'
const toFa = (s: number | string) => String(s).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])

interface EstimatorInputs {
  length: number
  diameter: number
  wt: number
  density: number
  fx: number
  escalation: number
  steel: number
  valves: number
  linework: number
  crossing: number
  test: number
  row: number
  hse: number
  terrain: number
  eng: number
  pm: number
  ins: number
  contingency: number
  duration: number
}

type ScenarioKey = 'steel' | 'terrain' | 'linework' | 'crossing' | 'contingency' | 'escalation' | 'fx'
type ScenarioOverrides = Record<ScenarioKey, number>

/** Eases toward the target value instead of jumping straight there — used only for the one
 * headline number, so a changed input reads as "the estimate moved" rather than a silent swap. */
function useCountUp(target: number, durationMs = 550) {
  const [value, setValue] = useState(target)
  const fromRef = useRef(target)
  const startRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }
    fromRef.current = value
    startRef.current = null
    const from = fromRef.current

    function tick(ts: number) {
      if (startRef.current === null) startRef.current = ts
      const elapsed = ts - startRef.current
      const t = Math.min(1, elapsed / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(from + (target - from) * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs])

  return value
}

function Field({
  label, value, onChange, unit, step = 1, min = 0, hint,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  unit?: string
  step?: number
  min?: number
  hint?: string
}) {
  return (
    <label className="block mb-3">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        {unit && <span className="text-[10px] text-slate-400">{unit}</span>}
      </div>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        onChange={(e) => onChange(parseFloat(e.target.value || '0'))}
        className="est-input w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-mono text-right transition-shadow"
        style={{ direction: 'ltr', textAlign: 'left' }}
      />
      {hint && <div className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">{hint}</div>}
    </label>
  )
}

function Section({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-slate-200">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between py-2.5 text-right">
        <span className="text-sm font-bold" style={{ color: STEEL_DARK }}>{title}</span>
        <ChevronDown size={16} className="transition-transform text-slate-400" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  )
}

const DEFAULTS: EstimatorInputs = {
  length: 50,
  diameter: 56,
  wt: 20,
  density: 7850,
  fx: 186000,
  escalation: 0.12,
  steel: 950,
  valves: 60000,
  linework: 320000,
  crossing: 40000,
  test: 15000,
  row: 30000,
  hse: 8000,
  terrain: 1.35,
  eng: 0.06,
  pm: 0.08,
  ins: 0.015,
  contingency: 0.15,
  duration: 20,
}

const SCEN_DEFAULTS: { low: ScenarioOverrides; high: ScenarioOverrides } = {
  low: { steel: 820, terrain: 1.2, linework: 280000, crossing: 25000, contingency: 0.10, escalation: 0.05, fx: 160000 },
  high: { steel: 1150, terrain: 1.55, linework: 380000, crossing: 65000, contingency: 0.25, escalation: 0.22, fx: 230000 },
}

const PHASES = [
  { name: 'فصل ۱', desc: 'بسیج کارگاه، تملک اراضی، مهندسی پایه', pct: 0.06 },
  { name: 'فصل ۲', desc: 'تأمین لوله و تجهیزات، مهندسی تفصیلی', pct: 0.16 },
  { name: 'فصل ۳', desc: 'شروع عملیات خطی (ترانشه و جوش)', pct: 0.20 },
  { name: 'فصل ۴', desc: 'ادامه عملیات خطی و تقاطع‌های اصلی (HDD)', pct: 0.24 },
  { name: 'فصل ۵', desc: 'تکمیل عملیات خطی و شیرآلات', pct: 0.18 },
  { name: 'فصل ۶', desc: 'تست هیدرواستاتیک، راه‌اندازی', pct: 0.11 },
  { name: 'فصل ۷', desc: 'تحویل موقت، مستندسازی و رفع نقص', pct: 0.05 },
]

function computeCBS(p: EstimatorInputs) {
  const pipeWeightKgPerM = Math.PI * (p.diameter * 0.0254) * (p.wt / 1000) * p.density
  const tonsPerKm = pipeWeightKgPerM
  const pipeCostPerKm = tonsPerKm * p.steel
  const rows = [
    { key: 'pipe', label: 'تأمین لوله فولادی و روکش', chartLabel: 'لوله فولادی', perKm: pipeCostPerKm },
    { key: 'valves', label: 'شیرآلات، حفاظت کاتدی، اسکادا', chartLabel: 'شیرآلات و کاتدی', perKm: p.valves },
    { key: 'linework', label: 'عملیات اجرایی خطی × ضریب توپوگرافی', chartLabel: 'عملیات خطی', perKm: p.linework * p.terrain },
    { key: 'crossing', label: 'عبور از موانع (HDD) × ضریب توپوگرافی', chartLabel: 'عبور از موانع', perKm: p.crossing * p.terrain },
    { key: 'test', label: 'تست هیدرواستاتیک و راه‌اندازی', chartLabel: 'تست هیدرواستاتیک', perKm: p.test },
    { key: 'row', label: 'تملک اراضی و حق‌الارض', chartLabel: 'تملک اراضی', perKm: p.row },
    { key: 'hse', label: 'HSE و مطالعات زیست‌محیطی', chartLabel: 'HSE و محیط‌زیست', perKm: p.hse },
  ]
  const direct = rows.reduce((s, r) => s + r.perKm, 0) * p.length
  const eng = direct * p.eng
  const pm = direct * p.pm
  const ins = direct * p.ins
  const indirect = eng + pm + ins
  const base = direct + indirect
  const contingency = base * p.contingency
  const escalation = base * p.escalation
  const grand = base + contingency + escalation
  return {
    rows: rows.map((r) => ({ ...r, total: r.perKm * p.length })),
    direct, eng, pm, ins, indirect, base, contingency, escalation, grand,
    tonsPerKm, pipeWeightKgPerM, perKm: grand / p.length,
  }
}

export function EstimatorApp({ onExitToHub }: { onExitToHub: () => void }) {
  const [p, setP] = useState<EstimatorInputs>({ ...DEFAULTS })
  const [scen, setScen] = useState<{ low: ScenarioOverrides; high: ScenarioOverrides }>(JSON.parse(JSON.stringify(SCEN_DEFAULTS)))
  const [phaseWeights, setPhaseWeights] = useState(PHASES.map((x) => x.pct))
  const [copied, setCopied] = useState(false)

  const set = (k: keyof EstimatorInputs) => (v: number) => setP((s) => ({ ...s, [k]: v }))

  const base = useMemo(() => computeCBS(p), [p])
  const low = useMemo(() => computeCBS({ ...p, ...scen.low }), [p, scen.low])
  const high = useMemo(() => computeCBS({ ...p, ...scen.high }), [p, scen.high])
  const animatedGrand = useCountUp(base.grand)

  const phaseSum = phaseWeights.reduce((a, b) => a + b, 0)
  const cashFlow = PHASES.map((ph, i) => ({
    name: ph.name,
    desc: ph.desc,
    pct: phaseWeights[i],
    usd: (phaseWeights[i] / (phaseSum || 1)) * base.grand,
  }))

  const tomanBn = (usd: number) => (usd * p.fx) / 1_000_000_000

  const cbsChartData = base.rows.map((r) => ({
    name: r.chartLabel,
    value: r.total,
  }))

  function resetAll() {
    setP({ ...DEFAULTS })
    setScen(JSON.parse(JSON.stringify(SCEN_DEFAULTS)))
    setPhaseWeights(PHASES.map((x) => x.pct))
  }

  function copySummary() {
    const txt =
      `برآورد مالی خط لوله ${toFa(p.diameter)} اینچ - طول ${toFa(p.length)} کیلومتر\n` +
      `سناریوی پایه: ${fmtUSD(base.grand)} (≈ ${fmtToman(tomanBn(base.grand))} میلیارد تومان)\n` +
      `بازه: ${fmtUSD(low.grand)} تا ${fmtUSD(high.grand)}\n` +
      `هزینه هر کیلومتر: ${fmtUSD(base.perKm)}`
    navigator.clipboard?.writeText(txt).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  const barColors = [STEEL, '#2E6C8E', TEAL, '#3E9C90', SAFETY, '#C98A00', BURNT]

  const scenarioLabels: Record<ScenarioKey, string> = {
    steel: 'قیمت فولاد',
    terrain: 'ضریب توپوگرافی',
    linework: 'عملیات اجرایی خطی',
    crossing: 'عبور از موانع',
    contingency: 'پیش‌بینی‌نشده',
    escalation: 'ذخیره نوسان ارزی',
    fx: 'نرخ ارز',
  }

  return (
    <div dir="rtl" lang="fa" style={{ background: PAPER, minHeight: '100vh', color: INK }} className="est-font">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
        .est-font { font-family: 'Vazirmatn', Tahoma, Arial, sans-serif; }
        .est-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .est-input:focus { outline: none; box-shadow: 0 0 0 2px ${SAFETY}; }

        @keyframes est-hazard-move {
          from { background-position: 0 0; }
          to { background-position: 56px 0; }
        }
        .est-hazard {
          height: 6px;
          background: repeating-linear-gradient(135deg, ${SAFETY} 0 14px, ${STEEL_DARK} 14px 28px);
          animation: est-hazard-move 3.2s linear infinite;
        }

        @keyframes est-fade-up {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .est-fade-in { animation: est-fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }

        @keyframes est-glow-pulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.6; }
        }
        .est-total-glow {
          position: absolute; inset: -14px -22px;
          background: radial-gradient(closest-side, rgba(242,183,5,0.35), transparent 72%);
          animation: est-glow-pulse 3.4s ease-in-out infinite;
          pointer-events: none;
          z-index: 0;
        }

        .est-card { transition: transform 0.25s ease, box-shadow 0.25s ease; }
        .est-card:hover { transform: translateY(-2px); box-shadow: 0 12px 28px -14px rgba(15,47,65,0.28); }

        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-card { box-shadow: none !important; border: 1px solid #ccc !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .est-hazard, .est-fade-in, .est-total-glow, .est-card { animation: none !important; transition: none !important; }
        }
      `}</style>

      <div className="est-hazard" />

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${STEEL_DARK}, #0A2434)` }} className="text-white">
        <div className="max-w-6xl mx-auto px-6 pt-3 flex items-center justify-between no-print">
          <div className="text-xs tracking-widest uppercase text-slate-400">RASTA · برآورد هزینه پروژه</div>
          <ModuleHeaderActions onExitToHub={onExitToHub} />
        </div>
        <div className="max-w-6xl mx-auto px-6 pb-6 pt-3 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="est-fade-in">
            <div className="text-xs tracking-widest uppercase text-slate-300 mb-1 flex items-center gap-2">
              <Gauge size={14} /> ماشین‌حساب برآورد مالی EPC
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold">
              خط لوله {toFa(p.diameter)} اینچ انتقال گاز — {toFa(p.length)} کیلومتر
            </h1>
            <div className="text-sm text-slate-300 mt-1">مسیر ترکیبی کوهستانی · سطح برآورد AACE Class 3</div>
          </div>
          <div className="flex items-end gap-6 est-fade-in" style={{ animationDelay: '80ms' }}>
            <div className="text-left relative">
              <div className="est-total-glow" />
              <div className="relative z-10 text-[11px] text-slate-300 mb-0.5">جمع کل پروژه (سناریوی پایه)</div>
              <div className="relative z-10 text-3xl md:text-4xl font-extrabold est-mono" style={{ color: SAFETY }}>
                {fmtUSD(animatedGrand)}
              </div>
              <div className="relative z-10 text-xs text-slate-300 est-mono mt-0.5">
                ≈ {fmtToman(tomanBn(base.grand))} میلیارد تومان
              </div>
            </div>
          </div>
        </div>
        {/* scenario strip */}
        <div className="max-w-6xl mx-auto px-6 pb-4 flex gap-2 text-xs no-print est-fade-in" style={{ animationDelay: '140ms' }}>
          <div className="px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
            خوش‌بینانه: <span className="est-mono">{fmtUSDm(low.grand)}</span>
          </div>
          <div className="px-3 py-1.5 rounded-full" style={{ background: SAFETY, color: STEEL_DARK, fontWeight: 700 }}>
            پایه: <span className="est-mono">{fmtUSDm(base.grand)}</span>
          </div>
          <div className="px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
            بدبینانه: <span className="est-mono">{fmtUSDm(high.grand)}</span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
        {/* Sidebar inputs */}
        <div className="no-print est-card bg-white rounded-xl border border-slate-200 p-4 h-fit sticky top-4">
          <div className="flex items-center justify-between mb-2">
            <div className="font-bold text-sm" style={{ color: STEEL_DARK }}>مفروضات و ورودی‌ها</div>
            <button onClick={resetAll} className="text-slate-400 hover:text-slate-700 transition-colors" title="بازنشانی">
              <RotateCcw size={15} />
            </button>
          </div>

          <Section title="۱. مشخصات فنی" defaultOpen>
            <Field label="طول خط لوله" unit="کیلومتر" value={p.length} onChange={set('length')} />
            <Field label="قطر لوله" unit="اینچ" value={p.diameter} onChange={set('diameter')} />
            <Field label="ضخامت جداره (WT)" unit="میلی‌متر" value={p.wt} onChange={set('wt')} step={0.5} />
            <div className="text-[11px] text-slate-500 est-mono">
              وزن لوله محاسبه‌شده: {base.pipeWeightKgPerM.toFixed(1)} kg/m
            </div>
          </Section>

          <Section title="۲. نرخ ارز و ذخیره">
            <Field label="نرخ دلار آزاد" unit="تومان/دلار" value={p.fx} onChange={set('fx')} step={1000} />
            <Field label="ذخیره نوسان ارزی/تورمی" unit="کسر اعشاری" value={p.escalation} onChange={set('escalation')} step={0.01} />
          </Section>

          <Section title="۳. نرخ‌های واحد ($/km)">
            <Field label="قیمت فولاد لوله" unit="$/تن" value={p.steel} onChange={set('steel')} step={10} />
            <Field label="شیرآلات/کاتدی/اسکادا" unit="$/km" value={p.valves} onChange={set('valves')} step={1000} />
            <Field label="عملیات اجرایی خطی" unit="$/km" value={p.linework} onChange={set('linework')} step={5000} />
            <Field label="عبور از موانع (HDD)" unit="$/km" value={p.crossing} onChange={set('crossing')} step={1000} />
            <Field label="تست هیدرواستاتیک" unit="$/km" value={p.test} onChange={set('test')} step={1000} />
            <Field label="تملک اراضی (ROW)" unit="$/km" value={p.row} onChange={set('row')} step={1000} />
            <Field label="HSE و محیط‌زیست" unit="$/km" value={p.hse} onChange={set('hse')} step={500} />
          </Section>

          <Section title="۴. ضرایب و سربار">
            <Field label="ضریب توپوگرافی" value={p.terrain} onChange={set('terrain')} step={0.05}
              hint="۱٫۰ مسطح — ۱٫۲ تا ۱٫۴ ترکیبی — ۱٫۵ تا ۱٫۸ کوهستانی" />
            <Field label="مهندسی و طراحی" value={p.eng} onChange={set('eng')} step={0.01} />
            <Field label="مدیریت پروژه (EPCM)" value={p.pm} onChange={set('pm')} step={0.01} />
            <Field label="بیمه و ضمانت‌نامه" value={p.ins} onChange={set('ins')} step={0.005} />
            <Field label="پیش‌بینی‌نشده (Contingency)" value={p.contingency} onChange={set('contingency')} step={0.01} />
          </Section>

          <Section title="۵. سناریوهای حساسیت (Low/High)">
            <div className="text-[11px] text-slate-500 mb-2">مقادیر «پایه» از بخش‌های بالا خوانده می‌شود.</div>
            {(Object.keys(scenarioLabels) as ScenarioKey[]).map((k) => (
              <div key={k} className="grid grid-cols-2 gap-2 mb-2">
                <Field label={`${scenarioLabels[k]} (Low)`} value={scen.low[k]} step={k === 'fx' ? 1000 : 0.01}
                  onChange={(v) => setScen((s) => ({ ...s, low: { ...s.low, [k]: v } }))} />
                <Field label={`${scenarioLabels[k]} (High)`} value={scen.high[k]} step={k === 'fx' ? 1000 : 0.01}
                  onChange={(v) => setScen((s) => ({ ...s, high: { ...s.high, [k]: v } }))} />
              </div>
            ))}
          </Section>

          <Section title="۶. زمان‌بندی فصلی">
            <Field label="مدت اجرا" unit="ماه" value={p.duration} onChange={set('duration')} />
            {PHASES.map((ph, i) => (
              <Field key={ph.name} label={ph.name} unit="سهم" value={phaseWeights[i]} step={0.01}
                onChange={(v) => setPhaseWeights((w) => w.map((x, j) => (j === i ? v : x)))} />
            ))}
            <div className="text-[11px] est-mono" style={{ color: Math.abs(phaseSum - 1) > 0.001 ? BURNT : TEAL }}>
              جمع سهم فصل‌ها: {fmtPct(phaseSum)}
            </div>
          </Section>
        </div>

        {/* Results */}
        <div className="space-y-6">
          {/* Toolbar */}
          <div className="flex flex-wrap gap-2 no-print est-fade-in">
            <button onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-white transition-transform hover:scale-[1.02]"
              style={{ background: STEEL }}>
              <Printer size={15} /> چاپ / خروجی PDF گزارش
            </button>
            <button onClick={copySummary}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border border-slate-300 bg-white transition-transform hover:scale-[1.02]">
              {copied ? <Check size={15} color={TEAL} /> : <Copy size={15} />}
              {copied ? 'کپی شد' : 'کپی خلاصه نتایج'}
            </button>
          </div>

          {/* CBS Table */}
          <div className="est-card bg-white rounded-xl border border-slate-200 p-5 print-card est-fade-in" style={{ animationDelay: '60ms' }}>
            <h2 className="font-bold mb-3" style={{ color: STEEL_DARK }}>ساختار شکست هزینه (CBS)</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 text-xs border-b" style={{ borderColor: LINE }}>
                  <th className="text-right py-1.5 font-medium">شرح</th>
                  <th className="text-left py-1.5 font-medium est-mono">$/km</th>
                  <th className="text-left py-1.5 font-medium est-mono">جمع (دلار)</th>
                  <th className="text-left py-1.5 font-medium est-mono">میلیارد تومان</th>
                </tr>
              </thead>
              <tbody>
                {base.rows.map((r, i) => (
                  <tr key={r.key} className="border-b" style={{ borderColor: LINE, borderRight: `3px solid ${barColors[i % barColors.length]}` }}>
                    <td className="py-1.5 pr-2">{r.label}</td>
                    <td className="text-left est-mono text-slate-600">{fmtUSD(r.perKm)}</td>
                    <td className="text-left est-mono">{fmtUSD(r.total)}</td>
                    <td className="text-left est-mono text-slate-500">{fmtToman(tomanBn(r.total))}</td>
                  </tr>
                ))}
                <tr className="font-bold" style={{ background: '#F7F3E2' }}>
                  <td className="py-2">جمع هزینه‌های مستقیم</td><td /><td className="text-left est-mono">{fmtUSD(base.direct)}</td>
                  <td className="text-left est-mono">{fmtToman(tomanBn(base.direct))}</td>
                </tr>
                <tr className="border-b" style={{ borderColor: LINE }}>
                  <td className="py-1.5 text-slate-600">مهندسی و طراحی</td><td /><td className="text-left est-mono">{fmtUSD(base.eng)}</td><td className="text-left est-mono text-slate-500">{fmtToman(tomanBn(base.eng))}</td>
                </tr>
                <tr className="border-b" style={{ borderColor: LINE }}>
                  <td className="py-1.5 text-slate-600">مدیریت پروژه (EPCM)</td><td /><td className="text-left est-mono">{fmtUSD(base.pm)}</td><td className="text-left est-mono text-slate-500">{fmtToman(tomanBn(base.pm))}</td>
                </tr>
                <tr className="border-b" style={{ borderColor: LINE }}>
                  <td className="py-1.5 text-slate-600">بیمه و ضمانت‌نامه</td><td /><td className="text-left est-mono">{fmtUSD(base.ins)}</td><td className="text-left est-mono text-slate-500">{fmtToman(tomanBn(base.ins))}</td>
                </tr>
                <tr className="border-b" style={{ borderColor: LINE }}>
                  <td className="py-1.5">پیش‌بینی‌نشده ({fmtPct(p.contingency)})</td><td /><td className="text-left est-mono">{fmtUSD(base.contingency)}</td><td className="text-left est-mono text-slate-500">{fmtToman(tomanBn(base.contingency))}</td>
                </tr>
                <tr className="border-b" style={{ borderColor: LINE }}>
                  <td className="py-1.5">ذخیره نوسان ارزی ({fmtPct(p.escalation)})</td><td /><td className="text-left est-mono">{fmtUSD(base.escalation)}</td><td className="text-left est-mono text-slate-500">{fmtToman(tomanBn(base.escalation))}</td>
                </tr>
                <tr className="font-extrabold text-white" style={{ background: STEEL_DARK }}>
                  <td className="py-2.5 rounded-r-md">جمع کل برآورد پروژه (EPC)</td><td />
                  <td className="text-left est-mono" style={{ color: SAFETY }}>{fmtUSD(base.grand)}</td>
                  <td className="text-left est-mono rounded-l-md" style={{ color: SAFETY }}>{fmtToman(tomanBn(base.grand))}</td>
                </tr>
              </tbody>
            </table>
            <div className="text-xs text-slate-400 mt-3">
              هزینه هر کیلومتر (میانگین): <span className="est-mono">{fmtUSD(base.perKm)}</span>
            </div>
          </div>

          {/* Chart */}
          <div className="est-card bg-white rounded-xl border border-slate-200 p-5 print-card est-fade-in" style={{ animationDelay: '110ms' }}>
            <h2 className="font-bold mb-3" style={{ color: STEEL_DARK }}>سهم اقلام هزینه مستقیم</h2>
            {/* Recharts lays out and anchors its SVG text assuming LTR; under the page's RTL
                direction its category-axis labels render mirrored into the plot area and collide
                with the bars/value labels. Forcing dir="ltr" just on the chart restores Recharts'
                own intended layout without affecting the rest of the (RTL) page. */}
            <div dir="ltr">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={cbsChartData} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={LINE} />
                <XAxis type="number" tickFormatter={(v) => fmtUSDm(v)} tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: string) => (v.length > 14 ? v.slice(0, 13) + '…' : v)}
                />
                <Tooltip formatter={(v) => fmtUSD(Number(v))} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} animationDuration={700} animationEasing="ease-out">
                  {cbsChartData.map((_, i) => (<Cell key={i} fill={barColors[i % barColors.length]} />))}
                  <LabelList dataKey="value" position="right" formatter={(v) => fmtUSDm(Number(v))} style={{ fontSize: 11, fill: INK }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
          </div>

          {/* Cash flow */}
          <div className="est-card bg-white rounded-xl border border-slate-200 p-5 print-card est-fade-in" style={{ animationDelay: '160ms' }}>
            <h2 className="font-bold mb-3" style={{ color: STEEL_DARK }}>زمان‌بندی اجرا و جریان نقدی</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={cashFlow} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={LINE} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => fmtUSDm(v)} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => fmtUSD(Number(v))} labelFormatter={(l, d) => (d?.[0]?.payload as { desc?: string } | undefined)?.desc || l} />
                <Bar dataKey="usd" radius={[4, 4, 0, 0]} animationDuration={700} animationEasing="ease-out">
                  {cashFlow.map((_, i) => (<Cell key={i} fill={i % 2 === 0 ? STEEL : '#2E6C8E'} />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <table className="w-full text-xs mt-2">
              <tbody>
                {cashFlow.map((c) => (
                  <tr key={c.name} className="border-b" style={{ borderColor: LINE }}>
                    <td className="py-1 w-16">{c.name}</td>
                    <td className="py-1 text-slate-500">{c.desc}</td>
                    <td className="py-1 text-left est-mono w-20">{fmtPct(c.pct)}</td>
                    <td className="py-1 text-left est-mono w-28">{fmtToman(tomanBn(c.usd))} B.T</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Sensitivity */}
          <div className="est-card bg-white rounded-xl border border-slate-200 p-5 print-card est-fade-in" style={{ animationDelay: '210ms' }}>
            <h2 className="font-bold mb-3" style={{ color: STEEL_DARK }}>تحلیل حساسیت — سناریوها</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 text-xs border-b" style={{ borderColor: LINE }}>
                  <th className="text-right py-1.5 font-medium">سناریو</th>
                  <th className="text-left py-1.5 font-medium est-mono">جمع کل (دلار)</th>
                  <th className="text-left py-1.5 font-medium est-mono">میلیارد تومان</th>
                  <th className="text-left py-1.5 font-medium est-mono">$/km</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b" style={{ borderColor: LINE }}>
                  <td className="py-2">خوش‌بینانه (Low)</td>
                  <td className="text-left est-mono">{fmtUSD(low.grand)}</td>
                  <td className="text-left est-mono">{fmtToman(tomanBn(low.grand))}</td>
                  <td className="text-left est-mono">{fmtUSD(low.perKm)}</td>
                </tr>
                <tr className="border-b font-bold" style={{ borderColor: LINE, background: '#F7F3E2' }}>
                  <td className="py-2">پایه (Base)</td>
                  <td className="text-left est-mono">{fmtUSD(base.grand)}</td>
                  <td className="text-left est-mono">{fmtToman(tomanBn(base.grand))}</td>
                  <td className="text-left est-mono">{fmtUSD(base.perKm)}</td>
                </tr>
                <tr>
                  <td className="py-2">بدبینانه (High)</td>
                  <td className="text-left est-mono">{fmtUSD(high.grand)}</td>
                  <td className="text-left est-mono">{fmtToman(tomanBn(high.grand))}</td>
                  <td className="text-left est-mono">{fmtUSD(high.perKm)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="text-[11px] text-slate-400 leading-relaxed px-1 pb-6">
            توجه: نرخ‌های واحد هزینه، مقادیر شاخص (Order-of-Magnitude) برای سطح برآورد Class 3 هستند.
            پیش از ارائه نهایی و تصمیم‌گیری سرمایه‌گذاری، با فهرست‌بهای مصوب و استعلام بازار روز راستی‌آزمایی شوند.
          </div>
        </div>
      </div>
    </div>
  )
}
