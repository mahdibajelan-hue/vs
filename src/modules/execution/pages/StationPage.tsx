import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Download, Pencil, Plus, Search, Upload, Wrench, X } from 'lucide-react'
import { useCsStore, type CsEntity } from '../store/useCsStore'
import { useExecutionStore } from '../store/useExecutionStore'
import {
  csSummary, equipmentEarned, equipmentGaps, equipmentNext, mapImport, packReadiness, weldState, weldEarned, inchDia,
  EQ_KINDS, EQ_STEPS, IMPORT_HEADERS, PACK_STATUS_FA, SPOOL_EARNED, SPOOL_STAGES, SPOOL_STAGE_FA, WELD_STATE_FA,
  type CsEquipment, type CsLine, type CsSpool, type CsTestPack, type CsWeld, type ImportEntity, type SpoolStage, type WeldState,
} from '../lib/csCore'
import { readXlsx, writeXlsx } from '../../material/lib/control/xlsx'
import { Chip, DataTable, KpiCard, Section, fmtD, type Col } from '../../finance/components/fn'
import { FormModal, type FieldDef, type Vals } from '../../finance/components/FormModal'
import { Bar, Empty, fa, pct } from '../components/common'
import { todayTehran } from '../../../lib/today'
import type { ExTab } from '../ExecutionApp'

type P = { projectId: string; sub: string; onGo: (t: ExTab, s?: string) => void }

/**
 * ایستگاه تقویت فشار — the station's own execution registers: piping lines and spools (shop fabrication → erection),
 * shop and field welds measured in inch-dia, equipment installation and test packs. Progress is computed from these
 * registers (lib/csCore.ts) and the server enforces the NDT and test-pack rules (migration 050).
 */
export function StationPage({ projectId, sub, onGo }: P) {
  const load = useCsStore((s) => s.load)
  const loading = useCsStore((s) => s.loading)
  useEffect(() => { void load(projectId) }, [projectId, load])
  if (loading && useCsStore.getState().projectId !== projectId) return <div className="im-skeleton" style={{ height: 240 }} />
  switch (sub) {
    case 'lines': return <LinesView projectId={projectId} />
    case 'welds': return <WeldsView projectId={projectId} />
    case 'equipment': return <EquipmentView projectId={projectId} />
    case 'packs': return <PacksView projectId={projectId} />
    default: return <StationDash projectId={projectId} onGo={onGo} />
  }
}

function useCs() {
  const lines = useCsStore((s) => s.lines), spools = useCsStore((s) => s.spools), welds = useCsStore((s) => s.welds), equipment = useCsStore((s) => s.equipment), packs = useCsStore((s) => s.packs)
  return { lines, spools, welds, equipment, packs }
}
function useRights(projectId: string) {
  const can = useExecutionStore((s) => s.can)
  const review = can(projectId, 'review')
  return { write: review || can(projectId, 'record'), review }
}

