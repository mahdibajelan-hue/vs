import type { ReactNode } from 'react'
import {
  AlertTriangle,
  BookOpen,
  Briefcase,
  Building2,
  CheckCircle2,
  Circle,
  ClipboardList,
  Crown,
  GraduationCap,
  Hourglass,
  Quote,
  Sparkles,
  Target,
  Users,
} from 'lucide-react'
import { formatJalali } from '../../../../lib/jalali'
import { tierColor } from '../../lib/competencyModel'
import { fa, type InterviewSummaryRow, type ResultsModel } from '../../lib/resultsModel'
import type { CompetencyAssessment } from '../../types'
import { tone } from '../../lib/tone'


export function SectionHeading({ id, icon: Icon, color, title, subtitle }: { id?: string; icon: typeof Target; color: string; title: string; subtitle?: string }) {
  return (
    <div id={id} className="flex scroll-mt-20 items-center gap-2.5 pt-2" style={tone(color)}>
      <span className="fx-tone-bg-strong fx-tone-text flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
        <Icon size={17} />
      </span>
      <div className="min-w-0">
        <h2 className="text-[15px] font-extrabold leading-6">{title}</h2>
        {subtitle && <p className="fx-muted text-[11px] leading-5">{subtitle}</p>}
      </div>
      <div className="fx-tone-bg-strong h-px flex-1" />
    </div>
  )
}

export function EmptyNote({ children = 'هنوز داده‌ای ثبت نشده' }: { children?: ReactNode }) {
  return (
    <div className="fx-sub fx-muted flex items-center gap-2 border-dashed px-3.5 py-3 text-[11.5px]">
      <Hourglass size={14} className="shrink-0" /> {children}
    </div>
  )
}

export function ScoreRing({ model }: { model: ResultsModel }) {
  const { overall, status, completion } = model
  const pending = status.state !== 'final'
  const color = pending ? '#94a3b8' : tierColor(overall)
  const deg = (overall ?? 0) * 3.6
  return (
    <div className="fx-card flex flex-col items-center justify-center gap-2 p-5">
      <div
        className="flex h-32 w-32 shrink-0 items-center justify-center rounded-full"
        role="img"
        aria-label={overall != null ? `امتیاز کلی ${overall} از ۱۰۰${pending ? ' (موقت)' : ''}` : 'بدون امتیاز'}
        style={{ background: `conic-gradient(${color} ${deg}deg, var(--fx-track) 0deg)` }}
      >
        <div className="flex h-[104px] w-[104px] flex-col items-center justify-center rounded-full" style={{ background: 'var(--fx-ring-hole)' }}>
          <p className="num text-3xl font-black leading-none" style={tone(color)}>
            <span className="fx-tone-text">{overall != null ? fa(overall) : '—'}</span>
          </p>
          <p className="fx-muted mt-1 text-[10.5px]">{overall == null ? 'بدون امتیاز' : pending ? 'امتیاز موقت' : 'از ۱۰۰'}</p>
        </div>
      </div>
      <p className="fx-muted num text-center text-[11px]">
        {fa(completion.answered)} از {fa(completion.total)} سؤال فنی امتیازدهی‌شده
      </p>
      <div className="fx-track h-1.5 w-full overflow-hidden rounded-full">
        <div className="h-full rounded-full" style={{ width: `${completion.percent}%`, background: completion.percent >= 60 ? '#34d399' : '#f59e0b' }} />
      </div>
    </div>
  )
}

export function StatusCard({ model, roleLabel, children }: { model: ResultsModel; roleLabel: string; children?: ReactNode }) {
  const { status } = model
  const Icon = status.state === 'final' ? (status.recommendation?.grade === 'D' ? AlertTriangle : CheckCircle2) : Hourglass
  return (
    <div className="fx-card fx-tone-border flex flex-col justify-between gap-3 border p-4" style={tone(status.color)}>
      <div>
        <p className="fx-muted mb-1.5 text-[11px] font-bold">وضعیت نتیجه — {roleLabel}</p>
        <p className="fx-tone-bg fx-tone-text inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13.5px] font-extrabold">
          <Icon size={15} /> {status.label}
        </p>
        <p className="fx-text-2 mt-2 text-[11.5px] leading-6">{status.detail}</p>
      </div>
      {children}
    </div>
  )
}

