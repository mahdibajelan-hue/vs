import { useEffect, useMemo, useState } from 'react'
import { Check, ClipboardCheck, Plus, Save, Target, X } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { useCsStore } from '../store/useCsStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { inchDia, type CsInspection } from '../lib/csCore'
import {
  B31_8_EXTENT, DISCIPLINE_FA, ITP_CHECKS, LOCATION_CLASS_FA, itpOf, judgeItp, ndtPlan, packTestNeed, specsOf, welderReview,
  type Discipline, type ItpCheck, type LocationClass, type QcRules,
} from '../lib/csQc'
import { registerKey, type Welder, type WelderQual } from '../lib/registers'
import { Chip, DataTable, KpiCard, NumInput, Section, fmtD, type Col } from '../../finance/components/fn'
import { FormModal, type FieldDef, type Vals } from '../../finance/components/FormModal'
import { Empty, fa, pct } from '../components/common'
import { todayTehran } from '../../../lib/today'

type Sub = 'ndt' | 'welders' | 'itp' | 'rules'
export const STATION_QC_SUBS: { id: Sub; label: string }[] = [
  { id: 'ndt', label: 'برنامهٔ NDT' }, { id: 'welders', label: 'جوشکاران و صلاحیت' }, { id: 'itp', label: 'بازرسی‌ها (ITP)' }, { id: 'rules', label: 'قواعد کیفیت پروژه' },
]

/**
 * کنترل کیفیت ایستگاه — ASME B31.8 with the project's IGS practice: which welds need NDT (extent by location class,
 * progressive examination after a reject), the welders against their qualifications, the ITP inspections of the other
 * disciplines, and the project's QC rules. Decisions (picking welds, accepting an inspection) are QC's; the server
 * enforces that (migration 051).
 */
export function StationQc({ projectId, sub }: { projectId: string; sub: string }) {
  const load = useCsStore((s) => s.load)
  useEffect(() => { void load(projectId) }, [projectId, load])
  const s = (STATION_QC_SUBS.some((x) => x.id === sub) ? sub : 'ndt') as Sub
  const qcMissing = useCsStore((x) => x.qcMissing)
  if (qcMissing && (s === 'itp' || s === 'rules')) return <Empty>جدول‌های کنترل کیفیت ایستگاه (میگریشن 051) هنوز روی این پایگاه داده نصب نشده است؛ برنامهٔ NDT و جوشکاران با قواعد پیش‌فرض کار می‌کنند.</Empty>
  if (s === 'welders') return <WeldersQc projectId={projectId} />
  if (s === 'itp') return <ItpView projectId={projectId} />
  if (s === 'rules') return <RulesView projectId={projectId} />
  return <NdtView projectId={projectId} />
}

/** the station QC views behind their own tabs (execution module's station tab, and the QC module) */
export function StationQcTabs({ projectId, sub = '' }: { projectId: string; sub?: string }) {
  const [v, setV] = useState(sub.startsWith('qc-') ? sub.slice(3) : 'ndt')
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="im-seg" role="tablist" aria-label="کنترل کیفیت ایستگاه" style={{ overflowX: 'auto', maxWidth: '100%' }}>{STATION_QC_SUBS.map((x) => <button key={x.id} role="tab" aria-selected={v === x.id} className={v === x.id ? 'on' : ''} onClick={() => setV(x.id)}>{x.label}</button>)}</div>
      <StationQc projectId={projectId} sub={v} />
    </div>
  )
}

const useRights = (projectId: string) => { const can = useExecutionStore((s) => s.can); return { review: can(projectId, 'review'), write: can(projectId, 'review') || can(projectId, 'record') } }
const REASON_FA = { random: 'تصادفی (درصد آزمون)', progressive: 'پیش‌رونده (پس از رد)', extent: 'آزمون صددرصد', client: 'درخواست کارفرما', '': '—' } as const