// ── dashboard ──────────────────────────────────────────────────────────
function StationDash({ onGo }: { projectId: string; onGo: P['onGo'] }) {
  const d = useCs()
  const s = useMemo(() => csSummary(d), [d])
  if (!d.lines.length && !d.equipment.length) return (
    <Empty>
      <b style={{ display: 'block', marginBottom: 6 }}>شروع ثبت‌های ایستگاه</b>
      ۱) فهرست لاین‌ها را از اکسل وارد کنید (شمارهٔ لاین، سایز، کلاس، درصد NDT). ۲) اسپول‌ها و فهرست جوش‌ها (Weld List) را وارد کنید. ۳) تجهیزات را با تگ ثبت کنید. ۴) تست‌پک‌ها را بسازید و لاین‌ها را به آن‌ها وصل کنید. پیشرفت پایپینگ بر حسب اینچ‌قطر و آمادگی تست‌پک‌ها خودکار حساب می‌شود.
      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="im-btn im-btn-primary im-btn-sm" onClick={() => onGo('station', 'lines')}>لاین‌ها و اسپول‌ها</button>
        <button className="im-btn im-btn-sm" onClick={() => onGo('station', 'equipment')}>تجهیزات</button>
      </div>
    </Empty>
  )
  const rejTone = s.ndt.rejectRate == null ? 'neutral' : s.ndt.rejectRate > 0.05 ? 'bad' : s.ndt.rejectRate > 0.02 ? 'warn' : 'good'
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="پیشرفت پایپینگ (اینچ‌قطر)" value={pct(s.piping)} tone="good" sub={`${fa(s.all.earned, 0)} از ${fa(s.all.total, 0)} اینچ‌قطر`} onClick={() => onGo('station', 'welds')} />
        <KpiCard i={1} label="جوش کارگاهی" value={`${fa(s.shop.welded, 0)} ID`} sub={`از ${fa(s.shop.total, 0)} · ${fa(s.shop.weldedCount)} سرجوش`} />
        <KpiCard i={2} label="جوش میدانی" value={`${fa(s.field.welded, 0)} ID`} sub={`از ${fa(s.field.total, 0)} · ${fa(s.field.weldedCount)} سرجوش`} />
        <KpiCard i={3} label="نرخ رد NDT" value={pct(s.ndt.rejectRate)} tone={rejTone} sub={`${fa(s.ndt.rejected)} رد از ${fa(s.ndt.examined)} آزمون · ${fa(s.ndt.waiting)} منتظر`} hint="هر آزمونِ ردشده‌ای که به تعمیر انجامیده هم شمرده می‌شود" />
        <KpiCard i={4} label="نصب تجهیزات" value={pct(s.equipment.earned)} sub={`${fa(s.equipment.done)} از ${fa(s.equipment.total)} تجهیز کامل`} onClick={() => onGo('station', 'equipment')} />
        <KpiCard i={5} label="تست‌پک‌ها" value={`${fa(s.packs.tested + s.packs.reinstated)} / ${fa(s.packs.total)}`} tone={s.packs.ready ? 'good' : 'neutral'} sub={`${fa(s.packs.ready)} آمادهٔ آزمون`} onClick={() => onGo('station', 'packs')} />
      </div>
      <Section title="ساخت اسپول (کارگاه) تا نصب" hint="تعداد اسپول در هر مرحله؛ پیشرفت وزنی مراحل در پرانتز">
        <div className="cs-stages">
          {SPOOL_STAGES.map((st) => (
            <div key={st} className="cs-stage"><b>{fa(s.spools.byStage[st])}</b><span>{SPOOL_STAGE_FA[st]}</span><small>({pct(SPOOL_EARNED[st], 0)})</small></div>
          ))}
        </div>
        <p className="im-helper" style={{ margin: '8px 0 0' }}>پیشرفت ساخت و نصب اسپول‌ها: <b>{pct(s.spools.earned)}</b> از {fa(s.spools.total)} اسپول.</p>
      </Section>
      <div className="mt-two" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 12 }}>
        <Section title="پیشرفت لاین‌ها" hint="کمترین پیشرفت بالاتر" flush>
          <DataTable rows={s.byLine.filter((x) => x.welds).sort((a, b) => a.pct - b.pct).slice(0, 12)} rowKey={(x) => x.line.id} cols={[
            { key: 'l', label: 'لاین', render: (x) => <span className="strong fn-code" dir="ltr">{x.line.lineNo}</span> },
            { key: 'w', label: 'جوش', num: true, render: (x) => `${fa(x.welded)} / ${fa(x.welds)}` },
            { key: 'p', label: 'پیشرفت', render: (x) => <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Bar value={x.pct} /><b>{pct(x.pct, 0)}</b></span> },
          ]} />
        </Section>
        <Section title="جوشکاران" hint="اینچ‌قطر جوش‌شده و نرخ رد" flush>
          <DataTable rows={s.welders.slice(0, 12)} rowKey={(x) => x.welder} empty="هنوز جوشی با نام جوشکار ثبت نشده است." cols={[
            { key: 'n', label: 'جوشکار', render: (x) => <span className="strong" dir="auto">{x.welder}</span> },
            { key: 'i', label: 'اینچ‌قطر', num: true, render: (x) => fa(x.id, 1) },
            { key: 'r', label: 'نرخ رد', render: (x) => <Chip tone={x.rate == null ? 'neutral' : x.rate > 0.05 ? 'bad' : x.rate > 0.02 ? 'warn' : 'good'}>{pct(x.rate)}</Chip> },
          ]} />
        </Section>
      </div>
    </div>
  )
}

// ── shared: Excel import ───────────────────────────────────────────────
function ImportButton({ projectId, entity, label }: { projectId: string; entity: ImportEntity; label: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const d = useCs()
  const importRows = useCsStore((s) => s.importRows)
  const [msg, setMsg] = useState<{ ok: boolean; text: string[] } | null>(null)
  const run = async (f: File) => {
    const res = mapImport(entity, await readXlsx(f), d)
    if (res.errors.length) { setMsg({ ok: false, text: res.errors.slice(0, 12).concat(res.errors.length > 12 ? [`و ${fa(res.errors.length - 12)} خطای دیگر`] : []) }); return }
    if (!res.rows.length) { setMsg({ ok: false, text: ['فایل ردیفی ندارد.'] }); return }
    const n = await importRows(entity as CsEntity, projectId, res.rows)
    setMsg({ ok: n === res.rows.length, text: [`${fa(n)} ردیف از ${fa(res.rows.length)} ثبت شد.`] })
  }
  return (
    <>
      <button className="im-btn im-btn-sm" onClick={() => void writeXlsx([Object.fromEntries(IMPORT_HEADERS[entity].map((h) => [h, '']))], `قالب-${label}.xlsx`, label)}><Download size={13} /> قالب اکسل</button>
      <button className="im-btn im-btn-sm" onClick={() => ref.current?.click()}><Upload size={13} /> ورود {label} از اکسل</button>
      <input ref={ref} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run(f) }} />
      {msg && <div className={`im-card cs-msg ${msg.ok ? 'ok' : 'bad'}`} role="status" style={{ flexBasis: '100%' }}>
        {!msg.ok && <b>هیچ ردیفی ثبت نشد؛ این موارد را در فایل اصلاح کنید:</b>}
        <ul>{msg.text.map((t, i) => <li key={i}>{t}</li>)}</ul>
        <button className="im-btn im-btn-sm" onClick={() => setMsg(null)} aria-label="بستن"><X size={13} /></button>
      </div>}
    </>
  )
}
const Toolbar = ({ children }: { children: React.ReactNode }) => <div className="cs-toolbar no-print">{children}</div>
const SearchBox = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
  <label className="cs-search"><Search size={14} aria-hidden /><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} dir="auto" /></label>
)

