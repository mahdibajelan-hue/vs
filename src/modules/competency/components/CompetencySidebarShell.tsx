import { type ReactNode } from 'react'
import { Award, BadgeCheck, CheckCircle2, BookOpen, Gavel, HardHat, ListTodo, Radar, BrainCircuit, FileBarChart2, FileUp, LayoutDashboard, LineChart, ListChecks, ListTree, Lock, Settings, Sparkles, Sprout, User, Users } from 'lucide-react'
import { StorageErrorBanner } from '../../../components/Layout/StorageErrorBanner'
import { ErrorBoundary } from '../../../components/common/ErrorBoundary'
import { ModuleHeaderActions } from '../../../components/common/ModuleHeaderActions'
import { useThemeAttributeSync } from '../lib/useThemeAttributeSync'
import '../styles/farinTheme.css'
import '../../issues/issues.css'
import '../styles/competency-im.css'
import type { EvaluationStage } from '../lib/evaluationStages'
import type { CompetencyAssessment } from '../types'
import { useDoneSections } from '../lib/useDoneSections'
import { SectionHelp } from './SectionHelp'

export type CompetencySection =
  | 'dashboard'
  | 'profile'
  | 'panel'
  | 'documents'
  | 'personality'
  | 'mcq'
  | 'questions'
  | 'results'
  | 'aiAnalysis'
  | 'idp'
  | 'questionBank'
  | 'reports'
  | 'settings'
  | 'personnel'
  | 'personalityReports'
  | 'talent'
  | 'myTasks'
  | 'inservice'
  | 'discipline'

// Matches COMPETENCY_ACCENT in CompetencyApp.tsx (Tailwind purple-500) — duplicated as a literal to
// avoid a circular import back through CompetencyApp -> AssessmentWizardPage -> this file.
const COMPETENCY_ACCENT = '#a855f7'

const SECTION_META: Record<CompetencySection, { label: string; icon: typeof LayoutDashboard }> = {
  dashboard: { label: 'داشبورد', icon: LayoutDashboard },
  profile: { label: 'مشخصات', icon: User },
  panel: { label: 'پنل مصاحبه‌گران', icon: Users },
  documents: { label: 'بارگذاری مدارک', icon: FileUp },
  personality: { label: 'ارزیابی شخصیت و رفتاری', icon: BrainCircuit },
  mcq: { label: 'آزمون تستی آنلاین', icon: ListTree },
  questions: { label: 'ارزیابی فنی تخصصی', icon: ListChecks },
  results: { label: 'نتیجه', icon: Award },
  aiAnalysis: { label: 'تحلیل جامع هوش مصنوعی', icon: Sparkles },
  idp: { label: 'برنامه توسعه فردی', icon: Sprout },
  questionBank: { label: 'بانک سؤالات', icon: BookOpen },
  reports: { label: 'گزارش‌ها', icon: FileBarChart2 },
  settings: { label: 'تنظیمات', icon: Settings },
  personnel: { label: 'صلاحیت جوشکاران و عایق‌کاران', icon: BadgeCheck },
  personalityReports: { label: 'گزارش‌های شخصیت', icon: LineChart },
  talent: { label: 'بانک استعداد و تناسب شغلی', icon: Radar },
  myTasks: { label: 'کارهای من', icon: ListTodo },
  inservice: { label: 'ارزیابی حین کار', icon: HardHat },
  discipline: { label: 'تصمیمات انضباطی', icon: Gavel },
}

// Candidate-specific sections vs. module-wide sections — rendered as two visually separated groups
// so it's clear "مشخصات"/"پنل"/... belong to whichever candidate is currently open while
// "بانک سؤالات"/"گزارش‌ها"/"تنظیمات" are always about the module as a whole. "panel" is a single
// merged screen (panel assembly + the exam-design plan, lead/designer-only for the latter half) —
// personality/mcq sit between it and questions — see AssessmentWizardPage's LEAD_STAGES for the full
// ordering. "بانک سؤالات" now covers both the technical and the personality question banks as tabs on
// one page (see QuestionBankPage.tsx) — there is no separate personalityQuestionBank section anymore.
const CANDIDATE_SECTIONS: CompetencySection[] = ['profile', 'documents', 'panel', 'personality', 'mcq', 'questions', 'results', 'aiAnalysis', 'idp']
const MODULE_SECTIONS: CompetencySection[] = ['dashboard', 'myTasks', 'talent', 'inservice', 'discipline', 'personnel', 'questionBank', 'reports', 'settings']
/** accent per module tab, same idea as the other modules' coloured nav */
const TAB_COLOR: Partial<Record<CompetencySection, string>> = { dashboard: '#a855f7', myTasks: '#f43f5e', inservice: '#22c55e', discipline: '#ef4444', personnel: '#f59e0b', talent: '#14b8a6', questionBank: '#6366f1', reports: '#0ea5e9', personalityReports: '#ec4899', settings: '#64748b' }

