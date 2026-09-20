import type { ReactNode } from 'react'
import { Award, BookOpen, FileBarChart2, FileUp, Home, LayoutDashboard, ListChecks, Lock, Settings, Sparkles, User, Users } from 'lucide-react'
import { SignOutButton } from '../../../components/Auth/SignOutButton'
import { StorageErrorBanner } from '../../../components/Layout/StorageErrorBanner'
import type { EvaluationStage } from '../lib/evaluationStages'

export type CompetencySection = 'dashboard' | 'profile' | 'panel' | 'documents' | 'questions' | 'results' | 'questionBank' | 'reports' | 'settings'

// Matches COMPETENCY_ACCENT in CompetencyApp.tsx (Tailwind purple-500) — duplicated as a literal to
// avoid a circular import back through CompetencyApp -> AssessmentWizardPage -> this file.
const COMPETENCY_ACCENT = '#a855f7'

const SECTION_META: Record<CompetencySection, { label: string; icon: typeof LayoutDashboard }> = {
  dashboard: { label: 'داشبورد', icon: LayoutDashboard },
  profile: { label: 'مشخصات', icon: User },
  panel: { label: 'پنل مصاحبه‌گران', icon: Users },
  documents: { label: 'بارگذاری مدارک', icon: FileUp },
  questions: { label: 'ارزیابی', icon: ListChecks },
  results: { label: 'نتیجه', icon: Award },
  questionBank: { label: 'بانک سؤالات', icon: BookOpen },
  reports: { label: 'گزارش‌ها', icon: FileBarChart2 },
  settings: { label: 'تنظیمات', icon: Settings },
}

// Candidate-specific sections vs. module-wide sections — rendered as two visually separated groups
// so it's clear "مشخصات"/"پنل"/... belong to whichever candidate is currently open while
// "بانک سؤالات"/"گزارش‌ها"/"تنظیمات" are always about the module as a whole.
const CANDIDATE_SECTIONS: CompetencySection[] = ['dashboard', 'profile', 'panel', 'documents', 'questions', 'results']
const MODULE_SECTIONS: CompetencySection[] = ['questionBank', 'reports', 'settings']

interface CompetencySidebarShellProps {
  active: CompetencySection
  /** A section appears clickable only if it has a handler here; the active section never needs one.
   * Any section missing from this map (other than the active one) renders locked/disabled — never a
   * dead link that looks clickable but does nothing. */
  nav: Partial<Record<CompetencySection, () => void>>
  title: string
  /** A very compact dot-and-line strip shown right next to the title — the five evaluation
   * milestones for whichever candidate is open, at a glance, on every one of their pages. Omitted
   * on module-wide pages (Dashboard, Question Bank, Reports, Settings) where there's no single
   * candidate in context. */
  stageStrip?: EvaluationStage[]
  /** Leaves the module entirely, back to the RASTA module hub — rendered once, in the sidebar
   * footer, instead of every page threading its own exit button. */
  onExitToHub: () => void
  /** Extra controls at the end of the top bar (e.g. a "New" button, export/print actions). */
  headerRight?: ReactNode
  children: ReactNode
}

/**
 * The one navigation shell for the whole Competency module — a right-hand sidebar (first flex
 * child, so it lands on the right in this RTL app without direction hacks) plus a slim top bar,
 * used by every page (the cross-candidate Dashboard and every stage of a single candidate's
 * assessment) so a user always sees the same six destinations and never a page-specific tab strip.
 */
export function CompetencySidebarShell({ active, nav, title, stageStrip, onExitToHub, headerRight, children }: CompetencySidebarShellProps) {
  return (
    <div className="comp-shell fixed inset-0 z-30 flex" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
      <aside className="no-print flex w-14 shrink-0 flex-col gap-1 border-l border-white/10 bg-[#0b0f16] px-2 py-5 sm:w-56 sm:px-3">
        <div className="mb-5 flex items-center gap-2 px-1 sm:px-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: `${COMPETENCY_ACCENT}22`, color: COMPETENCY_ACCENT }}>
            <Award size={16} />
          </div>
          <p className="hidden text-xs font-extrabold sm:block">ارزیابی شایستگی</p>
        </div>
        <nav className="flex-1 space-y-1">
          {CANDIDATE_SECTIONS.map((section) => (
            <SidebarButton key={section} section={section} active={active} handler={nav[section]} />
          ))}
          <div className="my-2 border-t border-white/10" />
          {MODULE_SECTIONS.map((section) => (
            <SidebarButton key={section} section={section} active={active} handler={nav[section]} />
          ))}
        </nav>
        <div className="space-y-1 border-t border-white/10 pt-2">
          <button
            onClick={onExitToHub}
            title="بازگشت به ماژول‌ها"
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium text-secondary transition-colors hover:bg-white/5 hover:text-primary sm:px-3"
          >
            <Home size={15} className="shrink-0" />
            <span className="hidden flex-1 text-right sm:block">بازگشت به ماژول‌ها</span>
          </button>
          <SignOutButton
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/10 sm:px-3"
            title="خروج از حساب"
          >
            <span className="hidden flex-1 text-right sm:block">خروج از حساب</span>
          </SignOutButton>
        </div>
        <p className="hidden px-2 text-[10px] text-muted sm:block">v1.0.0</p>
      </aside>

      <div className="flex-1 overflow-y-auto">
        <header className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#0b0f16]/90 px-5 py-3.5 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2.5">
            <Sparkles size={16} className="shrink-0 text-purple-300" />
            <h1 className="truncate text-sm font-extrabold">{title}</h1>
            {stageStrip && <StageStrip stages={stageStrip} />}
          </div>
          {headerRight && <div className="flex flex-wrap items-center gap-2">{headerRight}</div>}
        </header>

        <StorageErrorBanner />

        <div className="space-y-4 p-4 sm:p-5">{children}</div>
      </div>
    </div>
  )
}

function SidebarButton({ section, active, handler }: { section: CompetencySection; active: CompetencySection; handler?: () => void }) {
  const meta = SECTION_META[section]
  const isActive = section === active
  return (
    <button
      disabled={!isActive && !handler}
      onClick={handler}
      title={meta.label}
      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium transition-colors sm:px-3 ${
        isActive ? 'bg-purple-500/20 text-purple-200' : handler ? 'text-secondary hover:bg-white/5 hover:text-primary' : 'text-muted/50'
      }`}
    >
      <meta.icon size={15} className="shrink-0" />
      <span className="hidden flex-1 text-right sm:block">{meta.label}</span>
      {!isActive && !handler && <Lock size={11} className="hidden opacity-60 sm:block" />}
    </button>
  )
}

/** The "خیلی فشرده و کوچک" evaluation-progress strip — a row of small dots joined by lines, one per
 * milestone, green once done. No labels in the strip itself (that would defeat the point of being
 * compact); each dot's title attribute carries its name for anyone who hovers. */
function StageStrip({ stages }: { stages: EvaluationStage[] }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5" title="مراحل ارزیابی">
      {stages.map((s, i) => (
        <span key={s.label} className="flex items-center">
          <span className={`h-2 w-2 rounded-full ${s.done ? 'bg-emerald-400' : 'bg-white/15'}`} title={s.label} />
          {i < stages.length - 1 && <span className={`h-px w-2.5 ${s.done && stages[i + 1].done ? 'bg-emerald-400/50' : 'bg-white/10'}`} />}
        </span>
      ))}
    </div>
  )
}
