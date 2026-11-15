import { useEffect, useState } from 'react'
import { CheckCircle2, ClipboardList, Compass, FileText, FlaskConical, GitCompareArrows, LayoutDashboard, Layers, Loader2, Plus, Save, SlidersHorizontal, UserCheck, XCircle, type LucideIcon } from 'lucide-react'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { useModuleStore } from '../../store/useModuleStore'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { ModuleHeaderActions } from '../../components/common/ModuleHeaderActions'
import { NavScroller } from '../../components/common/NavScroller'
import { useRemembered } from '../../lib/navMemory'
import { STATUS_FA, fa, useLive } from './lib/useLive'
import { narrativeItems, type ReportMeta } from './lib/report'
import type { Answers } from './lib/questions'
import { DsDashboard } from './pages/DsDashboard'
import { DsWizard } from './pages/DsWizard'
import { DsWeights } from './pages/DsWeights'
import { DsOptions, DsScenarios } from './pages/DsAnalysis'
import { DsReport } from './pages/DsReport'
import { DsDecision } from './pages/DsDecision'
import { DsValidation } from './pages/DsValidation'
import '../pssr/pssr.css'
import './ds.css'

type Tab = 'dash' | 'wizard' | 'weights' | 'options' | 'scenarios' | 'report' | 'decision' | 'validation'
const TABS: [Tab, string, LucideIcon][] = [
  ['dash', 'داشبورد تصمیم', LayoutDashboard], ['wizard', 'اطلاعات پروژه', ClipboardList], ['weights', 'وزن معیارها', SlidersHorizontal], ['options', 'گزینه‌ها و راهبردها', Layers],
  ['scenarios', 'سناریو و حساسیت', GitCompareArrows], ['report', 'گزارش توجیهی', FileText], ['decision', 'تصمیم و نسخه‌ها', UserCheck], ['validation', 'نمونه‌های آزمایشی', FlaskConical],
]
const ALL = TABS.map((t) => t[0])

/**
 * راهبرد و روش اجرای پروژه — a decision aid for the delivery method (EPC, EPCM, DBB …), the contracting and procurement
 * strategy and the execution strategy. The engine (lib/engine.ts) is deterministic and explains every score; the optional
 * machine-written summary only rephrases its findings. Nothing is decided until an authorised person approves it, and that
 * person may choose differently from the engine, with a reason that is kept with the immutable version.
 */
