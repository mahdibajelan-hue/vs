import { useState, type CSSProperties, type ReactNode } from 'react'
import { CheckCircle2, Clock, Pencil, Plus, Printer, Trash2, XCircle, Zap } from 'lucide-react'
import { ShamsiDate } from '../../../components/common/ShamsiField'
import { useAuthStore } from '../../../store/useAuthStore'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { formatJalali } from '../../../lib/jalali'
import { todayTehran } from '../../../lib/today'
import { useTestingStore } from '../store/useTestingStore'
import {
  CP_CRITERIA, ELEC_STEPS, electricalTest, holidayKv, JOINT_SYSTEMS, jointChecks, jointMinMm, MAIN_COATINGS, PROFILE_UM,
  type Check, type Cleanliness, type CpCriterion, type JointSystem, type MainCoating, type PotentialRow,
} from '../lib/coatingCore'
import type { CtTest } from '../repo'

const fa = (v: number, d = 2) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })
const RES: Record<CtTest['result'], { label: string; color: string }> = { pass: { label: 'قبول', color: '#22c55e' }, fail: { label: 'مردود', color: '#ef4444' }, pending: { label: 'ناقص', color: '#94a3b8' } }
type D = Record<string, unknown>
const CSS = `.cq-checks{display:grid;gap:.2rem;font-size:12px}.cq-checks div{display:grid;grid-template-columns:1.2rem 1fr auto;gap:.5rem;align-items:center;padding:.3rem .55rem;border-radius:.6rem;background:color-mix(in srgb,var(--c) 8%,transparent)}
.cq-checks div span{color:var(--text-muted)}.cq-checks div b{font-variant-numeric:tabular-nums}.cq-checks small{grid-column:2/4;color:var(--text-muted)}
.cq-badge{display:inline-flex;align-items:center;gap:.3rem;padding:.12rem .55rem;border-radius:99px;font-size:11px;font-weight:800;color:var(--c);border:1px solid color-mix(in srgb,var(--c) 45%,transparent)}
.cq-kv{display:flex;flex-wrap:wrap;gap:.5rem;align-items:baseline}.cq-kv b{font-size:1.5rem;font-variant-numeric:tabular-nums}.cq-sub{display:grid;gap:.45rem;padding:.65rem .8rem;border:1px dashed var(--border-soft);border-radius:.9rem}.cq-sub>b{font-size:12.5px}
.cq-et td input{width:100%;min-width:4.5rem}`
const Badge = ({ r }: { r: CtTest['result'] }) => <span className="cq-badge" style={{ '--c': RES[r].color } as CSSProperties}>{RES[r].label}</span>
function Checks({ cs }: { cs: Check[] }) {
  return <div className="cq-checks">{cs.map((c) => { const col = c.ok == null ? '#94a3b8' : c.ok ? '#22c55e' : '#ef4444'; return (
    <div key={c.k} style={{ '--c': col } as CSSProperties}>{c.ok == null ? <Clock size={14} color={col} /> : c.ok ? <CheckCircle2 size={14} color={col} /> : <XCircle size={14} color={col} />}<span>{c.label}</span><b>{c.value}</b><small>معیار: {c.req}</small></div>) })}</div>
}

/** holiday voltage of the mainline coating by thickness — Table 1 */
export function HolidayCalc() {
  const [c, setC] = useState<MainCoating>('3lpe'), [t, setT] = useState('3')
  const r = MAIN_COATINGS[c].holiday
  return (
    <section className="ps-card"><style>{CSS}</style>
      <header className="ps-card-head"><b><Zap size={15} /> ولتاژ آزمون هالیدی پوشش خط (جدول ۱)</b><small className="ps-meta">۱۰۰٪ طول لوله پیش از لوله‌گذاری، سرعت حرکت الکترود حداکثر ۳۰۰ mm/s</small></header>
      <div className="ps-inline-form">
        <label className="ps-field"><span>نوع پوشش</span><select value={c} onChange={(e) => setC(e.target.value as MainCoating)}>{(Object.keys(MAIN_COATINGS) as MainCoating[]).filter((k) => MAIN_COATINGS[k].holiday).map((k) => <option key={k} value={k}>{MAIN_COATINGS[k].label}</option>)}</select></label>
        <label className="ps-field"><span>ضخامت پوشش (mm)</span><input type="number" step="0.1" value={t} onChange={(e) => setT(e.target.value)} dir="ltr" /></label>
        {r && <div className="cq-kv"><b>{fa(holidayKv(r, Number(t) || 0), 1)} kV</b><span className="ps-meta">{`${r.plus ? `${fa(r.plus)} kV + ` : ''}${fa(r.perMm)} kV/mm${r.maxKv ? `، حداکثر ${fa(r.maxKv)} kV` : ''}`}</span></div>}
      </div>
    </section>
  )
}