// ── NDT plan ───────────────────────────────────────────────────────────
function NdtView({ projectId }: { projectId: string }) {
  const lines = useCsStore((s) => s.lines), welds = useCsStore((s) => s.welds), rules = useCsStore((s) => s.rules), save = useCsStore((s) => s.save)
  const r = useRights(projectId)
  const plan = useMemo(() => ndtPlan(lines, welds, rules), [lines, welds, rules])
  const [busy, setBusy] = useState<string | null>(null)
  const tot = plan.reduce((a, p) => ({ req: a.req + p.required, ex: a.ex + p.examined, short: a.short + p.shortfall, owed: a.owed + Math.max(0, p.progressiveOwed - p.progressiveDone), esc: a.esc + p.escalated.length }), { req: 0, ex: 0, short: 0, owed: 0, esc: 0 })
  const classExtent = B31_8_EXTENT[rules.locationClass]
  const off = lines.filter((l) => !l.archived && l.ndtPct < classExtent)
  const pick = async (lineId: string) => {
    const p = plan.find((x) => x.line.id === lineId); if (!p) return
    setBusy(lineId)
    try { for (const id of p.suggest) { const w = welds.find((x) => x.id === id); if (w && !w.ndtSelected) await save('welds', projectId, { id, ndtSelected: true, ndtReason: p.reasonOf[id] ?? 'random' }) } } finally { setBusy(null) }
  }
  const raise = async () => { if (!window.confirm(`درصد آزمون ${fa(off.length)} لاین به ${fa(classExtent)}٪ (${LOCATION_CLASS_FA[rules.locationClass]}) برده شود؟`)) return; for (const l of off) await save('lines', projectId, { id: l.id, ndtPct: classExtent }) }
  if (!lines.length) return <Empty>هنوز لاینی ثبت نشده است؛ برنامهٔ NDT از لاین‌ها و سرجوش‌های «ایستگاه» ساخته می‌شود.</Empty>
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="سرجوش‌هایی که باید آزمون شوند" value={fa(tot.req)} sub={`${fa(tot.ex)} آزمون‌شده`} />
        <KpiCard i={1} label="کسری انتخاب برای NDT" value={fa(tot.short)} tone={tot.short ? 'warn' : 'good'} sub="تا رسیدن به درصد آزمون هر لاین" />
        <KpiCard i={2} label="آزمون پیش‌رونده باقی‌مانده" value={fa(tot.owed)} tone={tot.owed ? 'bad' : 'good'} sub={`${fa(rules.progressivePerReject)} سرجوش به ازای هر رد`} />
        <KpiCard i={3} label="جوشکاران صددرصد شده" value={fa(tot.esc)} tone={tot.esc ? 'bad' : 'good'} sub="رد در آزمون پیش‌رونده" />
      </div>
      <Section title="برنامهٔ آزمون غیرمخرب به تفکیک لاین" hint={`مبنا: ASME B31.8 §826.2 و قواعد پروژه — ${LOCATION_CLASS_FA[rules.locationClass]}. در لاین با درصد کمتر از ۱۰۰، انتخاب تصادفی میان جوشکاران پخش می‌شود و هر رد ${fa(rules.progressivePerReject)} آزمون پیش‌رونده از کار همان جوشکار می‌خواهد.`}
        action={r.review && off.length > 0 ? <button className="im-btn im-btn-sm" onClick={() => void raise()}>{fa(off.length)} لاین کمتر از {fa(classExtent)}٪ — اعمال</button> : undefined} flush>
        <DataTable rows={plan.filter((p) => p.welded)} rowKey={(p) => p.line.id} empty="هنوز جوشی انجام نشده است." cols={[
          { key: 'l', label: 'لاین', render: (p) => <span className="strong fn-code" dir="ltr">{p.line.lineNo}</span>, sort: (p) => p.line.lineNo },
          { key: 'e', label: 'درصد آزمون', num: true, render: (p) => pct(p.extent / 100, 0) },
          { key: 'w', label: 'جوش‌شده / لازم', num: true, render: (p) => `${fa(p.welded)} / ${fa(p.required)}` },
          { key: 'x', label: 'آزمون‌شده', render: (p) => <span className="sub">{fa(p.examined)} — قبول {fa(p.accepted)}، رد {fa(p.rejected)}</span> },
          { key: 's', label: 'کسری', render: (p) => (p.shortfall ? <Chip tone="warn">{fa(p.shortfall)}</Chip> : <Chip tone="good">کامل</Chip>), sort: (p) => p.shortfall },
          { key: 'p', label: 'پیش‌رونده', render: (p) => (p.extent >= 100 ? <span className="sub">—</span> : p.escalated.length ? <Chip tone="bad">صددرصد: {p.escalated.join('، ')}</Chip> : p.progressiveOwed ? <Chip tone={p.progressiveDone >= p.progressiveOwed ? 'good' : 'bad'}>{fa(p.progressiveDone)} از {fa(p.progressiveOwed)}</Chip> : <span className="sub">—</span>) },
          ...(r.review ? [{ key: 'a', label: 'اقدام', render: (p: (typeof plan)[number]) => {
            const n = p.suggest.filter((id) => !welds.find((w) => w.id === id)?.ndtSelected).length
            return n && p.extent < 100 ? <button className="im-btn im-btn-sm" disabled={busy === p.line.id} onClick={() => void pick(p.line.id)}><Target size={13} /> انتخاب {fa(n)} سرجوش</button> : <span className="sub">{p.extent >= 100 && p.shortfall ? 'همهٔ جوش‌ها' : '—'}</span>
          } } as Col<(typeof plan)[number]>] : []),
        ]} />
      </Section>
      <Section title="سرجوش‌های انتخاب‌شده و منتظر آزمون" flush>
        <DataTable rows={welds.filter((w) => !w.archived && w.weldDate && w.ndtResult === 'pending' && (w.ndtSelected || (lines.find((l) => l.id === w.lineId)?.ndtPct ?? 100) >= 100)).slice(0, 300)} rowKey={(w) => w.id} empty="سرجوشی منتظر آزمون نیست." cols={[
          { key: 'n', label: 'سرجوش', render: (w) => <><span className="strong fn-code" dir="ltr">{w.weldNo}</span><span className="sub" dir="ltr">{lines.find((l) => l.id === w.lineId)?.lineNo}</span></> },
          { key: 'z', label: 'ID', num: true, render: (w) => fa(inchDia(w), 2) },
          { key: 'wd', label: 'جوشکار', render: (w) => w.welder || '—' },
          { key: 'd', label: 'تاریخ جوش', render: (w) => (w.weldDate ? fmtD(w.weldDate) : '—') },
          { key: 'r', label: 'علت انتخاب', render: (w) => REASON_FA[(w.ndtReason ?? '') as keyof typeof REASON_FA] ?? '—' },
        ]} />
      </Section>
    </div>
  )
}

