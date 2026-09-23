import { useEffect, useMemo, useState } from 'react'
import { BrainCircuit, Copy, Home, Link as LinkIcon, Plus, Wand2 } from 'lucide-react'
import { usePersonalityStore } from '../store/usePersonalityStore'
import { useCompetencyStore } from '../../competency/store/useCompetencyStore'
import { JOB_ROLE_LABEL_FA } from '../../competency/types'
import { formatJalali } from '../../../lib/jalali'
import { StorageErrorBanner } from '../../../components/Layout/StorageErrorBanner'
import { SignOutButton } from '../../../components/Auth/SignOutButton'
import { PersonalityDesignerModal } from '../components/PersonalityDesignerModal'
import { PERSONALITY_ASSESSMENT_STATUS_LABEL_FA, type PersonalityAssessment, type PersonalityAssessmentStatus } from '../types'

const SCORED_STATUSES: PersonalityAssessmentStatus[] = ['FINGERPRINT', 'AI_ANALYSIS', 'FINAL_REVIEW', 'LOCKED', 'ARCHIVED']

const STATUS_TONE: Record<PersonalityAssessmentStatus, string> = {
  DRAFT: 'bg-white/10 text-secondary',
  DESIGNED: 'bg-sky-500/15 text-sky-300',
  GENERATED: 'bg-sky-500/15 text-sky-300',
  ASSIGNED: 'bg-sky-500/15 text-sky-300',
  STARTED: 'bg-amber-500/15 text-amber-300',
  IN_PROGRESS: 'bg-amber-500/15 text-amber-300',
  SUBMITTED: 'bg-purple-500/15 text-purple-300',
  VALIDITY_CHECK: 'bg-purple-500/15 text-purple-300',
  SCORING: 'bg-purple-500/15 text-purple-300',
  FINGERPRINT: 'bg-emerald-500/15 text-emerald-300',
  AI_ANALYSIS: 'bg-emerald-500/15 text-emerald-300',
  FINAL_REVIEW: 'bg-emerald-500/15 text-emerald-300',
  LOCKED: 'bg-emerald-500/15 text-emerald-300',
  ARCHIVED: 'bg-white/10 text-muted',
}

function copyLink(token: string, param: 'p_candidate' | 'p_results') {
  const url = `${window.location.origin}${window.location.pathname}?${param}=${token}`
  navigator.clipboard?.writeText(url)
}

/**
 * Landing page of the Personality & Behavioral Assessment module. Every personality assessment is
 * 1:1 with an existing comp_assessments candidate row (see personality_assessments.assessment_id in
 * schema.sql) rather than a parallel candidate model, so this page reads the competency module's own
 * candidate list to pick who a new personality assessment attaches to, exactly per the reuse note in
 * schema.sql Section 40.
 */