// ── lines & spools ─────────────────────────────────────────────────────
function LinesView({ projectId }: { projectId: string }) {
  const d = useCs(), save = useCsStore((s) => s.save), setStage = useCsStore((s) => s.setSpoolStage)
  const r = useRights(projectId)
  const [q, setQ] = useState(''), [form, setForm] = useState<{ line?: CsLine } | null>(null), [spoolForm, setSpoolForm] = useState<{ spool?: CsSpool } | null>(null)
  const sum = useMemo(() => csSummary(d), [d])
  const byLine = new Map(sum.byLine.map((x) => [x.line.id, x]))
  const packNo = new Map(d.packs.map((p) => [p.id, p.packNo]))
  const lines = d.lines.filter((l) => !l.archived && (!q || `${l.lineNo} ${l.service} ${l.area} ${l.isoNo}`.includes(q)))
  const lineNo = new Map(d.lines.map((l) => [l.id, l.lineNo]))
  const spools = d.spools.filter((s) => !s.archived && (!q || `${s.spoolNo} ${lineNo.get(s.lineId) ?? ''} ${s.area}`.includes(q)))
  const lineFields: FieldDef[] = [
    { key: 'lineNo', label: 'شمارهٔ لاین', kind: 'text', required: true }, { key: 'sizeIn', label: 'سایز (اینچ)', kind: 'num', required: true },
    { key: 'service', label: 'سرویس / سیال', kind: 'text' }, { key: 'specClass', label: 'کلاس لوله', kind: 'text' }, { key: 'material', label: 'جنس', kind: 'text' }, { key: 'area', label: 'ناحیه / واحد', kind: 'text' },
    { key: 'isoNo', label: 'شمارهٔ ایزومتریک', kind: 'text' }, { key: 'designPressBar', label: 'فشار طراحی (bar)', kind: 'num' },
    { key: 'ndtPct', label: 'درصد NDT لازم', kind: 'pct', required: true, hint: 'در ایستگاه تقویت فشار معمولاً ۱۰۰٪' },
    { key: 'testPackId', label: 'تست‌پک', kind: 'select', options: [{ value: '', label: '—' }, ...d.packs.filter((p) => !p.archived).map((p) => ({ value: p.id, label: `${p.packNo}${p.system ? ` — ${p.system}` : ''}` }))] },
    { key: 'note', label: 'یادداشت', kind: 'text', span: 2 },
  ]
  const lineInit = (l?: CsLine): Vals => ({ lineNo: l?.lineNo ?? '', sizeIn: l?.sizeIn ?? '', service: l?.service ?? '', specClass: l?.specClass ?? '', material: l?.material ?? '', area: l?.area ?? '', isoNo: l?.isoNo ?? '', designPressBar: l?.designPressBar ?? '', ndtPct: l?.ndtPct ?? 100, testPackId: l?.testPackId ?? '', note: l?.note ?? '' })
  const spoolFields: FieldDef[] = [
    { key: 'lineId', label: 'لاین', kind: 'select', required: true, options: d.lines.filter((l) => !l.archived).map((l) => ({ value: l.id, label: l.lineNo })) },
    { key: 'spoolNo', label: 'شمارهٔ اسپول', kind: 'text', required: true }, { key: 'sizeIn', label: 'سایز (اینچ)', kind: 'num' }, { key: 'weightKg', label: 'وزن (کیلوگرم)', kind: 'num' },
    { key: 'area', label: 'ناحیه', kind: 'text' }, { key: 'isoNo', label: 'شمارهٔ ایزومتریک', kind: 'text' }, { key: 'note', label: 'یادداشت', kind: 'text', span: 2 },
  ]
  const nextStage = (s: CsSpool): SpoolStage | null => SPOOL_STAGES[SPOOL_STAGES.indexOf(s.stage) + 1] ?? null
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="جست‌وجوی لاین، اسپول، ناحیه" />
        {r.write && <><button className="im-btn im-btn-primary im-btn-sm" onClick={() => setForm({})}><Plus size={13} /> لاین</button><ImportButton projectId={projectId} entity="lines" label="لاین‌ها" /></>}
      </Toolbar>
      <Section title={`لاین‌ها (${fa(lines.length)})`} hint="پیشرفت هر لاین از اینچ‌قطر جوش‌های آن" flush>
        <DataTable rows={lines} rowKey={(l) => l.id} empty="لاینی ثبت نشده است." cols={[
          { key: 'n', label: 'لاین', render: (l) => <><span className="strong fn-code" dir="ltr">{l.lineNo}</span><span className="sub">{[l.service, l.area, l.isoNo].filter(Boolean).join(' · ')}</span></>, sort: (l) => l.lineNo },
          { key: 's', label: 'سایز', num: true, render: (l) => `${fa(l.sizeIn, 2)}″`, sort: (l) => l.sizeIn },
          { key: 'c', label: 'کلاس / جنس', render: (l) => [l.specClass, l.material].filter(Boolean).join(' · ') || '—' },
          { key: 'ndt', label: 'NDT', num: true, render: (l) => pct(l.ndtPct / 100, 0) },
          { key: 'tp', label: 'تست‌پک', render: (l) => (l.testPackId ? <span className="fn-code" dir="ltr">{packNo.get(l.testPackId)}</span> : <Chip tone="warn">بدون تست‌پک</Chip>) },
          { key: 'p', label: 'پیشرفت', render: (l) => { const x = byLine.get(l.id); return x?.welds ? <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Bar value={x.pct} /><b>{pct(x.pct, 0)}</b><small>{fa(x.welded)}/{fa(x.welds)}</small></span> : <span className="sub">بدون جوش</span> }, sort: (l) => byLine.get(l.id)?.pct ?? 0 },
          ...(r.write ? [{ key: 'e', label: '', render: (l: CsLine) => <button className="im-btn im-btn-sm" onClick={() => setForm({ line: l })} aria-label={`ویرایش ${l.lineNo}`}><Pencil size={13} /></button> } as Col<CsLine>] : []),
        ]} />
      </Section>
      <Toolbar>
        {r.write && <><button className="im-btn im-btn-primary im-btn-sm" onClick={() => setSpoolForm({})} disabled={!d.lines.length}><Plus size={13} /> اسپول</button><ImportButton projectId={projectId} entity="spools" label="اسپول‌ها" /></>}
      </Toolbar>
      <Section title={`اسپول‌ها (${fa(spools.length)})`} hint="هر اسپول به ترتیب: برش ← فیت‌آپ ← جوش ← NDT ← رنگ ← ارسال ← نصب. با دکمهٔ مرحلهٔ بعد، تاریخ امروز ثبت می‌شود." flush>
        <DataTable rows={spools} rowKey={(s) => s.id} empty="اسپولی ثبت نشده است." cols={[
          { key: 'n', label: 'اسپول', render: (s) => <><span className="strong fn-code" dir="ltr">{s.spoolNo}</span><span className="sub" dir="ltr">{lineNo.get(s.lineId)}</span></>, sort: (s) => s.spoolNo },
          { key: 'z', label: 'سایز / وزن', render: (s) => [s.sizeIn ? `${fa(s.sizeIn, 2)}″` : '', s.weightKg ? `${fa(s.weightKg)} kg` : ''].filter(Boolean).join(' · ') || '—' },
          { key: 'a', label: 'ناحیه', render: (s) => s.area || '—' },
          { key: 'st', label: 'مرحله', render: (s) => <><Chip tone={s.stage === 'erected' ? 'good' : s.stage === 'planned' ? 'neutral' : 'warn'}>{SPOOL_STAGE_FA[s.stage]}</Chip>{s.stageDates[s.stage] && <span className="sub">{fmtD(s.stageDates[s.stage]!)}</span>}</>, sort: (s) => SPOOL_STAGES.indexOf(s.stage) },
          ...(r.write ? [{ key: 'go', label: 'اقدام', render: (s: CsSpool) => { const nx = nextStage(s); return nx ? <button className="im-btn im-btn-sm" onClick={() => void setStage(s, nx, todayTehran())}><Check size={13} /> {SPOOL_STAGE_FA[nx]}</button> : <span className="sub">کامل</span> } } as Col<CsSpool>] : []),
        ]} />
      </Section>
      {form && <FormModal title={form.line ? `ویرایش لاین ${form.line.lineNo}` : 'لاین تازه'} fields={lineFields} initial={lineInit(form.line)} onClose={() => setForm(null)}
        onSubmit={async (v) => { await save('lines', projectId, { id: form.line?.id, lineNo: String(v.lineNo).trim(), sizeIn: Number(v.sizeIn), service: String(v.service ?? ''), specClass: String(v.specClass ?? ''), material: String(v.material ?? ''), area: String(v.area ?? ''), isoNo: String(v.isoNo ?? ''), designPressBar: v.designPressBar === '' || v.designPressBar == null ? null : Number(v.designPressBar), ndtPct: Number(v.ndtPct), testPackId: v.testPackId || null, note: String(v.note ?? '') }) }} />}
      {spoolForm && <FormModal title={spoolForm.spool ? `ویرایش اسپول ${spoolForm.spool.spoolNo}` : 'اسپول تازه'} fields={spoolFields} initial={{ lineId: spoolForm.spool?.lineId ?? '', spoolNo: spoolForm.spool?.spoolNo ?? '', sizeIn: spoolForm.spool?.sizeIn ?? '', weightKg: spoolForm.spool?.weightKg ?? '', area: spoolForm.spool?.area ?? '', isoNo: spoolForm.spool?.isoNo ?? '', note: spoolForm.spool?.note ?? '' }} onClose={() => setSpoolForm(null)}
        onSubmit={async (v) => { await save('spools', projectId, { id: spoolForm.spool?.id, lineId: String(v.lineId), spoolNo: String(v.spoolNo).trim(), sizeIn: v.sizeIn === '' ? null : Number(v.sizeIn), weightKg: v.weightKg === '' ? null : Number(v.weightKg), area: String(v.area ?? ''), isoNo: String(v.isoNo ?? ''), note: String(v.note ?? '') }) }} />}
    </div>
  )
}

