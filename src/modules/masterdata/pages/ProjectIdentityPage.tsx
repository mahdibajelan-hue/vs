import { useEffect, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  Building2,
  Calendar,
  ClipboardList,
  FileText,
  Layers,
  Pencil,
  Plug,
  Plus,
  Save,
  Trash2,
  Users,
  Users2,
  X,
} from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { useMasterDataStore } from '../store/useMasterDataStore'
import { useAccessStore } from '../store/useAccessStore'
import { MAPPING_SOURCE_MODULE_LABEL_FA } from '../rbacTypes'
import {
  PHASE_STATUS_LABEL_FA,
  PHASE_STATUSES,
  PROJECT_LIFECYCLE_STATUSES,
  PROJECT_STATUS_LABEL_FA,
  PROJECT_STATUS_TONE,
  SCHEDULE_STATUS_LABEL_FA,
  SCHEDULE_STATUSES,
  type MasterProject,
  type PhaseStatus,
  type ProjectLifecycleStatus,
  type ScheduleStatus,
} from '../types'

const CONNECTED_MODULE_TABLE: Record<'risk' | 'issues' | 'pipepulse', string> = {
  risk: 'rm_risks',
  issues: 'im_issues',
  pipepulse: 'lines',
}

const TONE_CLASS: Record<'neutral' | 'green' | 'amber' | 'red', string> = {
  neutral: 'border-white/15 bg-white/[0.04] text-muted',
  green: 'border-green-400/40 bg-green-500/10 text-green-300',
  amber: 'border-amber-400/40 bg-amber-500/10 text-amber-300',
  red: 'border-red-400/40 bg-red-500/10 text-red-300',
}

function editableFormFromProject(p: MasterProject) {
  return {
    officialName: p.officialName,
    shortName: p.shortName,
    projectCode: p.projectCode,
    description: p.description,
    projectType: p.projectType,
    projectCategory: p.projectCategory,
    portfolioId: p.portfolioId ?? '',
    programId: p.programId ?? '',
    status: p.status,
    contractNumber: p.contractNumber,
    contractType: p.contractType,
    contractValue: p.contractValue == null ? '' : String(p.contractValue),
    currency: p.currency,
    contractStartDate: p.contractStartDate ?? '',
    contractualCompletionDate: p.contractualCompletionDate ?? '',
    revisedCompletionDate: p.revisedCompletionDate ?? '',
    employerOrgId: p.employerOrgId ?? '',
    consultantOrgId: p.consultantOrgId ?? '',
    contractorOrgId: p.contractorOrgId ?? '',
    partnerOrgId: p.partnerOrgId ?? '',
    sponsorId: p.sponsorId ?? '',
    projectManagerId: p.projectManagerId ?? '',
    projectDirectorId: p.projectDirectorId ?? '',
    programManagerId: p.programManagerId ?? '',
    portfolioManagerId: p.portfolioManagerId ?? '',
    pmoOwnerId: p.pmoOwnerId ?? '',
    plannedStartDate: p.plannedStartDate ?? '',
    plannedFinishDate: p.plannedFinishDate ?? '',
    actualStartDate: p.actualStartDate ?? '',
    actualFinishDate: p.actualFinishDate ?? '',
    forecastFinishDate: p.forecastFinishDate ?? '',
    baselineVersion: p.baselineVersion,
    scheduleStatus: p.scheduleStatus,
  }
}

