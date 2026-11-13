import { lazy, Suspense, useEffect, useState, type CSSProperties } from 'react'
import { BookOpenCheck, CheckCircle2, ClipboardList, FileWarning, Flame, Gauge, LayoutDashboard, Loader2, PaintRoller, ScanSearch, ShieldCheck, XCircle, type LucideIcon } from 'lucide-react'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { useModuleStore } from '../../store/useModuleStore'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { NavScroller } from '../../components/common/NavScroller'
import { useRemembered } from '../../lib/navMemory'
import { useWqStore } from './store/useWqStore'
import { useTestingStore } from '../testing/store/useTestingStore'
import { useExecutionStore } from '../execution/store/useExecutionStore'
import { WqDashboard } from './pages/WqDashboard'
import { WqJoints } from './pages/WqJoints'
import { WqGuide } from './pages/WqGuide'
import { QcHome } from './pages/QcHome'
import { clearFocusWelder } from './lib/handoff'
import '../pssr/pssr.css'
import '../testing/testing.css'
import '../issues/issues.css'
import '../finance/finance-dashboard.css'
import '../material/material-control.css'
import '../execution/execution.css'
import './weldqc.css'

const JointFile = lazy(() => import('./pages/JointFile').then((m) => ({ default: m.JointFile })))
const WqWelders = lazy(() => import('./pages/WqWelders').then((m) => ({ default: m.WqWelders })))
const WqRepairs = lazy(() => import('./pages/WqRepairs').then((m) => ({ default: m.WqRepairs })))
const WqCriteria = lazy(() => import('./pages/WqCriteria').then((m) => ({ default: m.WqCriteria })))
const WqLog = lazy(() => import('./pages/WqLog').then((m) => ({ default: m.WqLog })))
const WqCoating = lazy(() => import('./pages/WqCoating').then((m) => ({ default: m.WqCoating })))
const QcPretest = lazy(() => import('./pages/QcPretest').then((m) => ({ default: m.QcPretest })))
const JointQc = lazy(() => import('../testing/components/CoatingQc').then((m) => ({ default: m.JointQc })))
const ElectricalTest = lazy(() => import('../testing/components/CoatingQc').then((m) => ({ default: m.ElectricalTest })))
const CoatCriteria = lazy(() => import('../testing/components/CoatingQc').then((m) => ({ default: () => <><m.CoatingCriteria /><m.HolidayCalc /></> })))
const CoatingRecords = lazy(() => import('../testing/TestingApp').then((m) => ({ default: m.CoatingRecords })))
const NcrPage = lazy(() => import('../execution/pages/QcPage').then((m) => ({ default: m.QcPage })))
const FormsPage = lazy(() => import('../execution/pages/DailyPage').then((m) => ({ default: m.DailyPage })))

export type QcTab = 'home' | 'dash' | 'joints' | 'log' | 'welders' | 'repairs' | 'criteria' | 'coating' | 'jointqc' | 'linecoat' | 'electrical' | 'coatcrit' | 'pretest' | 'ncr' | 'forms' | 'guide'
/** kept for the weld pages, which navigate inside their own area */
export type WqTab = QcTab
type Area = { k: string; label: string; icon: LucideIcon; color: string; tabs: [QcTab, string][] }
const AREAS: Area[] = [
  { k: 'home', label: 'میز کیفیت', icon: LayoutDashboard, color: '#22c55e', tabs: [['home', 'میز کیفیت']] },
  { k: 'weld', label: 'جوش و رادیوگرافی', icon: Flame, color: '#f43f5e', tabs: [['dash', 'داشبورد جوش'], ['joints', 'شناسنامهٔ سرجوش‌ها'], ['log', 'دفتر جوش'], ['welders', 'عملکرد جوشکاران'], ['repairs', 'تحلیل تعمیرات'], ['criteria', 'معیارهای پذیرش API 1104']] },
  { k: 'jcoat', label: 'پوشش سرجوش', icon: PaintRoller, color: '#a855f7', tabs: [['coating', 'پوشش‌کاران و بایگانی'], ['jointqc', 'بازرسی و تست پوشش سرجوش']] },
  { k: 'lcoat', label: 'تست پوشش خط', icon: ShieldCheck, color: '#0ea5e9', tabs: [['linecoat', 'آزمون‌ها و عیوب (هالیدی، DCVG، …)'], ['electrical', 'آزمون الکتریکی (I/S)'], ['coatcrit', 'معیارهای پذیرش پوشش']] },
  { k: 'pretest', label: 'پیش‌تست قطعات', icon: Gauge, color: '#14b8a6', tabs: [['pretest', 'پیش‌تست قطعات عبوری']] },
  { k: 'ncr', label: 'NCR و عدم انطباق', icon: FileWarning, color: '#ef4444', tabs: [['ncr', 'NCR و مغایرت‌ها']] },
  { k: 'forms', label: 'فرم‌ها و گزارش‌های کیفی', icon: ClipboardList, color: '#eab308', tabs: [['forms', 'صدور فرم‌ها']] },
  { k: 'guide', label: 'راهنما', icon: BookOpenCheck, color: '#64748b', tabs: [['guide', 'راهنما']] },
]
const ALL_TABS = AREAS.flatMap((a) => a.tabs.map((t) => t[0]))
const areaOf = (t: QcTab) => AREAS.find((a) => a.tabs.some((x) => x[0] === t)) ?? AREAS[0]
const EX_TABS = new Set<QcTab>(['home', 'ncr', 'forms'])
const HT_TABS = new Set<QcTab>(['home', 'linecoat', 'electrical', 'coatcrit', 'jointqc', 'pretest'])