// ── welders ────────────────────────────────────────────────────────────
function useWelderRegister(projectId: string) {
  const [data, setData] = useState<{ welders: Welder[]; quals: WelderQual[]; error: string | null } | null>(null)
  useEffect(() => {
    let on = true
    void Promise.all([
      supabase.from('ex_welders').select('id, project_id, welder_key, welder_raw, full_name, status, kind').eq('project_id', projectId),
      supabase.from('ex_welder_quals').select('id, project_id, welder_id, wqt_no, process, position, thk_min, thk_max, dia_min, dia_max, issue_date, expiry_date, status').eq('project_id', projectId),
    ]).then(([w, q]) => {
      if (!on) return
      const n = (x: unknown) => (x == null ? null : Number(x))
      setData({
        error: w.error?.message ?? q.error?.message ?? null,
        welders: (w.data ?? []).map((r) => ({ id: r.id, projectId: r.project_id, key: r.welder_key || registerKey(r.welder_raw), raw: r.welder_raw ?? '', fullName: r.full_name ?? '', status: r.status, kind: r.kind } as unknown as Welder)),
        quals: (q.data ?? []).map((r) => ({ id: r.id, projectId: r.project_id, welderId: r.welder_id, wqtNo: r.wqt_no ?? '', process: r.process ?? '', position: r.position ?? '', thkMin: n(r.thk_min), thkMax: n(r.thk_max), diaMin: n(r.dia_min), diaMax: n(r.dia_max), issueDate: r.issue_date, expiryDate: r.expiry_date, status: r.status } as unknown as WelderQual)),
      })
    })
    return () => { on = false }
  }, [projectId])
  return data
}
function WeldersQc({ projectId }: { projectId: string }) {
  const welds = useCsStore((s) => s.welds), rules = useCsStore((s) => s.rules)
  const reg = useWelderRegister(projectId)
  const rows = useMemo(() => (reg ? welderReview(welds, reg.welders, reg.quals, rules, todayTehran()) : []), [reg, welds, rules])
  const [open, setOpen] = useState<string | null>(null)
  if (!reg) return <div className="im-skeleton" style={{ height: 200 }} />
  const unreg = rows.filter((x) => !x.registered).length, unq = rows.filter((x) => x.unqualified.length).length, over = rows.filter((x) => x.overLimit).length, gap = rows.filter((x) => x.continuityGap).length
  const sel = rows.find((x) => x.key === open)
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="جوشکاران این ایستگاه" value={fa(rows.length)} />
        <KpiCard i={1} label="خارج از بانک جوشکاران" value={fa(unreg)} tone={unreg ? 'bad' : 'good'} sub="کد جوشکار در ثبت صلاحیت‌ها نیست" />
        <KpiCard i={2} label="جوش خارج از محدودهٔ صلاحیت" value={fa(unq)} tone={unq ? 'bad' : 'good'} sub="ASME IX / API 1104: قطر، ضخامت، تاریخ" />
        <KpiCard i={3} label="بالاتر از حد مجاز رد" value={fa(over)} tone={over ? 'bad' : 'good'} sub={`حد پروژه ${pct(rules.welderRejectLimit)}`} />
        <KpiCard i={4} label="وقفهٔ بیش از ۶ ماه" value={fa(gap)} tone={gap ? 'warn' : 'good'} sub="ASME IX QW-322" />
      </div>
      {reg.error && <div className="im-card cs-msg bad">بانک جوشکاران خوانده نشد: {reg.error}</div>}
      <Section title="جوشکاران در برابر صلاحیت و عملکرد" hint="صلاحیت‌ها از بانک جوشکاران (ماژول صلاحیت) خوانده می‌شود؛ ضخامت سرجوش از میلی‌متر به اینچ برده و با محدودهٔ WQT مقایسه می‌شود." flush>
        <DataTable rows={rows} rowKey={(x) => x.key} onRow={(x) => setOpen(x.key === open ? null : x.key)} empty="هنوز جوشی با کد جوشکار ثبت نشده است." cols={[
          { key: 'k', label: 'جوشکار', render: (x) => <><span className="strong" dir="auto">{x.raw}</span><span className="sub">{x.name || (x.registered ? '' : 'ثبت‌نشده در بانک')}</span></> },
          { key: 'w', label: 'سرجوش / ID', num: true, render: (x) => `${fa(x.welds)} / ${fa(x.inchDia, 1)}` },
          { key: 'r', label: 'نرخ رد', render: (x) => <Chip tone={x.rate == null ? 'neutral' : x.overLimit ? 'bad' : x.rate > rules.welderRejectLimit / 2 ? 'warn' : 'good'}>{pct(x.rate)}</Chip>, sort: (x) => x.rate ?? -1 },
          { key: 'l', label: 'آخرین جوش', render: (x) => (x.lastWeld ? fmtD(x.lastWeld) : '—') },
          { key: 'f', label: 'هشدار', render: (x) => <span className="cs-acts">
            {!x.registered && <Chip tone="bad">ثبت‌نشده</Chip>}{x.registered && !x.active && <Chip tone="bad">غیرفعال</Chip>}
            {x.unqualified.length > 0 && <Chip tone="bad">{fa(x.unqualified.length)} جوش بدون صلاحیت</Chip>}
            {x.continuityGap && <Chip tone="warn">وقفهٔ طولانی</Chip>}{x.overLimit && <Chip tone="bad">رد بالا</Chip>}
            {x.registered && x.active && !x.unqualified.length && !x.continuityGap && !x.overLimit && <Chip tone="good">بدون مورد</Chip>}
          </span> },
        ]} />
      </Section>
      {sel && sel.unqualified.length > 0 && (
        <Section title={`جوش‌های خارج از صلاحیت ${sel.raw}`} flush>
          <DataTable rows={sel.unqualified} rowKey={(u) => u.weldId} cols={[{ key: 'n', label: 'سرجوش', render: (u) => <span className="fn-code" dir="ltr">{u.weldNo}</span> }, { key: 'r', label: 'علت', render: (u) => u.reasons.join('، ') }]} />
        </Section>
      )}
    </div>
  )
}

