import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, Cable, ClipboardList, ExternalLink, Radar, RefreshCw } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { supabase } from '../../../lib/supabaseClient'
import { useDeepLinkStore } from '../../../store/useDeepLinkStore'
import { useModuleStore } from '../../../store/useModuleStore'
import { useProjectContextStore } from '../../../store/useProjectContextStore'
import { HelpButton } from '../../issues/components/Help'
import { IM_CATEGORY_FA } from '../../issues/lib/imModel'
import { Kpi } from '../../issues/components/ui'
import { useRiskData, useRiskRole } from '../lib/useRiskData'
import { useRiskStore } from '../store/useRiskStore'
import { RK_HELP } from '../lib/help'
import { RM_SOURCE_LABEL_FA } from '../types'
import { useCategoryLabel } from '../components/rk'
import type { PageProps } from '../RiskApp'

interface IssueRow { id: string; code: string; title: string; stage: string | null; status: string; category: string | null; project_id: string; source: string | null; source_ref_id: string | null }
const IM_TO_RM: Record<string, string> = { engineering: 'engineering', procurement: 'procurement', contractor: 'contractor', contract_commercial: 'legal', land_right_of_way: 'land', permits: 'permits', hse: 'hse', quality: 'quality', finance: 'cost', interface: 'stakeholders', document_approval: 'engineering', other: 'other' }

