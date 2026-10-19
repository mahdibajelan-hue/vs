import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Download, FilePlus2, Plus, Ruler, Trash2 } from 'lucide-react'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { jalaliText } from '../../execution/lib/periods'
import { Chip, KpiCard, Section } from '../../finance/components/fn'
import { fa } from '../../execution/components/common'
import { CAUSES, CAUSE_FA, CLASS_FA, CLASS_TONE, PARTY_FA, measureImpact, milestoneRows, noticeState, suggestFromChanges, suggestFromDocs, suggestFromStoppages, windowsAnalysis, type Contract, type DelayEvent, type Party, type Suggestion, type VersionSnapshot } from '../lib/delay'
import { downloadWorkbook } from '../lib/exportXlsx'
import { calendarMap, computeSchedule, pickCalendar } from '../lib/schedule'
import { useDelayAnalysis } from '../store/useDelayAnalysis'
import { useSchedulingStore } from '../store/useSchedulingStore'
import type { LiveModel } from '../store/useScheduleModel'
import { Hint } from '../components/Hint'

const d = (x: string | null) => (x ? jalaliText(x) : '—')
const money = (v: number) => fa(Math.round(v))
const NOTICE_FA = { na: 'لازم نیست', ok: 'به‌موقع', late: 'دیرهنگام', due: 'در مهلت', lost: 'مهلت گذشته' } as const
const NOTICE_TONE = { na: 'neutral', ok: 'good', late: 'bad', due: 'warn', lost: 'bad' } as const
const EMPTY: Omit<DelayEvent, 'id'> = { title: '', cause: 'drawing_approval', party: 'employer', clause: '', eventStart: '', eventEnd: null, noticeDate: null, activityUids: [], claimedDays: 0, critical: null, status: 'draft', approvedDays: null, approvedCost: null, sourceType: 'manual', sourceRef: '', note: '' }