// ── welds ──────────────────────────────────────────────────────────────
const STATE_TONE: Record<WeldState, 'good' | 'warn' | 'bad' | 'neutral'> = { planned: 'neutral', fitup: 'neutral', welded: 'warn', accepted: 'good', rejected: 'bad' }
function WeldsView({ projectId }: { projectId: string }) {
  const d = useCs(), save = useCsStore((s) => s.save)
  const r = useRights(projectId)
  const [q, setQ] = useState(''), [state, setState] = useState<WeldState | ''>(''), [loc, setLoc] = useState<'' | 'shop' | 'field'>('')
  const [form, setForm] = useState<{ weld?: CsWeld } | null>(null), [ndt, setNdt] = useState<{ weld: CsWeld; result: 'accept' | 'reject' } | null>(null), [weldOf, setWeldOf] = useState<CsWeld | null>(null)
  const lineById = new Map(d.lines.map((l) => [l.id, l]))
  const spoolNo = new Map(d.spools.map((s) => [s.id, s.spoolNo]))
  const welds = d.welds.filter((w) => !w.archived && (!state || weldState(w) === state) && (!loc || w.location === loc) && (!q || `${w.weldNo} ${lineById.get(w.lineId)?.lineNo ?? ''} ${w.welder} ${spoolNo.get(w.spoolId ?? '') ?? ''}`.includes(q)))
  const total = welds.reduce((n, w) => n + inchDia(w), 0)
  const today = todayTehran()
  const weldFields: FieldDef[] = [
    { key: 'lineId', label: 'لاین', kind: 'select', required: true, options: d.lines.filter((l) => !l.archived).map((l) => ({ value: l.id, label: l.lineNo })) },
    { key: 'weldNo', label: 'شمارهٔ جوش', kind: 'text', required: true },
    { key: 'location', label: 'محل جوش', kind: 'select', required: true, options: [{ value: 'shop', label: 'کارگاهی (شاپ)' }, { value: 'field', label: 'میدانی (فیلد)' }] },
    { key: 'jointType', label: 'نوع اتصال', kind: 'select', options: [{ value: 'BW', label: 'BW — لب‌به‌لب' }, { value: 'SW', label: 'SW — ساکت' }, { value: 'FW', label: 'FW — گوشه' }, { value: 'BR', label: 'BR — انشعاب' }] },
    { key: 'sizeIn', label: 'سایز (اینچ)', kind: 'num', required: true }, { key: 'thkMm', label: 'ضخامت (میلی‌متر)', kind: 'num' },
    { key: 'spoolId', label: 'اسپول', kind: 'select', options: [{ value: '', label: '—' }, ...d.spools.filter((s) => !s.archived).map((s) => ({ value: s.id, label: `${s.spoolNo} (${lineById.get(s.lineId)?.lineNo ?? ''})` }))] },
    { key: 'material', label: 'جنس', kind: 'text' }, { key: 'wps', label: 'WPS', kind: 'text' }, { key: 'note', label: 'یادداشت', kind: 'text', span: 2 },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="جوش، لاین، اسپول یا جوشکار" />
        <select className="im-select-pill" value={state} onChange={(e) => setState(e.target.value as WeldState | '')} aria-label="وضعیت"><option value="">همهٔ وضعیت‌ها</option>{(Object.keys(WELD_STATE_FA) as WeldState[]).map((k) => <option key={k} value={k}>{WELD_STATE_FA[k]}</option>)}</select>
        <select className="im-select-pill" value={loc} onChange={(e) => setLoc(e.target.value as '' | 'shop' | 'field')} aria-label="محل"><option value="">کارگاهی و میدانی</option><option value="shop">کارگاهی</option><option value="field">میدانی</option></select>
        {r.write && <><button className="im-btn im-btn-primary im-btn-sm" onClick={() => setForm({})} disabled={!d.lines.length}><Plus size={13} /> سرجوش</button><ImportButton projectId={projectId} entity="welds" label="سرجوش‌ها" /></>}
        <button className="im-btn im-btn-sm" onClick={() => void writeXlsx(welds.map((w) => ({ 'لاین': lineById.get(w.lineId)?.lineNo ?? '', 'جوش': w.weldNo, 'محل': w.location === 'shop' ? 'کارگاهی' : 'میدانی', 'سایز': w.sizeIn, 'اسپول': spoolNo.get(w.spoolId ?? '') ?? '', 'جوشکار': w.welder, 'فیت‌آپ': w.fitupDate ?? '', 'تاریخ جوش': w.weldDate ?? '', 'NDT': w.ndtMethod, 'نتیجه': WELD_STATE_FA[weldState(w)], 'تعمیر': w.repairCount })), 'سرجوش‌های-ایستگاه.xlsx', 'سرجوش‌ها')}><Download size={13} /> اکسل</button>
      </Toolbar>
      <Section title={`سرجوش‌ها (${fa(welds.length)} · ${fa(total, 1)} اینچ‌قطر)`} hint="فیت‌آپ ۳۰٪، جوشکاری ۶۰٪، قبولی NDT ۱۰٪ از اینچ‌قطر هر جوش. نتیجهٔ NDT را فقط دستگاه نظارت ثبت می‌کند." flush>
        <DataTable rows={welds.slice(0, 500)} rowKey={(w) => w.id} empty="سرجوشی با این فیلتر نیست." cols={[
          { key: 'n', label: 'جوش', render: (w) => <><span className="strong fn-code" dir="ltr">{w.weldNo}</span><span className="sub" dir="ltr">{lineById.get(w.lineId)?.lineNo}{w.spoolId ? ` · ${spoolNo.get(w.spoolId)}` : ''}</span></>, sort: (w) => w.weldNo },
          { key: 'l', label: 'محل', render: (w) => (w.location === 'shop' ? 'کارگاهی' : 'میدانی') },
          { key: 'z', label: 'ID', num: true, render: (w) => fa(w.sizeIn, 2), sort: (w) => w.sizeIn },
          { key: 'wd', label: 'جوشکار', render: (w) => w.welder || '—' },
          { key: 'd', label: 'تاریخ‌ها', render: (w) => <span className="sub">{w.fitupDate ? `فیت‌آپ ${fmtD(w.fitupDate)}` : ''}{w.weldDate ? ` · جوش ${fmtD(w.weldDate)}` : ''}{w.ndtDate ? ` · NDT ${fmtD(w.ndtDate)}` : ''}</span> },
          { key: 's', label: 'وضعیت', render: (w) => <><Chip tone={STATE_TONE[weldState(w)]}>{WELD_STATE_FA[weldState(w)]}</Chip>{w.repairCount > 0 && <span className="sub">{fa(w.repairCount)} بار تعمیر</span>}</>, sort: (w) => weldEarned(w) },
          ...(r.write ? [{ key: 'a', label: 'اقدام', render: (w: CsWeld) => {
            const st = weldState(w)
            return <span className="cs-acts">
              {st === 'planned' && <button className="im-btn im-btn-sm" onClick={() => void save('welds', projectId, { id: w.id, fitupDate: today })}>فیت‌آپ امروز</button>}
              {st === 'fitup' && <button className="im-btn im-btn-sm" onClick={() => setWeldOf(w)}>ثبت جوش</button>}
              {st === 'welded' && r.review && <><button className="im-btn im-btn-sm" onClick={() => setNdt({ weld: w, result: 'accept' })}><Check size={13} /> قبول</button><button className="im-btn im-btn-sm" onClick={() => setNdt({ weld: w, result: 'reject' })}><X size={13} /> رد</button></>}
              {st === 'rejected' && <button className="im-btn im-btn-sm" onClick={() => void save('welds', projectId, { id: w.id, ndtResult: 'pending', repairCount: w.repairCount + 1 })}><Wrench size={13} /> تعمیر انجام شد</button>}
              <button className="im-btn im-btn-sm" onClick={() => setForm({ weld: w })} aria-label={`ویرایش ${w.weldNo}`}><Pencil size={13} /></button>
            </span>
          } } as Col<CsWeld>] : []),
        ]} />
        {welds.length > 500 && <p className="im-helper" style={{ padding: '8px 14px' }}>۵۰۰ ردیف اول نمایش داده شده است؛ با جست‌وجو یا فیلتر محدود کنید.</p>}
      </Section>
      {form && <FormModal title={form.weld ? `ویرایش جوش ${form.weld.weldNo}` : 'سرجوش تازه'} fields={weldFields} onClose={() => setForm(null)}
        initial={{ lineId: form.weld?.lineId ?? '', weldNo: form.weld?.weldNo ?? '', location: form.weld?.location ?? 'shop', jointType: form.weld?.jointType ?? 'BW', sizeIn: form.weld?.sizeIn ?? '', thkMm: form.weld?.thkMm ?? '', spoolId: form.weld?.spoolId ?? '', material: form.weld?.material ?? '', wps: form.weld?.wps ?? '', note: form.weld?.note ?? '' }}
        onSubmit={async (v) => { await save('welds', projectId, { id: form.weld?.id, lineId: String(v.lineId), weldNo: String(v.weldNo).trim(), location: v.location, jointType: v.jointType || 'BW', sizeIn: Number(v.sizeIn), thkMm: v.thkMm === '' || v.thkMm == null ? null : Number(v.thkMm), spoolId: v.spoolId || null, material: String(v.material ?? ''), wps: String(v.wps ?? ''), note: String(v.note ?? '') }) }} />}
      {weldOf && <FormModal title={`ثبت جوشکاری ${weldOf.weldNo}`} submitLabel="ثبت" fields={[{ key: 'weldDate', label: 'تاریخ جوشکاری', kind: 'date', required: true }, { key: 'welder', label: 'کد جوشکار', kind: 'text', required: true }, { key: 'wps', label: 'WPS', kind: 'text' }]}
        initial={{ weldDate: today, welder: weldOf.welder, wps: weldOf.wps }} onClose={() => setWeldOf(null)}
        onSubmit={async (v) => { await save('welds', projectId, { id: weldOf.id, weldDate: String(v.weldDate), welder: String(v.welder).trim(), wps: String(v.wps ?? '') }) }} />}
      {ndt && <FormModal title={`${ndt.result === 'accept' ? 'قبولی' : 'رد'} NDT — جوش ${ndt.weld.weldNo}`} submitLabel={ndt.result === 'accept' ? 'ثبت قبولی' : 'ثبت رد'}
        fields={[{ key: 'ndtMethod', label: 'روش', kind: 'select', required: true, options: ['RT', 'UT', 'PAUT', 'MT', 'PT'].map((x) => ({ value: x, label: x })) }, { key: 'ndtDate', label: 'تاریخ', kind: 'date', required: true }, { key: 'ndtReport', label: 'شمارهٔ گزارش', kind: 'text' }]}
        initial={{ ndtMethod: ndt.weld.ndtMethod || 'RT', ndtDate: today, ndtReport: ndt.weld.ndtReport }} onClose={() => setNdt(null)}
        onSubmit={async (v) => { await save('welds', projectId, { id: ndt.weld.id, ndtResult: ndt.result, ndtMethod: String(v.ndtMethod), ndtDate: String(v.ndtDate), ndtReport: String(v.ndtReport ?? '') }) }} />}
    </div>
  )
}