export function DeliveryApp({ onExitToHub }: { onExitToHub: () => void; onBackToRadar?: () => void }) {
  const projectId = useProjectContextStore((s) => s.projectId)
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId) ?? null)
  const { st, study, versions, current, live, shown, locked, canEdit } = useLive()
  const [tab, setTab] = useRemembered<Tab>('dstab', () => { const e = useModuleStore.getState().takeEntryTab() as Tab | null; return e && ALL.includes(e) ? e : 'dash' }, (v) => typeof v === 'string' && ALL.includes(v as Tab))
  const [focus, setFocus] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  useEffect(() => { if (!useMasterDataStore.getState().loaded) void useMasterDataStore.getState().fetchAll() }, [])
  useEffect(() => { if (projectId && st.projectId !== projectId) void st.load(projectId) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId])
  useEffect(() => { if (!st.flash) return; const t = setTimeout(() => st.clearFlash(), 4200); return () => clearTimeout(t) }, [st.flash, st])
  const go = (t: string, opt?: string) => { setTab(t as Tab); setFocus(opt ?? null) }
  const missing = !!st.error && /ds_|does not exist|relation/.test(st.error)
  const decisions = st.decisions.filter((d) => d.studyId === study?.id)
  const lastDecision = [...decisions].reverse().find((d) => ['approve', 'approve_override', 'reject'].includes(d.decision))
  const reportSaved = locked || (!!current && !st.dirty)
  const reportResult = reportSaved && current ? current.result : shown
  const meta: ReportMeta = {
    projectName: project?.officialName ?? '—', studyTitle: study?.title ?? '', version: reportSaved && current ? current.version : (study?.currentVersion ?? 0) + 1,
    status: study ? STATUS_FA[study.status] : '', date: new Date().toLocaleDateString('fa-IR-u-ca-persian', { dateStyle: 'long' }), engine: reportResult?.engineVersion ?? '',
    createdName: (reportSaved && current ? current.createdName : study?.createdName) ?? '',
    decision: study?.status === 'approved' || study?.status === 'rejected' ? (lastDecision ? { text: `${lastDecision.decision === 'reject' ? 'رد' : 'تصویب'}${lastDecision.method ? ` — ${reportResult?.options.find((o) => o.key === lastDecision.method)?.fa ?? lastDecision.method}` : ''}${lastDecision.overridesEngine ? ' (متفاوت از پیشنهاد موتور)' : ''}${lastDecision.rationale ? `؛ ${lastDecision.rationale}` : ''}`, by: lastDecision.decidedName, at: new Date(lastDecision.decidedAt).toLocaleDateString('fa-IR-u-ca-persian') } : null) : null,
    contracts: st.pre?.contracts.map((c) => ({ title: c.title, type: c.type })) ?? [],
  }
  const answers: Answers = (reportSaved && current ? current.answers : st.draft?.answers) ?? {}

  const body = () => {
    if (!study || !st.draft) return null
    switch (tab) {
      case 'dash': return shown ? <DsDashboard r={shown} answers={answers} frozen={locked} onGo={go} /> : null
      case 'wizard': return <DsWizard answers={st.draft.answers} sources={st.draft.sources} setAnswer={st.setAnswer} locked={locked || !canEdit} live={live} />
      case 'weights': return <DsWeights answers={st.draft.answers} weights={st.draft.weights} set={st.setWeights} locked={locked || !canEdit} live={live} />
      case 'options': return shown ? <DsOptions key={focus ?? ''} r={shown} focus={focus} /> : null
      case 'scenarios': return shown ? <DsScenarios r={shown} /> : null
      case 'report': return reportResult ? <DsReport r={reportResult} answers={answers} meta={meta} version={current} saved={reportSaved && !!current} busy={st.busy} canNarrate={st.caps.admin || st.caps.edit || st.caps.create || st.caps.export} canExport={st.caps.admin || st.caps.export || st.caps.view} onNarrate={() => { if (current) void st.narrate(current, narrativeItems(current.result)) }} /> : null
      case 'decision': return <DsDecision study={study} live={live} current={current} versions={versions} decisions={decisions} caps={st.caps} busy={st.busy} dirty={st.dirty} locked={locked} onSaveVersion={(r, w, n) => void st.saveVersion(r, w, n)} onDecide={(d, m, p, pr, e, why) => void st.decide(d, m, p, pr, e, why)} />
      case 'validation': return null
    }
  }

  return (
    <div className="ps ds" dir="rtl">
      <header className="ps-top">
        <div className="ps-brand">
          <span className="ps-brand-ico ds-brand-ico" aria-hidden><Compass size={19} /></span>
          <span><b>راهبرد و روش اجرای پروژه</b><small>{project?.officialName ?? '—'}</small></span>
        </div>
        <div className="ps-top-end"><ModuleHeaderActions onExitToHub={onExitToHub} hideModuleHome /></div>
      </header>
      <NavScroller label="بخش‌های راهبرد اجرا"><nav className="ps-tabs ds-tabs" role="tablist" aria-label="بخش‌های راهبرد اجرا">
        {TABS.map(([k, l, I]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`ps-tab ${tab === k ? 'is-on' : ''}`} onClick={() => go(k)}><I size={15} aria-hidden />{l}</button>)}
      </nav></NavScroller>
      <main className="ps-main ds-main">
        {!projectId ? <p className="ps-hint">ابتدا از رادار پروژه یک پروژه را انتخاب کنید.</p>
          : missing ? <p className="ps-hint is-warn">جدول‌های این ماژول هنوز در پایگاه داده ساخته نشده‌اند (supabase/delivery/001_core.sql).</p>
          : st.loading ? <div className="ds-skel" aria-busy="true"><span /><span /><span /><p className="ps-loading"><Loader2 size={16} className="animate-spin" /> خواندن مطالعات، شناسنامهٔ پروژه و ریسک‌ها…</p></div>
          : !st.caps.view && !st.caps.admin ? <p className="ps-hint is-warn">دسترسی مشاهدهٔ این ماژول برای شما تعریف نشده است (مدیریت کاربران ← سطح دسترسی).</p>
          : (
            <>
              <div className="ds-studybar">
                {st.studies.length > 0 && (
                  <label className="ds-field is-inline"><span>مطالعه</span>
                    <select value={st.activeId ?? ''} onChange={(e) => st.open(e.target.value)}>{st.studies.map((s) => <option key={s.id} value={s.id}>{s.title} — {STATUS_FA[s.status]}{s.currentVersion ? ` · نسخهٔ ${fa(s.currentVersion)}` : ''}</option>)}</select>
                  </label>
                )}
                {study && <span className={`ds-pill is-${study.status}`}>{STATUS_FA[study.status]}</span>}
                {study && !locked && canEdit && <button type="button" className="ds-btn is-ghost" disabled={!st.dirty || st.busy} onClick={() => void st.saveDraft()}><Save size={14} aria-hidden />{st.dirty ? 'ذخیرهٔ پیش‌نویس' : 'ذخیره‌شده'}</button>}
                {(st.caps.admin || st.caps.create) && (
                  <form className="ds-new" onSubmit={(e) => { e.preventDefault(); if (title.trim().length >= 3) void st.create(title.trim()).then((id) => { if (id) { setTitle(''); go('wizard') } }) }}>
                    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان مطالعهٔ جدید" aria-label="عنوان مطالعهٔ جدید" />
                    <button type="submit" className="ds-btn" disabled={st.busy || title.trim().length < 3}><Plus size={14} aria-hidden />مطالعهٔ جدید</button>
                  </form>
                )}
              </div>
              {tab === 'validation' ? <DsValidation canCreate={st.caps.admin || st.caps.create} busy={st.busy} onUse={(t, a) => void st.create(t, a as Answers).then((id) => { if (id) go('dash') })} />
                : !study ? (
                  <section className="ds-empty">
                    <Compass size={30} aria-hidden />
                    <h2>هنوز مطالعه‌ای برای این پروژه ثبت نشده است</h2>
                    <p>با ساخت مطالعه، اطلاعات شناسنامهٔ پروژه، قراردادها و ریسک‌های باز ماژول مدیریت ریسک خوانده و پرسش‌ها پیش‌پر می‌شوند. سپس پرسش‌های باقی‌مانده را در نُه گروه تکمیل می‌کنید.</p>
                    {st.pre && Object.keys(st.pre.answers).length > 0 && <p className="ds-muted">از سامانه قابل خواندن: {fa(Object.keys(st.pre.answers).length)} پاسخ، {fa(st.pre.risks.length)} ریسک باز، {fa(st.pre.contracts.length)} قرارداد.</p>}
                    {!(st.caps.admin || st.caps.create) && <p className="ds-muted">ساخت مطالعه به دسترسی «تحلیلگر راهبرد اجرا» نیاز دارد.</p>}
                  </section>
                ) : <div className="ds-page" key={`${study.id}:${tab}`}>{body()}</div>}
            </>
          )}
        {st.error && !missing && <p className="ps-err">{st.error}</p>}
      </main>
      {st.flash && <div className={`ds-flash is-${st.flash.tone}`} role="status">{st.flash.tone === 'ok' ? <CheckCircle2 size={16} aria-hidden /> : <XCircle size={16} aria-hidden />}{st.flash.text}</div>}
    </div>
  )
}
