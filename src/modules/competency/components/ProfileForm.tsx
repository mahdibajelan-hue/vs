import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { CandidateProfileInput } from '../store/useCompetencyStore'
import type { CertificationEntry, EducationEntry, EmploymentEntry } from '../types'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'

const EMPTY: CandidateProfileInput = {
  candidateName: '',
  candidatePosition: 'مدیر پروژه احداث خط لوله انتقال گاز',
  candidateNationalId: '',
  candidatePhone: '',
  candidateEmail: '',
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

/** Candidate profile/background intake — filled in once, before the scored questions start. Can also be reused, in candidateMode, for the self-service link the candidate fills in themselves. */
export function ProfileForm({ initial, submitLabel, onSubmit, candidateMode }: ProfileFormProps) {
  const [form, setForm] = useState<CandidateProfileInput>(initial ?? EMPTY)

  const set = <K extends keyof CandidateProfileInput>(key: K, value: CandidateProfileInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!form.candidateName.trim()) return
        onSubmit(form)
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
        </div>
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
          <input value={e.year} onChange={(ev) => update(e.id, { year: ev.target.value })} className="input num" placeholder="سال فارغ‌التحصیلی" />
        </RowShell>
      ))}
    </RepeatableSection>
  )
}

function EmploymentSection({ value, onChange }: { value: EmploymentEntry[]; onChange: (v: EmploymentEntry[]) => void }) {
  const update = (id: string, patch: Partial<EmploymentEntry>) => onChange(value.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  return (
    <RepeatableSection
      title="سوابق شغلی و بیمه‌ای"
      onAdd={() => onChange([...value, { id: newId(), employer: '', position: '', startDate: '', endDate: '', insuranceMonths: null, note: '' }])}
    >
      {value.length === 0 && <p className="text-[11px] text-muted">سابقه‌ای ثبت نشده است.</p>}
      {value.map((e) => (
        <RowShell key={e.id} onRemove={() => onChange(value.filter((x) => x.id !== e.id))}>
          <input value={e.employer} onChange={(ev) => update(e.id, { employer: ev.target.value })} className="input" placeholder="کارفرما" />
          <input value={e.position} onChange={(ev) => update(e.id, { position: ev.target.value })} className="input" placeholder="سمت" />
          <DateField label="تاریخ شروع همکاری" value={e.startDate} onChange={(v) => update(e.id, { startDate: v })} />
          <DateField label="تاریخ قطع همکاری" value={e.endDate} onChange={(v) => update(e.id, { endDate: v })} />
          <input
            type="number"
            min={0}
            value={e.insuranceMonths ?? ''}
            onChange={(ev) => update(e.id, { insuranceMonths: ev.target.value === '' ? null : Number(ev.target.value) })}
            className="input num"
            placeholder="سابقه بیمه (ماه)"
          />
          <input value={e.note} onChange={(ev) => update(e.id, { note: ev.target.value })} className="input" placeholder="توضیح تکمیلی (اختیاری)" />
        </RowShell>
      ))}
    </RepeatableSection>
  )
}

function CertificationSection({ value, onChange }: { value: CertificationEntry[]; onChange: (v: CertificationEntry[]) => void }) {
  const update = (id: string, patch: Partial<CertificationEntry>) => onChange(value.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  return (
    <RepeatableSection
      title="دوره‌های حرفه‌ای و گواهینامه‌ها (مانند PMP)"
      onAdd={() => onChange([...value, { id: newId(), title: '', issuer: '', date: '', isPmp: false }])}
    >
      {value.length === 0 && <p className="text-[11px] text-muted">گواهینامه‌ای ثبت نشده است.</p>}
      {value.map((e) => (
        <RowShell key={e.id} onRemove={() => onChange(value.filter((x) => x.id !== e.id))}>
          <input value={e.title} onChange={(ev) => update(e.id, { title: ev.target.value })} className="input" placeholder="عنوان دوره/گواهینامه" />
          <input value={e.issuer} onChange={(ev) => update(e.id, { issuer: ev.target.value })} className="input" placeholder="مرجع صادرکننده" />
          <DateField label="تاریخ اخذ" value={e.date} onChange={(v) => update(e.id, { date: v })} />
          <label className="flex items-center gap-1.5 text-[11px] text-secondary">
            <input type="checkbox" checked={e.isPmp} onChange={(ev) => update(e.id, { isPmp: ev.target.checked })} className="h-3.5 w-3.5" />
            صلاحیت حرفه‌ای مدیریت پروژه (مانند PMP)
          </label>
        </RowShell>
      ))}
    </RepeatableSection>
  )
}