// ── equipment ──────────────────────────────────────────────────────────
function EquipmentView({ projectId }: { projectId: string }) {
  const d = useCs(), save = useCsStore((s) => s.save)
  const r = useRights(projectId)
  const [q, setQ] = useState(''), [form, setForm] = useState<{ eq?: CsEquipment } | null>(null)
  const list = d.equipment.filter((e) => !e.archived && (!q || `${e.tag} ${e.title} ${e.area} ${EQ_KINDS[e.kind] ?? ''}`.includes(q)))
  const toggle = (e: CsEquipment, key: string) => {
    const steps = { ...e.steps }
    if (steps[key]) { if (!window.confirm('تاریخ این مرحله پاک شود؟')) return; delete steps[key] } else steps[key] = todayTehran()
    void save('equipment', projectId, { id: e.id, steps })
  }
  const fields: FieldDef[] = [
    { key: 'tag', label: 'تگ', kind: 'text', required: true }, { key: 'kind', label: 'نوع', kind: 'select', required: true, options: Object.entries(EQ_KINDS).map(([value, label]) => ({ value, label })) },
    { key: 'title', label: 'شرح', kind: 'text', span: 2 }, { key: 'area', label: 'ناحیه / واحد', kind: 'text' }, { key: 'weightT', label: 'وزن (تن)', kind: 'num' }, { key: 'note', label: 'یادداشت', kind: 'text', span: 2 },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="تگ، شرح یا ناحیه" />
        {r.write && <><button className="im-btn im-btn-primary im-btn-sm" onClick={() => setForm({})}><Plus size={13} /> تجهیز</button><ImportButton projectId={projectId} entity="equipment" label="تجهیزات" /></>}
      </Toolbar>
      <Section title={`نصب تجهیزات (${fa(list.length)})`} hint={`وزن مراحل: ${EQ_STEPS.filter((s) => s.weight).map((s) => `${s.fa} ${fa(s.weight)}٪`).join('، ')}. «آمادگی فونداسیون» پیش‌نیاز سیویل است. با زدن هر مرحله، تاریخ امروز ثبت می‌شود.`} flush>
        <DataTable rows={list} rowKey={(e) => e.id} empty="تجهیزی ثبت نشده است." cols={[
          { key: 't', label: 'تگ', render: (e) => <><span className="strong fn-code" dir="ltr">{e.tag}</span><span className="sub">{[e.title, EQ_KINDS[e.kind], e.area].filter(Boolean).join(' · ')}</span></>, sort: (e) => e.tag },
          { key: 'st', label: 'مراحل نصب', render: (e) => (
            <span className="cs-steps">{EQ_STEPS.map((s) => <button key={s.key} type="button" className={e.steps[s.key] ? 'on' : ''} disabled={!r.write} onClick={() => toggle(e, s.key)} title={e.steps[s.key] ? `${s.fa}: ${fmtD(e.steps[s.key])}` : s.fa} aria-pressed={!!e.steps[s.key]}>{s.fa}</button>)}</span>
          ) },
          { key: 'p', label: 'پیشرفت', render: (e) => <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Bar value={equipmentEarned(e)} /><b>{pct(equipmentEarned(e), 0)}</b></span>, sort: (e) => equipmentEarned(e) },
          { key: 'n', label: 'گام بعد / هشدار', render: (e) => { const g = equipmentGaps(e); return g.length ? <Chip tone="warn">{g[0]}</Chip> : <span className="sub">{equipmentNext(e)?.fa ?? 'کامل'}</span> } },
          ...(r.write ? [{ key: 'e', label: '', render: (e: CsEquipment) => <button className="im-btn im-btn-sm" onClick={() => setForm({ eq: e })} aria-label={`ویرایش ${e.tag}`}><Pencil size={13} /></button> } as Col<CsEquipment>] : []),
        ]} />
      </Section>
      {form && <FormModal title={form.eq ? `ویرایش ${form.eq.tag}` : 'تجهیز تازه'} fields={fields} onClose={() => setForm(null)}
        initial={{ tag: form.eq?.tag ?? '', kind: form.eq?.kind ?? 'compressor', title: form.eq?.title ?? '', area: form.eq?.area ?? '', weightT: form.eq?.weightT ?? '', note: form.eq?.note ?? '' }}
        onSubmit={async (v) => { await save('equipment', projectId, { id: form.eq?.id, tag: String(v.tag).trim(), kind: String(v.kind), title: String(v.title ?? ''), area: String(v.area ?? ''), weightT: v.weightT === '' || v.weightT == null ? null : Number(v.weightT), note: String(v.note ?? '') }) }} />}
    </div>
  )
}