export function PersonalityDashboardPage({ onExitToHub, onOpenResults }: { onExitToHub: () => void; onOpenResults: (id: string) => void }) {
  const assessments = usePersonalityStore((s) => s.assessments)
  const fetchAssessments = usePersonalityStore((s) => s.fetchAssessments)
  const fetchCatalog = usePersonalityStore((s) => s.fetchCatalog)
  const fetchQuestionBank = usePersonalityStore((s) => s.fetchQuestionBank)
  const frameworks = usePersonalityStore((s) => s.frameworks)
  const jobProfiles = usePersonalityStore((s) => s.jobProfiles)
  const createAssessment = usePersonalityStore((s) => s.createAssessment)

  const candidates = useCompetencyStore((s) => s.assessments)
  const fetchCandidates = useCompetencyStore((s) => s.fetchAll)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickedCandidateId, setPickedCandidateId] = useState('')
  const [creating, setCreating] = useState(false)
  const [designerFor, setDesignerFor] = useState<PersonalityAssessment | null>(null)

  useEffect(() => {
    fetchAssessments()
    fetchCatalog()
    fetchQuestionBank()
    if (candidates.length === 0) fetchCandidates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const candidateById = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates])
  const availableCandidates = useMemo(
    () => candidates.filter((c) => !assessments.some((a) => a.assessmentId === c.id)),
    [candidates, assessments],
  )

  const handleCreate = async () => {
    const candidate = candidateById.get(pickedCandidateId)
    if (!candidate) return
    setCreating(true)
    const frameworkId = frameworks.find((f) => f.active)?.id ?? null
    const jobProfileId = jobProfiles.find((p) => p.jobRole === candidate.jobRole && p.active)?.id ?? null
    const id = await createAssessment(candidate.id, candidate.jobRole, frameworkId, jobProfileId)
    setCreating(false)
    setPickerOpen(false)
    setPickedCandidateId('')
    if (id) {
      const created = usePersonalityStore.getState().assessments.find((a) => a.id === id)
      if (created) setDesignerFor(created)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#0b0f16]/90 px-5 py-3.5 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-pink-500/15 text-pink-300">
            <BrainCircuit size={16} />
          </div>
          <h1 className="text-sm font-extrabold">ارزیابی شخصیت و رفتاری</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPickerOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-pink-500 px-4 py-2 text-xs font-bold text-white hover:bg-pink-400">
            <Plus size={14} /> ارزیابی جدید
          </button>
          <button onClick={onExitToHub} title="بازگشت به ماژول‌ها" className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-secondary hover:bg-white/5">
            <Home size={14} />
          </button>
          <SignOutButton className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10" />
        </div>
      </header>

      <StorageErrorBanner />

      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        {pickerOpen && (
          <div className="glass-panel rounded-2xl p-4">
            <p className="mb-3 text-xs font-bold">انتخاب متقاضی برای شروع ارزیابی شخصیت</p>
            {availableCandidates.length === 0 ? (
              <p className="text-[11px] text-muted">همه متقاضیان ثبت‌شده در ماژول ارزیابی شایستگی، ارزیابی شخصیت هم دارند.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <select value={pickedCandidateId} onChange={(e) => setPickedCandidateId(e.target.value)} className="input max-w-xs">
                  <option value="">— انتخاب متقاضی —</option>
                  {availableCandidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.candidateName} — {JOB_ROLE_LABEL_FA[c.jobRole]}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleCreate}
                  disabled={!pickedCandidateId || creating}
                  className="flex items-center gap-1.5 rounded-lg bg-pink-500 px-3.5 py-2 text-xs font-bold text-white hover:bg-pink-400 disabled:opacity-40"
                >
                  <Wand2 size={13} /> {creating ? 'در حال ایجاد…' : 'ایجاد و طراحی آزمون'}
                </button>
                <button onClick={() => setPickerOpen(false)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-secondary hover:bg-white/5">
                  انصراف
                </button>
              </div>
            )}
          </div>
        )}

        {assessments.length === 0 ? (
          <div className="glass-panel flex flex-col items-center gap-2 rounded-2xl p-10 text-center">
            <BrainCircuit size={28} className="text-muted" />
            <p className="text-sm text-secondary">هنوز ارزیابی شخصیتی ثبت نشده است.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {assessments.map((a) => {
              const candidate = candidateById.get(a.assessmentId)
              const scored = SCORED_STATUSES.includes(a.status)
              const needsDesign = a.selectedQuestionIds.length === 0
              return (
                <div key={a.id} className="glass-panel rounded-2xl p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold">{candidate?.candidateName ?? 'متقاضی نامشخص'}</p>
                      <p className="truncate text-[10.5px] text-muted">{JOB_ROLE_LABEL_FA[a.jobRole]}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-bold ${STATUS_TONE[a.status]}`}>
                      {PERSONALITY_ASSESSMENT_STATUS_LABEL_FA[a.status]}
                    </span>
                  </div>
                  <p className="mb-3 text-[10px] text-muted">ایجاد: {formatJalali(a.createdAt)}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {needsDesign ? (
                      <button
                        onClick={() => setDesignerFor(a)}
                        className="flex items-center gap-1 rounded-lg bg-pink-500/15 px-2.5 py-1.5 text-[10.5px] font-bold text-pink-300 hover:bg-pink-500/25"
                      >
                        <Wand2 size={12} /> طراحی آزمون
                      </button>
                    ) : (
                      <button
                        onClick={() => copyLink(a.candidateToken, 'p_candidate')}
                        className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10.5px] text-secondary hover:bg-white/5"
                        title="کپی لینک ورود متقاضی"
                      >
                        <Copy size={12} /> لینک متقاضی
                      </button>
                    )}
                    {scored && (
                      <>
                        <button
                          onClick={() => onOpenResults(a.id)}
                          className="flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-[10.5px] font-bold text-emerald-300 hover:bg-emerald-500/25"
                        >
                          مشاهده نتیجه
                        </button>
                        <button
                          onClick={() => copyLink(a.resultsShareToken, 'p_results')}
                          className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10.5px] text-secondary hover:bg-white/5"
                          title="کپی لینک عمومی نتیجه"
                        >
                          <LinkIcon size={12} /> لینک نتیجه
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {designerFor && (
        <PersonalityDesignerModal
          personalityAssessmentId={designerFor.id}
          jobRole={designerFor.jobRole}
          onClose={() => setDesignerFor(null)}
          onGenerated={() => {
            setDesignerFor(null)
            fetchAssessments()
          }}
        />
      )}
    </div>
  )
}
