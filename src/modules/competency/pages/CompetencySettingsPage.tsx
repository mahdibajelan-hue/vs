import { useEffect, useState } from 'react'
import { BookOpenCheck, ClipboardEdit, Eye, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { CompetencySidebarShell, type CompetencySection } from '../components/CompetencySidebarShell'
import { QUESTION_TYPE_LABEL_FA, JOB_ROLES, JOB_ROLE_LABEL_FA, type CompProfileLite, type CompRoleAssignment, type QuestionType } from '../types'

interface CompetencySettingsPageProps {
  onExitToHub: () => void
  nav: Partial<Record<CompetencySection, () => void>>
}

const ALL_QUESTION_TYPES: QuestionType[] = [
  'GENERAL',
  'TECHNICAL',
  'SCENARIO',
  'PROBLEM_SOLVING',
  'EXPERIENCE_BASED',
  'CASE_STUDY',
  'IMAGE_BASED',
  'BEHAVIORAL',
  'HSE',
  'JUDGMENT',
]

/** Reusable "pick a user, add them, list current holders with a remove button" block — the exact
 * same shape used for module admins, assessment designers and report viewers, so it's written once
 * here instead of three times. */
function RoleAssignmentSection({
  icon,
  title,
  description,
  addLabel,
  emptyLabel,
  profiles,
  holders,
  onAdd,
  onRemove,
}: {
  icon: React.ReactNode
  title: string
  description: string
  addLabel: string
  emptyLabel: string
  profiles: CompProfileLite[]
  holders: CompRoleAssignment[]
  onAdd: (userId: string) => void
  onRemove: (userId: string) => void
}) {
  const [pickUserId, setPickUserId] = useState('')
  const availableProfiles = profiles.filter((p) => !holders.some((h) => h.userId === p.id))

  return (
    <div className="glass-panel rounded-2xl p-4">
      <p className="mb-1 flex items-center gap-1.5 text-sm font-bold">
        {icon} {title}
      </p>
      <p className="mb-3 text-[11px] leading-6 text-muted">{description}</p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={pickUserId} onChange={(e) => setPickUserId(e.target.value)} className="input max-w-xs">
          <option value="">انتخاب کاربر…</option>
          {availableProfiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName} ({p.email})
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!pickUserId}
          onClick={() => {
            onAdd(pickUserId)
            setPickUserId('')
          }}
          className="flex items-center gap-1.5 rounded-lg bg-purple-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-purple-400 disabled:opacity-40"
        >
          <UserPlus size={13} /> {addLabel}
        </button>
      </div>

      {holders.length === 0 ? (
        <p className="text-[11px] text-muted">{emptyLabel}</p>
      ) : (
        <div className="space-y-1.5">
          {holders.map((h) => {
            const profile = profiles.find((p) => p.id === h.userId)
            return (
              <div key={h.userId} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px]">
                <span>{profile?.fullName ?? h.userId}</span>
                <button onClick={() => onRemove(h.userId)} className="text-muted hover:text-red-300">
                  <Trash2 size={12} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Module-wide settings: who has full admin-equivalent access (comp_module_admins), who may design
 * assessments / view reports (the ASSESSMENT_DESIGNER / REPORT_VIEWER rasta roles), and which
 * question types each job role's bank may use. Only reachable at all when the viewer is already a
 * module admin (see nav construction in CompetencyApp). */
export function CompetencySettingsPage({ onExitToHub, nav }: CompetencySettingsPageProps) {
  const profiles = useCompetencyStore((s) => s.profiles)
  const fetchProfiles = useCompetencyStore((s) => s.fetchProfiles)
  const moduleAdmins = useCompetencyStore((s) => s.moduleAdmins)
  const fetchModuleAdmins = useCompetencyStore((s) => s.fetchModuleAdmins)
  const addModuleAdmin = useCompetencyStore((s) => s.addModuleAdmin)
  const removeModuleAdmin = useCompetencyStore((s) => s.removeModuleAdmin)

  const assessmentDesigners = useCompetencyStore((s) => s.assessmentDesigners)
  const fetchAssessmentDesigners = useCompetencyStore((s) => s.fetchAssessmentDesigners)
  const addAssessmentDesigner = useCompetencyStore((s) => s.addAssessmentDesigner)
  const removeAssessmentDesigner = useCompetencyStore((s) => s.removeAssessmentDesigner)

  const reportViewers = useCompetencyStore((s) => s.reportViewers)
  const fetchReportViewers = useCompetencyStore((s) => s.fetchReportViewers)
  const addReportViewer = useCompetencyStore((s) => s.addReportViewer)
  const removeReportViewer = useCompetencyStore((s) => s.removeReportViewer)

  const jobRoleConfigs = useCompetencyStore((s) => s.jobRoleConfigs)
  const fetchJobRoleConfigs = useCompetencyStore((s) => s.fetchJobRoleConfigs)
  const updateJobRoleConfig = useCompetencyStore((s) => s.updateJobRoleConfig)

  useEffect(() => {
    if (profiles.length === 0) fetchProfiles()
    fetchModuleAdmins()
    fetchAssessmentDesigners()
    fetchReportViewers()
    fetchJobRoleConfigs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <CompetencySidebarShell active="settings" nav={nav} title="تنظیمات ماژول ارزیابی شایستگی" onExitToHub={onExitToHub}>
      <RoleAssignmentSection
        icon={<ShieldCheck size={15} className="text-purple-300" />}
        title="ادمین‌های این ماژول"
        description="کاربرانی که اینجا اضافه می‌شوند، صرف‌نظر از دسترسی ادمین کلی سامانه، در این ماژول به‌طور کامل مانند ادمین عمل می‌کنند — ویرایش بانک سؤالات، مدیریت گروه‌های داوری، حذف هر ارزیابی و مشاهده/ویرایش کامل همه مصاحبه‌ها."
        addLabel="افزودن ادمین"
        emptyLabel="هنوز ادمین اختصاصی برای این ماژول تعریف نشده — فقط ادمین‌های کلی سامانه دسترسی کامل دارند."
        profiles={profiles}
        holders={moduleAdmins}
        onAdd={addModuleAdmin}
        onRemove={removeModuleAdmin}
      />

      <RoleAssignmentSection
        icon={<ClipboardEdit size={15} className="text-sky-300" />}
        title="طراحان آزمون (Assessment Designer)"
        description="این کاربران می‌توانند آزمون جدید طراحی و ترکیب سؤال آن را تعیین کنند و به بانک سؤال (برای پیش‌نمایش) دسترسی خواندن دارند — اما اجازه ویرایش بانک سؤالات را ندارند."
        addLabel="افزودن طراح آزمون"
        emptyLabel="هنوز طراح آزمون اختصاصی تعریف نشده."
        profiles={profiles}
        holders={assessmentDesigners}
        onAdd={addAssessmentDesigner}
        onRemove={removeAssessmentDesigner}
      />

      <RoleAssignmentSection
        icon={<Eye size={15} className="text-emerald-300" />}
        title="بینندگان گزارش (Report Viewer)"
        description="دسترسی مشاهده گزارش‌های نهایی‌شده ارزیابی شایستگی، بدون نیاز به نقش ادمین یا داور."
        addLabel="افزودن بیننده گزارش"
        emptyLabel="هنوز بیننده گزارش اختصاصی تعریف نشده."
        profiles={profiles}
        holders={reportViewers}
        onAdd={addReportViewer}
        onRemove={removeReportViewer}
      />

      <div className="glass-panel rounded-2xl p-4">
        <p className="mb-1 flex items-center gap-1.5 text-sm font-bold">
          <BookOpenCheck size={15} className="text-amber-300" /> انواع سؤال مجاز به تفکیک شغل
        </p>
        <p className="mb-3 text-[11px] leading-6 text-muted">
          مشخص کنید بانک سؤال هر شغل مجاز به استفاده از کدام انواع سؤال است — برای مشاغلی که مثلاً سؤال قضاوتی یا رفتاری ندارند می‌توانید آن نوع را غیرفعال کنید.
        </p>
        <div className="space-y-2">
          {JOB_ROLES.map((role) => {
            const config = jobRoleConfigs.find((c) => c.jobRole === role)
            const allowed = new Set(config?.allowedQuestionTypes ?? ALL_QUESTION_TYPES)
            return (
              <div key={role} className="rounded-lg border border-white/10 p-2.5">
                <p className="mb-1.5 text-[11px] font-bold">{JOB_ROLE_LABEL_FA[role]}</p>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_QUESTION_TYPES.map((t) => {
                    const isOn = allowed.has(t)
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          const next = new Set(allowed)
                          if (isOn) next.delete(t)
                          else next.add(t)
                          updateJobRoleConfig(role, ALL_QUESTION_TYPES.filter((x) => next.has(x)))
                        }}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors ${
                          isOn ? 'bg-amber-500/15 text-amber-300' : 'bg-white/5 text-muted hover:bg-white/10'
                        }`}
                      >
                        {QUESTION_TYPE_LABEL_FA[t]}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </CompetencySidebarShell>
  )
}