// ── test packs ─────────────────────────────────────────────────────────
function PacksView({ projectId }: { projectId: string }) {
  const d = useCs(), save = useCsStore((s) => s.save)
  const r = useRights(projectId)
  const [form, setForm] = useState<{ pack?: CsTestPack } | null>(null), [test, setTest] = useState<{ pack: CsTestPack; to: 'tested' | 'reinstated' } | null>(null)
  const packs = d.packs.filter((p) => !p.archived)
  const fields: FieldDef[] = [
    { key: 'packNo', label: 'شمارهٔ تست‌پک', kind: 'text', required: true }, { key: 'system', label: 'سیستم / زیرسیستم', kind: 'text' },
    { key: 'medium', label: 'نوع آزمون', kind: 'select', required: true, options: [{ value: 'hydro', label: 'هیدرواستاتیک' }, { value: 'pneumatic', label: 'پنوماتیک' }, { value: 'service', label: 'سرویس / نشتی' }] },
    { key: 'testPressBar', label: 'فشار آزمون (bar)', kind: 'num' }, { key: 'punchA', label: 'پانچ A باز', kind: 'num' }, { key: 'punchB', label: 'پانچ B باز', kind: 'num' }, { key: 'note', label: 'یادداشت', kind: 'text', span: 2 },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Toolbar>{r.write && <button className="im-btn im-btn-primary im-btn-sm" onClick={() => setForm({})}><Plus size={13} /> تست‌پک</button>}<span className="im-helper" style={{ margin: 0 }}>لاین‌ها از صفحهٔ «لاین‌ها و اسپول‌ها» به تست‌پک وصل می‌شوند.</span></Toolbar>
      {!packs.length ? <Empty>تست‌پکی ثبت نشده است.</Empty> : (
        <div className="cs-packs">
          {packs.map((p) => {
            const rd = packReadiness(p, d.lines, d.welds)
            const done = p.status === 'tested' || p.status === 'reinstated'
            return (
              <article key={p.id} className="im-card cs-pack">
                <header><b className="fn-code" dir="ltr">{p.packNo}</b><Chip tone={done ? 'good' : rd.ready ? 'good' : 'warn'}>{done ? PACK_STATUS_FA[p.status] : rd.ready ? 'آمادهٔ آزمون' : 'ناآماده'}</Chip></header>
                <p className="sub">{[p.system, p.medium === 'hydro' ? 'هیدرواستاتیک' : p.medium === 'pneumatic' ? 'پنوماتیک' : 'سرویس', p.testPressBar ? `${fa(p.testPressBar)} bar` : ''].filter(Boolean).join(' · ')}</p>
                <div className="cs-pack-nums"><span><b>{fa(rd.lines)}</b> لاین</span><span><b>{fa(rd.welded)}/{fa(rd.welds)}</b> جوش</span><span><b>{fa(rd.accepted)}</b> قبول NDT</span><span><b>{fa(p.punchA)}</b> پانچ A</span></div>
                <Bar value={rd.welds ? (rd.welds - rd.blocking) / rd.welds : 0} />
                {!done && rd.reasons.length > 0 && <ul className="cs-reasons">{rd.reasons.map((x) => <li key={x}>{x}</li>)}</ul>}
                {done && <p className="sub">آزمون: {p.testDate ? fmtD(p.testDate) : '—'}{p.reinstatedDate ? ` · بازگردانی: ${fmtD(p.reinstatedDate)}` : ''}</p>}
                <footer>
                  {r.write && <button className="im-btn im-btn-sm" onClick={() => setForm({ pack: p })}><Pencil size={13} /> ویرایش</button>}
                  {r.review && !done && <button className="im-btn im-btn-primary im-btn-sm" disabled={!rd.ready} title={rd.ready ? '' : 'تا رفع موارد بالا ممکن نیست'} onClick={() => setTest({ pack: p, to: 'tested' })}>ثبت آزمون</button>}
                  {r.review && p.status === 'tested' && <button className="im-btn im-btn-sm" onClick={() => setTest({ pack: p, to: 'reinstated' })}>ثبت بازگردانی</button>}
                </footer>
              </article>
            )
          })}
        </div>
      )}
      {form && <FormModal title={form.pack ? `ویرایش ${form.pack.packNo}` : 'تست‌پک تازه'} fields={fields} onClose={() => setForm(null)}
        initial={{ packNo: form.pack?.packNo ?? '', system: form.pack?.system ?? '', medium: form.pack?.medium ?? 'hydro', testPressBar: form.pack?.testPressBar ?? '', punchA: form.pack?.punchA ?? 0, punchB: form.pack?.punchB ?? 0, note: form.pack?.note ?? '' }}
        onSubmit={async (v) => { await save('packs', projectId, { id: form.pack?.id, packNo: String(v.packNo).trim(), system: String(v.system ?? ''), medium: v.medium, testPressBar: v.testPressBar === '' || v.testPressBar == null ? null : Number(v.testPressBar), punchA: Number(v.punchA) || 0, punchB: Number(v.punchB) || 0, note: String(v.note ?? '') }) }} />}
      {test && <FormModal title={test.to === 'tested' ? `ثبت آزمون ${test.pack.packNo}` : `ثبت بازگردانی ${test.pack.packNo}`} submitLabel="ثبت" fields={[{ key: 'd', label: test.to === 'tested' ? 'تاریخ آزمون' : 'تاریخ بازگردانی', kind: 'date', required: true }]}
        initial={{ d: todayTehran() }} onClose={() => setTest(null)}
        onSubmit={async (v) => { await save('packs', projectId, test.to === 'tested' ? { id: test.pack.id, status: 'tested', testDate: String(v.d) } : { id: test.pack.id, status: 'reinstated', reinstatedDate: String(v.d) }) }} />}
    </div>
  )
}
