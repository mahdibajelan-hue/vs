import { Award, Building2, GraduationCap, ShieldCheck } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { formatDurationFa, monthsBetween } from '../lib/profileCalc'
import type { CertificationEntry, EducationEntry, EmploymentEntry } from '../types'

/** Compact, color-coded credential cards for the read-only "مشخصات و سوابق نامزد" view — one dense
 * card per category (not one card per entry) so education/employment/certifications each stay
 * scannable in a single glance without eating much vertical space. */

export function EducationCards({ value }: { value: EducationEntry[] }) {
  if (value.length === 0) return null
  return (
    <CategoryCard title="مدارک تحصیلی" icon={GraduationCap} accent="#a855f7" count={value.length}>
      {value.map((e) => (
        <li key={e.id} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className="font-bold">{e.degree || '—'}</span>
          {e.field && <span className="text-secondary">— {e.field}</span>}
          {e.institution && <span className="text-muted">({e.institution})</span>}
          {e.year && (
            <span className="num mr-auto rounded-full bg-white/5 px-1.5 py-0.5 text-[9.5px] text-muted">
              {e.year}
            </span>
          )}
        </li>
      ))}
    </CategoryCard>
  )
}

export function EmploymentCards({ value }: { value: EmploymentEntry[] }) {
  if (value.length === 0) return null
  return (
    <CategoryCard title="سوابق شغلی و بیمه‌ای" icon={Building2} accent="#38bdf8" count={value.length}>
      {value.map((e) => {
        const duration = monthsBetween(e.startDate, e.endDate)
        return (
          <li key={e.id} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span className="font-bold">{e.employer || '—'}</span>
            {e.position && <span className="text-secondary">— {e.position}</span>}
            <span className="num text-muted">
              ({formatJalali(e.startDate) || '—'} تا {formatJalali(e.endDate) || 'اکنون'} — {formatDurationFa(duration)})
            </span>
            {e.isPipelineRole && <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-300">خط لوله</span>}
          </li>
        )
      })}
    </CategoryCard>
  )
}

export function CertificationCards({ value }: { value: CertificationEntry[] }) {
  if (value.length === 0) return null
  return (
    <CategoryCard title="دوره‌های حرفه‌ای و گواهینامه‌ها" icon={Award} accent="#f59e0b" count={value.length}>
      {value.map((e) => (
        <li key={e.id} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          {e.isPmp ? <ShieldCheck size={11} className="shrink-0 text-amber-300" /> : <Award size={11} className="shrink-0 text-amber-300" />}
          <span className="font-bold">{e.title || '—'}</span>
          {e.issuer && <span className="text-muted">— {e.issuer}</span>}
          {e.date && <span className="num text-muted">({e.date})</span>}
        </li>
      ))}
    </CategoryCard>
  )
}

function CategoryCard({
  title,
  icon: Icon,
  accent,
  count,
  children,
}: {
  title: string
  icon: typeof GraduationCap
  accent: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border p-2.5" style={{ borderColor: `${accent}35`, background: `linear-gradient(135deg, ${accent}12, transparent 65%)` }}>
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold" style={{ color: accent }}>
        <Icon size={12} /> {title}
        <span className="num rounded-full bg-white/5 px-1.5 py-0.5 text-[9.5px] text-muted">{count.toLocaleString('fa-IR')}</span>
      </p>
      <ul className="space-y-1 text-[11px] leading-5">{children}</ul>
    </div>
  )
}
