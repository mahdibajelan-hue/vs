import { useState } from 'react'
import type { CandidateProfileInput } from '../store/useCompetencyStore'

const EMPTY: CandidateProfileInput = {
  candidateName: '',
  candidatePosition: 'مدیر پروژه احداث خط لوله انتقال گاز',
  yearsExperienceTotal: null,
  yearsExperiencePipeline: null,
  currentEmployer: '',
  education: '',
  certifications: '',
  notableProjects: '',
  interviewDate: new Date().toISOString().slice(0, 10),
}

interface ProfileFormProps {
  initial?: CandidateProfileInput
  submitLabel: string
  onSubmit: (profile: CandidateProfileInput) => void
}

/** Candidate profile/background intake — filled in once, before the scored questions start. */
export function ProfileForm({ initial, submitLabel, onSubmit }: ProfileFormProps) {
  const [form, setForm] = useState<CandidateProfileInput>(initial ?? EMPTY)

  const set = <K extends keyof CandidateProfileInput>(key: K, value: CandidateProfileInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!form.candidateName.trim()) return
        onSubmit(form)
      }}
      className="glass-panel space-y-4 rounded-2xl p-5"
    >
      <p className="text-sm font-bold">مشخصات و سوابق نامزد</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="نام و نام خانوادگی *">
          <input required value={form.candidateName} onChange={(e) => set('candidateName', e.target.value)} className="input" placeholder="مثلاً علی احمدی" />
        </Field>
        <Field label="سمت مورد ارزیابی">
          <input value={form.candidatePosition} onChange={(e) => set('candidatePosition', e.target.value)} className="input" />
        </Field>
        <Field label="سابقه کل کار (سال)">
          <input
            type="number"
            min={0}
            step={0.5}
            value={form.yearsExperienceTotal ?? ''}
            onChange={(e) => set('yearsExperienceTotal', e.target.value === '' ? null : Number(e.target.value))}
            className="input num"
          />
        </Field>
        <Field label="سابقه اجرای خط لوله (سال)">
          <input
            type="number"
            min={0}
            step={0.5}
            value={form.yearsExperiencePipeline ?? ''}
            onChange={(e) => set('yearsExperiencePipeline', e.target.value === '' ? null : Number(e.target.value))}
            className="input num"
          />
        </Field>
        <Field label="کارفرمای فعلی">
          <input value={form.currentEmployer} onChange={(e) => set('currentEmployer', e.target.value)} className="input" />
        </Field>
        <Field label="تاریخ مصاحبه">
          <input type="date" value={form.interviewDate} onChange={(e) => set('interviewDate', e.target.value)} className="input num" />
        </Field>
        <Field label="تحصیلات">
          <input value={form.education} onChange={(e) => set('education', e.target.value)} className="input" placeholder="مثلاً کارشناسی ارشد مهندسی عمران" />
        </Field>
        <Field label="گواهینامه‌ها">
          <input value={form.certifications} onChange={(e) => set('certifications', e.target.value)} className="input" placeholder="مثلاً PMP، ایمنی HSE" />
        </Field>
      </div>

      <Field label="پروژه‌های شاخص گذشته">
        <textarea
          value={form.notableProjects}
          onChange={(e) => set('notableProjects', e.target.value)}
          rows={3}
          className="input resize-none"
          placeholder="خلاصه‌ای از پروژه‌های خط لوله که مدیریت یا اجرا کرده‌اند…"
        />
      </Field>

      <button type="submit" className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-400 transition-colors">
        {submitLabel}
      </button>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-muted">{label}</span>
      {children}
    </label>
  )
}
