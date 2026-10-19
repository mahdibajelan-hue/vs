import { EpcGate } from '../../execution/components/epc/EpcBanner'
import { useState } from 'react'
import { Radio } from 'lucide-react'
import { useScheduleModel, type LiveModel } from '../store/useScheduleModel'
import { useDelayAnalysis } from '../store/useDelayAnalysis'
import { useSchedulingStore } from '../store/useSchedulingStore'
import { buildAlerts } from '../lib/alerts'
import { qualityChecks } from '../lib/quality'
import { Hint } from '../components/Hint'
import type { SchTab } from '../SchedulingApp'
import { SchDash } from './SchDash'
import { SchImport } from './SchImport'
import { SchVersions } from './SchVersions'
import { SchGantt } from './SchGantt'
import { SchAnalysis } from './SchAnalysis'
import { SchLinks } from './SchLinks'
import { SchRiskLink } from './SchRiskLink'
import { SchHelp } from './SchHelp'
import { SchEdit } from './SchEdit'
import { SchDelay } from './SchDelay'
import { SchHealth } from './SchHealth'
import { SchResources } from './SchResources'

export function SchPage(p: { projectId: string; tab: SchTab; go: (t: SchTab) => void }) { return <EpcGate><Inner {...p} /></EpcGate> }
const KEY = 'sch.view'
type View = { live: boolean; baselineId: string | null; progressMode: 'retained' | 'override' }
const readView = (): View => { try { const x = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return { live: !!x.live, baselineId: x.baselineId ?? null, progressMode: x.progressMode === 'override' ? 'override' : 'retained' } } catch { return { live: false, baselineId: null, progressMode: 'retained' } } }
function Inner({ projectId, tab, go }: { projectId: string; tab: SchTab; go: (t: SchTab) => void }) {
  const [view, setView] = useState(readView)
  const setV = (v: Partial<typeof view>) => { const n = { ...view, ...v }; setView(n); try { localStorage.setItem(KEY, JSON.stringify(n)) } catch { /* private mode */ } }
  const m = useScheduleModel(projectId, view)
  if (tab === 'help') return <SchHelp />
  if (tab === 'import') return <SchImport projectId={projectId} m={m} go={go} />
  if (tab === 'versions') return <SchVersions projectId={projectId} m={m} go={go} />
  if (tab === 'edit') return <SchEdit projectId={projectId} m={m} />
  if (m.st.loading && m.st.versions.length === 0) return <div className="im-skeleton" style={{ height: 240 }} />
  if (m.empty) return <NoSchedule go={go} loading={m.st.loading} />
  const body = tab === 'gantt' ? <SchGantt projectId={projectId} m={m} go={go} />
    : tab === 'analysis' ? <SchAnalysis projectId={projectId} m={m} />
    : tab === 'links' ? <SchLinks projectId={projectId} m={m} />
    : tab === 'delay' ? <SchDelay projectId={projectId} m={m} />
    : tab === 'health' ? <SchHealth projectId={projectId} m={m} />
    : tab === 'resources' ? <SchResources projectId={projectId} m={m} />
    : tab === 'risk' ? <SchRiskLink projectId={projectId} m={m} />
    : <><Alerts projectId={projectId} m={m} go={go} /><SchDash projectId={projectId} m={m} go={go} /></>
  return <div style={{ display: 'grid', gap: 12 }}><ViewBar m={m} view={view} setV={setV} />{body}</div>
}

/** live status (actuals from approved site work) and the version the deviations are measured against */
function ViewBar({ m, view, setV }: { m: LiveModel; view: View; setV: (v: Partial<View>) => void }) {
  const st = useSchedulingStore()
  const bases = st.versions.filter((v) => v.status !== 'draft')
  return (
    <div className="im-card" style={{ padding: '8px 12px', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 12.5 }}>
      <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={view.live} onChange={(e) => setV({ live: e.target.checked })} /><Radio size={14} aria-hidden /> وضعیت زنده از اجرا <Hint id="live-status" /></label>
      {view.live && m.liveInfo && <span className="sub">تاریخ وضعیت {m.liveInfo.dataDate ?? '—'} · {m.liveInfo.changed.length} فعالیت از کار تأییدشده به‌روز شد{m.liveInfo.unlinkedStarted ? ` · ${m.liveInfo.unlinkedStarted} فعالیت شروع‌شده بدون اتصال` : ''}</span>}
      <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>منطق فعالیت‌های در جریان <Hint id="progress-mode" />
        <select value={view.progressMode} onChange={(e) => setV({ progressMode: e.target.value as View['progressMode'] })} style={{ width: 'auto' }}><option value="retained">Retained Logic (حفظ منطق)</option><option value="override">Progress Override (نادیده‌گرفتن پیش‌نیازهای ناتمام)</option></select></label>
      <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginInlineStart: 'auto' }}>مبنای مقایسه
        <select value={view.baselineId ?? ''} onChange={(e) => setV({ baselineId: e.target.value || null })} style={{ width: 'auto' }}><option value="">خط مبنای پروژه</option>{bases.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
    </div>
  )
}

function Alerts({ projectId, m, go }: { projectId: string; m: LiveModel; go: (t: SchTab) => void }) {
  const st = useSchedulingStore()
  const [busy, setBusy] = useState('')
  const { classified, recon } = useDelayAnalysis(projectId, m)
  const q = qualityChecks(m.cur!.activities, m.cur!.relations, m.forecast, m.dataDate)
  const list = buildAlerts({ today: m.today, recon, classified, criticalOverdue: m.overdue.filter((o) => o.critical).length, negativeFloat: [...m.forecast.byId.values()].filter((x) => (x.totalFloat ?? 0) < 0).length, unlinkedStarted: m.liveInfo?.unlinkedStarted ?? 0, live: !!m.liveInfo, qualityBad: q.filter((c) => c.status === 'bad').length })
  if (!list.length) return null
  return (
    <div className="im-card" style={{ padding: '8px 12px', display: 'grid', gap: 4 }}>
      <b style={{ fontSize: 12.5 }}>نیاز به توجه</b>
      {list.slice(0, 8).map((a) => { const issue = st.raised.get(a.key); return (
        <div key={a.key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
          <button type="button" onClick={() => go(a.tab)} style={{ all: 'unset', cursor: 'pointer', flex: 1, color: a.level === 'bad' ? '#dc2626' : a.level === 'warn' ? '#b45309' : undefined }}>{a.level === 'bad' ? '● ' : a.level === 'warn' ? '◐ ' : '○ '}{a.text}</button>
          {a.level !== 'info' && (issue ? <span className="sub" title="در ماژول مسائل ثبت شده است">مسئله ثبت شد ✓</span> : st.canEdit && <button className="im-btn im-btn-sm" disabled={busy === a.key} title="ثبت این هشدار به‌عنوان مسئله در ماژول مسائل (برای پیگیری و مسئول‌دار شدن)" onClick={() => { setBusy(a.key); void st.raiseIssue(a.key, `برنامه زمان‌بندی: ${a.text.slice(0, 110)}`, a.text, a.level === 'bad' ? 'high' : 'medium', a.days ?? 0).finally(() => setBusy('')) }}>تبدیل به مسئله</button>)}
        </div>) })}
    </div>
  )
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