// ── field-joint QC ───────────────────────────────────────────────────────────
const blankJoint = (): D => ({ system: 'hss80', cleanliness: '', thickness: ['', '', '', ''] })
export function JointQc() {
  const st = useTestingStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === st.projectId))
  const odIn = st.pipe?.diameterIn ?? 0
  const [edit, setEdit] = useState<{ id?: string; ref: string; km: string; at: string; d: D }>({ ref: '', km: '', at: todayTehran(), d: blankJoint() })
  const d = edit.d
  const sys = (d.system as JointSystem) ?? 'hss80'
  const spec = JOINT_SYSTEMS[sys]
  const calc = jointChecks({ ...(d as object), system: sys, odIn } as Parameters<typeof jointChecks>[0])
  const set = (k: string, v: unknown) => setEdit({ ...edit, d: { ...d, [k]: v } })
  const N = (k: string, label: string, step = 0.1, ph?: string) => <label className="ps-field" key={k}><span>{label}</span><input type="number" step={step} dir="ltr" placeholder={ph} value={String(d[k] ?? '')} onChange={(e) => set(k, e.target.value)} /></label>
  const thick = (d.thickness as string[]) ?? []
  const peel = (d.peel as Record<string, string>) ?? {}
  const list = st.ctTests.filter((t) => t.kind === 'joint')
  const save = async () => {
    const r = await st.saveCtTest({ id: edit.id, kind: 'joint', ref: edit.ref.trim(), kmFrom: edit.km === '' ? null : Number(edit.km), kmTo: null, at: edit.at || null, data: d, result: calc.result }, email)
    if (r) setEdit({ ref: '', km: '', at: edit.at, d: { ...blankJoint(), system: sys } })
  }
  return (
    <section className="ps-card"><style>{CSS}</style>
      <header className="ps-card-head"><b><CheckCircle2 size={15} /> بازرسی پوشش سرجوش (آماده‌سازی، شرایط محیط، ضخامت، هالیدی و چسبندگی)</b>
        {list.length > 0 && <button type="button" className="ps-btn" onClick={() => printJoints(list, odIn, project?.officialName ?? '', st.settings.parties)}><Printer size={14} /> چاپ گزارش</button>}</header>
      <div className="ps-grid">
        <label className="ps-field"><span>شمارهٔ سرجوش *</span><input value={edit.ref} onChange={(e) => setEdit({ ...edit, ref: e.target.value })} dir="ltr" /></label>
        <label className="ps-field"><span>کیلومتر</span><input type="number" step="0.001" value={edit.km} onChange={(e) => setEdit({ ...edit, km: e.target.value })} dir="ltr" /></label>
        <div className="ps-field"><span>تاریخ</span><ShamsiDate value={edit.at} onChange={(v) => setEdit({ ...edit, at: v })} label="تاریخ" /></div>
        <label className="ps-field is-wide"><span>سیستم پوشش سرجوش</span><select value={sys} onChange={(e) => set('system', e.target.value)}>{(Object.keys(JOINT_SYSTEMS) as JointSystem[]).map((k) => <option key={k} value={k}>{JOINT_SYSTEMS[k].label}</option>)}</select></label>
        <label className="ps-field"><span>&nbsp;</span><span style={{ display: 'flex', gap: '.35rem', fontSize: 12 }}><input type="checkbox" checked={d.repair === true} onChange={(e) => set('repair', e.target.checked)} />تعمیر موضعی (St3)</span></label>
        {(sys === 'epoxy' || sys === 'pu') && <label className="ps-field"><span>&nbsp;</span><span style={{ display: 'flex', gap: '.35rem', fontSize: 12 }}><input type="checkbox" checked={d.heavy === true} onChange={(e) => set('heavy', e.target.checked)} />شرایط سخت / دمای بالا</span></label>}
      </div>
      <div className="cq-sub"><b>شرایط محیط و آماده‌سازی سطح</b>
        <div className="ps-grid">{N('pipeTempC', 'دمای سطح لوله (°C)')}{N('dewC', 'نقطهٔ شبنم (°C)')}{N('rh', 'رطوبت نسبی (٪)', 1)}{N('delayH', 'فاصلهٔ آماده‌سازی تا پوشش (ساعت)')}
          <label className="ps-field"><span>درجهٔ تمیزی</span><select value={String(d.cleanliness ?? '')} onChange={(e) => set('cleanliness', e.target.value)}><option value="">—</option>{(Object.keys(PROFILE_UM) as Cleanliness[]).map((k) => <option key={k} value={k}>{k === 'Sa2.5' ? 'Sa 2½' : k}</option>)}</select></label>
          {N('profileUm', 'زبری سطح (µm)', 1)}{N('saltUg', 'نمک محلول (µg/cm²)')}{N('dust', 'کلاس گرد و غبار', 1)}{N('overlapMm', 'هم‌پوشانی روی پوشش خط (mm)', 1)}
          {spec.group === 'sleeve' && N('preheatC', 'دمای پیش‌گرم (°C)', 1)}
          {(spec.group === 'fbe' || (spec.group === 'sleeve' && odIn >= 24)) && <label className="ps-field"><span>&nbsp;</span><span style={{ display: 'flex', gap: '.35rem', fontSize: 12 }}><input type="checkbox" checked={d.induction === true} onChange={(e) => set('induction', e.target.checked)} />گرمایش القایی انجام شد</span></label>}
        </div></div>
      <div className="cq-sub"><b>{`ضخامت (حداقل ${fa(jointMinMm(sys, { odIn, heavy: d.heavy === true }), 2)} mm — ${spec.thickness})، هالیدی و چسبندگی`}</b>
        <div className="ps-grid">{[0, 1, 2, 3].map((i) => <label key={i} className="ps-field"><span>{`ضخامت نقطهٔ ${fa(i + 1, 0)} (mm)`}</span><input type="number" step="0.01" dir="ltr" value={thick[i] ?? ''} onChange={(e) => { const t = [...thick]; t[i] = e.target.value; set('thickness', t) }} /></label>)}
          {N('holidayKv', `ولتاژ هالیدی (kV) — لازم ${fa(calc.kvReq, 1)}`)}
          <label className="ps-field"><span>نتیجهٔ هالیدی</span><select value={String(d.holiday ?? '')} onChange={(e) => set('holiday', e.target.value)}><option value="">—</option><option value="ok">بدون جرقه</option><option value="fail">عیب دارد</option></select></label>
          {spec.peel.map((p) => <label key={p.k} className="ps-field"><span>{`Peel ${p.label} (N/mm) — ≥ ${fa(p.min, 1)}`}</span><input type="number" step="0.1" dir="ltr" value={peel[p.k] ?? ''} onChange={(e) => set('peel', { ...peel, [p.k]: e.target.value })} /></label>)}
          {spec.pullOffMpa != null && N('pullOff', `Pull-off (MPa) — ≥ ${fa(spec.pullOffMpa, 0)}`)}
        </div></div>
      <Checks cs={calc.checks} />
      <div className="ps-actions"><button type="button" className="ps-btn is-primary" disabled={!edit.ref.trim()} onClick={() => void save()}><CheckCircle2 size={14} /> {edit.id ? 'به‌روزرسانی' : 'ثبت'} بازرسی سرجوش</button><Badge r={calc.result} />
        {edit.id && <button type="button" className="ps-btn is-ghost" onClick={() => setEdit({ ref: '', km: '', at: todayTehran(), d: blankJoint() })}>انصراف</button>}</div>
      {list.length > 0 && <div className="ps-table-wrap"><table className="ps-table"><thead><tr><th>سرجوش</th><th>کیلومتر</th><th>تاریخ</th><th>سیستم</th><th>ضخامت کمینه</th><th>هالیدی</th><th>نتیجه</th><th>مورد مردود</th><th /></tr></thead>
        <tbody>{list.map((t) => { const c = jointChecks({ ...(t.data as object), system: (t.data.system as JointSystem) ?? 'hss80', odIn } as Parameters<typeof jointChecks>[0]); const th = c.checks.find((x) => x.k === 'thick'); return <tr key={t.id}>
          <td dir="ltr">{t.ref}</td><td>{t.kmFrom != null ? fa(t.kmFrom, 3) : '—'}</td><td>{t.at ? formatJalali(t.at) : '—'}</td><td>{c.spec.label}</td><td>{th?.value}</td><td>{c.checks.find((x) => x.k === 'kv')?.value}</td><td><Badge r={c.result} /></td>
          <td style={{ fontSize: 11.5 }}>{c.checks.filter((x) => x.ok === false).map((x) => x.label).join('، ') || '—'}</td>
          <td><button type="button" className="ps-btn is-ghost" aria-label="ویرایش" onClick={() => setEdit({ id: t.id, ref: t.ref, km: t.kmFrom == null ? '' : String(t.kmFrom), at: t.at ?? '', d: t.data })}><Pencil size={13} /></button></td></tr> })}</tbody></table></div>}
    </section>
  )
}