// ── ITP inspections ────────────────────────────────────────────────────
const RESULT_FA = { pending: 'در انتظار تصمیم', accept: 'قبول', reject: 'رد' } as const
function ItpView({ projectId }: { projectId: string }) {
  const st = useCsStore()
  const r = useRights(projectId)
  const [disc, setDisc] = useState<Discipline | ''>('')
  const [pickOpen, setPickOpen] = useState(false), [check, setCheck] = useState<ItpCheck | null>(null), [decide, setDecide] = useState<{ insp: CsInspection; to: 'accept' | 'reject' } | null>(null)
  const list = st.inspections.filter((x) => !x.archived && (!disc || x.discipline === disc))
  const counts = (Object.keys(DISCIPLINE_FA) as Discipline[]).map((d) => ({ d, n: st.inspections.filter((x) => !x.archived && x.discipline === d).length, rej: st.inspections.filter((x) => !x.archived && x.discipline === d && x.result === 'reject').length }))
  const subjects = (c: ItpCheck): { value: string; label: string }[] => {
    if (c.subject === 'line') return st.lines.filter((x) => !x.archived).map((x) => ({ value: x.id, label: x.lineNo }))
    if (c.subject === 'spool') return st.spools.filter((x) => !x.archived).map((x) => ({ value: x.id, label: x.spoolNo }))
    if (c.subject === 'equipment') return st.equipment.filter((x) => !x.archived).map((x) => ({ value: x.id, label: `${x.tag} — ${x.title}` }))
    if (c.subject === 'pack') return st.packs.filter((x) => !x.archived).map((x) => ({ value: x.id, label: x.packNo }))
    return []
  }
  const fieldsOf = (c: ItpCheck): FieldDef[] => {
    const subs = subjects(c)
    return [
      subs.length ? { key: 'subjectId', label: 'موضوع بازرسی', kind: 'select', required: true, options: subs } as FieldDef : { key: 'subjectLabel', label: c.subject === 'area' ? 'محل / سازه' : 'موضوع (تگ، کابل، لوپ …)', kind: 'text', required: true } as FieldDef,
      { key: 'inspDate', label: 'تاریخ بازرسی', kind: 'date', required: true },
      ...c.fields.map((f): FieldDef => (f.kind === 'bool' ? { key: `v_${f.key}`, label: f.label, kind: 'select', options: [{ value: '', label: '—' }, { value: 'yes', label: 'بله' }, { value: 'no', label: 'خیر' }] } : { key: `v_${f.key}`, label: `${f.label}${f.unit ? ` (${f.unit})` : ''}${f.many ? ' — چند قرائت با فاصله' : ''}`, kind: f.kind === 'num' ? 'num' : 'text', span: f.many ? 2 : undefined })),
      { key: 'reportNo', label: 'شمارهٔ گزارش', kind: 'text' }, { key: 'inspector', label: 'بازرس', kind: 'text' }, { key: 'note', label: 'یادداشت', kind: 'text', span: 2 },
    ]
  }
  const valuesOf = (c: ItpCheck, v: Vals) => Object.fromEntries(c.fields.map((f) => [f.key, f.kind === 'bool' ? (v[`v_${f.key}`] === 'yes' ? true : v[`v_${f.key}`] === 'no' ? false : null) : v[`v_${f.key}`] ?? '']))
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="cs-toolbar">
        <div className="im-seg" role="tablist" aria-label="رشته">
          <button role="tab" aria-selected={!disc} className={!disc ? 'on' : ''} onClick={() => setDisc('')}>همه ({fa(st.inspections.filter((x) => !x.archived).length)})</button>
          {counts.map((c) => <button key={c.d} role="tab" aria-selected={disc === c.d} className={disc === c.d ? 'on' : ''} onClick={() => setDisc(c.d)}>{DISCIPLINE_FA[c.d]} ({fa(c.n)}){c.rej ? ` · ${fa(c.rej)} رد` : ''}</button>)}
        </div>
        {r.write && <button className="im-btn im-btn-primary im-btn-sm" onClick={() => setPickOpen(true)}><Plus size={13} /> ثبت بازرسی</button>}
      </div>
      <Section title="بازرسی‌ها" hint="مقادیر را پیمانکار یا بازرس وارد می‌کند و سامانه با معیار پذیرش پروژه داوری پیشنهادی می‌دهد؛ قبول یا رد نهایی فقط با دستگاه نظارت / کنترل کیفیت است." flush>
        <DataTable rows={list.slice(0, 400)} rowKey={(x) => x.id} empty="بازرسی ثبت نشده است." cols={[
          { key: 'd', label: 'تاریخ', render: (x) => fmtD(x.inspDate), sort: (x) => x.inspDate },
          { key: 'c', label: 'بازرسی', render: (x) => { const c = itpOf(x.itpKey); return <><span className="strong">{c?.title ?? x.itpKey}</span><span className="sub">{DISCIPLINE_FA[x.discipline]}{x.holdPoint ? ` · نقطهٔ ${x.holdPoint}` : ''}{x.reportNo ? ` · ${x.reportNo}` : ''}</span></> } },
          { key: 's', label: 'موضوع', render: (x) => <span dir="auto">{x.subjectLabel || '—'}</span> },
          { key: 'j', label: 'داوری سامانه', render: (x) => { const c = itpOf(x.itpKey); if (!c) return '—'; const j = judgeItp(c, x.values, st.rules); return j.ok == null ? <span className="sub">{j.why[0]}</span> : j.ok ? <Chip tone="good">مطابق معیار</Chip> : <span title={j.why.join('\n')}><Chip tone="bad">{j.why[0]}</Chip></span> } },
          { key: 'r', label: 'نتیجه', render: (x) => <Chip tone={x.result === 'accept' ? 'good' : x.result === 'reject' ? 'bad' : 'warn'}>{RESULT_FA[x.result]}</Chip>, sort: (x) => x.result },
          ...(r.review ? [{ key: 'a', label: '', render: (x: CsInspection) => x.result === 'pending' ? <span className="cs-acts"><button className="im-btn im-btn-sm" onClick={() => setDecide({ insp: x, to: 'accept' })}><Check size={13} /> قبول</button><button className="im-btn im-btn-sm" onClick={() => setDecide({ insp: x, to: 'reject' })}><X size={13} /> رد</button></span> : null } as Col<CsInspection>] : []),
        ]} />
      </Section>
      {pickOpen && (
        <div className="im-card cs-pick" role="dialog" aria-label="انتخاب بازرسی">
          <header><b>کدام بازرسی؟</b><button className="im-btn im-btn-sm" onClick={() => setPickOpen(false)} aria-label="بستن"><X size={13} /></button></header>
          {(Object.keys(DISCIPLINE_FA) as Discipline[]).map((d) => (
            <div key={d} className="cs-pick-group"><span>{DISCIPLINE_FA[d]}</span><div>{ITP_CHECKS.filter((c) => c.discipline === d).map((c) => <button key={c.key} className="im-btn im-btn-sm" onClick={() => { setCheck(c); setPickOpen(false) }}><ClipboardCheck size={13} /> {c.title}</button>)}</div></div>
          ))}
        </div>
      )}
      {check && <FormModal title={check.title} subtitle={`مرجع: ${check.ref} · نقطهٔ ${check.hold === 'H' ? 'توقف (Hold)' : check.hold === 'W' ? 'مشاهده (Witness)' : 'بررسی مدرک (Review)'}`} fields={fieldsOf(check)} initial={{ inspDate: todayTehran() }} onClose={() => setCheck(null)}
        preview={(v) => { const j = judgeItp(check, valuesOf(check, v), st.rules); const sp = specsOf(check, st.rules); return <div className="im-helper" style={{ margin: 0 }}>{check.specs.length > 0 && <div>معیار پروژه: {check.specs.map((s) => `${s.label} ${fa(sp[s.key])}${s.unit ? ` ${s.unit}` : ''}`).join('، ')}</div>}<div>داوری سامانه: {j.ok == null ? j.why[0] : j.ok ? 'مطابق معیار' : j.why.join('، ')}</div></div> }}
        onSubmit={async (v) => {
          const subs = subjects(check), sid = String(v.subjectId ?? '')
          await st.save('inspections', projectId, { discipline: check.discipline, itpKey: check.key, subjectType: check.subject, subjectId: sid || null, subjectLabel: sid ? subs.find((x) => x.value === sid)?.label ?? '' : String(v.subjectLabel ?? ''), inspDate: String(v.inspDate), holdPoint: check.hold, values: valuesOf(check, v), reportNo: String(v.reportNo ?? ''), inspector: String(v.inspector ?? ''), note: String(v.note ?? '') })
        }} />}
      {decide && (() => { const c = itpOf(decide.insp.itpKey); const j = c ? judgeItp(c, decide.insp.values, st.rules) : { ok: null, why: [] }; const against = (decide.to === 'accept' && j.ok === false) || (decide.to === 'reject' && j.ok === true)
        return <FormModal title={`${decide.to === 'accept' ? 'قبول' : 'رد'} — ${c?.title ?? ''}`} subtitle={against ? 'این تصمیم با داوری سامانه یکی نیست؛ دلیل را بنویسید.' : undefined} submitLabel={decide.to === 'accept' ? 'ثبت قبول' : 'ثبت رد'}
          fields={[{ key: 'note', label: 'توضیح', kind: 'text', span: 2, required: against || decide.to === 'reject' }]} initial={{ note: decide.insp.note }} onClose={() => setDecide(null)}
          onSubmit={async (v) => { await st.save('inspections', projectId, { id: decide.insp.id, result: decide.to, note: String(v.note ?? '') }) }} /> })()}
    </div>
  )
}

