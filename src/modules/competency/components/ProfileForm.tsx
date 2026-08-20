import { useState } from 'react'
import { Plus, ShieldCheck, Trash2 } from 'lucide-react'
import type { CandidateProfileInput } from '../store/useCompetencyStore'
import type { CertificationEntry, EducationEntry, EmploymentEntry } from '../types'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { RECOMMENDED_PM_COURSES } from '../lib/competencyModel'
import { computeAge, formatDurationFa, monthsBetween, monthsToYears, totalInsuranceMonths, totalMonths, totalPipelineMonths } from '../lib/profileCalc'

const EMPTY: CandidateProfileInput = {
  candidateName: '',
  candidatePosition: 'مدیر پروژه احداث خط لوله انتقال گاز',
  candidateNationalId: '',
  candidatePhone: '',
  candidateEmail: '',
  candidateBirthDate: '',
  candidateAge: null,
  hasDisability: false,
  disabilityNote: '',
  yearsExperienceTotal: null,
  yearsExperiencePipeline: null,
  currentEmployer: '',
  education: [],
  employmentHistory: [],
  certifications: [],
  notableProjects: '',
  interviewDate: new Date().toISOString().slice(0, 10),
}

function newId() {
  return crypto.randomUUID()
}

interface ProfileFormProps {
  initial?: CandidateProfileInput
  submitLabel: string
  onSubmit: (profile: CandidateProfileInput) => void
  /** Self-service mode hides interview-internal fields (position/interview date) that the candidate shouldn't set. */
  candidateMode?: boolean
}

/**
 * Candidate profile/background intake — filled in once, before the scored questions start. Can
 * also be reused, in candidateMode, for the self-service link the candidate fills in themselves.
 *
 * Age and every experience total are derived, never typed: age comes from the birth date, each
 * position's duration comes from its own start/end dates, and the two career totals are the sums
 * of those durations (pipeline-specific total only counting positions flagged as such) — computed
 * fresh at submit time so they can never drift from what's actually in the form.
 */
export function ProfileForm({ initial, submitLabel, onSubmit, candidateMode }: ProfileFormProps) {
  const [form, setForm] = useState<CandidateProfileInput>(initial ?? EMPTY)

  const set = <K extends keyof CandidateProfileInput>(key: K, value: CandidateProfileInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  const age = computeAge(form.candidateBirthDate)
  const totalExperienceMonths = totalMonths(form.employmentHistory)
  const pipelineMonths = totalPipelineMonths(form.employmentHistory)
  const insuranceMonths = totalInsuranceMonths(form.employmentHistory)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!form.candidateName.trim()) return
        onSubmit({
          ...form,
          candidateAge: age,
          yearsExperienceTotal: monthsToYears(totalExperienceMonths),
          yearsExperiencePipeline: monthsToYears(pipelineMonths),
        })
      }}
      className="glass-panel space-y-5 rounded-2xl p-5"
    >
      <section className="space-y-3">
        <p className="text-sm font-bold">مشخصات فردی</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="نام و نام خانوادگی *">
            <input required value={form.candidateName} onChange={(e) => set('candidateName', e.target.value)} className="input" placeholder="مثلاً علی احمدی" />
          </Field>
          <Field label="کد ملی">
            <input value={form.candidateNationalId} onChange={(e) => set('candidateNationalId', e.target.value)} className="input num" placeholder="۰۰۱۲۳۴۵۶۷۸" />
          </Field>
          <Field label="شماره تماس">
            <input value={form.candidatePhone} onChange={(e) => set('candidatePhone', e.target.value)} className="input num" dir="ltr" placeholder="09123456789" />
          </Field>
          <Field label="ایمیل (جهت ارسال نتیجه مصاحبه)">
            <input type="email" value={form.candidateEmail} onChange={(e) => set('candidateEmail', e.target.value)} className="input" dir="ltr" placeholder="name@example.com" />
          </Field>
          <Field label="تاریخ تولد">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <JalaliDateInput value={form.candidateBirthDate} onChange={(v) => set('candidateBirthDate', v)} />
              </div>
              <span className="num shrink-0 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-secondary">
                {age != null ? `${age.toLocaleString('fa-IR')} سال` : 'سن —'}
              </span>
            </div>
          </Field>
          {!candidateMode && (
            <>
              <Field label="سمت مورد ارزیابی">
                <input value={form.candidatePosition} onChange={(e) => set('candidatePosition', e.target.value)} className="input" />
              </Field>
              <Field label="تاریخ مصاحبه">
                <JalaliDateInput value={form.interviewDate} onChange={(v) => set('interviewDate', v)} />
              </Field>
            </>
          )}
          <Field label="کارفرمای فعلی">
            <input value={form.currentEmployer} onChange={(e) => set('currentEmployer', e.target.value)} className="input" />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-3">
          <SummaryStat label="کل سابقه اشتغال" value={formatDurationFa(totalExperienceMonths)} />
          <SummaryStat label="سابقه اجرای خط لوله" value={formatDurationFa(pipelineMonths)} />
          <SummaryStat label="کل سابقه بیمه" value={formatDurationFa(insuranceMonths)} />
        </div>
        <p className="text-[10px] leading-5 text-muted">
          سابقهٔ کل و سابقهٔ خط لوله از جمع دوره‌های ثبت‌شده در بخش «سوابق شغلی» زیر محاسبه می‌شود؛ هر موقعیتی که با تیک «احداث خط لوله» علامت بخورد در سابقهٔ
          خط لوله هم لحاظ می‌شود.
        </p>
        <label className="flex items-center gap-1.5 text-xs text-secondary">
          <input type="checkbox" checked={form.hasDisability} onChange={(e) => set('hasDisability', e.target.checked)} className="h-3.5 w-3.5" />
          دارای معلولیت جسمی است
        </label>
        {form.hasDisability && (
          <Field label="توضیح معلولیت (اختیاری)">
            <input value={form.disabilityNote} onChange={(e) => set('disabilityNote', e.target.value)} className="input" placeholder="نوع و میزان تاثیر بر انجام وظایف شغلی" />
          </Field>
        )}
      </section>

      <EducationSection value={form.education} onChange={(v) => set('education', v)} />
      <EmploymentSection value={form.employmentHistory} onChange={(v) => set('employmentHistory', v)} />
      <CertificationSection value={form.certifications} onChange={(v) => set('certifications', v)} />

      <Field label="پروژه‌های شاخص گذشته">
        <textarea
          value={form.notableProjects}
          onChange={(e) => set('notableProjects', e.target.value)}
          rows={3}
          className="input resize-none"
          placeholder="خلاصه‌ای از پروژه‌های خط لوله که مدیریت یا اجرا کرده‌اند…"
        />
      </Field>

      <button type="submit" className="rounded-xl bg-purple-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-purple-400 transition-colors">
        {submitLabel}
      </button>
    </form>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="num text-sm font-extrabold text-purple-300">{value}</p>
      <p className="mt-0.5 text-[10px] text-muted">{label}</p>
    </div>
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

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] text-muted">{label}</span>
      <JalaliDateInput value={value} onChange={onChange} />
    </label>
  )
}