// ── electrical test of the coating (form 6-2 with its potential table 6-1-6) ──
const blankElec = (od: number): D => ({ coating: '3lpe', criterion: 'normal', station: 'temp', pipes: [{ dIn: od ? String(od) : '', lengthM: '' }], potentials: [] })
export function ElectricalTest() {
  const st = useTestingStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === st.projectId))
  const od = st.pipe?.diameterIn ?? 0
  const [edit, setEdit] = useState<{ id?: string; from: string; to: string; at: string; d: D }>({ from: '', to: '', at: todayTehran(), d: blankElec(od) })
  const d = edit.d
  const set = (k: string, v: unknown) => setEdit({ ...edit, d: { ...d, [k]: v } })
  const pipes = (d.pipes as { dIn: string; lengthM: string }[]) ?? []
  const pots = (d.potentials as PotentialRow[]) ?? []
  const r = electricalTest({ ...(d as object), coating: (d.coating as MainCoating) ?? '3lpe', pipes, potentials: pots } as Parameters<typeof electricalTest>[0])
  const N = (k: string, label: string, step = 0.001) => <label className="ps-field" key={k}><span>{label}</span><input type="number" step={step} dir="ltr" value={String(d[k] ?? '')} onChange={(e) => set(k, e.target.value)} /></label>
  const list = st.ctTests.filter((t) => t.kind === 'electrical')
  const ok = edit.from !== '' && edit.to !== '' && Number(edit.to) > Number(edit.from)
  const save = async () => { const x = await st.saveCtTest({ id: edit.id, kind: 'electrical', ref: `KP ${edit.from}–${edit.to}`, kmFrom: Number(edit.from), kmTo: Number(edit.to), at: edit.at || null, data: d, result: r.result }, email); if (x) setEdit({ ...edit, id: x.id }) }
  const potCell = (i: number, k: keyof PotentialRow, step = 0.001): ReactNode => <input type={k === 'note' ? 'text' : 'number'} step={step} dir="ltr" value={pots[i][k] ?? ''} onChange={(e) => set('potentials', pots.map((p, j) => (j === i ? { ...p, [k]: e.target.value } : p)))} />
  return (
    <section className="ps-card"><style>{CSS}</style>
      <header className="ps-card-head"><b><Zap size={15} /> آزمون الکتریکی پوشش — دانسیتهٔ جریان I/S (فرم‌های ۶-۲ و ۶-۱-۶)</b>
        {edit.id && <button type="button" className="ps-btn" onClick={() => { const t = st.ctTests.find((x) => x.id === edit.id); if (t) printElectrical(t, project?.officialName ?? '', st.settings.parties) }}><Printer size={14} /> چاپ صورتجلسه</button>}</header>
      <p className="ps-hint">پس از آزمون هیدرواستاتیک و خاک‌ریزی: پلاریزاسیون دست‌کم ۷۲ ساعت؛ طول آزمون چنان انتخاب شود که پتانسیل خاموش دورترین نقطه به −۰٫۸۵ ولت برسد. محل عیوب با DCVG یافته می‌شود.</p>
      <div className="ps-grid">
        <label className="ps-field"><span>از کیلومتر *</span><input type="number" step="0.001" value={edit.from} onChange={(e) => setEdit({ ...edit, from: e.target.value })} dir="ltr" /></label>
        <label className="ps-field"><span>تا کیلومتر *</span><input type="number" step="0.001" value={edit.to} onChange={(e) => setEdit({ ...edit, to: e.target.value })} dir="ltr" /></label>
        <div className="ps-field"><span>تاریخ</span><ShamsiDate value={edit.at} onChange={(v) => setEdit({ ...edit, at: v })} label="تاریخ" /></div>
        <label className="ps-field"><span>نوع پوشش خط</span><select value={String(d.coating)} onChange={(e) => set('coating', e.target.value)}>{(Object.keys(MAIN_COATINGS) as MainCoating[]).map((k) => <option key={k} value={k}>{MAIN_COATINGS[k].label}</option>)}</select></label>
        <label className="ps-field"><span>معیار حفاظت</span><select value={String(d.criterion ?? 'normal')} onChange={(e) => set('criterion', e.target.value)}>{(Object.keys(CP_CRITERIA) as CpCriterion[]).map((k) => <option key={k} value={k}>{CP_CRITERIA[k].label}</option>)}</select></label>
        <label className="ps-field"><span>ایستگاه حفاظت کاتدی</span><select value={String(d.station ?? 'temp')} onChange={(e) => set('station', e.target.value)}><option value="temp">موقت</option><option value="perm">دائم</option></select></label>
        {N('stationKm', 'کیلومتر ایستگاه')}
      </div>
      <div className="cq-sub"><b>{`قطر و طول خط مورد آزمایش — سطح جانبی ${fa(r.areaM2, 1)} m²`}</b>
        <div className="ps-table-wrap"><table className="ps-table cq-et"><thead><tr><th>قطر (اینچ)</th><th>طول (متر)</th><th>سطح جانبی (m²)</th><th /></tr></thead>
          <tbody>{pipes.map((p, i) => <tr key={i}><td><input type="number" dir="ltr" value={p.dIn} onChange={(e) => set('pipes', pipes.map((q, j) => (j === i ? { ...q, dIn: e.target.value } : q)))} /></td><td><input type="number" dir="ltr" value={p.lengthM} onChange={(e) => set('pipes', pipes.map((q, j) => (j === i ? { ...q, lengthM: e.target.value } : q)))} /></td>
            <td>{fa(Math.PI * (Number(p.dIn) || 0) * 0.0254 * (Number(p.lengthM) || 0), 1)}</td><td><button type="button" className="ps-btn is-ghost" aria-label="حذف" onClick={() => set('pipes', pipes.filter((_, j) => j !== i))}><Trash2 size={13} /></button></td></tr>)}</tbody>
          <tfoot><tr><td colSpan={4}><button type="button" className="ps-btn" onClick={() => set('pipes', [...pipes, { dIn: '', lengthM: '' }])}><Plus size={13} /> قطر دیگر</button></td></tr></tfoot></table></div></div>
      <div className="cq-sub"><b>اندازه‌گیری‌های انجام‌شده</b>
        <div className="ps-grid">{N('polarH', 'زمان پلاریزاسیون (ساعت)', 1)}{N('intOn', 'قطع و وصل — روشن (ثانیه)', 1)}{N('intOff', 'قطع و وصل — خاموش (ثانیه)', 1)}{N('drainOn', 'ولتاژ نقطهٔ تزریق — روشن (V)')}{N('drainOff', 'ولتاژ نقطهٔ تزریق — خاموش (V)')}
          {N('farOn', 'ولتاژ دورترین نقطه — روشن (V)')}{N('farOff', 'ولتاژ دورترین نقطه — خاموش (V)')}{N('trV', 'ولتاژ خروجی ترانس/رکتیفایر (V)', 0.1)}{N('currentA', 'جریان مصرفی (A)', 0.0001)}</div></div>
      <div className="cq-sub"><b>نتایج اندازه‌گیری پتانسیل (فرم ۶-۱-۶)</b>
        <div className="ps-table-wrap"><table className="ps-table cq-et"><thead><tr><th>ردیف</th><th>کیلومتر</th><th>طبیعی (V)</th><th>روشن (V)</th><th>خاموش (V)</th><th>AC (V)</th><th>توضیحات</th><th /></tr></thead>
          <tbody>{pots.map((p, i) => { const off = Number(p.off); const bad = p.off !== '' && off > r.crit.v; return <tr key={i} style={bad ? { background: 'color-mix(in srgb,#ef4444 10%,transparent)' } : undefined}><td>{fa(i + 1, 0)}</td><td>{potCell(i, 'km')}</td><td>{potCell(i, 'natural')}</td><td>{potCell(i, 'on')}</td><td>{potCell(i, 'off')}</td><td>{potCell(i, 'ac')}</td><td>{potCell(i, 'note')}</td>
            <td><button type="button" className="ps-btn is-ghost" aria-label="حذف" onClick={() => set('potentials', pots.filter((_, j) => j !== i))}><Trash2 size={13} /></button></td></tr> })}</tbody>
          <tfoot><tr><td colSpan={8}><button type="button" className="ps-btn" onClick={() => set('potentials', [...pots, { km: '', natural: '', on: '', off: '', ac: '' }])}><Plus size={13} /> نقطهٔ اندازه‌گیری</button></td></tr></tfoot></table></div></div>
      <Checks cs={r.checks} />
      <div className="ps-actions"><button type="button" className="ps-btn is-primary" disabled={!ok} onClick={() => void save()}><CheckCircle2 size={14} /> {edit.id ? 'به‌روزرسانی' : 'ثبت'} آزمون الکتریکی</button><Badge r={r.result} />
        {edit.id && <button type="button" className="ps-btn is-ghost" onClick={() => setEdit({ from: edit.to, to: '', at: todayTehran(), d: blankElec(od) })}>آزمون جدید</button>}</div>
      {list.length > 0 && <div className="ps-table-wrap"><table className="ps-table"><thead><tr><th>محدوده</th><th>تاریخ</th><th>پوشش</th><th>I/S</th><th>نتیجه</th><th /></tr></thead>
        <tbody>{list.map((t) => { const x = electricalTest({ ...(t.data as object), coating: (t.data.coating as MainCoating) ?? '3lpe', pipes: (t.data.pipes as []) ?? [], potentials: (t.data.potentials as []) ?? [] } as Parameters<typeof electricalTest>[0]); return <tr key={t.id}>
          <td className="ps-nowrap">{t.kmFrom != null ? fa(t.kmFrom, 3) : '—'} – {t.kmTo != null ? fa(t.kmTo, 3) : '—'}</td><td>{t.at ? formatJalali(t.at) : '—'}</td><td>{x.coating.label}</td><td>{x.isUa == null ? '—' : `${fa(x.isUa, 2)} µA/m² (حد ${fa(x.limitUa, 0)})`}</td><td><Badge r={x.result} /></td>
          <td className="ps-nowrap"><button type="button" className="ps-btn is-ghost" aria-label="ویرایش" onClick={() => setEdit({ id: t.id, from: String(t.kmFrom ?? ''), to: String(t.kmTo ?? ''), at: t.at ?? '', d: t.data })}><Pencil size={13} /></button>
            <button type="button" className="ps-btn is-ghost" aria-label="چاپ" onClick={() => printElectrical(t, project?.officialName ?? '', st.settings.parties)}><Printer size={13} /></button></td></tr> })}</tbody></table></div>}
    </section>
  )
}

