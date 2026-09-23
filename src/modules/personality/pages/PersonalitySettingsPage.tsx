import { useEffect, useState } from 'react'
import { BookOpen, ClipboardEdit, Eye, Home, Settings, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { usePersonalityStore } from '../store/usePersonalityStore'
import { SignOutButton } from '../../../components/Auth/SignOutButton'
import { StorageErrorBanner } from '../../../components/Layout/StorageErrorBanner'
import type { PersonalityProfileLite, PersonalityRoleAssignment } from '../types'

interface PersonalitySettingsPageProps {
  onExitToHub: () => void
  onNavDashboard: () => void
  onNavQuestionBank: () => void
}

/** Reusable "pick a user, add them, list current holders with a remove button" block — the exact
 * same shape used for module admins, assessment designers and report viewers, mirroring
 * CompetencySettingsPage's RoleAssignmentSection exactly (see that file), rebuilt here against the
 * personality module's own profile/role-assignment types since the two modules keep separate role
 * catalogs. */
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
  profiles: PersonalityProfileLite[]
  holders: PersonalityRoleAssignment[]
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
          className="flex items-center gap-1.5 rounded-lg bg-pink-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-pink-400 disabled:opacity-40"
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

/** Module-wide settings for the Personality & Behavioral Assessment module: who has full
 * admin-equivalent access (personality_module_admins) and who may design assessments / view
 * reports (PERSONALITY_ASSESSMENT_DESIGNER / PERSONALITY_REPORT_VIEWER rasta roles) — mirrors
 * CompetencySettingsPage exactly, reachable only when the viewer is already a module admin (see
 * isModuleAdmin gating in PersonalityApp). */
export function PersonalitySettingsPage({ onExitToHub, onNavDashboard, onNavQuestionBank }: PersonalitySettingsPageProps) {
  const profiles = usePersonalityStore((s) => s.profiles)
  const fetchProfiles = usePersonalityStore((s) => s.fetchProfiles)
  const moduleAdmins = usePersonalityStore((s) => s.moduleAdmins)
  const fetchModuleAdmins = usePersonalityStore((s) => s.fetchModuleAdmins)
  const addModuleAdmin = usePersonalityStore((s) => s.addModuleAdmin)
  const removeModuleAdmin = usePersonalityStore((s) => s.removeModuleAdmin)

  const assessmentDesigners = usePersonalityStore((s) => s.assessmentDesigners)
  const fetchAssessmentDesigners = usePersonalityStore((s) => s.fetchAssessmentDesigners)
  const addAssessmentDesigner = usePersonalityStore((s) => s.addAssessmentDesigner)
  const removeAssessmentDesigner = usePersonalityStore((s) => s.removeAssessmentDesigner)

  const reportViewers = usePersonalityStore((s) => s.reportViewers)
  const fetchReportViewers = usePersonalityStore((s) => s.fetchReportViewers)
  const addReportViewer = usePersonalityStore((s) => s.addReportViewer)
  const removeReportViewer = usePersonalityStore((s) => s.removeReportViewer)

  useEffect(() => {
    if (profiles.length === 0) fetchProfiles()
    fetchModuleAdmins()
    fetchAssessmentDesigners()
    fetchReportViewers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#0b0f16]/90 px-5 py-3.5 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-pink-500/15 text-pink-300">
            <Settings size={16} />
          </div>
          <h1 className="text-sm font-extrabold">تنظیمات ماژول ارزیابی شخصیت</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onNavDashboard} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-secondary hover:bg-white/5">
            داشبورد
          </button>
          <button onClick={onNavQuestionBank} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-secondary hover:bg-white/5">
            <BookOpen size={13} /> بانک سؤالات
          </button>
          <button onClick={onExitToHub} title="بازگشت به ماژول‌ها" className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-secondary hover:bg-white/5">
            <Home size={14} />
          </button>
          <SignOutButton className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10" />
        </div>
      </header>

      <StorageErrorBanner />

      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <RoleAssignmentSection
          icon={<ShieldCheck size={15} className="text-pink-300" />}
          title="ادمین‌های این ماژول"
          description="کاربرانی که اینجا اضافه می‌شوند، صرف‌نظر از دسترسی ادمین کلی سامانه، در این ماژول به‌طور کامل مانند ادمین عمل می‌کنند — ویرایش بانک سؤالات شخصیت، تأیید/رد سؤالات پیشنهادی و طراحی آزمون‌ها."
          addLabel="افزودن ادمین"
          emptyLabel="هنوز ادمین اختصاصی برای این ماژول تعریف نشده — فقط ادمین‌های کلی سامانه دسترسی کامل دارند."
          profiles={profiles}
          holders={moduleAdmins}
          onAdd={addModuleAdmin}
          onRemove={removeModuleAdmin}
        />

        <RoleAssignmentSection
          icon={<ClipboardEdit size={15} className="text-sky-300" />}
          title="طراحان آزمون شخصیت (Assessment Designer)"
          description="این کاربران می‌توانند ترکیب سؤال آزمون شخصیت را طراحی و آزمون را تولید کنند و به بانک سؤال (برای پیش‌نمایش) دسترسی خواندن دارند — اما اجازه ویرایش بانک سؤالات را ندارند."
          addLabel="افزودن طراح آزمون"
          emptyLabel="هنوز طراح آزمون اختصاصی تعریف نشده."
          profiles={profiles}
          holders={assessmentDesigners}
          onAdd={addAssessmentDesigner}
          onRemove={removeAssessmentDesigner}
        />

        <RoleAssignmentSection
          icon={<Eye size={15} className="text-emerald-300" />}
          title="بینندگان گزارش شخصیت (Report Viewer)"
          description="دسترسی مشاهده نتیجه و گزارش‌های نهایی‌شده ارزیابی شخصیت و رفتاری، بدون نیاز به نقش ادمین یا طراح آزمون."
          addLabel="افزودن بیننده گزارش"
          emptyLabel="هنوز بیننده گزارش اختصاصی تعریف نشده."
          profiles={profiles}
          holders={reportViewers}
          onAdd={addReportViewer}
          onRemove={removeReportViewer}
        />
      </div>
    </div>
  )
}