/** Delay analysis: contract terms, delay-event register with allowable / non-allowable classification, reconciliation with the contract finish, windows between updates, milestones with delay damages. */
export function SchDelay({ projectId, m }: { projectId: string; m: LiveModel }) {
  const st = useSchedulingStore()
  const { ds, sched, classified, recon } = useDelayAnalysis(projectId, m)
  const c = ds.contract
  const [form, setForm] = useState<(Omit<DelayEvent, 'id'> & { id?: string }) | null>(null)
  const acts = m.cur!.activities.filter((a) => a.type === 'task' || a.type === 'milestone')
  const byUid = useMemo(() => new Map(m.cur!.activities.map((a) => [a.uid, a])), [m.cur])
  // suggestions from the daily reports (stoppages) and from document review times
  const sug: Suggestion[] = useMemo(() => {
    const known = new Set(ds.events.map((e) => `${e.sourceType}:${e.sourceRef}`))
    const s1 = suggestFromStoppages(m.sources.stoppages ?? []).filter((x) => !known.has(`${x.sourceType}:${x.sourceRef}`))
    const linksOf = new Map<string, string[]>()
    for (const l of m.links) if (l.targetType === 'eng_doc') linksOf.set(l.targetId, [...(linksOf.get(l.targetId) ?? []), l.activityUid])
    const docs = [...m.sources.docs.values()].map((x) => ({ id: x.id, docNo: x.docNo, title: x.title, issuedDate: x.issuedDate ?? null, actualApproved: x.actualApproved, status: x.status, activityUids: linksOf.get(x.id) ?? [] }))
    const s2 = suggestFromDocs(docs, c.docReviewDays, m.today).filter((x) => !known.has(`${x.sourceType}:${x.sourceRef}`)).slice(0, 15)
    const chOf = new Map<string, string[]>()
    for (const l of m.links) if (l.targetType === 'change_request') chOf.set(l.targetId, [...(chOf.get(l.targetId) ?? []), l.activityUid])
    const s3 = suggestFromChanges([...(m.sources.changes?.values() ?? [])].map((x) => ({ id: x.id, crNumber: x.crNumber, title: x.title, status: x.status, approvedDays: x.approvedDays, approvedAt: x.approvedAt ?? null, activityUids: chOf.get(x.id) ?? [] }))).filter((x) => !known.has(`${x.sourceType}:${x.sourceRef}`))
    return [...s1, ...s2, ...s3]
  }, [ds.events, m.sources, m.links, c.docReviewDays, m.today])

  // windows analysis between the approved updates
  const approved = useMemo(() => [...st.versions].filter((v) => v.status === 'approved' && v.kind !== 'scenario').sort((a, b) => (a.dataDate ?? a.createdAt).localeCompare(b.dataDate ?? b.createdAt)), [st.versions])
  useEffect(() => { for (const v of approved) void st.loadBundle(v.id) }, [approved.map((v) => v.id).join()]) // eslint-disable-line react-hooks/exhaustive-deps
  const windows = useMemo(() => {
    const snaps: VersionSnapshot[] = []
    for (const v of approved) {
      const b = st.bundles.get(v.id); if (!b) continue
      const f = computeSchedule({ activities: b.activities, relations: b.relations, calendar: pickCalendar(b.calendars), calendars: calendarMap(b.calendars), mode: 'forecast', dataDate: v.dataDate ?? undefined, progressMode: m.progressMode })
      snaps.push({ label: v.label, dataDate: v.dataDate, finish: f.projectFinish, acts: new Map(b.activities.map((a) => [a.uid, { code: a.code, name: a.name, finish: f.byId.get(a.id)?.finish ?? null, critical: !!f.byId.get(a.id)?.critical }])) })
    }
    return windowsAnalysis(snaps)
  }, [approved, st.bundles, m.progressMode])

  const msRows = useMemo(() => milestoneRows(ds.milestones, (uid) => { const a = byUid.get(uid); return a ? m.forecast.byId.get(a.id)?.finish ?? null : null }), [ds.milestones, byUid, m.forecast])
  const can = st.canEdit, canApprove = st.canApprove

  const [cDraft, setCDraft] = useState<Contract>(c)
  useEffect(() => setCDraft(c), [c])
  const cDirty = JSON.stringify(cDraft) !== JSON.stringify(c)
  const [ms, setMs] = useState({ title: '', uid: '', date: '', ld: 0 })
  const [q, setQ] = useState('')
  const options = useMemo(() => { const n = q.trim().toLowerCase(); return acts.filter((a) => !n || `${a.code} ${a.name}`.toLowerCase().includes(n)).slice(0, 80) }, [acts, q])

  const startForm = (s?: Suggestion) => setForm(s ? { ...EMPTY, title: s.title, cause: s.cause, party: s.party, eventStart: s.eventStart, eventEnd: s.eventEnd, noticeDate: s.noticeDate, claimedDays: s.claimedDays, critical: s.critical, sourceType: s.sourceType, sourceRef: s.sourceRef, note: s.note, activityUids: s.activityUids ?? [] } : { ...EMPTY, eventStart: m.today })
  const formOk = form && form.title.trim() && form.eventStart && form.claimedDays >= 0
  const exportAll = () => void downloadWorkbook(`delay-analysis-${m.today}.xlsx`, {
    'تطبیق با قرارداد': [['شاخص', 'مقدار'], ['پایان قراردادی', recon.contractFinish], ['تمدید تأییدشده (روز)', recon.approvedExtension], ['پایان قراردادی اصلاح‌شده', recon.revisedFinish], ['پایان پیش‌بینی', recon.forecastFinish], ['تاخیر کل (روز)', recon.totalSlip], ['مجاز (روز)', recon.allowedTotal], ['غیرمجاز (روز)', recon.disallowedTotal], ['توضیح‌نشده (روز)', recon.unexplained], ['تاخیر پیمانکار پس از تمدید (روز)', recon.contractorDelay], ['جریمهٔ تخمینی (ریال)', Math.round(recon.ldAmount)]],
    'رویدادها': [['عنوان', 'علت', 'طرف', 'بند', 'شروع', 'پایان', 'اخطار', 'روز ادعا', 'اثر اندازه‌گیری‌شده', 'طبقه‌بندی', 'روز مجاز', 'روز غیرمجاز', 'وضعیت', 'روز تأییدشده', 'دلیل'], ...classified.map((x) => [x.event.title, CAUSE_FA[x.event.cause] ?? x.event.cause, PARTY_FA[x.event.party], x.event.clause, x.event.eventStart, x.event.eventEnd, x.event.noticeDate, x.event.claimedDays, x.impactDays, CLASS_FA[x.cls], x.allowedDays, x.disallowedDays, x.event.status, x.event.approvedDays, x.reason])],
    'نقاط عطف': [['عنوان', 'تاریخ قراردادی', 'پیش‌بینی', 'تاخیر (روز)', 'جریمه (ریال)'], ...msRows.map((x) => [x.title, x.contractDate, x.forecast, x.lateDays, x.ldAmount])],
  })

  if (ds.loading && ds.projectId !== projectId) return <div className="im-skeleton" style={{ height: 240 }} />
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="پایان قراردادی" value={d(recon.contractFinish)} sub={recon.contractFinish ? `اصلاح‌شده: ${d(recon.revisedFinish)}` : 'در «شرایط قرارداد» وارد کنید'} />
        <KpiCard i={1} label="پایان پیش‌بینی" value={d(recon.forecastFinish)} sub={recon.totalSlip == null ? undefined : recon.totalSlip > 0 ? `${fa(recon.totalSlip)} روز دیرتر از قرارداد` : 'در چارچوب قرارداد'} tone={recon.totalSlip == null ? 'neutral' : recon.totalSlip > 0 ? 'warn' : 'good'} />
        <KpiCard i={2} label={<span>تاخیر مجاز / غیرمجاز <Hint id="delay-class" /></span>} value={`${fa(recon.allowedTotal, 0)} / ${fa(recon.disallowedTotal, 0)}`} sub="روز؛ بر پایهٔ اثر اندازه‌گیری‌شده" />
        <KpiCard i={3} label={<span>جریمهٔ تخمینی <Hint id="delay-ld" /></span>} value={`${money(recon.ldAmount)}`} tone={recon.ldAmount > 0 ? 'bad' : 'good'} sub={recon.contractorDelay ? `${fa(recon.contractorDelay)} روز تاخیر پیمانکار پس از تمدید${recon.ldCapped ? ' (به سقف رسیده)' : ''}` : 'ریال'} />
      </div>
      {recon.overlapWarning && <div className="im-card" style={{ padding: '8px 12px', fontSize: 12.5 }}>⚠ مجموع روزهای رویدادها از تاخیر کل بیشتر است؛ رویدادها هم‌پوشانی دارند و نباید با هم جمع شوند. «تحلیل بازه‌ای» یا هم‌زمانی را بررسی کنید.</div>}
      {recon.unexplained != null && recon.unexplained > 0 && <div className="im-card" style={{ padding: '8px 12px', fontSize: 12.5 }}>ℹ {fa(recon.unexplained)} روز از تاخیر کل هنوز با هیچ رویدادی توضیح داده نشده است.</div>}

      <Section title="شرایط قرارداد" hint="مبنای تشخیص مجاز و غیرمجاز؛ همه قابل تنظیم‌اند">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="ex-lab">شروع قرارداد<JalaliDateInput value={cDraft.contractStart ?? ''} onChange={(v) => setCDraft({ ...cDraft, contractStart: v || null })} /></label>
          <label className="ex-lab">پایان قراردادی<JalaliDateInput value={cDraft.contractFinish ?? ''} onChange={(v) => setCDraft({ ...cDraft, contractFinish: v || null })} /></label>
          <label className="ex-lab">مبلغ قرارداد (ریال)<input type="number" min={0} disabled={!can} value={cDraft.contractValue} onChange={(e) => setCDraft({ ...cDraft, contractValue: Math.max(0, Number(e.target.value)) })} style={{ width: 160 }} /></label>
          <label className="ex-lab">جریمه برای هر روز (ریال)<input type="number" min={0} disabled={!can} value={cDraft.ldPerDay} onChange={(e) => setCDraft({ ...cDraft, ldPerDay: Math.max(0, Number(e.target.value)) })} style={{ width: 150 }} /></label>
          <label className="ex-lab">سقف جریمه (٪ مبلغ)<input type="number" min={0} max={100} disabled={!can} value={cDraft.ldCapPct} onChange={(e) => setCDraft({ ...cDraft, ldCapPct: Math.min(100, Math.max(0, Number(e.target.value))) })} style={{ width: 90 }} /></label>
          <label className="ex-lab">مهلت اخطار (روز) <Hint id="delay-notice" /><input type="number" min={0} disabled={!can} value={cDraft.noticeDays} onChange={(e) => setCDraft({ ...cDraft, noticeDays: Math.max(0, Number(e.target.value)) })} style={{ width: 80 }} /></label>
          <label className="ex-lab">مهلت بررسی مدرک (روز)<input type="number" min={0} disabled={!can} value={cDraft.docReviewDays} onChange={(e) => setCDraft({ ...cDraft, docReviewDays: Math.max(0, Number(e.target.value)) })} style={{ width: 90 }} /></label>
          <label className="ex-lab">تحمل پیش از جریمه (روز)<input type="number" min={0} disabled={!can} value={cDraft.toleranceDays} onChange={(e) => setCDraft({ ...cDraft, toleranceDays: Math.max(0, Number(e.target.value)) })} style={{ width: 90 }} /></label>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" style={{ width: 'auto' }} disabled={!can} checked={cDraft.forceMajeureNotice} onChange={(e) => setCDraft({ ...cDraft, forceMajeureNotice: e.target.checked })} /> اخطار برای فورس‌ماژور هم لازم است</label>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" style={{ width: 'auto' }} disabled={!can} checked={!!cDraft.requireReview} onChange={(e) => setCDraft({ ...cDraft, requireReview: e.target.checked })} /> تأیید نهایی به‌روزرسانی فقط پس از تأیید مشاور <Hint id="sch-workflow" /></label>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" style={{ width: 'auto' }} disabled={!can} checked={cDraft.concurrentCompensable} onChange={(e) => setCDraft({ ...cDraft, concurrentCompensable: e.target.checked })} /> تأخیر هم‌زمان خسارت دارد</label>
          {can && <button className="im-btn im-btn-primary im-btn-sm" disabled={!cDirty} onClick={() => void ds.saveContract(cDraft)}>ذخیرهٔ شرایط</button>}
          <button className="im-btn im-btn-sm" style={{ marginInlineStart: 'auto' }} onClick={exportAll}><Download size={13} /> خروجی Excel</button>
        </div>
      </Section>

      <Section title={<span>رویدادهای تاخیر <Hint id="delay-class" /></span>} hint="هر رویداد روی شبکهٔ زنده اندازه‌گیری و بر پایهٔ طرف مسئول، مسیر بحرانی و اخطار طبقه‌بندی می‌شود" flush>
        {classified.length > 0 && (
          <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>رویداد</th><th>طرف / علت</th><th>دورهٔ رویداد</th><th className="num">ادعا</th><th className="num">اثر بر پایان</th><th>اخطار</th><th>طبقه‌بندی</th><th className="num">مجاز</th><th className="num">غیرمجاز</th><th>وضعیت</th><th /></tr></thead><tbody>
            {classified.map((x) => { const n = noticeState(x, m.today); const e = x.event; return (
              <tr key={e.id}>
                <td style={{ whiteSpace: 'normal', minWidth: 200 }}><b>{e.title}</b><div className="sub">{x.reason}</div>{e.activityUids.length > 0 && <div className="sub">فعالیت: {e.activityUids.map((u) => byUid.get(u)?.code ?? '?').join('، ')}</div>}</td>
                <td>{PARTY_FA[e.party]}<div className="sub">{CAUSE_FA[e.cause] ?? e.cause}</div></td>
                <td className="sub">{d(e.eventStart)}{e.eventEnd ? ` تا ${d(e.eventEnd)}` : ''}</td>
                <td className="num">{fa(e.claimedDays, 0)}</td>
                <td className="num">{x.impactDays == null ? '—' : fa(x.impactDays, 0)}</td>
                <td><Chip tone={NOTICE_TONE[n.state]}>{NOTICE_FA[n.state]}</Chip>{n.state === 'due' && n.daysLeft != null && <div className="sub">{fa(n.daysLeft)} روز مانده</div>}</td>
                <td><Chip tone={CLASS_TONE[x.cls]}>{CLASS_FA[x.cls]}</Chip>{x.compensable && <div className="sub">قابل جبران هزینه</div>}</td>
                <td className="num">{fa(x.allowedDays, 0)}</td><td className="num">{fa(x.disallowedDays, 0)}</td>
                <td>{e.status === 'draft' ? 'پیش‌نویس' : e.status === 'assessed' ? 'ارزیابی‌شده' : e.status === 'approved' ? <Chip tone="good">تأیید ({fa(e.approvedDays ?? 0, 0)} روز)</Chip> : <Chip tone="bad">رد</Chip>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{can && <><button className="im-btn im-btn-sm" onClick={() => setForm(e)}>ویرایش</button> <button className="im-btn im-btn-sm im-btn-danger" aria-label="حذف" onClick={() => { if (window.confirm('رویداد حذف شود؟')) void ds.removeEvent(e.id) }}><Trash2 size={12} /></button></>}</td>
              </tr>) })}
          </tbody></table></div>
        )}
        {classified.length === 0 && <p className="im-helper" style={{ padding: '8px 12px', margin: 0 }}>رویدادی ثبت نشده است. از پیشنهادهای زیر یا با «رویداد جدید» شروع کنید.</p>}
        {can && !form && <div style={{ padding: 10 }}><button className="im-btn im-btn-primary im-btn-sm" onClick={() => startForm()}><Plus size={13} /> رویداد جدید</button></div>}
      </Section>

      {form && (
        <Section title={form.id ? 'ویرایش رویداد تاخیر' : 'رویداد تاخیر جدید'}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label className="ex-lab" style={{ flex: '1 1 240px' }}>عنوان<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} dir="auto" /></label>
              <label className="ex-lab">علت<select value={form.cause} onChange={(e) => { const k = CAUSES.find((x) => x.key === e.target.value); setForm({ ...form, cause: e.target.value, party: k?.party ?? form.party }) }}>{CAUSES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
              <label className="ex-lab">طرف مسئول<select value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value as Party })}>{(Object.keys(PARTY_FA) as Party[]).map((p) => <option key={p} value={p}>{PARTY_FA[p]}</option>)}</select></label>
              <label className="ex-lab">بند قرارداد<input value={form.clause} onChange={(e) => setForm({ ...form, clause: e.target.value })} dir="auto" style={{ width: 110 }} /></label>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label className="ex-lab">شروع رویداد<JalaliDateInput value={form.eventStart} onChange={(v) => setForm({ ...form, eventStart: v })} /></label>
              <label className="ex-lab">پایان رویداد<JalaliDateInput value={form.eventEnd ?? ''} onChange={(v) => setForm({ ...form, eventEnd: v || null })} /></label>
              <label className="ex-lab">تاریخ اخطار کتبی<JalaliDateInput value={form.noticeDate ?? ''} onChange={(v) => setForm({ ...form, noticeDate: v || null })} /></label>
              <label className="ex-lab">روز ادعا<input type="number" min={0} value={form.claimedDays} onChange={(e) => setForm({ ...form, claimedDays: Math.max(0, Number(e.target.value)) })} style={{ width: 80 }} /></label>
              <label className="ex-lab">بحرانی بودن<select value={form.critical == null ? 'auto' : form.critical ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, critical: e.target.value === 'auto' ? null : e.target.value === 'yes' })}><option value="auto">از شبکه اندازه‌گیری شود</option><option value="yes">بحرانی (دستی)</option><option value="no">غیربحرانی (دستی)</option></select></label>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label className="ex-lab">جست‌وجوی فعالیت<input value={q} onChange={(e) => setQ(e.target.value)} dir="auto" style={{ width: 140 }} /></label>
              <label className="ex-lab" style={{ minWidth: 260 }}>فعالیت‌های اثرپذیر ({fa(form.activityUids.length)})<select value="" onChange={(e) => { const u = e.target.value; if (u && !form.activityUids.includes(u)) setForm({ ...form, activityUids: [...form.activityUids, u] }) }}><option value="">— افزودن فعالیت —</option>{options.map((a) => <option key={a.uid} value={a.uid}>{a.code} — {a.name.slice(0, 50)}</option>)}</select></label>
              {form.activityUids.map((u) => <Chip key={u} tone="neutral"><button type="button" onClick={() => setForm({ ...form, activityUids: form.activityUids.filter((x) => x !== u) })} aria-label="حذف از فهرست" style={{ all: 'unset', cursor: 'pointer' }}>{byUid.get(u)?.code ?? '?'} ×</button></Chip>)}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label className="ex-lab">وضعیت<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as DelayEvent['status'] })}><option value="draft">پیش‌نویس</option><option value="assessed">ارزیابی‌شده</option>{(canApprove || form.status === 'approved') && <option value="approved">تأییدشده (تمدید)</option>}{(canApprove || form.status === 'rejected') && <option value="rejected">ردشده</option>}</select></label>
              {form.status === 'approved' && <label className="ex-lab">روز تمدید تأییدشده <Hint id="delay-eot" /><input type="number" min={0} disabled={!canApprove} value={form.approvedDays ?? ''} onChange={(e) => setForm({ ...form, approvedDays: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} style={{ width: 100 }} /></label>}
              {form.status === 'approved' && <label className="ex-lab">هزینهٔ تأییدشده (ریال)<input type="number" min={0} disabled={!canApprove} value={form.approvedCost ?? ''} onChange={(e) => setForm({ ...form, approvedCost: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} style={{ width: 150 }} /></label>}
              <label className="ex-lab" style={{ flex: '1 1 220px' }}>یادداشت<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} dir="auto" /></label>
            </div>
            {form.activityUids.length > 0 && (() => { const r = measureImpact(sched, form); return <p className="im-helper" style={{ margin: 0 }}><Ruler size={12} style={{ verticalAlign: -2 }} /> اندازه‌گیری: {r ? `بدون این تاخیر پایان ${d(r.finishWithout)} بود، اکنون ${d(r.finishWith)} — اثر ${fa(r.impactDays, 0)} روز تقویمی.` : 'روز ادعا یا دورهٔ رویداد را وارد کنید.'}</p> })()}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="im-btn im-btn-primary im-btn-sm" disabled={!formOk} onClick={() => void ds.saveEvent(form).then((ok) => ok && setForm(null))}>ذخیره</button>
              <button className="im-btn im-btn-sm" onClick={() => setForm(null)}>انصراف</button>
            </div>
          </div>
        </Section>
      )}

      {can && sug.length > 0 && (
        <Section title="پیشنهاد از سایر بخش‌های فرین" hint="از توقف‌های گزارش روزانه (با مسئولیت تعیین‌شده) و مدارکی که بیش از مهلت بررسی مانده‌اند؛ خودکار ثبت نمی‌شود" flush>
          <table className="ex-lines"><thead><tr><th>پیشنهاد</th><th>طرف</th><th className="num">روز</th><th>منبع</th><th /></tr></thead><tbody>
            {sug.map((s) => <tr key={s.key}><td style={{ whiteSpace: 'normal' }}><b>{s.title}</b><div className="sub">{s.note}</div></td><td>{PARTY_FA[s.party]}</td><td className="num">{fa(s.claimedDays, 0)}</td><td>{s.sourceType === 'doc' ? 'مهندسی' : 'گزارش روزانه'}</td><td><button className="im-btn im-btn-sm" onClick={() => startForm(s)}><FilePlus2 size={12} /> ثبت رویداد</button></td></tr>)}
          </tbody></table>
        </Section>
      )}

      <Section title={<span>تحلیل بازه‌ای بین نسخه‌ها <Hint id="delay-window" /></span>} hint="در هر به‌روزرسانی، پایان چقدر جابه‌جا شد و کدام فعالیت‌های بحرانی آن را عقب بردند" flush>
        {windows.length === 0 ? <p className="im-helper" style={{ padding: '8px 12px', margin: 0 }}>حداقل دو نسخهٔ تأییدشده (غیرسناریو) لازم است.</p> : (
          <table className="ex-lines"><thead><tr><th>بازه</th><th className="num">جابه‌جایی پایان (روز)</th><th>فعالیت‌های بحرانی عقب‌رفته</th><th>رویدادهای ثبت‌شده در بازه</th></tr></thead><tbody>
            {windows.map((w) => { const inWin = classified.filter((x) => w.fromDate && w.toDate && x.event.eventStart <= w.toDate && (x.event.eventEnd ?? x.event.eventStart) >= w.fromDate); return (
              <tr key={w.from + w.to}><td style={{ whiteSpace: 'normal' }}>{w.from} ← {w.to}<div className="sub">{d(w.fromDate)} تا {d(w.toDate)}</div></td><td className="num">{w.finishShift == null ? '—' : <b className={w.finishShift > 0 ? 'ex-bad' : undefined}>{fa(w.finishShift, 0)}</b>}</td>
                <td style={{ whiteSpace: 'normal' }}>{w.drivers.length ? w.drivers.map((x) => <div key={x.code}><b className="fn-code">{x.code}</b> {x.name.slice(0, 40)} (+{fa(x.shift, 0)})</div>) : '—'}</td>
                <td style={{ whiteSpace: 'normal' }}>{inWin.length ? inWin.map((x) => <div key={x.event.id}><Chip tone={CLASS_TONE[x.cls]}>{CLASS_FA[x.cls]}</Chip> {x.event.title}</div>) : '—'}</td></tr>) })}
          </tbody></table>
        )}
      </Section>

      <Section title="نقاط عطف قراردادی و جریمه" flush>
        {msRows.length > 0 && <table className="ex-lines"><thead><tr><th>نقطهٔ عطف</th><th>تاریخ قراردادی</th><th>پیش‌بینی</th><th className="num">تاخیر</th><th className="num">جریمه</th><th /></tr></thead><tbody>
          {msRows.map((x) => <tr key={x.id}><td>{x.title}</td><td>{d(x.contractDate)}</td><td>{d(x.forecast)}</td><td className="num">{x.lateDays == null ? '—' : <b className={x.lateDays > 0 ? 'ex-bad' : undefined}>{fa(x.lateDays, 0)}</b>}</td><td className="num">{x.ldAmount ? money(x.ldAmount) : '—'}</td><td>{can && <button className="im-btn im-btn-sm im-btn-danger" aria-label="حذف" onClick={() => void ds.removeMilestone(x.id)}><Trash2 size={12} /></button>}</td></tr>)}
        </tbody></table>}
        {can && (
          <div style={{ padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="ex-lab" style={{ flex: '1 1 200px' }}>عنوان<input value={ms.title} onChange={(e) => setMs({ ...ms, title: e.target.value })} dir="auto" /></label>
            <label className="ex-lab" style={{ minWidth: 220 }}>فعالیت متناظر<select value={ms.uid} onChange={(e) => setMs({ ...ms, uid: e.target.value })}><option value="">— انتخاب —</option>{acts.map((a) => <option key={a.uid} value={a.uid}>{a.code} — {a.name.slice(0, 40)}</option>)}</select></label>
            <label className="ex-lab">تاریخ قراردادی<JalaliDateInput value={ms.date} onChange={(v) => setMs({ ...ms, date: v })} /></label>
            <label className="ex-lab">جریمه هر روز (ریال)<input type="number" min={0} value={ms.ld} onChange={(e) => setMs({ ...ms, ld: Math.max(0, Number(e.target.value)) })} style={{ width: 130 }} /></label>
            <button className="im-btn im-btn-primary im-btn-sm" disabled={!ms.title.trim() || !ms.date} onClick={() => void ds.saveMilestone({ title: ms.title.trim(), activityUid: ms.uid || null, contractDate: ms.date, ldPerDay: ms.ld }).then(() => setMs({ title: '', uid: '', date: '', ld: 0 }))}><CalendarClock size={13} /> افزودن</button>
          </div>
        )}
      </Section>
    </div>
  )
}