/** the procedure's coating criteria, as tables */
export function CoatingCriteria() {
  const od = useTestingStore((s) => s.pipe?.diameterIn ?? 0)
  return (
    <section className="ps-card"><style>{CSS}</style>
      <header className="ps-card-head"><b>معیارهای پذیرش پوشش (دستورالعمل)</b></header>
      <div className="ps-table-wrap"><table className="ps-table"><thead><tr><th>سیستم پوشش سرجوش</th><th>ضخامت (جدول ۳)</th><th>ولتاژ هالیدی (جدول ۴)</th><th>چسبندگی (جداول ۵ و ۶)</th><th>تمیزی</th></tr></thead>
        <tbody>{(Object.keys(JOINT_SYSTEMS) as JointSystem[]).map((k) => { const s = JOINT_SYSTEMS[k]; const h = s.holiday; return <tr key={k}><td>{s.label}</td><td>{s.thickness}</td>
          <td>{`${h.plus ? `${fa(h.plus)} kV + ` : ''}${fa(h.perMm)} kV/mm${h.maxKv ? `، حداکثر ${fa(h.maxKv)} kV` : ''}${s.holidayNote ? ` (${s.holidayNote})` : ''}`}</td>
          <td>{s.pullOffMpa != null ? `Pull-off ≥ ${fa(s.pullOffMpa)} MPa` : s.peel.map((p) => `${p.label} ≥ ${fa(p.min, 1)} N/mm`).join('؛ ')}</td><td>{s.cleanliness === 'Sa2.5' ? 'Sa 2½' : s.cleanliness}</td></tr> })}</tbody></table></div>
      <div className="ps-table-wrap"><table className="ps-table"><thead><tr><th>پوشش خط</th><th>ولتاژ هالیدی (جدول ۱)</th><th>حداکثر I/S (جدول ۸)</th><th>حداکثر پتانسیل خاموش نقطهٔ تزریق</th><th>حداکثر پتانسیل روشن (جدول ۷)</th></tr></thead>
        <tbody>{(Object.keys(MAIN_COATINGS) as MainCoating[]).map((k) => { const c = MAIN_COATINGS[k], h = c.holiday; return <tr key={k}><td>{c.label}</td><td>{h ? `${h.plus ? `${fa(h.plus)} kV + ` : ''}${fa(h.perMm)} kV/mm، حداکثر ${fa(h.maxKv!)} kV` : '—'}</td><td>{fa(c.maxIsUa)} µA/m²</td><td>{fa(c.maxDrainOffV, 2)} V</td><td>{fa(c.maxDrainOnV, 2)} V</td></tr> })}</tbody></table></div>
      <ul className="ps-hint" style={{ lineHeight: 2, paddingInlineStart: '1.2rem' }}>
        <li>آماده‌سازی: دمای لوله بیش از ۵ °C و دست‌کم ۳ °C بالاتر از نقطهٔ شبنم؛ رطوبت نسبی حداکثر ۸۵٪؛ پوشش ظرف ۲ ساعت (RH ۷۰ تا ۸۵٪) یا ۴ ساعت (RH کمتر از ۷۰٪).</li>
        <li>زبری: Sa 2½ — ۷۵ ± ۲۵ µm؛ Sa3 — ۶۰ تا ۱۰۰ µm؛ St3 (تعمیرات) — ۲۵ تا ۵۰ µm. نمک محلول حداکثر ۲ µg/cm²؛ گرد و غبار FBE کلاس ۱ و سایر کلاس ۲.</li>
        <li>{`هم‌پوشانی دست‌کم ۵۰ mm روی پوشش خط با پخ ۳۷٫۵ ± ۲٫۵ درجه؛ پیش‌گرم نوارهای حرارتی ۴۵ تا ۷۰ °C؛ گرمایش القایی برای FBE و نوار حرارتی در قطر ۲۴″ و بیشتر${od ? ` (لولهٔ پروژه ${fa(od, 0)}″)` : ''}.`}</li>
        <li>حفاظت کاتدی: پتانسیل خاموش لحظه‌ای منفی‌تر از −۰٫۸۵ V (خاک با مقاومت بیش از ۳۰٬۰۰۰ Ω·cm: −۰٫۷۵ V؛ وجود SRB: −۰٫۹۵ V). در مناطق پرخطر ECDA طبق NACE SP0502.</li>
      </ul>
    </section>
  )
}