export function ProjectIdentityPage({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId))
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const organizations = useMasterDataStore((s) => s.organizations)
  const users = useMasterDataStore((s) => s.users)
  const updateProject = useMasterDataStore((s) => s.updateProject)
  const deleteProject = useMasterDataStore((s) => s.deleteProject)
  const phasesByProject = useMasterDataStore((s) => s.phasesByProject)
  const fetchPhases = useMasterDataStore((s) => s.fetchPhases)
  const createPhase = useMasterDataStore((s) => s.createPhase)
  const deletePhase = useMasterDataStore((s) => s.deletePhase)

  const accessLoaded = useAccessStore((s) => s.loaded)
  const fetchAccessAll = useAccessStore((s) => s.fetchAll)
  const projectRoles = useAccessStore((s) => s.projectRoles)
  const projectRoleAssignments = useAccessStore((s) => s.projectRoleAssignments)
  const assignProjectRole = useAccessStore((s) => s.assignProjectRole)
  const removeProjectRoleAssignment = useAccessStore((s) => s.removeProjectRoleAssignment)
  const projectMappings = useAccessStore((s) => s.projectMappings)

  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState(() => (project ? editableFormFromProject(project) : null))
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showNewPhase, setShowNewPhase] = useState(false)
  const [moduleCounts, setModuleCounts] = useState<Record<'risk' | 'issues' | 'pipepulse', number | null>>({ risk: null, issues: null, pipepulse: null })

  useEffect(() => {
    fetchPhases(projectId)
    if (!accessLoaded) fetchAccessAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const myMappingsKey = projectMappings
    .filter((m) => m.masterProjectId === projectId)
    .map((m) => `${m.sourceModule}:${m.sourceProjectId}`)
    .join(',')

  useEffect(() => {
    let cancelled = false
    const myMappings = projectMappings.filter((m) => m.masterProjectId === projectId)
    if (myMappings.length === 0) {
      setModuleCounts({ risk: null, issues: null, pipepulse: null })
      return
    }
    async function loadCounts() {
      const next: Record<'risk' | 'issues' | 'pipepulse', number | null> = { risk: null, issues: null, pipepulse: null }
      // Each query is caught individually — one module's count failing (e.g. a transient
      // network error) must not blank out the other two, which may have succeeded fine.
      await Promise.all(
        myMappings.map(async (m) => {
          try {
            const { count } = await supabase
              .from(CONNECTED_MODULE_TABLE[m.sourceModule])
              .select('id', { count: 'exact', head: true })
              .eq('project_id', m.sourceProjectId)
            next[m.sourceModule] = count ?? 0
          } catch {
            next[m.sourceModule] = null
          }
        }),
      )
      if (!cancelled) setModuleCounts(next)
    }
    loadCounts()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, myMappingsKey])

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted">پروژه یافت نشد یا حذف شده است.</p>
        <button onClick={onBack} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3.5 py-2 text-xs text-secondary hover:bg-white/5">
          <ArrowRight size={13} /> بازگشت به فهرست پروژه‌ها
        </button>
      </div>
    )
  }

  const orgName = (id: string | null) => organizations.find((o) => o.id === id)?.name ?? '—'
  const userName = (id: string | null) => users.find((u) => u.id === id)?.fullName || users.find((u) => u.id === id)?.email || '—'
  const portfolioName = (id: string | null) => portfolios.find((p) => p.id === id)?.name ?? '—'
  const programName = (id: string | null) => programs.find((p) => p.id === id)?.name ?? '—'
  const phases = phasesByProject[projectId] ?? []

  const startEdit = () => {
    setForm(editableFormFromProject(project))
    setEditMode(true)
  }

  const save = async () => {
    if (!form) return
    setSaving(true)
    await updateProject(project.id, {
      ...form,
      contractValue: form.contractValue === '' ? null : Number(form.contractValue),
      portfolioId: form.portfolioId || null,
      programId: form.programId || null,
      employerOrgId: form.employerOrgId || null,
      consultantOrgId: form.consultantOrgId || null,
      contractorOrgId: form.contractorOrgId || null,
      partnerOrgId: form.partnerOrgId || null,
      sponsorId: form.sponsorId || null,
      projectManagerId: form.projectManagerId || null,
      projectDirectorId: form.projectDirectorId || null,
      programManagerId: form.programManagerId || null,
      portfolioManagerId: form.portfolioManagerId || null,
      pmoOwnerId: form.pmoOwnerId || null,
      contractStartDate: form.contractStartDate || null,
      contractualCompletionDate: form.contractualCompletionDate || null,
      revisedCompletionDate: form.revisedCompletionDate || null,
      plannedStartDate: form.plannedStartDate || null,
      plannedFinishDate: form.plannedFinishDate || null,
      actualStartDate: form.actualStartDate || null,
      actualFinishDate: form.actualFinishDate || null,
      forecastFinishDate: form.forecastFinishDate || null,
    })
    setSaving(false)
    setEditMode(false)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b px-1 pb-4" style={{ borderColor: 'var(--border-soft)' }}>
        <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-xs text-secondary hover:text-current transition-colors">
          <ArrowRight size={13} /> بازگشت به فهرست پروژه‌ها
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted num" dir="ltr">
                {project.projectIdCode}
              </span>
              {project.projectCode && <span className="text-[11px] text-muted">({project.projectCode})</span>}
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${TONE_CLASS[PROJECT_STATUS_TONE[project.status]]}`}>
                {PROJECT_STATUS_LABEL_FA[project.status]}
              </span>
            </div>
            <h1 className="mt-1 text-lg font-extrabold truncate">{project.officialName}</h1>
            {project.shortName && <p className="text-xs text-secondary">{project.shortName}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {editMode ? (
              <>
                <button onClick={() => setEditMode(false)} className="rounded-lg px-3.5 py-2 text-xs text-secondary hover:bg-white/5">
                  انصراف
                </button>
                <button
                  onClick={save}
                  disabled={saving || !form?.officialName.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2 text-xs font-medium text-white hover:bg-brand-400 disabled:opacity-40 transition-colors"
                >
                  <Save size={13} /> {saving ? 'در حال ذخیره...' : 'ذخیره'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3.5 py-2 text-xs text-secondary hover:bg-white/5 transition-colors"
                >
                  <Pencil size={13} /> ویرایش
                </button>
                {confirmDelete ? (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => { deleteProject(project.id); onBack() }} className="text-xs text-red-400 hover:underline">
                      تایید حذف
                    </button>
                    <button onClick={() => setConfirmDelete(false)} className="text-xs text-secondary hover:underline">
                      انصراف
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="rounded-lg border border-white/10 p-2 text-muted hover:text-red-400 transition-colors"
                    title="حذف پروژه"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto py-4 space-y-4">
        {editMode && form ? (
          <EditForm
            form={form}
            setForm={(updater) => setForm((f) => (f ? updater(f) : f))}
            portfolios={portfolios}
            programs={programs}
            organizations={organizations}
            users={users}
          />
        ) : (
          <>
            <SectionCard icon={FileText} title="نمای کلی">
              <p className="text-sm leading-7 text-secondary">{project.description || 'توضیحی ثبت نشده است.'}</p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="نوع پروژه" value={project.projectType || '—'} />
                <Field label="دسته‌بندی" value={project.projectCategory || '—'} />
                <Field label="پورتفولیو" value={portfolioName(project.portfolioId)} />
                <Field label="طرح" value={programName(project.programId)} />
              </div>
            </SectionCard>

            <SectionCard icon={FileText} title="قرارداد">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="شماره قرارداد" value={project.contractNumber || '—'} dir="ltr" />
                <Field label="نوع قرارداد" value={project.contractType || '—'} />
                <Field label="مبلغ قرارداد" value={project.contractValue != null ? `${project.contractValue.toLocaleString('fa-IR')} ${project.currency}` : '—'} />
                <Field label="تاریخ شروع قرارداد" value={project.contractStartDate ?? '—'} num />
                <Field label="تاریخ تکمیل قراردادی" value={project.contractualCompletionDate ?? '—'} num />
                <Field label="تاریخ تکمیل بازنگری‌شده" value={project.revisedCompletionDate ?? '—'} num />
              </div>
            </SectionCard>

            <SectionCard icon={Calendar} title="برنامه زمان‌بندی">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="شروع برنامه‌ریزی‌شده" value={project.plannedStartDate ?? '—'} num />
                <Field label="پایان برنامه‌ریزی‌شده" value={project.plannedFinishDate ?? '—'} num />
                <Field label="شروع واقعی" value={project.actualStartDate ?? '—'} num />
                <Field label="پایان واقعی" value={project.actualFinishDate ?? '—'} num />
                <Field label="پیش‌بینی پایان" value={project.forecastFinishDate ?? '—'} num />
                <Field label="نسخه خط مبنا" value={project.baselineVersion} />
              </div>
              <span className={`mt-3 inline-block rounded-full border px-2.5 py-1 text-[11px] font-medium ${TONE_CLASS[scheduleTone(project.scheduleStatus)]}`}>
                {SCHEDULE_STATUS_LABEL_FA[project.scheduleStatus]}
              </span>
            </SectionCard>

            <SectionCard icon={Building2} title="سازمان‌های طرف پروژه">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="کارفرما" value={orgName(project.employerOrgId)} />
                <Field label="مشاور" value={orgName(project.consultantOrgId)} />
                <Field label="پیمانکار" value={orgName(project.contractorOrgId)} />
                <Field label="شریک" value={orgName(project.partnerOrgId)} />
              </div>
            </SectionCard>

            <SectionCard icon={Users} title="تیم مدیریت">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="حامی پروژه (Sponsor)" value={userName(project.sponsorId)} />
                <Field label="مدیر پروژه" value={userName(project.projectManagerId)} />
                <Field label="مدیر ارشد پروژه" value={userName(project.projectDirectorId)} />
                <Field label="مدیر طرح" value={userName(project.programManagerId)} />
                <Field label="مدیر پورتفولیو" value={userName(project.portfolioManagerId)} />
                <Field label="مسئول PMO" value={userName(project.pmoOwnerId)} />
              </div>
            </SectionCard>

            <SectionCard
              icon={Layers}
              title="ساختار — فازهای پروژه"
              action={
                <button
                  onClick={() => setShowNewPhase(true)}
                  className="flex items-center gap-1 rounded-lg border border-dashed border-white/15 px-2.5 py-1 text-[11px] text-secondary hover:bg-white/5 transition-colors"
                >
                  <Plus size={12} /> افزودن فاز
                </button>
              }
            >
              {phases.length === 0 ? (
                <p className="text-xs text-muted">هنوز فازی برای این پروژه تعریف نشده است.</p>
              ) : (
                <div className="space-y-2">
                  {phases.map((ph) => (
                    <div key={ph.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{ph.name}</p>
                          <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-secondary">
                            {PHASE_STATUS_LABEL_FA[ph.status]}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted num">
                          {ph.plannedStart ?? '—'} تا {ph.plannedFinish ?? '—'}
                        </p>
                      </div>
                      <div className="w-24 shrink-0">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-brand-400" style={{ width: `${ph.progress}%` }} />
                        </div>
                        <p className="mt-1 text-left text-[10px] text-muted num">{ph.progress}٪</p>
                      </div>
                      <button
                        onClick={() => deletePhase(ph.id, project.id)}
                        className="shrink-0 text-muted hover:text-red-400 transition-colors"
                        title="حذف فاز"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <ProjectTeamSection
              projectId={project.id}
              users={users}
              projectRoles={projectRoles}
              assignments={projectRoleAssignments.filter((a) => a.projectId === project.id)}
              onAssign={assignProjectRole}
              onRemove={removeProjectRoleAssignment}
            />

            <SectionCard icon={Plug} title="ماژول‌های متصل">
              <p className="mb-3 text-[11px] text-muted leading-5">
                از طریق «نگاشت پروژه‌ها» در داده‌های پایه، این پروژه مرکزی می‌تواند به پروژه معادل خودش در هر ماژول وصل شود. عددهای زیر واقعی و از همان ماژول خوانده می‌شوند.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(['risk', 'issues', 'pipepulse'] as const).map((key) => {
                  const count = moduleCounts[key]
                  return (
                    <div key={key} className="rounded-xl border border-dashed border-white/10 px-3 py-2.5 text-center">
                      <p className="text-xs text-secondary">{MAPPING_SOURCE_MODULE_LABEL_FA[key]}</p>
                      <p className="mt-1 text-sm font-bold num">
                        {count == null ? 'نگاشت‌نشده' : key === 'pipepulse' ? `${count} خط` : count}
                      </p>
                    </div>
                  )
                })}
              </div>
            </SectionCard>
          </>
        )}
      </main>

      {showNewPhase && (
        <NewPhaseModal
          onClose={() => setShowNewPhase(false)}
          onCreate={async (data) => {
            await createPhase(project.id, { ...data, sequence: phases.length })
            setShowNewPhase(false)
          }}
        />
      )}
    </div>
  )
}

function scheduleTone(s: ScheduleStatus): 'neutral' | 'green' | 'amber' | 'red' {
  if (s === 'on_track' || s === 'ahead') return 'green'
  if (s === 'at_risk') return 'amber'
  if (s === 'delayed') return 'red'
  return 'neutral'
}

function SectionCard({ icon: Icon, title, action, children }: { icon: typeof FileText; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="glass-panel rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={15} className="text-brand-400" />
          <h3 className="text-sm font-bold">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function Field({ label, value, num, dir }: { label: string; value: string; num?: boolean; dir?: 'ltr' | 'rtl' }) {
  return (
    <div>
      <p className="text-[10px] text-muted">{label}</p>
      <p className={`text-sm ${num ? 'num' : ''}`} dir={dir}>
        {value}
      </p>
    </div>
  )
}

function ProjectTeamSection({
  projectId,
  users,
  projectRoles,
  assignments,
  onAssign,
  onRemove,
}: {
  projectId: string
  users: { id: string; email: string; fullName: string }[]
  projectRoles: { id: string; name: string }[]
  assignments: { id: string; userId: string; projectRoleId: string }[]
  onAssign: (projectId: string, userId: string, projectRoleId: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [userId, setUserId] = useState('')
  const [roleId, setRoleId] = useState('')
  const [busy, setBusy] = useState(false)
  const userName = (id: string) => users.find((u) => u.id === id)?.fullName || users.find((u) => u.id === id)?.email || '—'
  const roleName = (id: string) => projectRoles.find((r) => r.id === id)?.name ?? '—'

  return (
    <SectionCard
      icon={Users2}
      title="اعضای پروژه"
      action={
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 rounded-lg border border-dashed border-white/15 px-2.5 py-1 text-[11px] text-secondary hover:bg-white/5 transition-colors"
        >
          <Plus size={12} /> افزودن عضو
        </button>
      }
    >
      {assignments.length === 0 && !showAdd ? (
        <p className="text-xs text-muted">هنوز عضوی برای این پروژه تعریف نشده است.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {assignments.map((a) => (
            <span key={a.id} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs">
              {userName(a.userId)} <span className="text-[10px] text-muted">— {roleName(a.projectRoleId)}</span>
              <button onClick={() => onRemove(a.id)} className="text-muted hover:text-red-400 transition-colors">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-brand-400/30 bg-brand-500/5 px-2.5 py-2">
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className="rounded-md bg-black/20 border border-white/10 px-2 py-1 text-[11px] outline-none">
            <option value="">کاربر...</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName || u.email}
              </option>
            ))}
          </select>
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className="rounded-md bg-black/20 border border-white/10 px-2 py-1 text-[11px] outline-none">
            <option value="">نقش پروژه...</option>
            {projectRoles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            onClick={async () => {
              if (!userId || !roleId) return
              setBusy(true)
              await onAssign(projectId, userId, roleId)
              setBusy(false)
              setShowAdd(false)
              setUserId('')
              setRoleId('')
            }}
            disabled={!userId || !roleId || busy}
            className="text-[11px] font-medium text-brand-300 hover:underline disabled:opacity-40"
          >
            افزودن
          </button>
          <button onClick={() => setShowAdd(false)} className="text-muted hover:text-current transition-colors">
            <X size={12} />
          </button>
        </div>
      )}
    </SectionCard>
  )
}

type EditFormState = ReturnType<typeof editableFormFromProject>

function EditForm({
  form,
  setForm,
  portfolios,
  programs,
  organizations,
  users,
}: {
  form: EditFormState
  setForm: (updater: (f: EditFormState) => EditFormState) => void
  portfolios: { id: string; name: string }[]
  programs: { id: string; name: string }[]
  organizations: { id: string; name: string }[]
  users: { id: string; email: string; fullName: string }[]
}) {
  const set = <K extends keyof EditFormState>(key: K, value: EditFormState[K]) => setForm((f) => ({ ...f, [key]: value }))
  const userOptions = [{ id: '', label: '—' }, ...users.map((u) => ({ id: u.id, label: u.fullName || u.email }))]

  return (
    <div className="space-y-4">
      <SectionCard icon={FileText} title="اطلاعات پایه">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">نام رسمی پروژه</span>
            <input value={form.officialName} onChange={(e) => set('officialName', e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">نام کوتاه</span>
            <input value={form.shortName} onChange={(e) => set('shortName', e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">کد پروژه</span>
            <input value={form.projectCode} onChange={(e) => set('projectCode', e.target.value)} className="input" dir="ltr" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">وضعیت پروژه</span>
            <select value={form.status} onChange={(e) => set('status', e.target.value as ProjectLifecycleStatus)} className="input">
              {PROJECT_LIFECYCLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABEL_FA[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">نوع پروژه</span>
            <input value={form.projectType} onChange={(e) => set('projectType', e.target.value)} className="input" placeholder="مثلاً خط لوله، ایستگاه تقویت فشار" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">دسته‌بندی</span>
            <input value={form.projectCategory} onChange={(e) => set('projectCategory', e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">پورتفولیو</span>
            <select value={form.portfolioId} onChange={(e) => set('portfolioId', e.target.value)} className="input">
              <option value="">—</option>
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">طرح</span>
            <select value={form.programId} onChange={(e) => set('programId', e.target.value)} className="input">
              <option value="">—</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs text-secondary">توضیحات پروژه</span>
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} className="input" rows={3} />
        </label>
      </SectionCard>

      <SectionCard icon={FileText} title="قرارداد">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">شماره قرارداد</span>
            <input value={form.contractNumber} onChange={(e) => set('contractNumber', e.target.value)} className="input" dir="ltr" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">نوع قرارداد</span>
            <input value={form.contractType} onChange={(e) => set('contractType', e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">مبلغ قرارداد</span>
            <div className="flex gap-1.5">
              <input type="number" value={form.contractValue} onChange={(e) => set('contractValue', e.target.value)} className="input num" />
              <input value={form.currency} onChange={(e) => set('currency', e.target.value)} className="input w-20" dir="ltr" />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">تاریخ شروع قرارداد</span>
            <input type="date" value={form.contractStartDate} onChange={(e) => set('contractStartDate', e.target.value)} className="input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">تکمیل قراردادی</span>
            <input type="date" value={form.contractualCompletionDate} onChange={(e) => set('contractualCompletionDate', e.target.value)} className="input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">تکمیل بازنگری‌شده</span>
            <input type="date" value={form.revisedCompletionDate} onChange={(e) => set('revisedCompletionDate', e.target.value)} className="input num" />
          </label>
        </div>
      </SectionCard>

      <SectionCard icon={Calendar} title="برنامه زمان‌بندی">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">شروع برنامه‌ریزی‌شده</span>
            <input type="date" value={form.plannedStartDate} onChange={(e) => set('plannedStartDate', e.target.value)} className="input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">پایان برنامه‌ریزی‌شده</span>
            <input type="date" value={form.plannedFinishDate} onChange={(e) => set('plannedFinishDate', e.target.value)} className="input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">شروع واقعی</span>
            <input type="date" value={form.actualStartDate} onChange={(e) => set('actualStartDate', e.target.value)} className="input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">پایان واقعی</span>
            <input type="date" value={form.actualFinishDate} onChange={(e) => set('actualFinishDate', e.target.value)} className="input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">پیش‌بینی پایان</span>
            <input type="date" value={form.forecastFinishDate} onChange={(e) => set('forecastFinishDate', e.target.value)} className="input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">وضعیت زمان‌بندی</span>
            <select value={form.scheduleStatus} onChange={(e) => set('scheduleStatus', e.target.value as ScheduleStatus)} className="input">
              {SCHEDULE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {SCHEDULE_STATUS_LABEL_FA[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </SectionCard>

      <SectionCard icon={Building2} title="سازمان‌های طرف پروژه">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">کارفرما</span>
            <select value={form.employerOrgId} onChange={(e) => set('employerOrgId', e.target.value)} className="input">
              <option value="">—</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">مشاور</span>
            <select value={form.consultantOrgId} onChange={(e) => set('consultantOrgId', e.target.value)} className="input">
              <option value="">—</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">پیمانکار</span>
            <select value={form.contractorOrgId} onChange={(e) => set('contractorOrgId', e.target.value)} className="input">
              <option value="">—</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">شریک</span>
            <select value={form.partnerOrgId} onChange={(e) => set('partnerOrgId', e.target.value)} className="input">
              <option value="">—</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </SectionCard>

      <SectionCard icon={Users} title="تیم مدیریت">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(
            [
              ['sponsorId', 'حامی پروژه (Sponsor)'],
              ['projectManagerId', 'مدیر پروژه'],
              ['projectDirectorId', 'مدیر ارشد پروژه'],
              ['programManagerId', 'مدیر طرح'],
              ['portfolioManagerId', 'مدیر پورتفولیو'],
              ['pmoOwnerId', 'مسئول PMO'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-xs text-secondary">{label}</span>
              <select value={form[key]} onChange={(e) => set(key, e.target.value)} className="input">
                {userOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

function NewPhaseModal({ onClose, onCreate }: { onClose: () => void; onCreate: (data: { name: string; code: string; status: PhaseStatus }) => Promise<void> }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<PhaseStatus>('not_started')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!name.trim()) return
    setSaving(true)
    await onCreate({ name, code, status })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="glass-panel w-full max-w-sm rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold flex items-center gap-1.5">
            <ClipboardList size={14} /> فاز جدید
          </h3>
          <button onClick={onClose} className="text-muted hover:text-current">
            <X size={16} />
          </button>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">نام فاز</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" autoFocus placeholder="مثلاً مهندسی، ساخت، راه‌اندازی" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">کد</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} className="input" dir="ltr" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">وضعیت</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as PhaseStatus)} className="input">
            {PHASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PHASE_STATUS_LABEL_FA[s]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
            انصراف
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || saving}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-400 disabled:opacity-40 transition-colors"
          >
            {saving ? 'در حال ذخیره...' : 'افزودن'}
          </button>
        </div>
      </div>
    </div>
  )
}