function RepeatableSection({ title, onAdd, children }: { title: string; onAdd: () => void; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">{title}</p>
        <button type="button" onClick={onAdd} className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-secondary hover:bg-white/5">
          <Plus size={12} /> افزودن
        </button>
      </div>
      {children}
    </section>
  )
}

function RowShell({ onRemove, children }: { onRemove: () => void; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-white/10 p-3">
      <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>
      <button type="button" onClick={onRemove} className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-red-500/10 hover:text-red-300">
        <Trash2 size={13} />
      </button>
    </div>
  )
}

function EducationSection({ value, onChange }: { value: EducationEntry[]; onChange: (v: EducationEntry[]) => void }) {
  const update = (id: string, patch: Partial<EducationEntry>) => onChange(value.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  return (
    <RepeatableSection
      title="مدارک تحصیلی"
      onAdd={() => onChange([...value, { id: newId(), degree: '', field: '', institution: '', year: '' }])}
    >
      {value.length === 0 && <p className="text-[11px] text-muted">مدرکی ثبت نشده است.</p>}
      {value.map((e) => (
        <RowShell key={e.id} onRemove={() => onChange(value.filter((x) => x.id !== e.id))}>
          <input value={e.degree} onChange={(ev) => update(e.id, { degree: ev.target.value })} className="input" placeholder="مقطع (مثلاً کارشناسی ارشد)" />
          <input value={e.field} onChange={(ev) => update(e.id, { field: ev.target.value })} className="input" placeholder="رشته تحصیلی" />
          <input value={e.institution} onChange={(ev) => update(e.id, { institution: ev.target.value })} className="input" placeholder="دانشگاه/موسسه" />
          <input value={e.year} onChange={(ev) => update(e.id, { year: ev.target.value })} className="input num" placeholder="سال اخذ مدرک" />
        </RowShell>
      ))}
    </RepeatableSection>
  )
}

function EmploymentSection({ value, onChange }: { value: EmploymentEntry[]; onChange: (v: EmploymentEntry[]) => void }) {
  const update = (id: string, patch: Partial<EmploymentEntry>) => onChange(value.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  return (
    <RepeatableSection
      title="سوابق شغلی و بیمه‌ای (۱۰ سال اخیر)"
      onAdd={() => onChange([...value, { id: newId(), employer: '', position: '', startDate: '', endDate: '', insuranceMonths: null, isPipelineRole: false, note: '' }])}
    >
      {value.length === 0 && <p className="text-[11px] text-muted">سابقه‌ای ثبت نشده است.</p>}
      {value.map((e) => {
        const duration = monthsBetween(e.startDate, e.endDate)
        return (
          <div key={e.id} className="rounded-xl border border-white/10 p-3">
            <div className="flex items-start gap-2">
              <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                <input value={e.employer} onChange={(ev) => update(e.id, { employer: ev.target.value })} className="input" placeholder="کارفرما" />
                <input value={e.position} onChange={(ev) => update(e.id, { position: ev.target.value })} className="input" placeholder="سمت" />
                <DateField label="تاریخ شروع همکاری" value={e.startDate} onChange={(v) => update(e.id, { startDate: v })} />
                <DateField label="تاریخ قطع همکاری (خالی = هم‌اکنون)" value={e.endDate} onChange={(v) => update(e.id, { endDate: v })} />
                <input
                  type="number"
                  min={0}
                  value={e.insuranceMonths ?? ''}
                  onChange={(ev) => update(e.id, { insuranceMonths: ev.target.value === '' ? null : Number(ev.target.value) })}
                  className="input num"
                  placeholder="سابقه بیمه (ماه)"
                />
                <input value={e.note} onChange={(ev) => update(e.id, { note: ev.target.value })} className="input" placeholder="توضیح تکمیلی (اختیاری)" />
              </div>
              <button type="button" onClick={() => onChange(value.filter((x) => x.id !== e.id))} className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-red-500/10 hover:text-red-300">
                <Trash2 size={13} />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-[11px] text-secondary">
                <input type="checkbox" checked={e.isPipelineRole} onChange={(ev) => update(e.id, { isPipelineRole: ev.target.checked })} className="h-3.5 w-3.5" />
                این سمت به‌طور اختصاصی احداث خط لوله بوده است
              </label>
              <span className="num text-[11px] text-purple-300">مدت این سمت: {formatDurationFa(duration)}</span>
            </div>
          </div>
        )
      })}
    </RepeatableSection>
  )
}

function CertificationSection({ value, onChange }: { value: CertificationEntry[]; onChange: (v: CertificationEntry[]) => void }) {
  const update = (id: string, patch: Partial<CertificationEntry>) => onChange(value.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  const recommendedCount = value.filter((e) => RECOMMENDED_PM_COURSES.includes(e.title.trim())).length
  return (
    <RepeatableSection
      title="دوره‌های حرفه‌ای و گواهینامه‌ها (مانند PMP)"
      onAdd={() => onChange([...value, { id: newId(), title: '', issuer: '', date: '', isPmp: false }])}
    >
      <p className="text-[10.5px] leading-5 text-muted">
        هنگام تایپ عنوان، دوره‌های مهم مدیریت پروژه توصیه‌شده پیشنهاد داده می‌شود؛ گذراندن آن‌ها با
        <ShieldCheck size={11} className="mx-0.5 inline text-emerald-300" />
        علامت‌گذاری می‌شود.
        {recommendedCount > 0 && (
          <span className="text-emerald-300"> ({recommendedCount.toLocaleString('fa-IR')} از {RECOMMENDED_PM_COURSES.length.toLocaleString('fa-IR')} دوره توصیه‌شده گذرانده‌شده)</span>
        )}
      </p>
      <datalist id="comp-recommended-courses">
        {RECOMMENDED_PM_COURSES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {value.length === 0 && <p className="text-[11px] text-muted">گواهینامه‌ای ثبت نشده است.</p>}
      {value.map((e) => {
        const isRecommended = RECOMMENDED_PM_COURSES.includes(e.title.trim())
        return (
          <RowShell key={e.id} onRemove={() => onChange(value.filter((x) => x.id !== e.id))}>
            <label className="relative block">
              <input
                value={e.title}
                onChange={(ev) => {
                  const title = ev.target.value
                  // Every course on the recommended list counts as a professional qualification —
                  // scheduling/Primavera included, not just the literally-named PMP entry — so
                  // picking one from the list marks it automatically instead of requiring a second,
                  // easy-to-forget manual tick.
                  update(e.id, { title, isPmp: RECOMMENDED_PM_COURSES.includes(title.trim()) ? true : e.isPmp })
                }}
                className="input pl-7"
                placeholder="عنوان دوره/گواهینامه"
                list="comp-recommended-courses"
              />
              {isRecommended && <ShieldCheck size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-emerald-300" />}
            </label>
            <input value={e.issuer} onChange={(ev) => update(e.id, { issuer: ev.target.value })} className="input" placeholder="مرجع صادرکننده" />
            <DateField label="تاریخ اخذ" value={e.date} onChange={(v) => update(e.id, { date: v })} />
            <label className="flex items-center gap-1.5 text-[11px] text-secondary">
              <input type="checkbox" checked={e.isPmp} onChange={(ev) => update(e.id, { isPmp: ev.target.checked })} className="h-3.5 w-3.5" />
              صلاحیت حرفه‌ای مدیریت پروژه (مانند PMP)
            </label>
          </RowShell>
        )
      })}
    </RepeatableSection>
  )
}