// ── rules ──────────────────────────────────────────────────────────────
function RulesView({ projectId }: { projectId: string }) {
  const rules = useCsStore((s) => s.rules), saved = useCsStore((s) => s.rulesSaved), saveRules = useCsStore((s) => s.saveRules), lines = useCsStore((s) => s.lines), packs = useCsStore((s) => s.packs)
  const r = useRights(projectId)
  const [d, setD] = useState<QcRules>(rules)
  useEffect(() => setD(rules), [rules])
  const dirty = JSON.stringify(d) !== JSON.stringify(rules)
  const setSpec = (ck: string, sk: string, v: number) => setD((x) => ({ ...x, itp: { ...x.itp, [ck]: { ...(x.itp[ck] ?? {}), [sk]: v } } }))
  const lowPacks = packs.filter((p) => !p.archived && p.status !== 'tested' && p.status !== 'reinstated').map((p) => ({ p, need: packTestNeed(p, lines, d) })).filter((x) => x.need != null && (x.p.testPressBar ?? 0) < x.need)
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {!saved && <div className="im-card cs-msg bad">قواعد کیفیت این پروژه هنوز ذخیره نشده است؛ مقادیر پیش‌فرض (ASME B31.8 برای ایستگاه) به کار می‌رود.</div>}
      <Section title="آزمون غیرمخرب و جوشکاران" hint="پیش‌فرض‌ها از ASME B31.8 و ASME IX؛ اگر مشخصات فنی یا IGS پروژه سخت‌گیرانه‌تر است، همین‌جا تغییر دهید." action={r.review ? <button className="im-btn im-btn-primary im-btn-sm" disabled={!dirty} onClick={() => void saveRules(projectId, d)}><Save size={13} /> ذخیره</button> : <span className="sub">فقط دستگاه نظارت / کنترل کیفیت تغییر می‌دهد</span>}>
        <div className="cs-rules">
          <label>کلاس مکانی (درصد آزمون پیش‌فرض)<select disabled={!r.review} value={d.locationClass} onChange={(e) => setD({ ...d, locationClass: e.target.value as LocationClass })}>{(Object.keys(LOCATION_CLASS_FA) as LocationClass[]).map((k) => <option key={k} value={k}>{LOCATION_CLASS_FA[k]} — {fa(B31_8_EXTENT[k])}٪</option>)}</select></label>
          <label><span><input type="checkbox" disabled={!r.review} checked={d.progressiveEnabled} onChange={(e) => setD({ ...d, progressiveEnabled: e.target.checked })} /> آزمون پیش‌رونده پس از رد</span></label>
          <label>سرجوش اضافه به ازای هر رد<NumInput label="سرجوش اضافه به ازای هر رد" value={d.progressivePerReject} onCommit={(v) => setD({ ...d, progressivePerReject: Math.max(0, Math.round(v)) })} /></label>
          <label>حد مجاز نرخ رد جوشکار (٪)<NumInput label="حد مجاز نرخ رد جوشکار" value={d.welderRejectLimit * 100} onCommit={(v) => setD({ ...d, welderRejectLimit: Math.max(0, v) / 100 })} /></label>
          <label>حداکثر وقفهٔ جوشکار (روز)<NumInput label="حداکثر وقفهٔ جوشکار" value={d.continuityDays} onCommit={(v) => setD({ ...d, continuityDays: Math.max(1, Math.round(v)) })} /></label>
          <label>ضریب فشار هیدروتست (× فشار طراحی)<NumInput label="ضریب فشار هیدروتست" value={d.testFactor} onCommit={(v) => setD({ ...d, testFactor: Math.max(1, v) })} /></label>
        </div>
        {lowPacks.length > 0 && <p className="im-helper" style={{ color: '#f59e0b' }}>فشار آزمون {lowPacks.map((x) => `${x.p.packNo} (لازم ${fa(x.need!)} bar)`).join('، ')} کمتر از حداقل است؛ سرور ثبت آزمون آن‌ها را نمی‌پذیرد.</p>}
      </Section>
      <Section title="معیارهای پذیرش بازرسی‌ها (ITP)" hint="مقادیر مشخصات فنی پروژه را جایگزین پیش‌فرض‌ها کنید؛ داوری سامانه با همین مقادیر انجام می‌شود." flush>
        <DataTable rows={ITP_CHECKS.flatMap((c) => c.specs.map((s) => ({ c, s })))} rowKey={(x) => `${x.c.key}.${x.s.key}`} cols={[
          { key: 'd', label: 'رشته', render: (x) => DISCIPLINE_FA[x.c.discipline] },
          { key: 'c', label: 'بازرسی', render: (x) => <><span className="strong">{x.c.title}</span><span className="sub">{x.c.ref}</span></> },
          { key: 's', label: 'معیار', render: (x) => `${x.s.label}${x.s.unit ? ` (${x.s.unit})` : ''}` },
          { key: 'v', label: 'مقدار پروژه', render: (x) => (r.review ? <NumInput label={x.s.label} className="fn-cell-input" value={d.itp[x.c.key]?.[x.s.key] ?? x.s.value} onCommit={(v) => setSpec(x.c.key, x.s.key, v)} /> : fa(d.itp[x.c.key]?.[x.s.key] ?? x.s.value)) },
        ]} />
      </Section>
    </div>
  )
}
