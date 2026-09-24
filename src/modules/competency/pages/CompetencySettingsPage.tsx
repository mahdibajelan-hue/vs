import { useEffect, useMemo, useState } from 'react'
import { BookOpenCheck, ClipboardEdit, Eye, History, ListTree, Pencil, Plus, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react'
import { useCompetencyStore, type CompetencyCatalogInput, type JobCompetencyRequirementInput, type JobRoleCatalogInput } from '../store/useCompetencyStore'
import { formatJalali } from '../../../lib/jalali'
import { CompetencySidebarShell, type CompetencySection } from '../components/CompetencySidebarShell'
import { sortedJobRoles } from '../lib/competencyData'
import {
  COMP_COMPETENCY_DOMAIN_LABEL_FA,
  QUESTION_TYPE_LABEL_FA,
  type CompCompetency,
  type CompCompetencyDomain,
  type CompJobCompetencyRequirement,
  type CompJobRoleConfig,
  type CompProfileLite,
  type CompRoleAssignment,
  type QuestionType,
} from '../types'

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
  const addJobRole = useCompetencyStore((s) => s.addJobRole)
  const updateJobRole = useCompetencyStore((s) => s.updateJobRole)

  const competencies = useCompetencyStore((s) => s.competencies)
  const fetchCompetencies = useCompetencyStore((s) => s.fetchCompetencies)
  const addCompetency = useCompetencyStore((s) => s.addCompetency)
  const updateCompetency = useCompetencyStore((s) => s.updateCompetency)

  const jobCompetencyRequirements = useCompetencyStore((s) => s.jobCompetencyRequirements)
  const fetchJobCompetencyRequirements = useCompetencyStore((s) => s.fetchJobCompetencyRequirements)
  const upsertJobCompetencyRequirement = useCompetencyStore((s) => s.upsertJobCompetencyRequirement)
  const removeJobCompetencyRequirement = useCompetencyStore((s) => s.removeJobCompetencyRequirement)

  const auditLog = useCompetencyStore((s) => s.auditLog)
  const fetchAuditLog = useCompetencyStore((s) => s.fetchAuditLog)

  useEffect(() => {
    if (profiles.length === 0) fetchProfiles()
    fetchModuleAdmins()
    fetchAssessmentDesigners()
    fetchReportViewers()
    fetchJobRoleConfigs()
    fetchCompetencies()
    fetchJobCompetencyRequirements()
    fetchAuditLog()
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
          {sortedJobRoles(jobRoleConfigs).map((config) => {
            const role = config.jobRole
            const allowed = new Set(config.allowedQuestionTypes.length > 0 ? config.allowedQuestionTypes : ALL_QUESTION_TYPES)
            return (
              <div key={role} className="rounded-lg border border-white/10 p-2.5">
                <p className="mb-1.5 text-[11px] font-bold">{config.labelFa}</p>
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

      <JobCompetencyModelSection
        jobRoleConfigs={jobRoleConfigs}
        addJobRole={addJobRole}
        updateJobRole={updateJobRole}
        competencies={competencies}
        addCompetency={addCompetency}
        updateCompetency={updateCompetency}
        jobCompetencyRequirements={jobCompetencyRequirements}
        upsertJobCompetencyRequirement={upsertJobCompetencyRequirement}
        removeJobCompetencyRequirement={removeJobCompetencyRequirement}
      />

      <div className="glass-panel rounded-2xl p-4">
        <p className="mb-1 flex items-center gap-1.5 text-sm font-bold">
          <History size={15} className="text-red-300" /> گزارش رویدادهای حساس (Audit Log)
        </p>
        <p className="mb-3 text-[11px] leading-6 text-muted">
          آخرین ۲۰۰ رویداد حساس ثبت‌شده — فقط توسط سرور و از طریق اقدامات رسمی (مثل بازگشایی ارزیابی) نوشته می‌شود و هیچ‌کس نمی‌تواند مستقیماً آن را ویرایش کند.
        </p>
        {auditLog.length === 0 ? (
          <p className="text-[11px] text-muted">هنوز رویدادی ثبت نشده است.</p>
        ) : (
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {auditLog.map((entry) => {
              const actorProfile = profiles.find((p) => p.id === entry.actor)
              return (
                <div key={entry.id} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[10.5px]">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="font-bold text-secondary">{entry.action}</span>
                    <span className="num text-muted">{formatJalali(entry.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-muted">
                    {entry.entityType} · توسط {actorProfile?.fullName ?? entry.actor ?? 'سیستم'}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </CompetencySidebarShell>
  )
}

const ALL_DOMAINS: CompCompetencyDomain[] = ['TECHNICAL', 'BEHAVIORAL', 'HYBRID']

// A job-role key, once created, is a foreign key from comp_assessments/comp_question_bank/
// comp_job_competency_requirements — see the note on JobRoleCatalogInput in useCompetencyStore.ts —
// so it's validated as a simple slug here, at creation, and never editable afterward.
const JOB_ROLE_SLUG_PATTERN = /^[a-z][a-z0-9_]*$/

type ModelTab = 'roles' | 'competencies' | 'requirements'

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors ${
        active ? 'bg-sky-500/20 text-sky-200' : 'border border-white/10 text-secondary hover:bg-white/5'
      }`}
    >
      {label}
    </button>
  )
}

/**
 * "مدل شایستگی و مشاغل" — lets a module admin manage the three catalogs the Enterprise Competency
 * Assessment Engine is built on (schema.sql Section 47): the job-role catalog itself (what used to
 * be the frontend's hardcoded JOB_ROLE_LABEL_FA/JOB_ROLES), the unified competency catalog, and
 * which competencies each job role requires. Deliberately three tabs of one section rather than
 * three separate glass-panel cards — they're one coherent model, not three unrelated settings.
 * Evidence-source wiring (which assessments/items actually feed a competency's score) and any
 * scoring/gap-analysis UI are explicitly a later phase — this is catalog/model management only.
 */
function JobCompetencyModelSection({
  jobRoleConfigs,
  addJobRole,
  updateJobRole,
  competencies,
  addCompetency,
  updateCompetency,
  jobCompetencyRequirements,
  upsertJobCompetencyRequirement,
  removeJobCompetencyRequirement,
}: {
  jobRoleConfigs: CompJobRoleConfig[]
  addJobRole: (jobRole: string, input: JobRoleCatalogInput) => Promise<void>
  updateJobRole: (jobRole: string, input: JobRoleCatalogInput) => Promise<void>
  competencies: CompCompetency[]
  addCompetency: (input: CompetencyCatalogInput) => Promise<void>
  updateCompetency: (id: string, input: CompetencyCatalogInput) => Promise<void>
  jobCompetencyRequirements: CompJobCompetencyRequirement[]
  upsertJobCompetencyRequirement: (jobRole: string, input: JobCompetencyRequirementInput) => Promise<void>
  removeJobCompetencyRequirement: (id: string) => Promise<void>
}) {
  const [tab, setTab] = useState<ModelTab>('roles')

  return (
    <div className="glass-panel rounded-2xl p-4">
      <p className="mb-1 flex items-center gap-1.5 text-sm font-bold">
        <ListTree size={15} className="text-sky-300" /> مدل شایستگی و مشاغل
      </p>
      <p className="mb-3 text-[11px] leading-6 text-muted">
        کاتالوگ مشاغل، کاتالوگ شایستگی‌های سازمانی و الزامات شایستگی هر شغل — افزودن شغل یا شایستگی جدید از این پس صرفاً یک عملیات داده‌ای است، بدون نیاز به تغییر کد.
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <TabButton active={tab === 'roles'} onClick={() => setTab('roles')} label="کاتالوگ مشاغل" />
        <TabButton active={tab === 'competencies'} onClick={() => setTab('competencies')} label="کاتالوگ شایستگی‌ها" />
        <TabButton active={tab === 'requirements'} onClick={() => setTab('requirements')} label="الزامات شایستگی به تفکیک شغل" />
      </div>

      {tab === 'roles' && <JobRoleCatalogTab jobRoleConfigs={jobRoleConfigs} addJobRole={addJobRole} updateJobRole={updateJobRole} />}
      {tab === 'competencies' && <CompetencyCatalogTab competencies={competencies} addCompetency={addCompetency} updateCompetency={updateCompetency} />}
      {tab === 'requirements' && (
        <RequirementsTab
          jobRoleConfigs={jobRoleConfigs}
          competencies={competencies}
          requirements={jobCompetencyRequirements}
          onUpsert={upsertJobCompetencyRequirement}
          onRemove={removeJobCompetencyRequirement}
        />
      )}
    </div>
  )
}

function JobRoleCatalogTab({
  jobRoleConfigs,
  addJobRole,
  updateJobRole,
}: {
  jobRoleConfigs: CompJobRoleConfig[]
  addJobRole: (jobRole: string, input: JobRoleCatalogInput) => Promise<void>
  updateJobRole: (jobRole: string, input: JobRoleCatalogInput) => Promise<void>
}) {
  const [editingRole, setEditingRole] = useState<string | null>(null)
  const [newKey, setNewKey] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [keyError, setKeyError] = useState('')

  const rows = sortedJobRoles(jobRoleConfigs)

  const handleAdd = async () => {
    const key = newKey.trim()
    if (!JOB_ROLE_SLUG_PATTERN.test(key)) {
      setKeyError('کلید شغل باید فقط از حروف انگلیسی کوچک، عدد و زیرخط تشکیل شده و با یک حرف شروع شود (مثال: quality_inspector).')
      return
    }
    if (jobRoleConfigs.some((c) => c.jobRole === key)) {
      setKeyError('این کلید قبلاً ثبت شده است.')
      return
    }
    if (!newLabel.trim()) return
    setKeyError('')
    await addJobRole(key, {
      labelFa: newLabel.trim(),
      description: newDescription.trim(),
      active: true,
      sortOrder: rows.length > 0 ? Math.max(...rows.map((r) => r.sortOrder)) + 1 : 1,
      allowedQuestionTypes: ALL_QUESTION_TYPES,
    })
    setNewKey('')
    setNewLabel('')
    setNewDescription('')
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <label className="block">
          <span className="mb-1 block text-[10px] text-muted">کلید شغل (انگلیسی، ثابت)</span>
          <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="quality_inspector" className="input w-44 !py-1.5 text-[11px]" dir="ltr" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] text-muted">عنوان فارسی</span>
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="کارشناس کنترل کیفیت" className="input w-48 !py-1.5 text-[11px]" />
        </label>
        <label className="block min-w-[10rem] flex-1">
          <span className="mb-1 block text-[10px] text-muted">توضیح (اختیاری)</span>
          <input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className="input w-full !py-1.5 text-[11px]" />
        </label>
        <button
          type="button"
          disabled={!newKey.trim() || !newLabel.trim()}
          onClick={handleAdd}
          className="flex items-center gap-1 rounded-lg bg-purple-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-purple-400 disabled:opacity-40"
        >
          <Plus size={12} /> افزودن شغل
        </button>
      </div>
      {keyError && <p className="text-[10.5px] text-red-300">{keyError}</p>}

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.02] text-muted">
              <th className="p-2 text-right font-bold">کلید</th>
              <th className="p-2 text-right font-bold">عنوان فارسی</th>
              <th className="p-2 text-right font-bold">توضیح</th>
              <th className="num p-2 text-center font-bold">ترتیب</th>
              <th className="p-2 text-center font-bold">وضعیت</th>
              <th className="p-2 text-center font-bold"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) =>
              editingRole === r.jobRole ? (
                <JobRoleEditRow
                  key={r.jobRole}
                  row={r}
                  onCancel={() => setEditingRole(null)}
                  onSave={async (input) => {
                    await updateJobRole(r.jobRole, input)
                    setEditingRole(null)
                  }}
                />
              ) : (
                <tr key={r.jobRole} className={`border-b border-white/5 last:border-0 ${!r.active ? 'opacity-50' : ''}`}>
                  <td className="num p-2" dir="ltr">
                    {r.jobRole}
                  </td>
                  <td className="p-2 font-bold">{r.labelFa}</td>
                  <td className="p-2 text-muted">{r.description || '—'}</td>
                  <td className="num p-2 text-center">{r.sortOrder.toLocaleString('fa-IR')}</td>
                  <td className="p-2 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold ${r.active ? 'bg-emerald-500/12 text-emerald-300' : 'bg-white/5 text-muted'}`}>
                      {r.active ? 'فعال' : 'غیرفعال'}
                    </span>
                  </td>
                  <td className="p-2 text-center">
                    <button onClick={() => setEditingRole(r.jobRole)} className="rounded-lg border border-white/10 p-1.5 text-secondary hover:bg-white/5">
                      <Pencil size={12} />
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function JobRoleEditRow({
  row,
  onCancel,
  onSave,
}: {
  row: CompJobRoleConfig
  onCancel: () => void
  onSave: (input: JobRoleCatalogInput) => Promise<void>
}) {
  const [labelFa, setLabelFa] = useState(row.labelFa)
  const [description, setDescription] = useState(row.description)
  const [active, setActive] = useState(row.active)
  const [sortOrder, setSortOrder] = useState(row.sortOrder)
  const [saving, setSaving] = useState(false)

  return (
    <tr className="border-b border-white/5 bg-sky-500/[0.05] last:border-0">
      <td className="num p-2" dir="ltr">
        {row.jobRole}
      </td>
      <td className="p-1.5">
        <input value={labelFa} onChange={(e) => setLabelFa(e.target.value)} className="input !py-1 text-[11px]" />
      </td>
      <td className="p-1.5">
        <input value={description} onChange={(e) => setDescription(e.target.value)} className="input !py-1 text-[11px]" />
      </td>
      <td className="p-1.5">
        <input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
          className="num input w-16 !py-1 text-center text-[11px]"
        />
      </td>
      <td className="p-1.5 text-center">
        <label className="inline-flex items-center gap-1 text-[10px]">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-3.5 w-3.5" /> فعال
        </label>
      </td>
      <td className="p-1.5">
        <div className="flex items-center justify-center gap-1">
          <button
            disabled={saving || !labelFa.trim()}
            onClick={async () => {
              setSaving(true)
              await onSave({ labelFa: labelFa.trim(), description: description.trim(), active, sortOrder, allowedQuestionTypes: row.allowedQuestionTypes })
              setSaving(false)
            }}
            className="rounded-lg bg-purple-500 px-2 py-1 text-[10.5px] font-bold text-white hover:bg-purple-400 disabled:opacity-40"
          >
            ذخیره
          </button>
          <button onClick={onCancel} className="rounded-lg border border-white/10 p-1.5 text-muted hover:bg-white/5">
            <X size={12} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function CompetencyCatalogTab({
  competencies,
  addCompetency,
  updateCompetency,
}: {
  competencies: CompCompetency[]
  addCompetency: (input: CompetencyCatalogInput) => Promise<void>
  updateCompetency: (id: string, input: CompetencyCatalogInput) => Promise<void>
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newKey, setNewKey] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newDomain, setNewDomain] = useState<CompCompetencyDomain>('HYBRID')
  const [keyError, setKeyError] = useState('')

  const sorted = useMemo(() => [...competencies].sort((a, b) => a.labelFa.localeCompare(b.labelFa)), [competencies])

  const handleAdd = async () => {
    const key = newKey.trim()
    if (!key || !newLabel.trim()) return
    if (competencies.some((c) => c.key === key)) {
      setKeyError('این کلید قبلاً ثبت شده است.')
      return
    }
    setKeyError('')
    await addCompetency({ key, labelFa: newLabel.trim(), description: newDescription.trim(), domain: newDomain, active: true })
    setNewKey('')
    setNewLabel('')
    setNewDescription('')
    setNewDomain('HYBRID')
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <label className="block">
          <span className="mb-1 block text-[10px] text-muted">کلید (انگلیسی، ثابت)</span>
          <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="risk_management" className="input w-40 !py-1.5 text-[11px]" dir="ltr" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] text-muted">عنوان فارسی</span>
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="مدیریت ریسک" className="input w-44 !py-1.5 text-[11px]" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] text-muted">حوزه</span>
          <select value={newDomain} onChange={(e) => setNewDomain(e.target.value as CompCompetencyDomain)} className="input w-32 !py-1.5 text-[11px]">
            {ALL_DOMAINS.map((d) => (
              <option key={d} value={d}>
                {COMP_COMPETENCY_DOMAIN_LABEL_FA[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-[10rem] flex-1">
          <span className="mb-1 block text-[10px] text-muted">توضیح (اختیاری)</span>
          <input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className="input w-full !py-1.5 text-[11px]" />
        </label>
        <button
          type="button"
          disabled={!newKey.trim() || !newLabel.trim()}
          onClick={handleAdd}
          className="flex items-center gap-1 rounded-lg bg-purple-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-purple-400 disabled:opacity-40"
        >
          <Plus size={12} /> افزودن شایستگی
        </button>
      </div>
      {keyError && <p className="text-[10.5px] text-red-300">{keyError}</p>}

      {sorted.length === 0 ? (
        <p className="text-[11px] text-muted">هنوز شایستگی‌ای تعریف نشده است.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-muted">
                <th className="p-2 text-right font-bold">کلید</th>
                <th className="p-2 text-right font-bold">عنوان فارسی</th>
                <th className="p-2 text-right font-bold">توضیح</th>
                <th className="p-2 text-center font-bold">حوزه</th>
                <th className="p-2 text-center font-bold">وضعیت</th>
                <th className="p-2 text-center font-bold"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) =>
                editingId === c.id ? (
                  <CompetencyEditRow
                    key={c.id}
                    competency={c}
                    onCancel={() => setEditingId(null)}
                    onSave={async (input) => {
                      await updateCompetency(c.id, input)
                      setEditingId(null)
                    }}
                  />
                ) : (
                  <tr key={c.id} className={`border-b border-white/5 last:border-0 ${!c.active ? 'opacity-50' : ''}`}>
                    <td className="num p-2" dir="ltr">
                      {c.key}
                    </td>
                    <td className="p-2 font-bold">{c.labelFa}</td>
                    <td className="p-2 text-muted">{c.description || '—'}</td>
                    <td className="p-2 text-center">{COMP_COMPETENCY_DOMAIN_LABEL_FA[c.domain]}</td>
                    <td className="p-2 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold ${c.active ? 'bg-emerald-500/12 text-emerald-300' : 'bg-white/5 text-muted'}`}>
                        {c.active ? 'فعال' : 'غیرفعال'}
                      </span>
                    </td>
                    <td className="p-2 text-center">
                      <button onClick={() => setEditingId(c.id)} className="rounded-lg border border-white/10 p-1.5 text-secondary hover:bg-white/5">
                        <Pencil size={12} />
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function CompetencyEditRow({
  competency,
  onCancel,
  onSave,
}: {
  competency: CompCompetency
  onCancel: () => void
  onSave: (input: CompetencyCatalogInput) => Promise<void>
}) {
  const [labelFa, setLabelFa] = useState(competency.labelFa)
  const [description, setDescription] = useState(competency.description)
  const [domain, setDomain] = useState<CompCompetencyDomain>(competency.domain)
  const [active, setActive] = useState(competency.active)
  const [saving, setSaving] = useState(false)

  return (
    <tr className="border-b border-white/5 bg-sky-500/[0.05] last:border-0">
      <td className="num p-2" dir="ltr">
        {competency.key}
      </td>
      <td className="p-1.5">
        <input value={labelFa} onChange={(e) => setLabelFa(e.target.value)} className="input !py-1 text-[11px]" />
      </td>
      <td className="p-1.5">
        <input value={description} onChange={(e) => setDescription(e.target.value)} className="input !py-1 text-[11px]" />
      </td>
      <td className="p-1.5 text-center">
        <select value={domain} onChange={(e) => setDomain(e.target.value as CompCompetencyDomain)} className="input !py-1 text-[11px]">
          {ALL_DOMAINS.map((d) => (
            <option key={d} value={d}>
              {COMP_COMPETENCY_DOMAIN_LABEL_FA[d]}
            </option>
          ))}
        </select>
      </td>
      <td className="p-1.5 text-center">
        <label className="inline-flex items-center gap-1 text-[10px]">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-3.5 w-3.5" /> فعال
        </label>
      </td>
      <td className="p-1.5">
        <div className="flex items-center justify-center gap-1">
          <button
            disabled={saving || !labelFa.trim()}
            onClick={async () => {
              setSaving(true)
              await onSave({ key: competency.key, labelFa: labelFa.trim(), description: description.trim(), domain, active })
              setSaving(false)
            }}
            className="rounded-lg bg-purple-500 px-2 py-1 text-[10.5px] font-bold text-white hover:bg-purple-400 disabled:opacity-40"
          >
            ذخیره
          </button>
          <button onClick={onCancel} className="rounded-lg border border-white/10 p-1.5 text-muted hover:bg-white/5">
            <X size={12} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function RequirementsTab({
  jobRoleConfigs,
  competencies,
  requirements,
  onUpsert,
  onRemove,
}: {
  jobRoleConfigs: CompJobRoleConfig[]
  competencies: CompCompetency[]
  requirements: CompJobCompetencyRequirement[]
  onUpsert: (jobRole: string, input: JobCompetencyRequirementInput) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const roles = sortedJobRoles(jobRoleConfigs)
  const [selectedRole, setSelectedRole] = useState<string>('')
  const [competencyId, setCompetencyId] = useState('')
  const [requiredLevel, setRequiredLevel] = useState(3)
  const [weight, setWeight] = useState(1)
  const [isCritical, setIsCritical] = useState(false)

  useEffect(() => {
    if (!selectedRole && roles.length > 0) setSelectedRole(roles[0].jobRole)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles.length])

  const effectiveRole = selectedRole || roles[0]?.jobRole || ''
  const rowsForRole = requirements.filter((r) => r.jobRole === effectiveRole)
  const competencyById = useMemo(() => new Map(competencies.map((c) => [c.id, c])), [competencies])
  const availableCompetencies = competencies.filter((c) => c.active && !rowsForRole.some((r) => r.competencyId === c.id))

  const handleAdd = async () => {
    if (!effectiveRole || !competencyId) return
    await onUpsert(effectiveRole, { competencyId, requiredLevel, isCritical, weight })
    setCompetencyId('')
    setRequiredLevel(3)
    setWeight(1)
    setIsCritical(false)
  }

  if (roles.length === 0) {
    return <p className="text-[11px] text-muted">ابتدا در تب «کاتالوگ مشاغل» حداقل یک شغل تعریف کنید.</p>
  }

  return (
    <div className="space-y-3">
      <label className="block max-w-xs">
        <span className="mb-1 block text-[10px] text-muted">شغل</span>
        <select value={effectiveRole} onChange={(e) => setSelectedRole(e.target.value)} className="input">
          {roles.map((r) => (
            <option key={r.jobRole} value={r.jobRole}>
              {r.labelFa}
            </option>
          ))}
        </select>
      </label>

      {competencies.length === 0 ? (
        <p className="text-[11px] text-muted">ابتدا در تب «کاتالوگ شایستگی‌ها» حداقل یک شایستگی تعریف کنید.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <label className="block">
            <span className="mb-1 block text-[10px] text-muted">شایستگی</span>
            <select value={competencyId} onChange={(e) => setCompetencyId(e.target.value)} className="input w-48 !py-1.5 text-[11px]">
              <option value="">انتخاب شایستگی…</option>
              {availableCompetencies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.labelFa}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] text-muted">سطح مورد نیاز</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={requiredLevel}
              onChange={(e) => setRequiredLevel(Number(e.target.value) || 0)}
              className="num input w-20 !py-1.5 text-center text-[11px]"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] text-muted">وزن</span>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value) || 1)}
              className="num input w-20 !py-1.5 text-center text-[11px]"
            />
          </label>
          <label className="flex items-center gap-1.5 pb-2 text-[11px] text-secondary">
            <input type="checkbox" checked={isCritical} onChange={(e) => setIsCritical(e.target.checked)} className="h-3.5 w-3.5" /> الزام حیاتی
          </label>
          <button
            type="button"
            disabled={!competencyId}
            onClick={handleAdd}
            className="flex items-center gap-1 rounded-lg bg-purple-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-purple-400 disabled:opacity-40"
          >
            <Plus size={12} /> افزودن الزام
          </button>
        </div>
      )}

      {rowsForRole.length === 0 ? (
        <p className="text-[11px] text-muted">هنوز الزام شایستگی‌ای برای این شغل ثبت نشده است.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-muted">
                <th className="p-2 text-right font-bold">شایستگی</th>
                <th className="num p-2 text-center font-bold">سطح مورد نیاز</th>
                <th className="num p-2 text-center font-bold">وزن</th>
                <th className="p-2 text-center font-bold">حیاتی</th>
                <th className="p-2 text-center font-bold"></th>
              </tr>
            </thead>
            <tbody>
              {rowsForRole.map((r) => (
                <RequirementRow
                  key={r.id}
                  requirement={r}
                  competencyLabel={competencyById.get(r.competencyId)?.labelFa ?? '—'}
                  onSave={(input) => onUpsert(effectiveRole, input)}
                  onRemove={() => onRemove(r.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function RequirementRow({
  requirement,
  competencyLabel,
  onSave,
  onRemove,
}: {
  requirement: CompJobCompetencyRequirement
  competencyLabel: string
  onSave: (input: JobCompetencyRequirementInput) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const [requiredLevel, setRequiredLevel] = useState(requirement.requiredLevel)
  const [weight, setWeight] = useState(requirement.weight)
  const [isCritical, setIsCritical] = useState(requirement.isCritical)
  const [dirty, setDirty] = useState(false)

  return (
    <tr className="border-b border-white/5 last:border-0">
      <td className="p-2 font-bold">{competencyLabel}</td>
      <td className="p-1.5 text-center">
        <input
          type="number"
          min={0}
          step={0.5}
          value={requiredLevel}
          onChange={(e) => {
            setRequiredLevel(Number(e.target.value) || 0)
            setDirty(true)
          }}
          className="num input w-16 !py-1 text-center text-[11px]"
        />
      </td>
      <td className="p-1.5 text-center">
        <input
          type="number"
          min={0.1}
          step={0.1}
          value={weight}
          onChange={(e) => {
            setWeight(Number(e.target.value) || 1)
            setDirty(true)
          }}
          className="num input w-16 !py-1 text-center text-[11px]"
        />
      </td>
      <td className="p-1.5 text-center">
        <input
          type="checkbox"
          checked={isCritical}
          onChange={(e) => {
            setIsCritical(e.target.checked)
            setDirty(true)
          }}
          className="h-3.5 w-3.5"
        />
      </td>
      <td className="p-1.5">
        <div className="flex items-center justify-center gap-1">
          {dirty && (
            <button
              onClick={async () => {
                await onSave({ competencyId: requirement.competencyId, requiredLevel, isCritical, weight })
                setDirty(false)
              }}
              className="rounded-lg bg-purple-500 px-2 py-1 text-[10.5px] font-bold text-white hover:bg-purple-400"
            >
              ذخیره
            </button>
          )}
          <button onClick={onRemove} className="rounded-lg p-1.5 text-muted hover:bg-red-500/10 hover:text-red-300">
            <Trash2 size={12} />
          </button>
        </div>
      </td>
    </tr>
  )
}
