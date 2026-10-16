import { useEffect, useMemo, useState } from 'react'
import { useExecutionStore } from '../store/useExecutionStore'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionModel } from '../lib/useExecutionModel'
import { STAGE_OF_FORM, type WeldStage } from '../lib/welds'
import { Chip, KpiCard, Section } from '../../finance/components/fn'
import { fa } from '../components/common'
import { EpcGate } from '../components/epc/EpcBanner'
import type { WeldRow } from '../epcTypes'
import { buildProfile, SHARED } from '../lib/weldProfile'
import { ATTR_LABEL, type Attr } from '../lib/weldCentral'
import { FORM_BY_KEY } from '../lib/formCatalog'
import { WSTATE_FA, weldLifecycle, type WState } from '../lib/weldLifecycle'
import { fmtD } from '../../finance/components/fn'

const STAGES: { key: WeldStage; label: string }[] = [{ key: 'fitup', label: 'فیت‌آپ' }, { key: 'weld', label: 'جوش' }, { key: 'rt_request', label: 'درخواست RT' }, { key: 'rt', label: 'RT' }, { key: 'repair', label: 'تعمیر' }, { key: 'coating', label: 'پوشش' }]
const KIND_FA = { pipe: 'شمارهٔ لوله', size: 'قطر', thickness: 'ضخامت', front: 'جبهه' } as const

