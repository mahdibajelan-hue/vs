import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Plus, Trash2, UserPlus, Users } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { COMPETENCY_DOMAINS, CAPSTONE_QUESTION, computeDomainScores, computeOverallPercent, questionsForDomain } from '../lib/competencyModel'
import { QuestionScoreCard } from '../components/QuestionScoreCard'
import { CapstoneCard } from '../components/CapstoneCard'
import { ScoringGuideBanner } from '../components/ScoringGuideBanner'

interface PanelStageProps {
  assessmentId: string
}

/** Tiered color for a 0-100 score, matching ResultsStage's tierColor — kept as a local duplicate rather than a shared import to avoid coupling this stage to the results page. */
function tierColor(percent: number | null): string {
  if (percent == null) return '#6b7280'
  if (percent >= 80) return '#34d399'
  if (percent >= 60) return '#a78bfa'
  if (percent >= 40) return '#fbbf24'
  return '#f87171'
}

/** Multi-interviewer panel: assign panelists, let each score the candidate independently, and show the interview lead the panel's average per domain before the lead records their own final score in the "questions" stage. */
export function PanelStage({ assessmentId }: PanelStageProps) {
  const profiles = useCompetencyStore((s) => s.profiles)
  const panelists = useCompetencyStore((s) => s.panelists).filter((p) => p.assessmentId === assessmentId)
  const panelistScores = useCompetencyStore((s) => s.panelistScores).filter((p) => p.assessmentId === assessmentId)
  const assessment = useCompetencyStore((s) => s.assessments.find((a) => a.id === assessmentId))
  const fetchProfiles = useCompetencyStore((s) => s.fetchProfiles)
  const fetchPanelists = useCompetencyStore((s) => s.fetchPanelists)
  const fetchPanelistScores = useCompetencyStore((s) => s.fetchPanelistScores)
  const addPanelist = useCompetencyStore((s) => s.addPanelist)
  const removePanelist = useCompetencyStore((s) => s.removePanelist)
  const setMyPanelistAnswer = useCompetencyStore((s) => s.setMyPanelistAnswer)
  const setMyPanelistCapstone = useCompetencyStore((s) => s.setMyPanelistCapstone)
  const submitMyPanelistScore = useCompetencyStore((s) => s.submitMyPanelistScore)

  const myId = useAuthStore((s) => s.profile?.id ?? null)
  const isLead = assessment?.createdBy === myId

  const [pickUserId, setPickUserId] = useState('')

  useEffect(() => {
    if (profiles.length === 0) fetchProfiles()
    fetchPanelists(assessmentId)
    fetchPanelistScores(assessmentId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId])

  const myScore = panelistScores.find((p) => p.panelistId === myId)
  const amPanelist = panelists.some((p) => p.userId === myId)

  const availableProfiles = profiles.filter((p) => !panelists.some((pl) => pl.userId === p.id))
  const PANEL_SIZE = 3
  const panelFull = panelists.length >= PANEL_SIZE

  const submittedScores = panelistScores.filter((p) => p.submittedAt)
  const averageDomainScores = useMemo(() => {
    if (submittedScores.length === 0) return null
    return COMPETENCY_DOMAINS.map((domain) => {
      const values = submittedScores
        .map((s) => computeDomainScores(s.answers).find((d) => d.domain.key === domain.key)?.percentScore)
        .filter((v): v is number => typeof v === 'number')
      return { domain, avg: values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null, count: values.length }
    })
  }, [submittedScores])

  const overallAverages = submittedScores.map((s) => computeOverallPercent(computeDomainScores(s.answers))).filter((v): v is number => typeof v === 'number')
  const overallAvg = overallAverages.length > 0 ? Math.round(overallAverages.reduce((a, b) => a + b, 0) / overallAverages.length) : null

  const capstoneAverages = submittedScores.map((s) => s.capstoneScore).filter((v): v is number => typeof v === 'number')
  const capstoneAvg = capstoneAverages.length > 0 ? Math.round((capstoneAverages.reduce((a, b) => a + b, 0) / capstoneAverages.length) * 10) / 10 : null

  return (
    <div className="space-y-4">
      {isLead && (
        <div className="glass-panel rounded-2xl p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-bold">
              <Users size={14} className="text-purple-300" /> پنل داوران این مصاحبه
            </p>
            <span className={`num rounded-full px-2 py-0.5 text-[10px] font-bold ${panelFull ? 'bg-green-500/15 text-green-300' : 'bg-purple-500/15 text-purple-300'}`}>
              {panelists.length.toLocaleString('fa-IR')} از {PANEL_SIZE.toLocaleString('fa-IR')} داور
            </span>
          </div>
          {panelFull ? (
            <p className="mb-3 text-[11px] text-amber-300/90">پنل تکمیل شده است (۳ داور). یکی از داوران را حذف کنید تا بتوانید داور دیگری اضافه کنید.</p>
          ) : (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select value={pickUserId} onChange={(e) => setPickUserId(e.target.value)} className="input max-w-xs">
                <option value="">انتخاب داور از فهرست کاربران…</option>
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
                  addPanelist(assessmentId, pickUserId, false)
                  setPickUserId('')
                }}
                className="flex items-center gap-1.5 rounded-lg bg-purple-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-purple-400 disabled:opacity-40"
              >
                <UserPlus size={13} /> افزودن داور
              </button>
            </div>
          )}
          {panelists.length === 0 ? (
            <p className="text-[11px] text-muted">هنوز داوری اضافه نشده است — امتیاز نهایی را خودتان در بخش «سوالات» ثبت می‌کنید.</p>
          ) : (
            <div className="space-y-1.5">
              {panelists.map((p) => {
                const profile = profiles.find((pr) => pr.id === p.userId)
                const score = panelistScores.find((s) => s.panelistId === p.userId)
                return (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px]">
                    <span>{profile?.fullName ?? p.userId}</span>
                    <div className="flex items-center gap-2">
                      {score?.submittedAt ? (
                        <span className="flex items-center gap-1 text-green-300">
                          <CheckCircle2 size={12} /> ثبت‌شده
                        </span>
                      ) : (
                        <span className="text-muted">در انتظار امتیازدهی</span>
                      )}
                      <button onClick={() => removePanelist(p.id)} className="text-muted hover:text-red-300">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {averageDomainScores && (
        <div className="glass-panel rounded-2xl p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold">میانگین امتیاز داوران ({submittedScores.length} داور ثبت‌شده)</p>
            <span className="num text-sm font-extrabold text-purple-300">{overallAvg != null ? `٪${overallAvg.toLocaleString('fa-IR')}` : '—'}</span>
          </div>
          <div className="space-y-1.5">
            {averageDomainScores.map((d) => (
              <div key={d.domain.key} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[11px] text-secondary">{d.domain.shortTitle}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full" style={{ width: `${d.avg ?? 0}%`, background: tierColor(d.avg) }} />
                </div>
                <span className="num w-10 shrink-0 text-left text-[10px] text-muted">{d.avg != null ? `٪${d.avg}` : '—'}</span>
              </div>
            ))}
          </div>
          {capstoneAvg != null && <p className="mt-2 text-[11px] text-muted">میانگین امتیاز سناریوی پایانی داوران: {capstoneAvg.toLocaleString('fa-IR')}</p>}
        </div>
      )}

      {amPanelist ? (
        <div className="space-y-3">
          <ScoringGuideBanner />
          {COMPETENCY_DOMAINS.map((domain) => (
            <div key={domain.key} className="glass-panel space-y-2.5 rounded-2xl p-3.5">
              <p className="text-xs font-bold">{domain.title}</p>
              {questionsForDomain(domain.key).map((q, i) => (
                <QuestionScoreCard
                  key={q.key}
                  index={i}
                  question={q}
                  hint={domain.excellentAnswerHint}
                  answer={myScore?.answers[q.key]}
                  editable
                  onChange={(score, note) => setMyPanelistAnswer(assessmentId, q.key, score, note)}
                />
              ))}
            </div>
          ))}
          <CapstoneCard
            score={myScore?.capstoneScore ?? null}
            note={myScore?.capstoneNote ?? ''}
            editable
            onChange={(score, note) => setMyPanelistCapstone(assessmentId, score, note)}
          />
          <div className="flex items-center justify-end gap-2">
            {myScore?.submittedAt ? (
              <span className="flex items-center gap-1.5 rounded-xl bg-green-500/15 px-4 py-2 text-xs font-bold text-green-300">
                <CheckCircle2 size={14} /> امتیاز شما ثبت نهایی شد
              </span>
            ) : (
              <button
                onClick={() => submitMyPanelistScore(assessmentId)}
                className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400"
              >
                <Plus size={14} /> ثبت نهایی امتیاز من
              </button>
            )}
          </div>
        </div>
      ) : (
        !isLead && <p className="text-xs text-muted">شما به‌عنوان داور به این مصاحبه اضافه نشده‌اید.</p>
      )}

      {isLead && !amPanelist && (
        <p className="text-[11px] text-muted">
          سؤال پایانی سناریو («{CAPSTONE_QUESTION.text.slice(0, 40)}…») را در پایان مصاحبه بپرسید — امتیاز نهایی خودتان را در بخش «سوالات» ثبت کنید.
        </p>
      )}
    </div>
  )
}
