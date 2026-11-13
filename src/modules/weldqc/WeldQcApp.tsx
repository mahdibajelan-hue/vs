import { lazy, Suspense, useEffect, useState } from 'react'
import { BookOpenCheck, CheckCircle2, Flame, LayoutDashboard, Loader2, ScanSearch, SlidersHorizontal, Wrench, XCircle } from 'lucide-react'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { NavScroller } from '../../components/common/NavScroller'
import { useRemembered } from '../../lib/navMemory'
import { useWqStore } from './store/useWqStore'
import { WqDashboard } from './pages/WqDashboard'
import { WqJoints } from './pages/WqJoints'
import { WqGuide } from './pages/WqGuide'
import '../pssr/pssr.css'
import './weldqc.css'

const JointFile = lazy(() => import('./pages/JointFile').then((m) => ({ default: m.JointFile })))
const WqWelders = lazy(() => import('./pages/WqWelders').then((m) => ({ default: m.WqWelders })))
const WqRepairs = lazy(() => import('./pages/WqRepairs').then((m) => ({ default: m.WqRepairs })))
const WqCriteria = lazy(() => import('./pages/WqCriteria').then((m) => ({ default: m.WqCriteria })))

export type WqTab = 'dash' | 'joints' | 'welders' | 'repairs' | 'criteria' | 'guide'
const TABS: { k: WqTab; label: string; icon: typeof Flame }[] = [
  { k: 'dash', label: 'داشبورد', icon: LayoutDashboard },
  { k: 'joints', label: 'سرجوش‌ها و تفسیر فیلم', icon: ScanSearch },
  { k: 'welders', label: 'جوشکاران', icon: Flame },
  { k: 'repairs', label: 'تحلیل تعمیرات', icon: Wrench },
  { k: 'criteria', label: 'معیارهای پذیرش', icon: SlidersHorizontal },
  { k: 'guide', label: 'راهنما', icon: BookOpenCheck },
]

/**
 * کنترل کیفیت جوش و تفسیر رادیوگرافی — the radiography file of each weld of the project: films and their quality,
 * interpretation (calibrated ruler, marks, candidate regions), defects tied to the weld and to the welders of their pass,
 * evaluation by the project's acceptance rules, the NDT inspector's sign-off, repairs (two at most, then cut-out) and the
 * welders' quality reports. Welds and welders come from the execution module's registers; nothing is entered twice.
 */
export function WeldQcApp({ onExitToHub }: { onExitToHub: () => void; onBackToRadar?: () => void }) {
  const projectId = useProjectContextStore((s) => s.projectId)
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId) ?? null)
  const st = useWqStore()
  const [tab, setTab] = useRemembered<WqTab>('tab', 'dash', (v) => typeof v === 'string' && TABS.some((t) => t.k === v))
  const [open, setOpen] = useRemembered<string | null>('weld', null, (v) => v === null || typeof v === 'string')
  const [filter, setFilter] = useState<string>('all')
  useEffect(() => { if (!useMasterDataStore.getState().loaded) void useMasterDataStore.getState().fetchAll() }, [])
  useEffect(() => { if (projectId) void st.load(projectId) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId])
  useEffect(() => { if (!st.flash) return; const t = setTimeout(() => st.clearFlash(), 3200); return () => clearTimeout(t) }, [st.flash, st])
  const go = (t: WqTab, f?: string) => { setTab(t); setOpen(null); if (f) setFilter(f) }
  const weld = open ? st.welds.find((w) => w.id === open) ?? null : null
  const missing = !!st.error && /wq_|does not exist|relation/.test(st.error)

  return (
    <div className="ps wq" dir="rtl">
      <header className="ps-top">
        <div className="ps-brand">
          <span className="ps-brand-ico wq-brand-ico" aria-hidden><ScanSearch size={19} /></span>
          <span><b>کنترل کیفیت جوش و رادیوگرافی</b><small>{project?.officialName ?? '—'}</small></span>
        </div>
        <div className="ps-top-end"><ModuleHeaderActions onExitToHub={onExitToHub} hideModuleHome onGuide={() => go('guide')} guideActive={tab === 'guide'} /></div>
      </header>
      <NavScroller label="بخش‌های کنترل کیفیت جوش"><nav className="ps-tabs wq-tabs" role="tablist" aria-label="بخش‌های کنترل کیفیت جوش">
        {TABS.map(({ k, label, icon: I }) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k && !weld} className={`ps-tab ${tab === k && !weld ? 'is-on' : ''}`} onClick={() => go(k)}><I size={15} aria-hidden />{label}</button>
        ))}
      </nav></NavScroller>
      <main className="ps-main wq-main">
        {!projectId ? <p className="ps-hint">ابتدا از رادار پروژه یک پروژه را انتخاب کنید.</p>
          : missing ? <p className="ps-hint is-warn">جدول‌های این ماژول هنوز در پایگاه داده ساخته نشده‌اند (supabase/weldqc/001_weldqc.sql).</p>
          : st.loading ? <div className="wq-skel" aria-busy="true"><span /><span /><span /><p className="ps-loading"><Loader2 size={16} className="animate-spin" /> بارگذاری سرجوش‌ها و پرونده‌های کیفی…</p></div>
          : (
            <Suspense fallback={<div className="wq-skel"><span /><span /></div>}>
              <div className="wq-page" key={weld ? `w:${weld.id}` : tab}>
                {weld ? <JointFile weld={weld} onBack={() => setOpen(null)} />
                  : tab === 'dash' ? <WqDashboard onOpen={setOpen} onGo={go} />
                  : tab === 'joints' ? <WqJoints onOpen={setOpen} filter={filter} setFilter={setFilter} />
                  : tab === 'welders' ? <WqWelders onOpen={setOpen} />
                  : tab === 'repairs' ? <WqRepairs onOpen={setOpen} />
                  : tab === 'criteria' ? <WqCriteria />
                  : <WqGuide onGo={go} />}
              </div>
            </Suspense>
          )}
        {st.error && !missing && <p className="ps-err">{st.error}</p>}
      </main>
      {st.flash && <div className={`wq-flash is-${st.flash.tone}`} role="status">{st.flash.tone === 'ok' ? <CheckCircle2 size={16} aria-hidden /> : <XCircle size={16} aria-hidden />}{st.flash.text}</div>}
    </div>
  )
}
