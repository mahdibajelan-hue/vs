import { useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Upload } from 'lucide-react'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { useEpcModel } from '../lib/useEpcModel'
import { useMaterialModel } from '../../material/lib/control/useMaterialModel'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { ppc, deviationCauses, lookaheadWeeks, type LookaheadItem } from '../lib/engine/lookahead'
import { parsePredecessors, parseScheduleGrid, matchActivities, type MatchResult, type ScheduleParse } from '../lib/engine/scheduleImport'
import { readWorkbookGrids } from '../lib/priceBookXlsx'
import { addDays, jalaliText, weekdayOf, weekOf } from '../lib/periods'
import { Chip, KpiCard, Section } from '../../finance/components/fn'
import { Empty, fa, pct } from '../components/common'
import { EpcGate } from '../components/epc/EpcBanner'
import { ActivityLinks } from '../components/epc/ActivityLinks'
import { PREREQ_KIND_LABEL_FA } from '../epcTypes'
import type { PrereqKind, PrereqStatus } from '../lib/engine/readiness'

const READY_TONE = { ready: 'good', at_risk: 'warn', blocked: 'bad', unknown: 'neutral' } as const
const READY_FA = { ready: 'آماده', at_risk: 'آماده با محدودیت', blocked: 'غیرآماده', unknown: 'پیش‌نیازی تعریف نشده' } as const

export function PlanPage(p: { projectId: string; sub: string }) { return <EpcGate><Inner {...p} /></EpcGate> }
function Inner({ projectId, sub }: { projectId: string; sub: string }) {
  const m = useEpcModel(projectId)
  const epc = useEpcStore()
  const ex = useExecutionStore()
  const can = ex.can(projectId, 'edit_activities')
  const acts = useMemo(() => m.ex.activities.filter((a) => a.active && a.approval === 'approved'), [m.ex.activities])
  const title = (id: string) => m.ex.actById.get(id)?.title ?? '—'
  if (!acts.length) return <Empty>ابتدا فعالیت‌های پروژه را تعریف کنید.</Empty>
  if (sub === 'readiness') return <Readiness m={m} projectId={projectId} can={can} acts={acts} />
  if (sub === 'import') return <Import projectId={projectId} can={can} acts={acts} />
  return <Lookahead m={m} projectId={projectId} can={can} acts={acts} title={title} epcLook={epc.lookahead.filter((l) => l.projectId === projectId)} />
}