interface CompetencySidebarShellProps {
  active: CompetencySection
  /** A section appears clickable only if it has a handler here; the active section never needs one.
   * Any section missing from this map (other than the active one) renders locked/disabled — never a
   * dead link that looks clickable but does nothing. */
  nav: Partial<Record<CompetencySection, () => void>>
  title: string
  /** A very compact dot-and-line strip shown right next to the title — the evaluation milestones
   * for whichever candidate is open. Omitted on module-wide pages. */
  stageStrip?: EvaluationStage[]
  /** the open candidate: lets the step links show a check mark once that step is complete */
  assessment?: CompetencyAssessment
  /** Leaves the module entirely, back to the FARIN module hub. */
  onExitToHub: () => void
  /** Extra controls at the end of the top bar (e.g. a "New" button, export/print actions). */
  headerRight?: ReactNode
  children: ReactNode
}

/**
 * The one navigation shell for the whole Competency module, built on the same project-management
 * design system as Issues, Risk, Finance and Material: a banner header (logo, title, shortcut bar),
 * one row of module tabs, and — while a candidate is open — a second row with that candidate's
 * assessment stages. Every page shares it so a user always sees the same destinations.
 */
export function CompetencySidebarShell({ active, nav, title, stageStrip, assessment, onExitToHub, headerRight, children }: CompetencySidebarShellProps) {
  // `color-scheme` must follow the real theme (a hard-coded 'dark' made light-theme colours unreadable).
  const theme = useThemeAttributeSync()
  const inCandidate = CANDIDATE_SECTIONS.includes(active)
  const done = useDoneSections(assessment, stageStrip)
  return (
    <div className="comp-shell comp-im im-root fixed inset-0 z-30" dir="rtl" style={{ colorScheme: theme }}>
      <header className="im-head no-print">
        <div className="im-head-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
            <span className="im-logo" aria-hidden style={{ background: `linear-gradient(135deg, ${COMPETENCY_ACCENT}, #7c3aed 70%, #5b21b6)`, boxShadow: '0 10px 22px -10px #7c3aed, inset 0 1px 0 rgba(255,255,255,.35)' }}><Award size={22} /></span>
            <div style={{ minWidth: 0, lineHeight: 1.3 }}>
              <h1 className="im-head-title">ارزیابی شایستگی</h1>
              <p className="im-head-eyebrow">Competency Assessment &amp; Talent Matching</p>
            </div>
          </div>
          <div className="im-actions" style={{ minWidth: 0 }}>
            {headerRight}
            <ModuleHeaderActions onExitToHub={onExitToHub} />
          </div>
        </div>
        <nav className="im-nav" role="tablist" aria-label="بخش‌های ارزیابی شایستگی">
          {MODULE_SECTIONS.map((section) => {
            const meta = SECTION_META[section]; const handler = nav[section]; const isActive = section === active
            return (
              <button key={section} role="tab" aria-selected={isActive} disabled={!isActive && !handler} onClick={handler} className="im-nav-tab" style={{ ['--c' as string]: TAB_COLOR[section] ?? COMPETENCY_ACCENT }} title={!isActive && !handler ? 'دسترسی ندارید' : undefined}>
                <meta.icon size={15} aria-hidden />{meta.label}{!isActive && !handler && <Lock size={11} aria-hidden style={{ opacity: 0.6 }} />}
              </button>
            )
          })}
        </nav>
      </header>

      <StorageErrorBanner />

      <main className="im-main fx-remap" id="im-main">
        <div className="im-page" style={{ display: 'grid', gap: 14 }}>
          {(inCandidate || stageStrip) && (
            <div className="comp-stagebar no-print">
              <div className="comp-stagebar-title"><Sparkles size={15} aria-hidden style={{ color: COMPETENCY_ACCENT }} /><b>{title}</b><SectionHelp section={active} /></div>
              <div className="comp-stagebar-nav" role="tablist" aria-label="مراحل ارزیابی این داوطلب">
                {CANDIDATE_SECTIONS.map((section) => {
                  const meta = SECTION_META[section]
                  const handler = nav[section]
                  const isActive = section === active
                  return (
                    <button key={section} role="tab" aria-selected={isActive} disabled={!isActive && !handler} onClick={handler} className={isActive ? 'on' : ''}>
                      <meta.icon size={13} aria-hidden />{meta.label}{done[section] && <CheckCircle2 size={12} aria-label="تکمیل شده" style={{ color: '#34d399', flex: 'none' }} />}{!isActive && !handler && <Lock size={10} aria-hidden style={{ opacity: 0.55 }} />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {!inCandidate && !stageStrip && <h2 className="comp-page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{title}<SectionHelp section={active} /></h2>}
          {/* A crash in one page's content stays inside this box (navigation still works); keyed so
              moving to another page/candidate resets it. */}
          <ErrorBoundary key={`${active}:${title}`} area={title}>
            {children}
          </ErrorBoundary>
        </div>
      </main>
    </div>
  )
}