export function ProfileSummary({ assessment: a }: { assessment: CompetencyAssessment }) {
  const facts: [string, string][] = [
    ['سابقه کل کار', a.yearsExperienceTotal != null ? `${fa(a.yearsExperienceTotal, 1)} سال` : '—'],
    ['سابقه خط لوله', a.yearsExperiencePipeline != null ? `${fa(a.yearsExperiencePipeline, 1)} سال` : '—'],
    ['کارفرمای فعلی', a.currentEmployer || '—'],
    ['سن', a.candidateAge != null ? `${fa(a.candidateAge)} سال` : '—'],
  ]
  const empty = a.education.length === 0 && a.employmentHistory.length === 0 && a.certifications.length === 0 && !a.yearsExperienceTotal
  return (
    <div className="fx-card space-y-3 p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {facts.map(([l, v]) => (
          <div key={l} className="fx-sub px-3 py-2">
            <p className="fx-muted text-[10.5px]">{l}</p>
            <p className="num truncate text-[12.5px] font-bold">{v}</p>
          </div>
        ))}
      </div>
      {empty ? (
        <EmptyNote>متقاضی هنوز سوابق تحصیلی، شغلی یا گواهینامه‌ای ثبت نکرده است.</EmptyNote>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <ProfileList icon={GraduationCap} color="#38bdf8" title="تحصیلات" items={a.education.map((e) => ({ k: e.id, main: `${e.degree || '—'}${e.field ? ` — ${e.field}` : ''}`, sub: [e.institution, e.year].filter(Boolean).join('، ') }))} />
          <ProfileList
            icon={Building2}
            color="#a855f7"
            title="سوابق شغلی"
            items={a.employmentHistory.slice(0, 5).map((e) => ({
              k: e.id,
              main: `${e.position || '—'} — ${e.employer || '—'}`,
              sub: e.startDate ? `از ${formatJalali(e.startDate)}${e.endDate ? ` تا ${formatJalali(e.endDate)}` : ' تاکنون'}` : '',
            }))}
          />
          <ProfileList icon={BookOpen} color="#f59e0b" title="گواهینامه‌ها و دوره‌ها" items={a.certifications.map((c) => ({ k: c.id, main: c.title, sub: c.issuer }))} />
        </div>
      )}
    </div>
  )
}