function Lookahead({ m, projectId, can, acts, title, epcLook }: { m: ReturnType<typeof useEpcModel>; projectId: string; can: boolean; acts: ReturnType<typeof useExecutionStore.getState>['activities']; title: (id: string) => string; epcLook: ReturnType<typeof useEpcStore.getState>['lookahead'] }) {
  const save = useEpcStore((s) => s.saveLookahead)
  const items: LookaheadItem[] = epcLook.map((l) => ({ id: l.id, weekStart: l.weekStart, activityId: l.activityId, front: l.front, responsible: l.responsible, plannedQty: l.plannedQty, committed: l.committed, achievedQty: l.achievedQty, deviationCause: l.deviationCause, recoveryPlan: l.recoveryPlan }))
  const cap = new Map<string, number | null>([...m.insights].map(([id, i]) => [id, i.forecast.perWeek]))
  const weeks = lookaheadWeeks(items, m.today, m.ex.settings.weekStart, weekdayOf, cap)
  const prev = addDays(weekOf(m.today, m.ex.settings.weekStart).from, -7)
  const past = ppc(items, prev)
  const [add, setAdd] = useState({ weekStart: weeks[0].weekStart, activityId: '', front: '', responsible: '', qty: 0 })
  const causes = deviationCauses(items)
  const firstWeekItems = weeks[0].items
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="تحقق تعهدات هفتهٔ گذشته (PPC)" value={past.ppc == null ? '—' : pct(past.ppc, 0)} tone={past.ppc == null ? 'neutral' : past.ppc >= 0.8 ? 'good' : past.ppc >= 0.6 ? 'warn' : 'bad'} sub={past.committed ? `${fa(past.met)} از ${fa(past.committed)} تعهد` : 'تعهدی ثبت نشده'} />
        <KpiCard i={1} label="تعهدات این هفته" value={fa(firstWeekItems.filter((i) => i.committed).length)} />
        <KpiCard i={2} label="بیش از ظرفیت پیش‌بینی‌شده" value={fa(weeks.reduce((s, w) => s + w.overCommit.length, 0))} tone={weeks.some((w) => w.overCommit.length) ? 'warn' : 'good'} sub="تعهد بیشتر از ظرفیت هفتگی موتور بهره‌وری" />
        <KpiCard i={3} label="علل اصلی انحراف" value={causes[0]?.cause ?? '—'} sub={causes[0] ? `${fa(causes[0].count)} مورد` : undefined} />
      </div>
      {can && <div className="im-card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="ex-lab">هفته<select value={add.weekStart} onChange={(e) => setAdd({ ...add, weekStart: e.target.value })}>{weeks.map((w) => <option key={w.weekStart} value={w.weekStart}>{jalaliText(w.weekStart)}</option>)}</select></label>
        <label className="ex-lab">فعالیت<select value={add.activityId} onChange={(e) => setAdd({ ...add, activityId: e.target.value })} style={{ minWidth: 240, maxWidth: 380 }}><option value="">—</option>{acts.map((a) => <option key={a.id} value={a.id}>{a.itemNo ? `${a.itemNo} — ` : ''}{a.title}</option>)}</select></label>
        <label className="ex-lab">جبهه<input value={add.front} onChange={(e) => setAdd({ ...add, front: e.target.value })} dir="auto" style={{ width: 110 }} /></label>
        <label className="ex-lab">مسئول<input value={add.responsible} onChange={(e) => setAdd({ ...add, responsible: e.target.value })} dir="auto" style={{ width: 120 }} /></label>
        <label className="ex-lab">مقدار برنامه<input type="number" min={0} value={add.qty} onChange={(e) => setAdd({ ...add, qty: Number(e.target.value) || 0 })} style={{ width: 100 }} /></label>
        <button className="im-btn im-btn-primary im-btn-sm" disabled={!add.activityId} onClick={() => void save({ projectId, weekStart: add.weekStart, activityId: add.activityId, front: add.front, responsible: add.responsible, plannedQty: add.qty })}><Plus size={13} /> افزودن</button>
      </div>}
      {weeks.map((w) => (
        <Section key={w.weekStart} title={`هفتهٔ ${jalaliText(w.weekStart)} تا ${jalaliText(w.weekEnd)}`} hint={w.weekStart === weeks[0].weekStart ? 'هفتهٔ جاری — تعهد قطعی و ثبت تحقق' : undefined} flush>
          {w.items.length === 0 ? <p className="im-helper" style={{ margin: 12 }}>برنامه‌ای ثبت نشده.</p> : (
            <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>فعالیت</th><th>جبهه</th><th>مسئول</th><th className="num">برنامه</th><th className="num">ظرفیت هفتگی پیش‌بینی</th><th>پیش‌نیاز</th><th>تعهد</th><th className="num">تحقق</th><th>علت انحراف / برنامهٔ جبرانی</th></tr></thead>
              <tbody>{w.items.map((i) => { const ins = m.insights.get(i.activityId); const c = cap.get(i.activityId); const over = w.overCommit.includes(i); const row = epcLook.find((l) => l.id === i.id)!
                return <tr key={i.id}><td>{title(i.activityId)}</td><td>{i.front || '—'}</td><td>{i.responsible || '—'}</td><td className="num">{fa(i.plannedQty, 2)}{over && <small className="ex-warn" style={{ display: 'block' }}>بیش از ظرفیت</small>}</td><td className="num">{c == null ? '—' : fa(c, 2)}</td>
                  <td>{ins ? <Chip tone={READY_TONE[ins.readiness.state]}>{READY_FA[ins.readiness.state]}</Chip> : '—'}</td>
                  <td><input type="checkbox" disabled={!can} checked={i.committed} onChange={(e) => void save({ ...row, committed: e.target.checked })} aria-label="تعهد" /></td>
                  <td className="num"><input type="number" disabled={!can} defaultValue={i.achievedQty ?? ''} onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== i.achievedQty) void save({ ...row, achievedQty: v }) }} style={{ width: 80 }} aria-label="تحقق" /></td>
                  <td style={{ minWidth: 220 }}><input disabled={!can} defaultValue={i.deviationCause} placeholder="علت" onBlur={(e) => { if (e.target.value !== i.deviationCause) void save({ ...row, deviationCause: e.target.value }) }} dir="auto" aria-label="علت انحراف" /><input disabled={!can} defaultValue={i.recoveryPlan} placeholder="برنامهٔ جبرانی" onBlur={(e) => { if (e.target.value !== i.recoveryPlan) void save({ ...row, recoveryPlan: e.target.value }) }} dir="auto" aria-label="برنامه جبرانی" /></td></tr> })}</tbody></table></div>)}
        </Section>
      ))}
    </div>
  )
}