/** The weld registry: an index over the technical forms. Every row of a form keeps its own text; this page only shows which forms mention the same weld, flags conflicts and asks a person about anything doubtful. */
export function WeldsPage({ projectId }: { projectId: string; sub: string }) { return <EpcGate><Inner projectId={projectId} /></EpcGate> }
function Inner({ projectId }: { projectId: string }) {
  const m = useExecutionModel(projectId)
  const epc = useEpcStore()
  const can = useExecutionStore((s) => s.can(projectId, 'review') || s.can(projectId, '*'))
  const [tab, setTab] = useState<'list' | 'conflicts' | 'suspects'>('list')
  const [q, setQ] = useState('')
  const [noRt, setNoRt] = useState(false)
  const [open, setOpen] = useState('')
  useEffect(() => { if (open) void epc.loadWeldHistory(open) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const welds = useMemo(() => epc.welds.filter((w) => w.projectId === projectId && w.status !== 'merged'), [epc.welds, projectId])
  const byId = useMemo(() => new Map(epc.welds.map((w) => [w.id, w])), [epc.welds])
  const reportById = useMemo(() => new Map(m.reports.map((r) => [r.id, r])), [m.reports])
  const lineById = useMemo(() => new Map(m.lines.map((l) => [l.id, l])), [m.lines])
  // per weld: how many rows each stage has, and the latest verdicts
  const info = useMemo(() => {
    const out = new Map<string, { stages: Partial<Record<WeldStage, number>>; rt: string; vt: string; status: string[] }>()
    for (const lw of epc.lineWelds) {
      if (lw.projectId !== projectId) continue
      const l = lineById.get(lw.lineId); const r = l ? reportById.get(l.reportId) : undefined
      if (!l || !r) continue
      const st = STAGE_OF_FORM[r.formKey]; if (!st) continue
      const e = out.get(lw.weldId) ?? { stages: {}, rt: '', vt: '', status: [] }
      e.stages[st] = (e.stages[st] ?? 0) + 1
      if (st === 'rt') e.rt = String(l.detail.result ?? e.rt)
      if (st === 'weld') e.vt = String(l.detail.vt ?? e.vt)
      if (r.status !== 'approved') e.status.push(r.status)
      out.set(lw.weldId, e)
    }
    return out
  }, [epc.lineWelds, lineById, reportById, projectId])
  // quality chain per weld (fit-up → weld → RT → repair → RT again → coating → coating test), derived from the rows
  const life = useMemo(() => {
    const ev = new Map<string, import('../lib/weldLifecycle').WEvent[]>()
    for (const lw of epc.lineWelds) {
      if (lw.projectId !== projectId) continue
      const l = lineById.get(lw.lineId); const r = l ? reportById.get(l.reportId) : undefined; if (!l || !r || r.status === 'rejected') continue
      const a = ev.get(lw.weldId) ?? []; a.push({ formKey: r.formKey, date: r.reportDate, result: String(l.detail.result ?? ''), vt: String(l.detail.vt ?? ''), repairDone: String(l.detail.repairDone ?? ''), lineId: l.id }); ev.set(lw.weldId, a)
    }
    return new Map([...ev].map(([id, e]) => [id, weldLifecycle(e)]))
  }, [epc.lineWelds, lineById, reportById, projectId])
  const [lifeF, setLifeF] = useState<WState | ''>('')
  const conflicts = epc.weldConflicts.filter((c) => c.projectId === projectId)
  const suspects = epc.weldSuspects.filter((s) => s.projectId === projectId)
  const confByWeld = new Map<string, number>(); for (const c of conflicts) confByWeld.set(c.weldId, (confByWeld.get(c.weldId) ?? 0) + 1)
  const rows = welds.filter((w) => (!q || `${w.sectionRaw} ${w.weldRaw} ${w.pipeNo ?? ''}`.toLowerCase().includes(q.toLowerCase())) && (!noRt || !(info.get(w.id)?.stages.rt)) && (!lifeF || life.get(w.id)?.state === lifeF)).sort((a, b) => (a.sectionKey + a.weldKey < b.sectionKey + b.weldKey ? -1 : 1))
  const label = (w: WeldRow | undefined) => (w ? `سکشن ${w.sectionRaw} · ${w.weldRaw}` : '—')
  const act = (fn: Parameters<typeof epc.weldAction>[0], args: Record<string, unknown>) => void epc.weldAction(fn, args)
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard label="سرجوش‌های شناخته‌شده" value={fa(welds.length)} sub="شاخصی روی فرم‌ها؛ متن فرم‌ها دست‌نخورده" />
        <KpiCard label="بدون درخواست/گزارش RT" value={fa(welds.filter((w) => !info.get(w.id)?.stages.rt).length)} tone="warn" />
        <KpiCard label="نیازمند تعمیر" value={fa([...life.values()].filter((x) => x.state === 'needs_repair').length)} tone={[...life.values()].some((x) => x.state === 'needs_repair') ? 'bad' : 'good'} onClick={() => setLifeF(lifeF === 'needs_repair' ? '' : 'needs_repair')} />
        <KpiCard label="تعمیرشده، منتظر RT مجدد" value={fa([...life.values()].filter((x) => x.state === 'repaired').length)} tone="warn" onClick={() => setLifeF(lifeF === 'repaired' ? '' : 'repaired')} />
        <KpiCard label="RT پذیرفته، منتظر پوشش" value={fa([...life.values()].filter((x) => x.state === 'rt_accepted').length)} onClick={() => setLifeF(lifeF === 'rt_accepted' ? '' : 'rt_accepted')} />
        <KpiCard label="پوشش‌شده، منتظر تست پوشش" value={fa([...life.values()].filter((x) => x.state === 'coated').length)} onClick={() => setLifeF(lifeF === 'coated' ? '' : 'coated')} />
        <KpiCard label="ناسازگاری باز" value={fa(conflicts.length)} tone={conflicts.length ? 'bad' : 'good'} />
        <KpiCard label="موارد مشکوک به یکی‌بودن" value={fa(suspects.length)} tone={suspects.length ? 'warn' : 'good'} hint="هرگز خودکار ادغام نمی‌شوند" />
      </div>
      {open && (() => {
        const w = byId.get(open); if (!w) return null
        const mine = epc.lineWelds.filter((x) => x.weldId === open).map((x) => { const l = lineById.get(x.lineId), r = l ? reportById.get(l.reportId) : undefined; return l && r ? { l, r } : null }).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => a.r.reportDate.localeCompare(b.r.reportDate))
        const prof = buildProfile(mine.map(({ l, r }) => ({ formKey: r.formKey, date: r.reportDate, detail: l.detail })))
        const KEYS = ['result', 'vt', 'repairDone', 'vtCheck', 'rtReqNo', 'rtReportNo', 'defect', 'defectType', 'stamp', 'coatType', 'batchNo']
        return <Section title={`کارت سرجوش — ${label(w)}`} hint="مشخصات مرکزی در جدول مرکزی ذخیره می‌شود؛ مقدارهای زیرِ آن (چیپ‌ها) صرفاً خلاصهٔ آخرین مقدارهای ثبت‌شده در ردیف‌های فرم‌هاست و چیزی را عوض نمی‌کند." action={<button className="im-btn im-btn-sm" onClick={() => setOpen('')}>بستن</button>}>
          <div style={{ marginBottom: 10 }}>
            <b>مشخصات مرکزی سرجوش</b> <span className="im-helper">(یک مقدار برای همهٔ فرم‌ها؛ تغییر نیازمند دلیل است و در تاریخچه می‌ماند)</span>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>{(Object.keys(ATTR_LABEL) as Attr[]).map((a) => <label key={a} className="im-helper" style={{ display: 'grid', gap: 2 }}>{ATTR_LABEL[a]}
              <input key={`${w.id}${a}${w.central[a] ?? ''}`} disabled={!can} defaultValue={w.central[a] ?? ''} dir="ltr" style={{ width: 110 }} onBlur={(e) => { const v = e.target.value.trim(); if (v === (w.central[a] ?? '')) return; let note = ''; if (w.central[a]) { note = window.prompt(`دلیل تغییر «${ATTR_LABEL[a]}» از ${w.central[a]} به ${v || '(خالی)'}:`) ?? ''; if (!note.trim()) { e.target.value = w.central[a] ?? ''; return } } void epc.weldSetAttr(w.id, a, v, note) }} /></label>)}</div>
            {epc.weldHistory.filter((h) => h.weldId === w.id).length > 0 && <details style={{ marginTop: 6 }}><summary className="im-helper">تاریخچهٔ تغییر مشخصات</summary><table className="ex-lines"><tbody>{epc.weldHistory.filter((h) => h.weldId === w.id).map((h) => <tr key={h.id}><td>{fmtD(h.at.slice(0, 10))}</td><td>{ATTR_LABEL[h.attr]}</td><td dir="ltr">{h.oldValue ?? '—'} ← {h.newValue ?? '—'}</td><td>{h.source === 'manual' ? 'دستی' : h.source === 'backfill' ? 'انتقال از سوابق' : 'از فرم'}</td><td dir="auto">{h.note}</td></tr>)}</tbody></table></details>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>{SHARED.map((a) => { const f = prof[a.attr]; return <Chip key={a.attr} tone={f ? 'good' : 'neutral'}>{a.label}: {f ? <b dir="ltr">{f.value}</b> : '—'}{f ? ` (از ${FORM_BY_KEY[f.from]?.title ?? f.from})` : ''}</Chip> })}</div>
          <div className="fn-tbl-wrap" style={{ maxHeight: 320 }}><table className="ex-lines"><thead><tr><th>تاریخ</th><th>فرم</th><th>شمارهٔ گزارش</th><th>وضعیت گزارش</th><th>اطلاعات مرحله</th></tr></thead><tbody>
            {mine.map(({ l, r }) => <tr key={l.id}><td>{fmtD(r.reportDate)}</td><td>{FORM_BY_KEY[r.formKey]?.title ?? r.formKey}</td><td className="fn-code">{r.reportNo}</td><td>{r.status}</td><td dir="auto">{KEYS.filter((k) => String(l.detail[k] ?? '').trim()).map((k) => `${FORM_BY_KEY[r.formKey]?.columns.find((c) => c.key === k)?.label ?? k}: ${l.detail[k]}`).join(' · ') || '—'}</td></tr>)}
            {mine.length === 0 && <tr><td colSpan={5} className="sub">ردیفی برای این سرجوش ثبت نشده است.</td></tr>}
          </tbody></table></div>
        </Section>
      })()}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {([['list', 'سرجوش‌ها'], ['conflicts', `ناسازگاری‌ها (${fa(conflicts.length)})`], ['suspects', `موارد مشکوک (${fa(suspects.length)})`]] as const).map(([k, l]) => <button key={k} className={`im-btn im-btn-sm${tab === k ? ' im-btn-primary' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'list' && (
        <Section title="سرجوش‌ها و مراحل" action={<span style={{ display: 'inline-flex', gap: 6 }}><input placeholder="جست‌وجوی سکشن، سرجوش، لوله…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="جست‌وجو" /><select value={lifeF} onChange={(e) => setLifeF(e.target.value as WState | '')} aria-label="وضعیت کیفیت"><option value="">همهٔ وضعیت‌های کیفیت</option>{(['welded', 'rt_requested', 'needs_repair', 'repaired', 'rt_accepted', 'coated', 'coat_failed', 'coat_tested'] as WState[]).map((k) => <option key={k} value={k}>{WSTATE_FA[k]}</option>)}</select><label><input type="checkbox" checked={noRt} onChange={(e) => setNoRt(e.target.checked)} /> فقط بدون RT</label></span>}>
          <div className="fn-tbl-wrap" style={{ maxHeight: 520 }}><table className="ex-lines"><thead><tr><th>سرجوش</th><th>لوله</th>{STAGES.map((s) => <th key={s.key}>{s.label}</th>)}<th>وضعیت کیفیت</th><th>گام بعدی</th><th>وضعیت</th><th /></tr></thead>
            <tbody>{rows.slice(0, 300).map((w) => { const e = info.get(w.id); return (
              <tr key={w.id}><td dir="ltr"><button className="im-btn im-btn-sm" onClick={() => setOpen(open === w.id ? '' : w.id)} aria-expanded={open === w.id}>{label(w)}</button></td><td dir="ltr">{w.pipeNo ?? <Chip tone="warn">نامشخص</Chip>}</td>
                {STAGES.map((s) => { const n = e?.stages[s.key] ?? 0; const res = s.key === 'rt' ? e?.rt : s.key === 'weld' ? e?.vt : ''; return <td key={s.key}>{n ? <Chip tone={res === 'rep' || res === 'rej' ? 'bad' : 'good'}>{res === 'rep' ? 'تعمیر' : res === 'rej' ? 'مردود' : '✓'}{n > 1 ? ` ×${fa(n)}` : ''}</Chip> : <span className="sub">—</span>}</td> })}
                <td>{(() => { const lf = life.get(w.id); if (!lf || lf.state === 'none') return <span className="sub">—</span>; const bad = lf.state === 'needs_repair' || lf.state === 'coat_failed'; return <span title={lf.anomalies.join(' · ') || undefined}><Chip tone={bad ? 'bad' : lf.state === 'coat_tested' ? 'good' : 'warn'}>{WSTATE_FA[lf.state]}{lf.cycle ? ` · چرخهٔ تعمیر ${fa(lf.cycle)}` : ''}</Chip>{lf.anomalies.length > 0 && <Chip tone="bad">ناهمخوانی ترتیب</Chip>}</span> })()}</td>
                <td>{life.get(w.id)?.next ?? <span className="sub">—</span>}</td>
                <td>{w.status === 'confirmed' ? <Chip tone="good">تأییدشده</Chip> : (e?.status.length ? <Chip tone="warn">موقت</Chip> : <Chip tone="neutral">خودکار</Chip>)}{confByWeld.get(w.id) ? <Chip tone="bad">ناسازگار</Chip> : null}</td>
                <td>{can && w.status !== 'confirmed' && <button className="im-btn im-btn-sm" onClick={() => act('ex_weld_set_status', { p_weld: w.id, p_status: 'confirmed' })}>تأیید</button>}</td></tr>) })}
              {rows.length === 0 && <tr><td colSpan={STAGES.length + 6} className="sub">سرجوشی ثبت نشده است؛ با ذخیرهٔ فرم‌های فنی ساخته می‌شود.</td></tr>}</tbody></table></div>
          {rows.length > 300 && <p className="im-helper">۳۰۰ ردیف اول نمایش داده شد؛ جست‌وجو کنید.</p>}
        </Section>
      )}
      {tab === 'conflicts' && (
        <Section title="ناسازگاری‌ها" hint="سیستم هیچ‌کدام از مقدارها را بازنویسی نمی‌کند؛ فرم مبدأ را اصلاح کنید یا ناسازگاری را با دلیل ببندید.">
          <table className="ex-lines"><tbody>{conflicts.map((c) => <tr key={c.id}><td dir="ltr">{label(byId.get(c.weldId))}</td><td>{KIND_FA[c.kind]}</td><td dir="ltr">{c.detail}</td><td>{can && <span style={{ display: 'inline-flex', gap: 4 }}><button className="im-btn im-btn-sm" onClick={() => { const n = window.prompt('دلیل/یادداشت رفع ناسازگاری'); if (n != null) act('ex_weld_conflict_resolve', { p_id: c.id, p_status: 'resolved', p_note: n }) }}>رفع‌شد</button><button className="im-btn im-btn-sm" onClick={() => { const n = window.prompt('چرا ناسازگاری نادیده گرفته می‌شود؟'); if (n) act('ex_weld_conflict_resolve', { p_id: c.id, p_status: 'dismissed', p_note: n }) }}>نادیده</button></span>}</td></tr>)}
            {conflicts.length === 0 && <tr><td className="sub">ناسازگاری بازی نیست.</td></tr>}</tbody></table>
        </Section>
      )}
      {tab === 'suspects' && (
        <Section title="موارد مشکوک به یکی‌بودن" hint="مثلاً W-404 و W404. فقط با تأیید شما ادغام می‌شوند؛ ادغام قابل لغو است.">
          <table className="ex-lines"><tbody>{suspects.map((s) => <tr key={s.n2}><td dir="ltr">{s.raws.join('  ≟  ')}</td><td>{can && <span style={{ display: 'inline-flex', gap: 4 }}>
            <button className="im-btn im-btn-sm" onClick={() => { const n = window.prompt(`ادغام «${s.raws[1]}» در «${s.raws[0]}» — دلیل:`); if (n) act('ex_weld_merge', { p_from: s.weldIds[1], p_into: s.weldIds[0], p_reason: n }) }}>یکی‌اند (ادغام)</button>
            <button className="im-btn im-btn-sm" onClick={() => act('ex_weld_dismiss_suspect', { p_project: projectId, p_n2: s.n2 })}>جدا هستند</button></span>}</td></tr>)}
            {suspects.length === 0 && <tr><td className="sub">مورد مشکوکی نیست.</td></tr>}</tbody></table>
          {epc.weldMerges.filter((x) => x.projectId === projectId).length > 0 && <div style={{ marginTop: 10 }}><b>ادغام‌های انجام‌شده</b>{epc.weldMerges.filter((x) => x.projectId === projectId).map((x) => <div key={x.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span dir="ltr">{label(byId.get(x.fromWeld))} → {label(byId.get(x.intoWeld))}</span><span className="sub">{x.reason}</span>{can && <button className="im-btn im-btn-sm" onClick={() => act('ex_weld_unmerge', { p_merge: x.id })}>لغو ادغام</button>}</div>)}</div>}
        </Section>
      )}
    </div>
  )
}