function ProfileList({ icon: Icon, color, title, items }: { icon: typeof Target; color: string; title: string; items: { k: string; main: string; sub: string }[] }) {
  return (
    <div className="fx-sub p-3" style={tone(color)}>
      <p className="fx-tone-text mb-2 flex items-center gap-1.5 text-[11.5px] font-bold">
        <Icon size={13} /> {title}
      </p>
      {items.length === 0 ? (
        <p className="fx-muted text-[11px]">ثبت نشده</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((i) => (
            <li key={i.k} className="text-[11.5px] leading-5">
              <span className="font-bold">{i.main}</span>
              {i.sub && <span className="fx-muted block text-[10.5px]">{i.sub}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ExamDesignCard({ model, assessment: a }: { model: ResultsModel; assessment: CompetencyAssessment }) {
  const colors: Record<string, string> = { technical: '#a855f7', personality: '#ec4899', interview: '#0ea5e9', experience: '#f59e0b' }
  return (
    <div className="fx-card space-y-3 p-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {model.methods.map((m) => (
          <div key={m.key} className={`fx-sub flex items-center gap-2 px-3 py-2.5 ${m.enabled ? '' : 'opacity-60'}`} style={tone(colors[m.key])}>
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${m.enabled ? 'fx-tone-bg-strong fx-tone-text' : 'fx-muted'}`}>
              {m.enabled ? <CheckCircle2 size={14} /> : <Circle size={14} />}
            </span>
            <div className="min-w-0">
              <p className="text-[11.5px] font-bold leading-5">{m.label}</p>
              <p className="fx-muted text-[10px]">{m.enabled ? 'در طرح ارزیابی' : 'در طرح نیست'}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="fx-text-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
        <span>
          مدل امتیازدهی: <b>{model.isPM ? 'روبریک ثابت مدیر پروژه (۸ حوزه)' : 'بانک سؤال شغل (۴ دسته وزنی)'}</b>
        </span>
        <span className="num">
          سؤالات فنی: <b>{fa(model.completion.total)}</b>
        </span>
        <span className="num">
          پنل داوری: <b>{fa(model.panel.length)}</b> از {fa(a.panelSize)} نفر
        </span>
        <span className="num">
          مدت هدف: <b>{a.durationMinutes ? `${fa(a.durationMinutes)} دقیقه` : 'بدون محدودیت'}</b>
        </span>
        {a.interviewDate && (
          <span className="num">
            تاریخ مصاحبه: <b>{formatJalali(a.interviewDate)}</b>
          </span>
        )}
      </div>
    </div>
  )
}

export function InterpretationCard({ model, roleLabel, paragraphs }: { model: ResultsModel; roleLabel: string; paragraphs: string[] }) {
  const i = model.interpretation
  const pending = i.source === 'pending'
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.1fr_1fr]">
      <div className="fx-card fx-tone-wash p-4" style={tone(pending ? '#94a3b8' : '#a855f7')}>
        <p className="mb-2 flex items-center gap-1.5 text-[13px] font-extrabold">
          <Sparkles size={15} className="fx-tone-text" /> تفسیر بلوغ و توصیه استفاده
        </p>
        <p className="fx-tone-bg fx-tone-text mb-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold">
          سطح بلوغ: {i.bandLabel} · {roleLabel}
        </p>
        <p className="fx-text-2 text-[12px] leading-7">{i.guidance}</p>
        {!pending && (
          <p className="fx-tone-bg mt-2 rounded-xl p-2.5 text-[12px] leading-6">
            <b className="fx-tone-text">سمت‌های شغلی پیشنهادی: </b>
            {i.suggestedPositions}
          </p>
        )}
        {i.focusAreas.length > 0 && (
          <p className="mt-2 text-[11.5px] leading-6" style={tone('#f59e0b')}>
            <b className="fx-tone-text">اولویت‌های توسعه این متقاضی: </b>
            <span className="fx-text-2">{i.focusAreas.join('، ')}</span>
          </p>
        )}
        {model.status.recommendation?.hasCriticalGap && (
          <p className="mt-2 text-[11.5px] leading-6" style={tone('#ef4444')}>
            <span className="fx-tone-text">{model.status.recommendation.reason}</span>
          </p>
        )}
        {i.source === 'template' && <p className="fx-muted mt-2 text-[10px]">متن پیش‌فرض خانواده شغلی — قابل ویرایش توسط ادمین ماژول (جدول تفسیر بلوغ نقش‌ها).</p>}
      </div>
      <div className="fx-card p-4" style={tone('#0ea5e9')}>
        <p className="mb-2 flex items-center gap-1.5 text-[13px] font-extrabold">
          <ClipboardList size={15} className="fx-tone-text" /> تحلیل الگوی پاسخ‌ها
        </p>
        <div className="space-y-2">
          {paragraphs.map((p, idx) => (
            <p key={idx} className="fx-text-2 text-[11.5px] leading-7">
              {p}
            </p>
          ))}
        </div>
        <p className="fx-muted mt-2 text-[10px]">این تحلیل صرفاً از الگوی امتیازات ثبت‌شده در همین ارزیابی ساخته شده و جایگزین قضاوت حرفه‌ای ارزیاب نیست.</p>
      </div>
    </div>
  )
}

export function PanelBreakdown({ model }: { model: ResultsModel }) {
  if (model.panel.length === 0) return <EmptyNote>هنوز داوری برای این متقاضی ثبت نشده است.</EmptyNote>
  const comments = model.panel.filter((p) => p.strengths || p.developmentAreas)
  return (
    <div className="fx-card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[13px] font-extrabold">
          <Users size={15} style={{ color: '#38bdf8' }} /> امتیاز به تفکیک داوران
        </p>
        <span className="num text-[11.5px]">
          <span className="fx-muted">میانگین داوران ثبت‌نهایی‌کرده: </span>
          <b>{model.panelAverage != null ? `٪${fa(model.panelAverage)}` : '—'}</b>
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--fx-border)' }}>
        <table className="w-full min-w-[520px] text-[11.5px]">
          <thead>
            <tr style={{ background: 'var(--fx-surface-2)' }} className="fx-muted">
              <th className="p-2.5 text-right font-bold">داور</th>
              {model.domainScores.map((d) => (
                <th key={d.domain.key} className="p-2.5 text-center font-bold">
                  {d.domain.shortTitle}
                </th>
              ))}
              <th className="p-2.5 text-center font-bold">کل</th>
              <th className="p-2.5 text-center font-bold">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {model.panel.map((p) => (
              <tr key={p.userId} className="border-t" style={{ borderColor: 'var(--fx-border)' }}>
                <td className="p-2.5 font-bold">
                  <span className="flex items-center gap-1.5">
                    {p.isLead && <Crown size={12} style={{ color: '#f59e0b' }} aria-label="سرداور" />}
                    {p.name}
                  </span>
                </td>
                {p.domainPercents.map((v, i) => (
                  <td key={i} className="num p-2.5 text-center" style={tone(tierColor(v))}>
                    <span className={v != null ? 'fx-tone-text font-bold' : 'fx-muted'}>{v != null ? fa(v) : '—'}</span>
                  </td>
                ))}
                <td className="num p-2.5 text-center" style={tone(tierColor(p.overallPercent))}>
                  <span className="fx-tone-text font-extrabold">{p.overallPercent != null ? `٪${fa(p.overallPercent)}` : '—'}</span>
                </td>
                <td className="p-2.5 text-center text-[10.5px]" style={tone(p.submitted ? '#10b981' : '#f59e0b')}>
                  <span className="fx-tone-bg fx-tone-text rounded-full px-2 py-0.5 font-bold">{p.submitted ? 'ثبت نهایی' : 'ثبت نهایی نشده'}</span>
                </td>
              </tr>
            ))}
            <tr className="border-t" style={{ borderColor: 'var(--fx-border-strong)', background: 'var(--fx-surface-2)' }}>
              <td className="p-2.5 font-extrabold">امتیاز رسمی (میانگین پنل)</td>
              {model.domainScores.map((d) => (
                <td key={d.domain.key} className="num p-2.5 text-center font-extrabold">
                  {d.percentScore != null ? fa(d.percentScore) : '—'}
                </td>
              ))}
              <td className="num p-2.5 text-center font-black">{model.overall != null ? `٪${fa(model.overall)}` : '—'}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {comments.length > 0 && (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {comments.map((p) => (
            <div key={p.userId} className="fx-sub space-y-1.5 p-3">
              <p className="flex items-center gap-1.5 text-[11.5px] font-bold">
                <Quote size={12} className="fx-muted" /> {p.name}
              </p>
              {p.strengths && (
                <p className="text-[11px] leading-6" style={tone('#10b981')}>
                  <b className="fx-tone-text">نقاط قوت: </b>
                  <span className="fx-text-2">{p.strengths}</span>
                </p>
              )}
              {p.developmentAreas && (
                <p className="text-[11px] leading-6" style={tone('#f59e0b')}>
                  <b className="fx-tone-text">قابل بهبود: </b>
                  <span className="fx-text-2">{p.developmentAreas}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {model.capstone.score != null && (
        <div className="fx-sub p-3" style={tone('#f59e0b')}>
          <p className="flex items-center gap-1.5 text-[12px] font-bold">
            <AlertTriangle size={13} className="fx-tone-text" /> سناریوی پایانی (بحران چندوجهی):{' '}
            <span className="num fx-tone-text">{fa(model.capstone.score, 1)} / ۵</span>
          </p>
          {model.capstone.note && <p className="fx-text-2 mt-1 text-[11px] leading-6">{model.capstone.note}</p>}
        </div>
      )}
    </div>
  )
}

export function InterviewResults({ rows, inDesign }: { rows: InterviewSummaryRow[]; inDesign: boolean }) {
  if (!inDesign && rows.length === 0) return <EmptyNote>مصاحبه ساختاریافته در طرح ارزیابی این متقاضی قرار ندارد.</EmptyNote>
  if (rows.every((r) => r.ratings.length === 0)) return <EmptyNote>هنوز امتیازی برای مصاحبه ساختاریافته ثبت نشده است.</EmptyNote>
  return (
    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
      {rows.map((r) => {
        const pct = r.average != null ? ((r.average - 1) / 4) * 100 : null
        const color = tierColor(pct)
        return (
          <div key={r.competencyId} className="fx-card fx-accent-bar p-3.5" style={tone(color)}>
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <p className="text-[12.5px] font-bold leading-6">
                {r.labelFa}
                {r.isCritical && (
                  <span className="mr-1.5 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold" style={tone('#ef4444')}>
                    <span className="fx-tone-text">حیاتی</span>
                  </span>
                )}
              </p>
              <span className="num fx-tone-bg fx-tone-text shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-extrabold">{r.average != null ? `${fa(r.average, 1)} / ۵` : '—'}</span>
            </div>
            <p className="fx-muted num mb-2 text-[10.5px]">
              سطح مورد نیاز: {fa(r.requiredLevel)}
              {r.requiredLabel ? ` (${r.requiredLabel})` : ''} · {fa(r.ratings.length)} داور
            </p>
            {r.ratings.length === 0 ? (
              <p className="fx-muted text-[11px]">هنوز امتیاز نگرفته</p>
            ) : (
              <ul className="space-y-1">
                {r.ratings.map((x, idx) => (
                  <li key={idx} className="text-[11px] leading-5">
                    <span className="font-bold">{x.raterName}</span> <span className="num fx-tone-text font-bold">{fa(x.rating)}</span>
                    {x.notes && <span className="fx-text-2"> — {x.notes}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function KeyProjects({ assessment }: { assessment: CompetencyAssessment }) {
  const projects = assessment.employmentHistory.slice(0, 3)
  return (
    <div className="fx-card p-4">
      <p className="mb-3 flex items-center gap-1.5 text-[13px] font-extrabold">
        <Briefcase size={14} style={{ color: '#a855f7' }} /> سوابق کلیدی پروژه‌ها
      </p>
      {projects.length === 0 ? (
        <EmptyNote>سابقه کاری ثبت‌شده‌ای موجود نیست.</EmptyNote>
      ) : (
        <div className="space-y-2">
          {projects.map((p) => (
            <div key={p.id} className="fx-sub flex items-center gap-2.5 p-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={tone('#a855f7')}>
                <Building2 size={14} className="fx-tone-text" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11.5px] font-bold">{p.employer || '—'}</p>
                <p className="fx-muted truncate text-[10.5px]">
                  {p.position} {p.startDate && `— از ${formatJalali(p.startDate)}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function SectionNav({ items }: { items: { id: string; label: string; color: string }[] }) {
  return (
    <nav aria-label="بخش‌های گزارش" className="no-print -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {items.map((i) => (
        <a
          key={i.id}
          href={`#${i.id}`}
          onClick={(e) => {
            e.preventDefault()
            document.getElementById(i.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
          className="fx-sub flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap px-3 text-[11px] font-bold transition-colors hover:brightness-110"
          style={tone(i.color)}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: i.color }} />
          {i.label}
        </a>
      ))}
    </nav>
  )
}

