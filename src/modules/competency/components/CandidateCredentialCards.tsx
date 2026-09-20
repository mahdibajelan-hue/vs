import { Award, Building2, Calendar, GraduationCap, ShieldCheck } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { formatDurationFa, monthsBetween } from '../lib/profileCalc'
import type { CertificationEntry, EducationEntry, EmploymentEntry } from '../types'

/** Modern, icon-led credential cards for the read-only "مشخصات و سوابق نامزد" view — replaces the
 * old plain bullet lists for education/employment/certifications with something a lead can scan at
 * a glance rather than read line by line. */

export function EducationCards({ value }: { value: EducationEntry[] }) {
  if (value.length === 0) return null
  return (
    <CredentialSection title="مدارک تحصیلی" icon={GraduationCap}>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {value.map((e) => (
          <div key={e.id} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-gradient-to-br from-purple-500/[0.07] to-transparent p-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 text-purple-300">
              <GraduationCap size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold">{e.degree || '—'}</p>
              <p className="truncate text-[11px] text-secondary">{e.field}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {e.institution && <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted">{e.institution}</span>}
                {e.year && <span className="num rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted">{e.year}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </CredentialSection>
  )
}

export function EmploymentCards({ value }: { value: EmploymentEntry[] }) {
  if (value.length === 0) return null
  return (
    <CredentialSection title="سوابق شغلی و بیمه‌ای" icon={Building2}>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {value.map((e) => {
          const duration = monthsBetween(e.startDate, e.endDate)
          return (
            <div key={e.id} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/[0.07] to-transparent p-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
                <Building2 size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold">{e.employer || '—'}</p>
                <p className="truncate text-[11px] text-secondary">{e.position}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted">
                    <Calendar size={10} /> {formatJalali(e.startDate) || '—'} تا {formatJalali(e.endDate) || 'اکنون'}
                  </span>
                  <span className="num rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted">{formatDurationFa(duration)}</span>
                  {e.isPipelineRole && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">احداث خط لوله</span>}
                  {e.insuranceMonths != null && <span className="num rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted">{e.insuranceMonths.toLocaleString('fa-IR')} ماه بیمه</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </CredentialSection>
  )
}

export function CertificationCards({ value }: { value: CertificationEntry[] }) {
  if (value.length === 0) return null
  return (
    <CredentialSection title="دوره‌های حرفه‌ای و گواهینامه‌ها" icon={Award}>
      <div className="flex flex-wrap gap-2.5">
        {value.map((e) => (
          <div key={e.id} className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-gradient-to-br from-amber-500/[0.08] to-transparent px-3.5 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">
              {e.isPmp ? <ShieldCheck size={15} /> : <Award size={15} />}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-bold">{e.title || '—'}</p>
              <p className="truncate text-[10.5px] text-muted">
                {e.issuer}
                {e.date && ` — ${e.date}`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </CredentialSection>
  )
}

function CredentialSection({ title, icon: Icon, children }: { title: string; icon: typeof GraduationCap; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-muted">
        <Icon size={13} /> {title}
      </p>
      {children}
    </div>
  )
}
