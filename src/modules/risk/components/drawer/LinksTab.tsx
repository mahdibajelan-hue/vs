import { useEffect, useState } from 'react'
import { ArrowLeftRight, ExternalLink, FileText, Link2, Network, Trash2 } from 'lucide-react'
import { formatJalali } from '../../../../lib/jalali'
import { supabase } from '../../../../lib/supabaseClient'
import { ProposeChangeButton } from '../../../changeManagement/components/ProposeChangeButton'
import { useDeepLinkStore } from '../../../../store/useDeepLinkStore'
import { useModuleStore } from '../../../../store/useModuleStore'
import { useProjectContextStore } from '../../../../store/useProjectContextStore'
import { useRiskStore } from '../../store/useRiskStore'
import { useRiskPeopleStore } from '../../store/useRiskPeopleStore'
import { RM_LINK_RELATION_LABEL_FA, type RmLinkRelation } from '../../types'
import { Field, PersonSelect } from '../rk'
import type { TabProps } from './common'

interface IssueRow { id: string; code: string; title: string; stage: string | null; status: string }

export function LinksTab({ risk, canEdit, canManage }: TabProps) {
  const links = useRiskStore((s) => s.links)
  const risks = useRiskStore((s) => s.risks)
  const projects = useRiskStore((s) => s.projects)
  const corporate = useRiskStore((s) => s.corporate)
  const { addLink, removeLink, convertToIssue, createCorporate, attachCorporate } = useRiskStore.getState()
  const people = useRiskPeopleStore((s) => s.byProject[risk.projectId]) ?? []
  const [issues, setIssues] = useState<IssueRow[] | null>(null)
  const [conv, setConv] = useState<{ cause: string; days: number; pursuer: string | null } | null>(null)
  const [err, setErr] = useState('')
  const [newLink, setNewLink] = useState<{ target: string; relation: RmLinkRelation }>({ target: '', relation: 'related' })
  const [corp, setCorp] = useState<{ title: string; description: string; plan: string } | null>(null)

  const out = links.filter((l) => l.riskId === risk.id)
  const incoming = links.filter((l) => l.targetType === 'risk' && l.targetId === risk.id)
  useEffect(() => {
    let live = true
    supabase.from('im_issues').select('id, code, title, stage, status').eq('source', 'risk').eq('source_ref_id', risk.id).then(({ data }) => live && setIssues((data ?? []) as IssueRow[]))
    return () => { live = false }
  }, [risk.id, out.length])

  const goIssue = (id: string) => { useDeepLinkStore.getState().request({ module: 'issues', recordId: id }); useModuleStore.getState().enterModule('issues') }
  const goMission = (id: string) => {
    const master = projects.find((p) => p.id === risk.projectId)?.masterRefId
    if (master) useProjectContextStore.getState().setProject(master)
    useDeepLinkStore.getState().request({ module: 'missions', recordId: id })
    useModuleStore.getState().enterModule('missions')
  }
  const convert = async () => {
    if (!conv) return
    const r = await convertToIssue(risk.id, conv.cause.trim(), conv.days, conv.pursuer)
    if (!r.ok) { setErr(r.error ?? ''); return }
    setErr(''); setConv(null)
  }
  const snap = risk.sourceSnapshot as { mission_id?: string; mission_code?: string; destination?: string; visit_date?: string }
  const corpObj = corporate.find((c) => c.id === risk.corporateRiskId)
  const pool = risks.filter((r) => r.id !== risk.id).sort((a, b) => Number(b.projectId === risk.projectId) - Number(a.projectId === risk.projectId))
  const nameOf = (id: string) => { const r = risks.find((x) => x.id === id); return r ? `${r.code} · ${r.title}` : id }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {out.some((l) => l.targetType === 'change') && (
        <section>
          <div className="im-section-title">تغییرات مرتبط (مدیریت تغییرات)</div>
          {out.filter((l) => l.targetType === 'change').map((l) => <div key={l.id} className="im-task" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}><div><span className="rk-flag">درخواست تغییر</span> {l.targetLabel}</div><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => { useDeepLinkStore.getState().request({ module: 'change', recordId: l.targetId }); useModuleStore.getState().enterModule('change') }}>مشاهده</button></div>)}
        </section>
      )}
      <section>
        <div className="im-section-title"><span><ArrowLeftRight size={15} style={{ color: 'var(--im-sky)' }} /> مسائل مرتبط (مدیریت مسائل)</span>{canEdit && <ProposeChangeButton type="risk" id={risk.id} />}</div>
        {issues === null ? <div className="im-skeleton" style={{ height: 50 }} /> : issues.length === 0 ? <div className="im-helper">مسئلهٔ تحقق‌یافته‌ای برای این ریسک ثبت نشده است.</div> : issues.map((i) => (
          <div key={i.id} className="im-task" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            <div><span className="im-code">{i.code}</span> <b>{i.title}</b><div className="im-helper">مرحله: {i.stage ?? i.status} — ریسک بالقوه و مسئلهٔ تحقق‌یافته دو رکورد جدا با سوابق مستقل‌اند.</div></div>
            <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => goIssue(i.id)}><ExternalLink size={12} /> مشاهده</button>
          </div>
        ))}
        {canEdit && risk.status !== 'closed' && issues !== null && issues.length === 0 && (conv ? (
          <div className="im-card-flat" style={{ marginTop: 8 }}>
            <div className="im-helper" style={{ marginBottom: 8 }}>یک مسئلهٔ پیگیری‌پذیر ساخته می‌شود؛ خود ریسک و سوابق ارزیابی‌اش دست‌نخورده می‌ماند و وضعیتش «تحقق‌یافته» می‌شود. تکرار این کار رکورد دوم نمی‌سازد.</div>
            <Field label="علت یا شرح وقوع"><textarea style={{ minHeight: 50 }} value={conv.cause} onChange={(e) => setConv({ ...conv, cause: e.target.value })} /></Field>
            <div className="rk-grid2"><Field label="مهلت رفع (روز)"><input type="number" min={1} value={conv.days} onChange={(e) => setConv({ ...conv, days: Math.max(1, Number(e.target.value) || 1) })} /></Field><Field label="مسئول پیگیری"><PersonSelect value={conv.pursuer} onChange={(v) => setConv({ ...conv, pursuer: v })} people={people.map((p) => ({ userId: p.userId, name: p.name }))} /></Field></div>
            {err && <div className="im-err">{err}</div>}
            <div className="im-actions"><button className="im-btn im-btn-primary im-btn-sm" onClick={convert}>ساخت مسئله</button><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setConv(null)}>انصراف</button></div>
          </div>
        ) : <button className="im-btn im-btn-ghost im-btn-sm" style={{ marginTop: 8 }} onClick={() => setConv({ cause: '', days: 7, pursuer: risk.ownerId })}>ریسک محقق شد ← ساخت مسئله</button>)}
      </section>

      <section>
        <div className="im-section-title"><FileText size={15} style={{ color: 'var(--im-violet)' }} /> منبع و همگام‌سازی</div>
        <div className="im-card-flat" style={{ fontSize: 12.5, display: 'grid', gap: 4 }}>
          <div>منبع ثبت: <b>{({ manual: 'ثبت دستی', mission_debrief: 'گزارش بازدید/مأموریت', issue: 'مدیریت مسائل', import: 'ورود از فایل', meeting: 'صورت‌جلسه', api: 'سامانهٔ خارجی', ai: 'پیشنهاد هوشمند', lifecycle: 'چرخهٔ عمر', kri: 'شاخص هشدار' } as Record<string, string>)[risk.source]}</b></div>
          {snap.mission_id && <div>مأموریت: <b>{snap.mission_code}</b>{snap.destination ? ` · ${snap.destination}` : ''}{snap.visit_date ? ` · ${formatJalali(String(snap.visit_date).slice(0, 10))}` : ''} <button className="im-ghostlink" onClick={() => goMission(snap.mission_id!)}><ExternalLink size={11} /> بازگشت به گزارش منبع</button></div>}
          {risk.externalSystem && <div>شناسهٔ خارجی: <code dir="ltr">{risk.externalSystem}:{risk.externalId}</code> · وضعیت همگام‌سازی: {risk.syncStatus}{risk.syncedAt ? ` (${formatJalali(risk.syncedAt.slice(0, 10))})` : ''}</div>}
          {!snap.mission_id && !risk.externalSystem && <div className="im-helper">ریسک مستقیماً در این سامانه ثبت شده است.</div>}
        </div>
      </section>

      <section>
        <div className="im-section-title"><Link2 size={15} style={{ color: 'var(--im-teal)' }} /> ارتباط با ریسک‌های دیگر</div>
        {out.filter((l) => l.targetType === 'risk').map((l) => <div key={l.id} className="im-task" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}><div><span className="rk-flag">{RM_LINK_RELATION_LABEL_FA[l.relation]}</span> {nameOf(l.targetId)}</div>{canEdit && <button className="im-ghostlink" style={{ color: 'var(--im-coral)' }} aria-label="حذف پیوند" onClick={() => removeLink(l.id)}><Trash2 size={12} /></button>}</div>)}
        {incoming.map((l) => <div key={l.id} className="im-task" style={{ marginBottom: 6 }}><span className="rk-flag" style={{ ['--c' as string]: '#64748b' }}>پیوند ورودی · {RM_LINK_RELATION_LABEL_FA[l.relation]}</span> {nameOf(l.riskId)}</div>)}
        {out.filter((l) => l.targetType === 'risk').length + incoming.length === 0 && <div className="im-helper">ریسک مستقل است (پیوندی ثبت نشده).</div>}
        {canEdit && (
          <div className="im-actions" style={{ marginTop: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 260px' }}><Field label="ریسک"><select value={newLink.target} onChange={(e) => setNewLink({ ...newLink, target: e.target.value })}><option value="">— انتخاب کنید —</option>{pool.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.title.slice(0, 50)}{r.projectId !== risk.projectId ? ' (پروژهٔ دیگر)' : ''}</option>)}</select></Field></div>
            <div style={{ flex: '0 1 190px' }}><Field label="نوع ارتباط"><select value={newLink.relation} onChange={(e) => setNewLink({ ...newLink, relation: e.target.value as RmLinkRelation })}>{(['related', 'shared_cause', 'depends_on', 'duplicate_of', 'aggregates', 'mitigated_by'] as const).map((r) => <option key={r} value={r}>{RM_LINK_RELATION_LABEL_FA[r]}</option>)}</select></Field></div>
            <button className="im-btn im-btn-ghost im-btn-sm" style={{ marginBottom: 12 }} disabled={!newLink.target} onClick={async () => { const t = risks.find((r) => r.id === newLink.target); const r = await addLink(risk.id, { targetType: 'risk', targetId: newLink.target, targetLabel: t ? t.code : '', relation: newLink.relation }); if (!r.ok) setErr(r.error ?? ''); else { setErr(''); setNewLink({ target: '', relation: 'related' }) } }}>افزودن پیوند</button>
          </div>
        )}
        {err && <div className="im-err">{err}</div>}
      </section>

      <section>
        <div className="im-section-title"><Network size={15} style={{ color: 'var(--im-indigo)' }} /> ریسک مادر (سازمانی)</div>
        {corpObj ? <div className="im-task"><b>{corpObj.code}</b> · {corpObj.title}<div className="im-helper">{corpObj.description}</div>{corpObj.correctivePlan && <div className="im-helper">برنامهٔ اصلاحی: {corpObj.correctivePlan}</div>}{canManage && <button className="im-ghostlink" onClick={() => attachCorporate(risk.id, null)}>جدا کردن (سوابق ریسک حفظ می‌شود)</button>}</div> : <div className="im-helper">این ریسک به ریسک سازمانی وصل نشده است.</div>}
        {canManage && !corpObj && (
          <div className="im-actions" style={{ marginTop: 8 }}>
            <select style={{ maxWidth: 320 }} value="" onChange={(e) => e.target.value && attachCorporate(risk.id, e.target.value)}><option value="">اتصال به ریسک مادر موجود…</option>{corporate.filter((c) => c.status !== 'closed').map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</select>
            <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setCorp({ title: risk.title, description: '', plan: '' })}>ساخت ریسک مادر جدید</button>
          </div>
        )}
        {corp && (
          <div className="im-card-flat" style={{ marginTop: 8 }}>
            <Field label="عنوان ریسک سازمانی *"><input value={corp.title} onChange={(e) => setCorp({ ...corp, title: e.target.value })} /></Field>
            <Field label="شرح"><input value={corp.description} onChange={(e) => setCorp({ ...corp, description: e.target.value })} /></Field>
            <Field label="برنامهٔ اصلاحی سازمانی"><input value={corp.plan} onChange={(e) => setCorp({ ...corp, plan: e.target.value })} /></Field>
            <div className="im-actions"><button className="im-btn im-btn-primary im-btn-sm" onClick={async () => { if (corp.title.trim().length < 4) { setErr('عنوان را بنویسید'); return } const r = await createCorporate({ title: corp.title.trim(), description: corp.description, category: risk.category, ownerId: null, correctivePlan: corp.plan }); if (!r.ok || !r.id) { setErr(r.error ?? ''); return } await attachCorporate(risk.id, r.id); setCorp(null) }}>ساخت و اتصال</button><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setCorp(null)}>انصراف</button></div>
          </div>
        )}
      </section>
    </div>
  )
}