function Readiness({ m, projectId, can, acts }: { m: ReturnType<typeof useEpcModel>; projectId: string; can: boolean; acts: ReturnType<typeof useExecutionStore.getState>['activities'] }) {
  const epc = useEpcStore()
  const [sel, setSel] = useState('')
  const [f, setF] = useState<{ kind: PrereqKind; title: string; refType: string; refId: string; status: PrereqStatus; neededDate: string }>({ kind: 'drawing', title: '', refType: '', refId: '', status: 'pending', neededDate: '' })
  const docs = epc.engDocs.filter((d) => d.projectId === projectId)
  const mats = useMaterialModel(projectId).materials
  const list = acts.filter((a) => (m.insights.get(a.id)?.remaining ?? 0) > 0).sort((a, b) => ['blocked', 'at_risk', 'unknown', 'ready'].indexOf(m.insights.get(a.id)?.readiness.state ?? 'unknown') - ['blocked', 'at_risk', 'unknown', 'ready'].indexOf(m.insights.get(b.id)?.readiness.state ?? 'unknown'))
  const cur = sel ? m.insights.get(sel) : null
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p className="im-helper" style={{ margin: 0 }}>آمادگی فعالیت فقط از پیش‌نیازهای آن (مدارک مهندسی، مصالح، مجوز، زمین، بازرسی…) تعیین می‌شود؛ حضور نیرو و ماشین‌آلات به‌تنهایی به‌معنای آمادگی نیست. پیش‌نیاز وصل‌شده به مدرک مهندسی یا کالای ماژول تأمین، وضعیت واقعی همان را می‌گیرد.</p>
      <Section title="وضعیت آمادگی فعالیت‌های دارای کار باقیمانده" flush>
        <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>فعالیت</th><th>آمادگی</th><th>موانع</th><th className="num">پیش‌نیاز</th></tr></thead>
          <tbody>{list.map((a) => { const r = m.insights.get(a.id)!.readiness; return <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => setSel(a.id)}><td>{a.title}</td><td><Chip tone={READY_TONE[r.state]}>{READY_FA[r.state]}</Chip></td><td className="sub">{r.blockers.join('؛ ') || (r.items.filter((i) => i.state === 'pending').map((i) => i.title).join('؛ ') || '—')}</td><td className="num">{fa(r.items.length)}</td></tr> })}</tbody></table></div>
      </Section>
      {cur && (
        <Section title={`پیش‌نیازهای «${m.ex.actById.get(cur.activityId)?.title}»`}>
          <div style={{ display: 'grid', gap: 6 }}>
            {cur.readiness.items.map((i) => { const row = epc.prereqs.find((x) => x.id === i.prereqId)!; return <div key={i.prereqId} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><Chip tone={i.state === 'ready' ? 'good' : i.state === 'blocked' ? 'bad' : 'warn'}>{PREREQ_KIND_LABEL_FA[i.kind]}</Chip><b>{i.title}</b><span className="sub">{i.reason}</span>{can && <><select value={row.status} onChange={(e) => void epc.savePrereq({ ...row, status: e.target.value as PrereqStatus })} aria-label="وضعیت"><option value="pending">در انتظار</option><option value="ready">آماده</option><option value="blocked">مسدود</option><option value="na">لازم نیست</option></select><button className="im-btn im-btn-sm im-btn-danger" aria-label="حذف" onClick={() => void epc.removePrereq(row.id)}><Trash2 size={12} /></button></>}</div> })}
            {can && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 6 }}>
                <label className="ex-lab">نوع<select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as PrereqKind, refType: '', refId: '' })}>{(Object.keys(PREREQ_KIND_LABEL_FA) as PrereqKind[]).map((k) => <option key={k} value={k}>{PREREQ_KIND_LABEL_FA[k]}</option>)}</select></label>
                <label className="ex-lab">عنوان<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} dir="auto" style={{ width: 200 }} /></label>
                {f.kind === 'drawing' && <label className="ex-lab">مدرک مهندسی<select value={f.refId} onChange={(e) => setF({ ...f, refType: 'eng_doc', refId: e.target.value })}><option value="">دستی</option>{docs.map((d) => <option key={d.id} value={d.id}>{d.docNo} Rev {d.rev}</option>)}</select></label>}
                {f.kind === 'material' && <label className="ex-lab">کالا (ماژول تأمین)<select value={f.refId} onChange={(e) => setF({ ...f, refType: 'material', refId: e.target.value })}><option value="">دستی</option>{mats.map((x) => <option key={x.id} value={x.id}>{x.materialCode || x.itemUid} — {x.description.slice(0, 60)}</option>)}</select></label>}
                <label className="ex-lab">موعد نیاز<JalaliDateInput value={f.neededDate} onChange={(x) => setF({ ...f, neededDate: x })} /></label>
                <button className="im-btn im-btn-primary im-btn-sm" disabled={!f.title.trim()} onClick={() => void epc.savePrereq({ projectId, activityId: cur.activityId, kind: f.kind, title: f.title, refType: f.refType, refId: f.refId || null, status: f.status, neededDate: f.neededDate || null }).then(() => setF({ ...f, title: '' }))}><Plus size={13} /> پیش‌نیاز</button>
              </div>)}
          </div>
          <div style={{ marginTop: 14 }}><ActivityLinks projectId={projectId} activityId={cur.activityId} can={useExecutionStore.getState().can(projectId, 'raise')} /></div>
        </Section>
      )}
    </div>
  )
}