/** Where risks come from and where they go: Issue Management (both ways), mission/visit reports, external systems. */
export function IntegrationPage({ onOpenRisk }: PageProps) {
  const d = useRiskData()
  const role = useRiskRole(d.scope === 'all' ? null : d.scope)
  const catLabel = useCategoryLabel()
  const { scanMissions, acceptSuggestion, rejectSuggestion } = useRiskStore.getState()
  const [issues, setIssues] = useState<IssueRow[] | null>(null)
  const [map, setMap] = useState<{ master: string; module: string; project: string }[]>([])
  const [scanProject, setScanProject] = useState<string>(d.scope !== 'all' ? d.scope : '')
  const [scanMsg, setScanMsg] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let live = true
    Promise.all([
      supabase.from('im_issues').select('id, code, title, stage, status, category, project_id, source, source_ref_id').limit(2000),
      supabase.from('rasta_project_mappings').select('master_project_id, source_module, source_project_id').in('source_module', ['issues', 'risk']).eq('status', 'confirmed'),
    ]).then(([i, m]) => { if (!live) return; setIssues((i.data ?? []) as IssueRow[]); setMap(((m.data ?? []) as { master_project_id: string; source_module: string; source_project_id: string }[]).map((x) => ({ master: x.master_project_id, module: x.source_module, project: x.source_project_id }))) })
    return () => { live = false }
  }, [d.links.length])

  const rmByIssueProject = useMemo(() => { const m = new Map<string, string>(); for (const x of map.filter((y) => y.module === 'issues')) { const rm = map.find((y) => y.module === 'risk' && y.master === x.master); if (rm) m.set(x.project, rm.project) } return m }, [map])
  const realized = d.risks.filter((r) => r.status === 'realized' || !!r.realizedAt)
  const issueByRisk = useMemo(() => { const m = new Map<string, IssueRow>(); for (const i of issues ?? []) if (i.source === 'risk' && i.source_ref_id) m.set(i.source_ref_id, i); return m }, [issues])
  const scopeIds = new Set(d.projects.map((p) => p.id))

  // recurring issues (≥3 active in one project+category) with no active risk of the matching category → candidate new risk
  const patterns = useMemo(() => {
    const g = new Map<string, IssueRow[]>()
    for (const i of issues ?? []) {
      if (['closed', 'cancelled', 'duplicate'].includes(i.stage ?? '') || i.source === 'risk') continue
      const rm = rmByIssueProject.get(i.project_id)
      if (!rm || !scopeIds.has(rm)) continue
      const cat = IM_TO_RM[i.category ?? 'other'] ?? 'other'
      g.set(`${rm}|${cat}`, [...(g.get(`${rm}|${cat}`) ?? []), i])
    }
    return [...g.entries()].map(([k, list]) => ({ project: k.split('|')[0], category: k.split('|')[1], list })).filter((x) => x.list.length >= 3 && !d.active.some((r) => r.projectId === x.project && r.category === x.category)).sort((a, b) => b.list.length - a.list.length)
  }, [issues, rmByIssueProject, d.active]) // eslint-disable-line react-hooks/exhaustive-deps

  const createFromPattern = async (p: { project: string; category: string; list: IssueRow[] }) => {
    const master = map.find((m) => m.module === 'risk' && m.project === p.project)?.master
    if (!master) { setErr('پروژهٔ مرجع نگاشت نشده است'); return }
    setBusy(p.project + p.category); setErr('')
    const { data, error } = await supabase.rpc('rm_ingest_risk', {
      p_source: 'issue', p_external_system: 'issues-pattern', p_external_id: `${p.project}:${p.category}`, p_master_project: master,
      p_payload: { title: `تکرار مسائل در دستهٔ «${catLabel(p.category)}»`, description: `${p.list.length} مسئلهٔ باز در این دسته ثبت شده: ${p.list.slice(0, 5).map((i) => i.code).join('، ')}`, category: p.category, probability: 4, impact: 3, cause: 'علت مشترک مسائل تکراری هنوز تحلیل نشده', riskEvent: 'ادامهٔ الگوی مسائل و اثر بر برنامه', snapshot: { issue_codes: p.list.map((i) => i.code) } },
    })
    setBusy(null)
    if (error) { setErr(error.message); return }
    await useRiskStore.getState().fetchAll()
    const id = (data as { id: string }).id
    if (id) onOpenRisk(id)
  }

  const goIssue = (id: string) => { useDeepLinkStore.getState().request({ module: 'issues', recordId: id }); useModuleStore.getState().enterModule('issues') }
  const goMission = (id: string, projectId: string) => {
    const master = d.allProjects.find((p) => p.id === projectId)?.masterRefId
    if (master) useProjectContextStore.getState().setProject(master)
    useDeepLinkStore.getState().request({ module: 'missions', recordId: id }); useModuleStore.getState().enterModule('missions')
  }
  const scan = async () => {
    if (!scanProject) { setScanMsg('یک پروژه انتخاب کنید'); return }
    setBusy('scan'); setScanMsg('')
    const r = await scanMissions(scanProject)
    setBusy(null)
    setScanMsg(r.ok ? `${r.queued ?? 0} پیشنهاد جدید از گزارش‌های بازدید${r.auto ? ` (${r.auto} مورد خودکار ثبت شد)` : ''}` : r.error ?? '')
  }

  const pending = d.suggestions.filter((s) => s.status === 'pending')
  const external = d.risks.filter((r) => r.externalSystem)
  const extKris = d.kris.filter((k) => k.dataSource === 'external')

  return (
    <div className="im-page">
      <div className="im-topbar"><div><div className="im-page-title">یکپارچگی با مدیریت مسائل، مأموریت و سامانه‌های دیگر</div><div className="im-page-sub">منبع هر ریسک و مقصد ریسک‌های تحقق‌یافته روشن و قابل‌ردیابی است</div></div><div className="im-actions"><HelpButton content={RK_HELP.integration} /></div></div>

      <div className="im-kpi-grid">
        <Kpi label="ریسک تحقق‌یافته" value={realized.length} icon={ArrowLeftRight} color="#a855f7" index={0} />
        <Kpi label="پیشنهاد از گزارش بازدید" value={pending.length} tone={pending.length ? 'warn' : 'good'} icon={ClipboardList} index={1} />
        <Kpi label="مسائل تکراری بدون ریسک" value={patterns.length} tone={patterns.length ? 'warn' : 'good'} icon={Radar} index={2} />
        <Kpi label="ریسک دارای شناسهٔ خارجی" value={external.length} icon={Cable} color="#0ea5e9" index={3} />
      </div>
      {err && <div className="im-notice bad" role="alert" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="im-card" style={{ marginBottom: 14 }}>
        <div className="im-section-title"><ArrowLeftRight size={16} style={{ color: 'var(--im-sky)' }} /> ریسک ← مسئله (تحقق ریسک)</div>
        <div className="im-helper" style={{ marginBottom: 8 }}>تحقق ریسک یک Issue می‌سازد؛ ریسک بالقوه و مسئلهٔ تحقق‌یافته دو رکورد جدا با سوابق مستقل هستند. تبدیل مجدد، رکورد تکراری نمی‌سازد و با ثبت مسئلهٔ مرتبط، ارزیابی ریسک برای بازنگری علامت می‌خورد.</div>
        {realized.length === 0 ? <div className="im-helper">ریسکی تحقق نیافته است. تبدیل از تب «ارتباطات» هر ریسک انجام می‌شود.</div> : (
          <div className="im-table-wrap"><table className="im-table"><thead><tr><th>ریسک</th><th>تاریخ تحقق</th><th>مسئلهٔ ایجادشده</th><th>مرحلهٔ مسئله</th></tr></thead><tbody>
            {realized.map((r) => { const i = issueByRisk.get(r.id); return (
              <tr key={r.id} className="rk-row-click" onClick={() => onOpenRisk(r.id, 'links')}><td><span className="im-code">{r.code}</span> {r.title.slice(0, 60)}</td><td className="im-helper">{r.realizedAt ? formatJalali(r.realizedAt.slice(0, 10)) : '—'}</td>
                <td>{i ? <button className="im-ghostlink" onClick={(e) => { e.stopPropagation(); goIssue(i.id) }}><ExternalLink size={11} /> {i.code}</button> : <span className="im-helper">—</span>}</td><td className="im-helper">{i ? i.stage ?? i.status : '—'}</td></tr>) })}
          </tbody></table></div>
        )}
      </div>

      <div className="im-card" style={{ marginBottom: 14 }}>
        <div className="im-section-title"><Radar size={16} style={{ color: 'var(--im-coral)' }} /> مسئله ← ریسک: الگوی مسائل تکراری <span className="im-helper">دست‌کم ۳ مسئلهٔ باز در یک دسته که ریسک فعالی برای آن دسته نیست</span></div>
        {patterns.length === 0 ? <div className="im-notice ok">الگوی تکراری بدون ریسکی دیده نشد.</div> : patterns.slice(0, 8).map((p) => (
          <div key={p.project + p.category} className="im-task" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div><b>{p.list.length} مسئلهٔ باز در دستهٔ «{IM_CATEGORY_FA[Object.entries(IM_TO_RM).find(([, v]) => v === p.category)?.[0] ?? 'other'] ?? catLabel(p.category)}»</b> — {d.allProjects.find((x) => x.id === p.project)?.name}<div className="im-helper">{p.list.slice(0, 4).map((i) => i.code + ' ' + i.title.slice(0, 30)).join(' · ')}</div></div>
            {role.canEdit && <button className="im-btn im-btn-ghost im-btn-sm" disabled={busy === p.project + p.category} onClick={() => createFromPattern(p)}>{busy === p.project + p.category ? '…' : 'ایجاد ریسک از این الگو'}</button>}
          </div>
        ))}
      </div>

      <div className="im-card" style={{ marginBottom: 14 }}>
        <div className="im-section-title"><ClipboardList size={16} style={{ color: 'var(--im-violet)' }} /> گزارش بازدید و مأموریت ← ریسک <span className="im-helper">یافته‌های دارای ماهیت ریسک (ریسک، یا مشاهدهٔ زیاد/بحرانی) به‌صورت پیشنهاد می‌آیند</span></div>
        {role.canManage && (
          <div className="im-actions" style={{ marginBottom: 10 }}>
            {d.scope === 'all' && <select value={scanProject} onChange={(e) => setScanProject(e.target.value)} aria-label="پروژه" style={{ width: 'auto' }}><option value="">— پروژه —</option>{d.allProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
            <button className="im-btn im-btn-primary im-btn-sm" disabled={busy === 'scan'} onClick={scan}><RefreshCw size={13} /> {busy === 'scan' ? 'در حال بررسی…' : 'دریافت پیشنهاد از گزارش‌ها'}</button>
            {scanMsg && <span className="im-helper">{scanMsg}</span>}
          </div>
        )}
        {pending.length === 0 ? <div className="im-helper">پیشنهاد در انتظاری نیست. دریافت مجدد هرگز رکورد تکراری نمی‌سازد (هر یافته یک‌بار پیشنهاد/تبدیل می‌شود).</div> : pending.map((s) => {
          const snap = (s.payload.snapshot ?? {}) as { mission_code?: string; mission_id?: string; destination?: string; visit_date?: string }
          return (
            <div key={s.id} className="im-task" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 240 }}><b>{s.title}</b><div className="im-helper">{s.description.slice(0, 200)}</div>
                  <div className="rk-flags"><span className="rk-flag" style={{ ['--c' as string]: '#8b5cf6' }}>{RM_SOURCE_LABEL_FA.mission_debrief}{snap.mission_code ? ` · ${snap.mission_code}` : ''}</span><span className="rk-flag">{catLabel(String(s.payload.category ?? 'other'))}</span><span className="rk-flag" style={{ ['--c' as string]: '#94a3b8' }}>اطمینان {Math.round(s.confidence * 100)}٪</span>{snap.visit_date && <span className="rk-flag" style={{ ['--c' as string]: '#94a3b8' }}>{formatJalali(String(snap.visit_date).slice(0, 10))}</span>}</div></div>
                <div className="im-actions" style={{ alignSelf: 'flex-start' }}>
                  {snap.mission_id && <button className="im-ghostlink" onClick={() => goMission(snap.mission_id!, s.projectId)}><ExternalLink size={11} /> گزارش منبع</button>}
                  {role.canEdit && <button className="im-btn im-btn-primary im-btn-sm" disabled={busy === s.id} onClick={async () => { setBusy(s.id); const r = await acceptSuggestion(s.id); setBusy(null); if (!r.ok) setErr(r.error ?? ''); else if (r.id) onOpenRisk(r.id) }}>ایجاد ریسک</button>}
                  {role.canEdit && <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => rejectSuggestion(s.id)}>رد</button>}
                </div>
              </div>
            </div>
          )
        })}
        {d.suggestions.filter((s) => s.status !== 'pending').length > 0 && <div className="im-helper">{d.suggestions.filter((s) => s.status === 'accepted').length} پیشنهاد تبدیل به ریسک شده · {d.suggestions.filter((s) => s.status === 'rejected').length} رد شده</div>}
      </div>

      <div className="im-card">
        <div className="im-section-title"><Cable size={16} style={{ color: 'var(--im-teal)' }} /> سامانه‌های دیگر (برنامه‌ریزی، تأمین، قرارداد، گزارش پیشرفت…)</div>
        <div className="im-notice info" style={{ marginBottom: 10 }}>اتصال خودکار هر سامانه نیازمند راه‌اندازی خود آن سامانه (کلید، نشانی، نگاشت شناسه‌ها) است و بدون آن انجام نمی‌شود. هستهٔ ریسک برای آن آماده است:
          <pre dir="ltr" style={{ margin: '8px 0 0', fontSize: 11.5, whiteSpace: 'pre-wrap', textAlign: 'left' }}>{`supabase.rpc('rm_ingest_risk', {
  p_source: 'api', p_external_system: 'planning',
  p_external_id: 'ACT-1042', p_master_project: '<master project id>',
  p_payload: { title, description, category, probability, impact, cause, risk_event, consequence }
})   // idempotent on (external_system, external_id); needs edit access to the project`}</pre>
          مقدارهای شاخص‌های هشدار هم با درج در <code dir="ltr">rm_kri_readings</code> (با <code dir="ltr">external_ref</code> یکتا) از هر سامانه قابل‌دریافت‌اند؛ وضعیت و عبور از آستانه را پایگاه‌داده خودش حساب می‌کند.</div>
        {external.length === 0 && extKris.length === 0 ? <div className="im-helper">هنوز ریسک یا شاخصی از سامانهٔ خارجی دریافت نشده است.</div> : (
          <div className="im-table-wrap"><table className="im-table"><thead><tr><th>مورد</th><th>سامانهٔ مبدأ</th><th>شناسهٔ خارجی</th><th>همگام‌سازی</th></tr></thead><tbody>
            {external.slice(0, 30).map((r) => <tr key={r.id} className="rk-row-click" onClick={() => onOpenRisk(r.id, 'links')}><td><span className="im-code">{r.code}</span> {r.title.slice(0, 50)}</td><td className="im-helper">{r.externalSystem}</td><td dir="ltr" className="im-helper">{r.externalId}</td><td className="im-helper">{r.syncStatus}{r.syncedAt ? ` · ${formatJalali(r.syncedAt.slice(0, 10))}` : ''}</td></tr>)}
            {extKris.map((k) => <tr key={k.id}><td>شاخص: {k.name}</td><td className="im-helper">{k.externalSystem ?? '—'}</td><td dir="ltr" className="im-helper">{k.externalKey ?? '—'}</td><td className="im-helper">{k.lastReadingAt ? formatJalali(k.lastReadingAt.slice(0, 10)) : 'بدون قرائت'}</td></tr>)}
          </tbody></table></div>
        )}
      </div>
    </div>
  )
}