/**
 * کنترل کیفیت — every quality stream of the project in one module: welding and radiography (the file of each weld,
 * interpretation, API 1104 evaluation, repairs and the welders' performance), field-joint coating and its applicators,
 * the line's coating tests, the pre-test of crossing pipe, NCRs and the quality forms (daily welding, radiography request
 * and report, coating …), which are issued here. Welders and applicators are the competency module's register — their
 * qualification and ID card are issued there; here they are rated on the work they do.
 */
export function WeldQcApp({ onExitToHub }: { onExitToHub: () => void; onBackToRadar?: () => void }) {
  const projectId = useProjectContextStore((s) => s.projectId)
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId) ?? null)
  const st = useWqStore()
  const [tab, setTab] = useRemembered<QcTab>('qtab', () => { const e = useModuleStore.getState().takeEntryTab() as QcTab | null; return e && ALL_TABS.includes(e) ? e : 'home' }, (v) => typeof v === 'string' && ALL_TABS.includes(v as QcTab))
  const [open, setOpen] = useRemembered<string | null>('weld', null, (v) => v === null || typeof v === 'string')
  const [filter, setFilter] = useState<string>('all')
  const exLoaded = useExecutionStore((s) => s.loaded)
  useEffect(() => { if (!useMasterDataStore.getState().loaded) void useMasterDataStore.getState().fetchAll() }, [])
  useEffect(() => { if (projectId) void st.load(projectId) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId])
  // the coating / pre-test areas and the forms read the testing and execution stores; load them when first needed
  useEffect(() => { if (projectId && HT_TABS.has(tab) && useTestingStore.getState().projectId !== projectId) void useTestingStore.getState().load(projectId) }, [projectId, tab])
  useEffect(() => { if (EX_TABS.has(tab) && !useExecutionStore.getState().loaded) void useExecutionStore.getState().fetchAll() }, [tab])
  useEffect(() => { if (!st.flash) return; const t = setTimeout(() => st.clearFlash(), 3200); return () => clearTimeout(t) }, [st.flash, st])
  const htFlash = useTestingStore((s) => s.flash), htErr = useTestingStore((s) => s.error)
  useEffect(() => { if (!htFlash) return; const t = setTimeout(() => useTestingStore.setState({ flash: null }), 2600); return () => clearTimeout(t) }, [htFlash])
  const go = (t: QcTab, f?: string) => { clearFocusWelder(); setTab(t); setOpen(null); if (f) setFilter(f) }
  const weld = open ? st.welds.find((w) => w.id === open) ?? null : null
  const missing = !!st.error && /wq_|does not exist|relation/.test(st.error)
  const area = areaOf(tab)
  const isWeld = area.k === 'weld'

  const body = () => {
    if (!projectId) return null
    switch (tab) {
      case 'home': return <QcHome projectId={projectId} onGo={go} />
      case 'dash': return <WqDashboard onOpen={setOpen} onGo={go} />
      case 'joints': return <WqJoints onOpen={setOpen} filter={filter} setFilter={setFilter} />
      case 'log': return <WqLog onOpen={setOpen} />
      case 'welders': return <WqWelders onOpen={setOpen} />
      case 'repairs': return <WqRepairs onOpen={setOpen} />
      case 'criteria': return <WqCriteria />
      case 'coating': return <WqCoating onOpen={setOpen} />
      case 'jointqc': return <div className="ht ps-stack"><JointQc /></div>
      case 'linecoat': return <div className="ht"><CoatingRecords /></div>
      case 'electrical': return <div className="ht ps-stack"><ElectricalTest /></div>
      case 'coatcrit': return <div className="ht ps-stack"><CoatCriteria /></div>
      case 'pretest': return <QcPretest />
      case 'ncr': return <div className="im-root fn-root mt-root ex-root qc-embed">{exLoaded ? <NcrPage projectId={projectId} sub="" onGo={() => undefined} /> : <div className="wq-skel"><span /></div>}</div>
      case 'forms': return <div className="im-root fn-root mt-root ex-root qc-embed">{exLoaded ? <FormsPage projectId={projectId} sub="forms" scope="qc" /> : <div className="wq-skel"><span /></div>}</div>
      case 'guide': return <WqGuide onGo={go} />
    }
  }

  return (
    <div className="ps wq" dir="rtl">
      <header className="ps-top">
        <div className="ps-brand">
          <span className="ps-brand-ico wq-brand-ico" aria-hidden><ScanSearch size={19} /></span>
          <span><b>کنترل کیفیت</b><small>{project?.officialName ?? '—'}</small></span>
        </div>
        <div className="ps-top-end"><ModuleHeaderActions onExitToHub={onExitToHub} hideModuleHome onGuide={() => go('guide')} guideActive={tab === 'guide'} /></div>
      </header>
      <NavScroller label="بخش‌های کنترل کیفیت"><nav className="ps-tabs wq-tabs" role="tablist" aria-label="بخش‌های کنترل کیفیت">
        {AREAS.map((a) => (
          <button key={a.k} type="button" role="tab" aria-selected={area.k === a.k && !weld} className={`ps-tab ${area.k === a.k && !weld ? 'is-on' : ''}`} style={{ '--qc': a.color } as CSSProperties} onClick={() => go(a.tabs[0][0])}><a.icon size={15} aria-hidden />{a.label}</button>
        ))}
      </nav></NavScroller>
      {area.tabs.length > 1 && !weld && (
        <div className="qc-sub" role="tablist" aria-label={area.label}>
          {area.tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} style={{ '--qc': area.color } as CSSProperties} onClick={() => go(k)}>{l}</button>)}
        </div>
      )}
      <main className="ps-main wq-main">
        {!projectId ? <p className="ps-hint">ابتدا از رادار پروژه یک پروژه را انتخاب کنید.</p>
          : isWeld && missing ? <p className="ps-hint is-warn">جدول‌های جوش و رادیوگرافی هنوز در پایگاه داده ساخته نشده‌اند (supabase/weldqc/001_weldqc.sql).</p>
          : (isWeld || tab === 'home' || tab === 'coating') && st.loading ? <div className="wq-skel" aria-busy="true"><span /><span /><span /><p className="ps-loading"><Loader2 size={16} className="animate-spin" /> بارگذاری سرجوش‌ها و پرونده‌های کیفی…</p></div>
          : (
            <Suspense fallback={<div className="wq-skel"><span /><span /></div>}>
              <div className="wq-page" key={weld ? `w:${weld.id}` : tab}>
                {weld ? <JointFile weld={weld} onBack={() => setOpen(null)} /> : body()}
              </div>
            </Suspense>
          )}
        {st.error && !missing && isWeld && <p className="ps-err">{st.error}</p>}
        {htErr && HT_TABS.has(tab) && tab !== 'home' && <p className="ps-err">{htErr}</p>}
      </main>
      {htFlash && !st.flash && <div className="wq-flash is-ok" role="status"><CheckCircle2 size={16} aria-hidden />{htFlash}</div>}
      {st.flash && <div className={`wq-flash is-${st.flash.tone}`} role="status">{st.flash.tone === 'ok' ? <CheckCircle2 size={16} aria-hidden /> : <XCircle size={16} aria-hidden />}{st.flash.text}</div>}
    </div>
  )
}