// ── print ───────────────────────────────────────────────────────────────────
type Parties = ReturnType<typeof useTestingStore.getState>['settings']['parties']
const esc = (x: unknown) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const nv = (x: unknown, d = 3) => { const n = Number(x); return x === '' || x == null || !Number.isFinite(n) ? '—' : fa(n, d) }
const box = (b: boolean) => (b ? '☑' : '☐')
function openPrint(title: string, body: string) {
  const w = window.open('', '_blank', 'width=1000,height=1200'); if (!w) return
  w.document.write(`<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>${esc(title)}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700;900&display=swap">
<style>@page{size:A4;margin:11mm}body{font-family:Vazirmatn,Tahoma,sans-serif;color:#0f172a;font-size:10.5px;margin:0}section{page-break-after:always;border:1.6px solid #1e293b;border-radius:6px;padding:8px 10px}section:last-of-type{page-break-after:auto}
h2{text-align:center;font-size:14px;margin:4px 0 6px}.org{text-align:center;font-weight:900;font-size:12px}h4{font-size:11.5px;margin:8px 0 3px}table{width:100%;border-collapse:collapse;margin:5px 0;font-variant-numeric:tabular-nums}th,td{border:1px solid #94a3b8;padding:3px 5px;text-align:right}th{background:#e2e8f0}
.sg td{text-align:center;font-weight:700;background:#f8fafc;width:25%}.sg .sp td{height:46px;background:#fff}ol{line-height:1.9;margin:4px 0}p{line-height:1.9;margin:4px 0}.ok{color:#166534;font-weight:700}.bad{color:#991b1b;font-weight:700}</style></head><body>${body}
<script>document.fonts&&document.fonts.ready.then(()=>setTimeout(()=>print(),250))</script></body></html>`)
  w.document.close()
}
const SIG_ELEC = `<table class="sg"><tr><td>رئیس کارگاه پیمانکار</td><td>مسئول کنترل کیفی پیمانکار</td><td>سرپرست دستگاه نظارت</td><td>ناظر مقیم مشاور</td></tr><tr class="sp"><td></td><td></td><td></td><td></td></tr></table>`
function printElectrical(t: CtTest, projectName: string, p: Parties) {
  const d = t.data
  const r = electricalTest({ ...(d as object), coating: (d.coating as MainCoating) ?? '3lpe', pipes: (d.pipes as []) ?? [], potentials: (d.potentials as []) ?? [] } as Parameters<typeof electricalTest>[0])
  const pipes = (d.pipes as { dIn: string; lengthM: string }[]) ?? []
  const pots = (d.potentials as PotentialRow[]) ?? []
  const kinds: [MainCoating[], string][] = [[['coal_tar'], 'ذغال‌سنگی'], [['bitumen'], 'قیر پایهٔ نفتی'], [['3lpe'], 'پلی‌اتیلن سه‌لایه'], [['mod_bitumen'], 'قیر پایهٔ نفتی اصلاح‌شده'], [['cold_tape'], 'نوار پلاستیکی'], [['fbe', 'epoxy_pu'], 'سایر']]
  const top = `<div class="org">شرکت ملی گاز ایران — پروژه: خط انتقال گاز ${esc(projectName)}</div><table><tr><th>طرح</th><td>${esc(p.employer)}</td><th>تاریخ</th><td>${t.at ? formatJalali(t.at) : '—'}</td></tr><tr><th>پیمانکار</th><td>${esc(p.contractor)}</td><th>شمارهٔ پیمان</th><td>${esc(p.contractNo)}</td></tr><tr><th>دستگاه نظارت</th><td colspan="3">${esc(p.consultant)}</td></tr></table>`
  const page1 = `<section>${top}<h2>صورتجلسهٔ آزمایش الکتریکی پوشش (فرم ۶-۲)</h2>
    <h4>الف — مشخصات پروژه</h4><ol><li>محدودهٔ خط لولهٔ مورد آزمایش: از کیلومتر ${nv(t.kmFrom)} تا کیلومتر ${nv(t.kmTo)}</li><li>طول خط لولهٔ مورد آزمایش: ${fa(r.lengthM, 0)} متر</li>
      <li>قطر خط لولهٔ مورد آزمایش: ${pipes.map((x) => `${nv(x.dIn, 0)}″ به طول ${nv(x.lengthM, 0)} متر`).join('؛ ')}</li><li>سطح جانبی خط لولهٔ مورد آزمایش: ${fa(r.areaM2, 1)} مترمربع</li>
      <li>نوع پوشش خط: ${kinds.map(([ks, l]) => `${box(ks.includes(d.coating as MainCoating))} ${l}`).join(' &nbsp; ')}${['fbe', 'epoxy_pu'].includes(String(d.coating)) ? ` (${r.coating.label})` : ''}</li>
      <li>نوع ایستگاه حفاظت کاتدی در زمان آزمایش: ${box(d.station !== 'perm')} موقت &nbsp; ${box(d.station === 'perm')} دائم</li><li>موقعیت ایستگاه حفاظت کاتدی در زمان آزمایش: کیلومتر ${nv(d.stationKm)} خط لوله</li></ol>
    <h4>ب — مراحل آزمایش</h4><p>با حضور امضاءکنندگان ذیل، عملیات آزمایش الکتریکی پوشش خط انتقال گاز فوق‌الذکر در محدودهٔ ذکرشده به شرح ذیل انجام گردید:</p><ol>${ELEC_STEPS.map((s, i) => `<li>${esc(s)}${i === 5 ? ` — گذشت ${nv(d.polarH, 0)} ساعت` : ''}</li>`).join('')}</ol>
    <h4>ج — اندازه‌گیری‌های انجام‌شده</h4><table><tr><th>زمان قطع و وصل جریان ترانس/رکتیفایر</th><td>روشن ${nv(d.intOn, 0)} ثانیه — خاموش ${nv(d.intOff, 0)} ثانیه</td></tr><tr><th>ولتاژ لوله در نقطهٔ تزریق</th><td>روشن ${nv(d.drainOn)} ولت — خاموش ${nv(d.drainOff)} ولت</td></tr>
      <tr><th>ولتاژ لوله در دورترین نقطه</th><td>روشن ${nv(d.farOn)} ولت — خاموش ${nv(d.farOff)} ولت</td></tr><tr><th>ولتاژ خروجی ترانس/رکتیفایر</th><td>${nv(d.trV, 2)} ولت</td></tr><tr><th>جریان مصرفی</th><td>${nv(d.currentA, 4)} آمپر</td></tr></table>
    <h4>د — نتیجهٔ آزمایش</h4><p>با توجه به اندازه‌گیری‌های انجام‌شده، دانسیتهٔ جریان بر واحد سطح خط لولهٔ مورد آزمایش برابر با <b>I/S = ${r.isMa == null ? '—' : fa(r.isMa, 5)} mA/m²</b> (${r.isUa == null ? '—' : fa(r.isUa, 2)} µA/m²؛ حد مجاز ${fa(r.limitUa, 0)} µA/m² برای ${esc(r.coating.label)}) محاسبه گردید و نظر به میزان دانسیتهٔ جریان مجاز متناسب با نوع پوشش، کیفیت پوشش مورد ${box(r.result === 'pass')} تأیید می‌باشد &nbsp; ${box(r.result === 'fail')} تأیید نمی‌باشد.</p>
    <table>${r.checks.map((c) => `<tr><th>${esc(c.label)}</th><td>${esc(c.value)}</td><td>${esc(c.req)}</td><td class="${c.ok == null ? '' : c.ok ? 'ok' : 'bad'}">${c.ok == null ? '—' : c.ok ? 'برقرار' : 'برقرار نیست'}</td></tr>`).join('')}</table>
    ${d.note ? `<p>توضیحات: ${esc(d.note)}</p>` : '<p>توضیحات:</p>'}${SIG_ELEC}</section>`
  const page2 = `<section>${top}<h2>نتایج اندازه‌گیری پتانسیل — پیوست صورتجلسهٔ آزمایش الکتریکی پوشش (فرم ۶-۱-۶)</h2>
    <table><tr><th>ردیف</th><th>کیلومتر</th><th>پتانسیل طبیعی (ولت)</th><th>پتانسیل روشن (ولت)</th><th>پتانسیل خاموش (ولت)</th><th>پتانسیل A.C (ولت)</th><th>توضیحات</th></tr>
    ${pots.map((x, i) => `<tr><td>${fa(i + 1, 0)}</td><td>${nv(x.km)}</td><td>${nv(x.natural)}</td><td>${nv(x.on)}</td><td class="${x.off !== '' && Number(x.off) > r.crit.v ? 'bad' : ''}">${nv(x.off)}</td><td>${nv(x.ac)}</td><td>${esc(x.note)}</td></tr>`).join('') || '<tr><td colspan="7">ثبت نشده</td></tr>'}</table>
    <p>معیار حفاظت: ${esc(r.crit.label)}${r.unprotected.length ? ` — <span class="bad">${fa(r.unprotected.length, 0)} نقطه بدون پتانسیل حفاظتی</span>` : ''}</p>${SIG_ELEC}</section>`
  openPrint(`Coating electrical test ${t.ref}`, page1 + page2)
}
function printJoints(list: CtTest[], odIn: number, projectName: string, p: Parties) {
  const rows = list.map((t) => { const c = jointChecks({ ...(t.data as object), system: (t.data.system as JointSystem) ?? 'hss80', odIn } as Parameters<typeof jointChecks>[0]); return { t, c } })
  const body = `<section><div class="org">شرکت ملی گاز ایران — پروژهٔ احداث خط انتقال گاز ${esc(projectName)}</div><h2>گزارش بازرسی پوشش سرجوش‌ها</h2>
    <table><tr><th>کارفرما</th><td>${esc(p.employer)}</td><th>پیمانکار</th><td>${esc(p.contractor)}</td><th>مشاور</th><td>${esc(p.consultant)}</td></tr></table>
    <table><tr><th>سرجوش</th><th>کیلومتر</th><th>تاریخ</th><th>سیستم</th><th>دمای لوله / شبنم / RH</th><th>تمیزی / زبری</th><th>ضخامت کمینه</th><th>هالیدی</th><th>چسبندگی</th><th>نتیجه</th></tr>
    ${rows.map(({ t, c }) => { const g = (k: string) => c.checks.find((x) => x.k === k); const d = t.data; return `<tr><td>${esc(t.ref)}</td><td>${nv(t.kmFrom)}</td><td>${t.at ? formatJalali(t.at) : '—'}</td><td>${esc(c.spec.label)}</td>
      <td>${nv(d.pipeTempC, 1)} / ${nv(d.dewC, 1)} / ${nv(d.rh, 0)}٪</td><td>${esc(g('clean')?.value)} / ${esc(g('profile')?.value)}</td><td>${esc(g('thick')?.value)}</td><td>${esc(g('kv')?.value)} — ${esc(g('holiday')?.value)}</td>
      <td>${c.checks.filter((x) => x.k.startsWith('peel') || x.k === 'pull').map((x) => esc(x.value)).join(' / ') || '—'}</td><td class="${c.result === 'pass' ? 'ok' : c.result === 'fail' ? 'bad' : ''}">${RES[c.result].label}${c.result === 'fail' ? `<br><small>${c.checks.filter((x) => x.ok === false).map((x) => esc(x.label)).join('، ')}</small>` : ''}</td></tr>` }).join('')}</table>
    <table class="sg"><tr><td>مسئول کنترل کیفی پیمانکار</td><td>رئیس کارگاه پیمانکار</td><td>سرپرست دستگاه نظارت</td><td>ناظر مقیم مشاور</td></tr><tr class="sp"><td></td><td></td><td></td><td></td></tr></table></section>`
  openPrint('Field joint coating inspection', body)
}
