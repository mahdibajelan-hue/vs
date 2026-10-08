import { useEffect, useMemo, useState } from 'react'
import { Briefcase, CircleSlash, Save, UserCheck } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { OPEN_TO_WORK_GREEN } from './OpenToWorkRing'
import type { CompetencyAssessment, WorkStatus } from '../types'

const OPTIONS: { id: WorkStatus; label: string; hint: string; icon: typeof Briefcase; color: string }[] = [
  { id: 'none', label: 'نامشخص', hint: 'چیزی روی کارت نشان داده نمی‌شود', icon: CircleSlash, color: '#94a3b8' },
  { id: 'open_to_work', label: 'آماده به کار', hint: 'حلقه سبز «Open to work» دور عکس', icon: UserCheck, color: OPEN_TO_WORK_GREEN },
  { id: 'on_project', label: 'شاغل در پروژه', hint: '«شاغل در پروژه …» روی کارت صلاحیت', icon: Briefcase, color: '#0ea5e9' },
]

/** Where the candidate stands after the assessment — drives the «Open to work» photo ring and the
 * «شاغل در پروژه …» line on the credential card, and the project filter on the dashboard. */
export function WorkStatusEditor({ assessment }: { assessment: CompetencyAssessment }) {
  const setWorkStatus = useCompetencyStore((s) => s.setWorkStatus)
  const allAssessments = useCompetencyStore((s) => s.assessments)
  const [status, setStatus] = useState<WorkStatus>(assessment.workStatus)
  const [project, setProject] = useState(assessment.workProjectName)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setStatus(assessment.workStatus)
    setProject(assessment.workProjectName)
  }, [assessment.id, assessment.workStatus, assessment.workProjectName])

  const known = useMemo(
    () => [...new Set(allAssessments.map((a) => a.workProjectName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fa')),
    [allAssessments],
  )
  const needsProject = status === 'on_project'
  const dirty = status !== assessment.workStatus || (needsProject && project.trim() !== assessment.workProjectName)
  const invalid = needsProject && !project.trim()

  const save = async () => {
    setSaving(true)
    const ok = await setWorkStatus(assessment.id, status, project)
    setSaving(false)
    setSaved(ok)
    if (ok) setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="fx-card space-y-3 p-4">
      <div>
        <p className="text-[12.5px] font-extrabold">وضعیت اشتغال متقاضی</p>
        <p className="fx-muted text-[11px] leading-6">پس از ارزیابی مشخص کنید متقاضی آماده به کار است یا در پروژه‌ای مشغول شده است.</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="وضعیت اشتغال">
        {OPTIONS.map((o) => {
          const on = status === o.id
          return (
            <button
              key={o.id}
              role="radio"
              aria-checked={on}
              onClick={() => setStatus(o.id)}
              className={`flex items-start gap-2 rounded-xl border-2 p-3 text-right transition-colors ${on ? '' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
              style={on ? { borderColor: o.color, background: `${o.color}22` } : undefined}
            >
              <o.icon size={16} className="mt-0.5 shrink-0" style={{ color: on ? o.color : undefined }} aria-hidden />
              <span className="min-w-0">
                <span className="block text-[12px] font-bold" style={{ color: on ? o.color : undefined }}>
                  {o.label}
                </span>
                <span className="fx-muted block text-[10.5px] leading-5">{o.hint}</span>
              </span>
            </button>
          )
        })}
      </div>
      {needsProject && (
        <label className="block">
          <span className="fx-muted mb-1 block text-[11px]">نام پروژه</span>
          <input
            list="comp-work-projects"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="مثلاً خط لوله ۳۶ اینچ گوره-جاسک"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs outline-none focus:border-sky-400/60"
          />
          <datalist id="comp-work-projects">
            {known.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          {invalid && <span className="mt-1 block text-[10.5px] text-amber-300">برای «شاغل در پروژه» نام پروژه لازم است.</span>}
        </label>
      )}
      <div className="flex items-center justify-end gap-2">
        {saved && <span className="text-[11px] font-bold text-emerald-300">ثبت شد</span>}
        <button
          onClick={save}
          disabled={!dirty || invalid || saving}
          className="flex min-h-10 items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-sky-500 disabled:opacity-40"
        >
          <Save size={14} aria-hidden /> ذخیره وضعیت اشتغال
        </button>
      </div>
    </div>
  )
}
