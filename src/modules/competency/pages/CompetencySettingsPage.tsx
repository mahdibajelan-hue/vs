import { useEffect, useState } from 'react'
import { ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { CompetencySidebarShell, type CompetencySection } from '../components/CompetencySidebarShell'

interface CompetencySettingsPageProps {
  onExitToHub: () => void
  nav: Partial<Record<CompetencySection, () => void>>
}

/** Module-wide settings — currently just who has full admin-equivalent access to Competency
 * (comp_module_admins), independent of the global RASTA admin flag. Only reachable at all when the
 * viewer is already a module admin (see nav construction in CompetencyApp). */
export function CompetencySettingsPage({ onExitToHub, nav }: CompetencySettingsPageProps) {
  const profiles = useCompetencyStore((s) => s.profiles)
  const fetchProfiles = useCompetencyStore((s) => s.fetchProfiles)
  const moduleAdmins = useCompetencyStore((s) => s.moduleAdmins)
  const fetchModuleAdmins = useCompetencyStore((s) => s.fetchModuleAdmins)
  const addModuleAdmin = useCompetencyStore((s) => s.addModuleAdmin)
  const removeModuleAdmin = useCompetencyStore((s) => s.removeModuleAdmin)
  const [pickUserId, setPickUserId] = useState('')

  useEffect(() => {
    if (profiles.length === 0) fetchProfiles()
    fetchModuleAdmins()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const availableProfiles = profiles.filter((p) => !moduleAdmins.some((m) => m.userId === p.id))

  return (
    <CompetencySidebarShell active="settings" nav={nav} title="تنظیمات ماژول ارزیابی شایستگی" onExitToHub={onExitToHub}>
      <div className="glass-panel rounded-2xl p-4">
        <p className="mb-1 flex items-center gap-1.5 text-sm font-bold">
          <ShieldCheck size={15} className="text-purple-300" /> ادمین‌های این ماژول
        </p>
        <p className="mb-3 text-[11px] leading-6 text-muted">
          کاربرانی که اینجا اضافه می‌شوند، صرف‌نظر از دسترسی ادمین کلی سامانه، در این ماژول به‌طور کامل مانند ادمین عمل می‌کنند — ویرایش بانک سؤالات، مدیریت
          گروه‌های داوری، حذف هر ارزیابی و مشاهده/ویرایش کامل همه مصاحبه‌ها.
        </p>

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
              addModuleAdmin(pickUserId)
              setPickUserId('')
            }}
            className="flex items-center gap-1.5 rounded-lg bg-purple-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-purple-400 disabled:opacity-40"
          >
            <UserPlus size={13} /> افزودن ادمین
          </button>
        </div>

        {moduleAdmins.length === 0 ? (
          <p className="text-[11px] text-muted">هنوز ادمین اختصاصی برای این ماژول تعریف نشده — فقط ادمین‌های کلی سامانه دسترسی کامل دارند.</p>
        ) : (
          <div className="space-y-1.5">
            {moduleAdmins.map((m) => {
              const profile = profiles.find((p) => p.id === m.userId)
              return (
                <div key={m.userId} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px]">
                  <span>{profile?.fullName ?? m.userId}</span>
                  <button onClick={() => removeModuleAdmin(m.userId)} className="text-muted hover:text-red-300">
                    <Trash2 size={12} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </CompetencySidebarShell>
  )
}