function Import({ projectId, can, acts }: { projectId: string; can: boolean; acts: ReturnType<typeof useExecutionStore.getState>['activities'] }) {
  const epc = useEpcStore(), ex = useExecutionStore()
  const ref = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [parse, setParse] = useState<ScheduleParse | null>(null)
  const [match, setMatch] = useState<MatchResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const pick = async (f: File) => {
    setBusy(true); setMsg('')
    try {
      const grids = await readWorkbookGrids(f)
      let best: ScheduleParse | null = null
      for (const g of grids) { const pr = parseScheduleGrid(g.rows as never); if (!best || pr.rows.length > best.rows.length) best = pr }
      if (!best || !best.rows.length) { setMsg(best?.issues[0]?.message ?? 'برنامه‌ای در فایل پیدا نشد.'); setParse(null); setMatch(null) }
      else { setName(f.name); setParse(best); setMatch(matchActivities(best.rows, acts.map((a) => ({ id: a.id, itemNo: a.itemNo, rowNo: a.rowNo, title: a.title })))) }
    } catch { setMsg('فایل خوانده نشد.') }
    setBusy(false)
  }
  const apply = async () => {
    if (!parse || !match) return
    setBusy(true)
    const n = await epc.applySchedule(projectId, match.matched.map((x) => ({ activityId: x.activityId, start: x.row.start, finish: x.row.finish })))
    const idByCode = new Map(match.matched.filter((x) => x.row.code).map((x) => [x.row.code.trim().toLowerCase(), x.activityId]))
    const deps = match.matched.flatMap((x) => parsePredecessors(x.row.predecessors).flatMap((d) => { const pid = idByCode.get(d.predCode.trim().toLowerCase()); return pid && pid !== x.activityId ? [{ predId: pid, succId: x.activityId, type: d.type, lag: d.lag }] : [] }))
    await epc.saveDeps(projectId, deps)
    await epc.logImport(projectId, name, { rows: parse.rows.length, matched: match.matched.length, unmatched: match.unmatched.length, ambiguous: match.ambiguous.length, datesApplied: n, deps: deps.length, mapping: parse.mapping, data: parse.rows.slice(0, 5000) }, parse.issues)
    await ex.fetchAll()
    setMsg(`${fa(n)} فعالیت به‌روز شد و ${fa(deps.length)} وابستگی ثبت شد.`); setParse(null); setMatch(null); setBusy(false)
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p className="im-helper" style={{ margin: 0 }}>ورود برنامهٔ زمان‌بندی از Excel (خروجی Primavera یا MS Project با ستون‌های نام فعالیت، شروع، پایان، پیش‌نیاز). تطبیق فعالیت‌ها ابتدا با شمارهٔ ردیف و سپس با عنوان یکسان انجام می‌شود؛ موارد تطبیق‌نخورده یا مبهم اعمال نمی‌شوند. محتوای خوانده‌شده در سابقهٔ ورود نگه‌داری می‌شود؛ خود فایل در ذخیره‌ساز ذخیره نمی‌شود.</p>
      {can && <div><input ref={ref} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = '' }} /><button className="im-btn im-btn-primary" disabled={busy} onClick={() => ref.current?.click()}><Upload size={14} /> انتخاب فایل برنامه</button></div>}
      {msg && <div className="im-card" style={{ padding: 10 }}>{msg}</div>}
      {parse && match && (
        <Section title={`پیش‌نمایش ${name}`} hint={`${fa(parse.rows.length)} ردیف · ${fa(match.matched.length)} تطبیق · ${fa(match.unmatched.length)} بی‌تطبیق · ${fa(match.ambiguous.length)} مبهم`} action={<button className="im-btn im-btn-primary im-btn-sm" disabled={busy || !match.matched.length} onClick={() => void apply()}>اعمال تاریخ‌ها و وابستگی‌ها</button>}>
          {parse.issues.length > 0 && <div className="ex-warn" style={{ marginBottom: 8 }}>{parse.issues.slice(0, 8).map((i, k) => <div key={k}>ردیف {fa(i.row)}: {i.message}</div>)}{parse.issues.length > 8 && <div>… و {fa(parse.issues.length - 8)} مورد دیگر</div>}</div>}
          <div className="fn-tbl-wrap" style={{ maxHeight: 360 }}><table className="ex-lines"><thead><tr><th>ردیف فایل</th><th>نام در فایل</th><th>شروع</th><th>پایان</th><th>پیش‌نیاز</th><th>تطبیق</th></tr></thead>
            <tbody>{parse.rows.slice(0, 300).map((r) => { const mt = match.matched.find((x) => x.row === r); const am = match.ambiguous.find((x) => x.row === r); return <tr key={r.rowIndex}><td className="num">{fa(r.rowIndex)}</td><td>{r.name}</td><td>{r.start ? jalaliText(r.start) : '—'}</td><td>{r.finish ? jalaliText(r.finish) : '—'}</td><td className="sub">{r.predecessors}</td><td>{mt ? <Chip tone="good">{ex.activities.find((a) => a.id === mt.activityId)?.title.slice(0, 40)} ({mt.by === 'code' ? 'با شماره' : 'با عنوان'})</Chip> : am ? <Chip tone="warn">مبهم ({fa(am.candidates.length)})</Chip> : <Chip tone="bad">بی‌تطبیق</Chip>}</td></tr> })}</tbody></table></div>
        </Section>)}
      {epc.imports.filter((i) => i.projectId === projectId).length > 0 && <Section title="سابقهٔ ورود" flush><div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><tbody>{epc.imports.filter((i) => i.projectId === projectId).map((i) => <tr key={i.id}><td>{i.fileName}</td><td>{new Date(i.importedAt).toLocaleString('fa-IR')}</td><td className="sub">{fa(Number(i.summary.matched ?? 0))} تطبیق از {fa(Number(i.summary.rows ?? 0))} ردیف</td></tr>)}</tbody></table></div></Section>}
    </div>
  )
}
