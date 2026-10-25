import { useEffect, useMemo, useState } from 'react'
import { Loader2, Orbit } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../store/useAuthStore'
import { useModuleStore } from '../../../store/useModuleStore'
import { ensureEpcStores, epcProgressOf } from '../../epc/epcProgressLoader'
import { weightsFromReport } from '../../epc/epcProgress'
import { createStageGateEngine } from '../../stagegate/legacy/engine'
import { loadSgProjects, type SgProjectRef } from '../../stagegate/sgProjects'
import '../../stagegate/stagegate.css'

/**
 * «مستر پلن چرخه عمر پروژه» — the Stage-Gate module's own Master Schedule (Gantt), the same engine and the same data
 * (sg_lifecycle_schedule_*), shown here for the Stage-Gate project linked to the selected master project.
 */
export function LifecycleMasterPlan({ projectId }: { projectId: string }) {
  const profile = useAuthStore((s) => s.profile)
  const [sg, setSg] = useState<SgProjectRef[] | null>(null)
  useEffect(() => { void loadSgProjects().then(setSg) }, [])
  const linked = sg?.find((p) => p.masterProjectId === projectId) ?? null

  const engine = useMemo(() => {
    if (!profile || !sg) return null
    return createStageGateEngine({
      _supabase: supabase,
      currentUser: { email: profile.email },
      currentProfile: { role: profile.isAdmin ? 'admin' : 'manager' },
      myProjectAccess: sg.map((p) => ({ project_name: p.name })),
      // the EPC phase reads the engineering / material / execution modules (once their stores are loaded)
      getEpcLive: (name: string, report: Record<string, unknown> | null) => { const m = (sg ?? []).find((p) => p.name === name)?.masterProjectId; return m ? epcProgressOf(m, weightsFromReport(report)) : null },
      planOnly: true,
    })
  }, [profile, sg])

  useEffect(() => { if (engine && linked) void ensureEpcStores().then(() => engine.openLifecyclePreview(linked.name)) }, [engine, linked])

  if (!sg) return <div className="im-card" style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader2 className="animate-spin" size={20} aria-label="در حال بارگذاری" /></div>
  if (!linked) {
    return (
      <div className="im-card im-empty" style={{ display: 'grid', gap: 10, justifyItems: 'center', padding: 32 }}>
        <Orbit size={26} aria-hidden style={{ color: 'var(--im-muted)' }} />
        <b>این پروژه هنوز به یک پروژهٔ Stage-Gate وصل نشده است.</b>
        <span className="im-helper">مستر پلن چرخه عمر از ماژول «چرخه عمر پروژه (Stage-Gate)» خوانده می‌شود؛ اتصال پروژه از همان ماژول (بیرون از رادار) انجام می‌شود.</span>
        <button type="button" className="im-btn im-btn-sm" onClick={() => useModuleStore.getState().enterModule('stagegate')}>رفتن به Stage-Gate</button>
      </div>
    )
  }
  return (
    <div className="sg-root" dir="rtl" style={{ borderRadius: 18, padding: 2, background: 'transparent' }}>
      <p className="im-helper" style={{ margin: '0 4px 8px' }}>پروژهٔ Stage-Gate: <b>{linked.name}</b> — همان برنامهٔ زمان‌بندی اصلی ماژول Stage-Gate؛ تغییر در هر کدام در دیگری هم دیده می‌شود.</p>
      <div id="lcBody"><div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader2 className="animate-spin" size={20} /></div></div>
    </div>
  )
}
