import { EpcGate } from '../../execution/components/epc/EpcBanner'
import { useScheduleModel } from '../store/useScheduleModel'
import type { SchTab } from '../SchedulingApp'
import { SchDash } from './SchDash'
import { SchImport } from './SchImport'
import { SchVersions } from './SchVersions'
import { SchGantt } from './SchGantt'
import { SchAnalysis } from './SchAnalysis'
import { SchLinks } from './SchLinks'
import { SchRiskLink } from './SchRiskLink'
import { SchHelp } from './SchHelp'

export function SchPage(p: { projectId: string; tab: SchTab; go: (t: SchTab) => void }) { return <EpcGate><Inner {...p} /></EpcGate> }
function Inner({ projectId, tab, go }: { projectId: string; tab: SchTab; go: (t: SchTab) => void }) {
  const m = useScheduleModel(projectId)
  if (tab === 'help') return <SchHelp />
  if (tab === 'import') return <SchImport projectId={projectId} m={m} go={go} />
  if (tab === 'versions') return <SchVersions projectId={projectId} m={m} go={go} />
  if (m.st.loading && m.st.versions.length === 0) return <div className="im-skeleton" style={{ height: 240 }} />
  if (m.empty) return <NoSchedule go={go} loading={m.st.loading} />
  if (tab === 'gantt') return <SchGantt projectId={projectId} m={m} go={go} />
  if (tab === 'analysis') return <SchAnalysis projectId={projectId} m={m} />
  if (tab === 'links') return <SchLinks projectId={projectId} m={m} />
  if (tab === 'risk') return <SchRiskLink projectId={projectId} m={m} />
  return <SchDash projectId={projectId} m={m} go={go} />
}

function NoSchedule({ go, loading }: { go: (t: SchTab) => void; loading: boolean }) {
  if (loading) return <div className="im-skeleton" style={{ height: 240 }} />
  return (
    <div className="im-card im-empty" style={{ padding: 34, display: 'grid', gap: 10, justifyItems: 'center', textAlign: 'center' }}>
      <b>برای این پروژه هنوز برنامهٔ زمان‌بندی ثبت نشده است.</b>
      <span className="im-helper" style={{ margin: 0 }}>برنامه را از Excel یا Primavera P6 وارد کنید؛ پس از بررسی، نسخه را تأیید و به‌عنوان خط مبنا تعیین کنید.</span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="im-btn im-btn-primary" onClick={() => go('import')}>ورود برنامه</button>
        <button className="im-btn" onClick={() => go('help')}>راهنمای ماژول</button>
      </div>
    </div>
  )
}
