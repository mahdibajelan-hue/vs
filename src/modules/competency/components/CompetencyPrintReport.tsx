import type { CSSProperties, ReactNode } from 'react'
import { formatJalali as formatJalaliDate } from '../../../lib/jalali'
import { formatLevel, GAP_CONFIDENCE_META, GAP_STATUS_META, sortGapRows, type GapRow } from '../lib/competencyGap'
import { ACTION_STATUS_META, ACTION_TYPE_LABEL_FA, PLAN_STATUS_META, PRIORITY_META, planProgress } from '../lib/developmentPlan'
import { fa, type InterviewSummaryRow, type ResultsModel } from '../lib/resultsModel'
import { REPORT_WIDTH_PX } from '../lib/reportExport'
import { scoreBandFa, type FingerprintSnapshot } from '../../personality/lib/fingerprintModel'
import { PERSONALITY_VALIDITY_STATUS_LABEL_FA } from '../../personality/types'
import type { CompDevelopmentAction, CompDevelopmentPlan, CompReassessmentComparison, CompetencyAssessment, DomainScore } from '../types'

/**
 * «گزارش کامل» — the light, print/PDF rendering of a candidate's complete result (A4, RTL).
 *
 * Kept separate from ResultsStage's themed on-screen view (same convention as the Finance
 * module's ExecutiveReportPrint): this markup is cloned into a blank print iframe and rasterized
 * section by section for the PDF (lib/reportExport.ts), where the app's CSS variables don't exist,
 * so every color here is a literal. Each top-level section is a [data-pdf-block] so pages only
 * break between sections. No store access by design — ResultsStage resolves everything and passes
 * it in, so the PDF can never disagree with the page.
 */

/** Accepts a date or a full timestamp (formatJalali itself only parses YYYY-MM-DD). */
const formatJalali = (iso: string | null | undefined) => (iso ? formatJalaliDate(iso.slice(0, 10)) : '')

const INK = '#0f172a'
const SUB = '#475569'
const MUTED = '#94a3b8'
const LINE = '#e2e8f0'
const SOFT = '#f8fafc'
const ACCENT = '#6d28d9'
const GOLD = '#a16207'

const PRINT_TONE: Record<string, string> = {
  good: '#15803d',
  info: '#0369a1',
  warn: '#b45309',
  bad: '#b91c1c',
}

function toneForPercent(p: number | null): string {
  if (p == null) return MUTED
  if (p >= 80) return PRINT_TONE.good
  if (p >= 60) return ACCENT
  if (p >= 40) return PRINT_TONE.warn
  return PRINT_TONE.bad
}

/** Darkens a bright UI hue for print on white. */
function inkTone(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const mix = (c: number) => Math.round(c * 0.62)
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`
}

// ---------------------------------------------------------------- building blocks
function Section({ n, title, children, breakable, style }: { n: number; title: string; children: ReactNode; breakable?: boolean; style?: CSSProperties }) {
  return (
    <section data-pdf-block="" {...(breakable ? { 'data-pdf-breakable': '' } : {})} style={{ padding: '10px 6px 12px', ...style }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            display: 'inline-flex',
            width: 20,
            height: 20,
            borderRadius: 6,
            background: ACCENT,
            color: '#fff',
            fontSize: 10.5,
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
          }}
        >
          {fa(n)}
        </span>
        {title}
        <span style={{ flex: 1, height: 1, background: LINE }} />
      </h2>
      {children}
    </section>
  )
}

function Empty({ children = 'هنوز داده‌ای ثبت نشده' }: { children?: ReactNode }) {
  return <p style={{ margin: 0, fontSize: 10, color: MUTED, border: `1px dashed ${LINE}`, borderRadius: 8, padding: '8px 10px' }}>{children}</p>
}

function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18 }}>
      {rows.map(([l, v]) => (
        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3.5px 0', fontSize: 10.5, borderBottom: `1px solid ${LINE}` }}>
          <span style={{ color: SUB }}>{l}</span>
          <span style={{ fontWeight: 700, textAlign: 'left' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

function Bar({ value, color, marker, height = 7 }: { value: number | null; color: string; marker?: number | null; height?: number }) {
  const pct = Math.max(0, Math.min(100, value ?? 0))
  return (
    <div style={{ position: 'relative', flex: 1, height, borderRadius: 5, background: '#eef2f7', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: `${pct}%`, background: color, borderRadius: 5 }} />
      {marker != null && <div style={{ position: 'absolute', top: -1, bottom: -1, width: 2, background: INK, right: `${marker}%` }} />}
    </div>
  )
}

const th: CSSProperties = { padding: '5px 6px', textAlign: 'right', fontWeight: 700, borderBottom: `1px solid ${LINE}`, color: SUB, background: SOFT, fontSize: 9.5 }
const td: CSSProperties = { padding: '4px 6px', borderBottom: `1px solid ${LINE}`, fontSize: 9.5, verticalAlign: 'top' }

/** Static SVG radar (no animation/measurement, so html2canvas and print capture it complete). */
function PrintRadar({ labels, values, color = ACCENT, size = 300 }: { labels: string[]; values: (number | null)[]; color?: string; size?: number }) {
  const width = size + 150
  const height = size
  const cx = width / 2
  const cy = height / 2
  const radius = size * 0.3
  const n = Math.max(3, labels.length)
  const pointAt = (i: number, pct: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
    const r = (radius * pct) / 100
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} direction="ltr" style={{ display: 'block', margin: '0 auto', direction: 'ltr' }}>
      {[25, 50, 75, 100].map((ring) => (
        <polygon key={ring} points={labels.map((_, i) => pointAt(i, ring).join(',')).join(' ')} fill="none" stroke={LINE} strokeWidth={1} />
      ))}
      {labels.map((_, i) => {
        const [x, y] = pointAt(i, 100)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={LINE} strokeWidth={1} />
      })}
      <polygon points={values.map((v, i) => pointAt(i, v ?? 0).join(',')).join(' ')} fill={color} fillOpacity={0.16} stroke={color} strokeWidth={2} />
      {values.map((v, i) => {
        const [x, y] = pointAt(i, v ?? 0)
        return <circle key={i} cx={x} cy={y} r={2.6} fill={color} />
      })}
      {labels.map((l, i) => {
        const [x, y] = pointAt(i, 124)
        const anchor = Math.abs(x - cx) < 6 ? 'middle' : x > cx ? 'start' : 'end'
        // Long (English) labels wrap onto two lines so neighbouring axes never overlap.
        const words = l.split(' ')
        const lines = l.length > 13 && words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [l]
        const value = values[i] != null ? fa(values[i]) : null
        if (value) lines.push(`(${value})`)
        const y0 = y - ((lines.length - 1) * 10) / 2
        return (
          <text key={i} x={x} y={y0} textAnchor={anchor} dominantBaseline="middle" fontSize={8.5} fill={SUB} fontFamily="Vazirmatn, sans-serif">
            {lines.map((ln, k) => (
              <tspan key={k} x={x} dy={k === 0 ? 0 : 10} fontWeight={k === lines.length - 1 && value ? 800 : 400} fill={k === lines.length - 1 && value ? INK : SUB}>
                {ln}
              </tspan>
            ))}
          </text>
        )
      })}
    </svg>
  )
}

// ---------------------------------------------------------------- props
export interface PrintPersonality {
  /** null = not scored yet; the label says why (status). */
  snapshot: FingerprintSnapshot | null
  statusLabel: string
}

export interface CompetencyPrintReportProps {
  assessment: CompetencyAssessment
  model: ResultsModel
  roleLabel: string
  logoUrl: string
  photoUrl?: string | null
  interview: InterviewSummaryRow[]
  personality: PrintPersonality | null
  competencyGapRows: GapRow[]
  developmentPlan: {
    plan: CompDevelopmentPlan
    actions: CompDevelopmentAction[]
    competencyLabel: (competencyId: string) => string
    ownerName: string | null
  } | null
  ai: { summary: string; roleFit?: string; stale: boolean; generatedAt: string } | null
  reassessment: CompReassessmentComparison | null
  patternParagraphs: string[]
  peers: { rank: number | null; total: number; average: number | null }
  approval: { reviewedByName: string | null; creatorName: string | null }
  generatedAt: string
}

export function CompetencyPrintReport(props: CompetencyPrintReportProps) {
  const { assessment: a, model: m, roleLabel, logoUrl, photoUrl, interview, personality, competencyGapRows, developmentPlan, ai, reassessment, patternParagraphs, peers, approval, generatedAt } = props
  const status = m.status
  const statusInk = status.state === 'final' ? inkTone(status.color) : SUB
  const interp = m.interpretation
  const allDomains: DomainScore[] = [...m.domainScores, ...m.extendedFingerprint]
  let n = 0
  const next = () => (n += 1)

  const qualification = [
    { label: 'مدرک تحصیلی', value: m.officialQualification.educationScore },
    { label: 'سوابق کاری مرتبط', value: m.officialQualification.experienceScore },
    { label: 'دوره‌های حرفه‌ای', value: m.officialQualification.pmTrainingScore },
    { label: 'صلاحیت حرفه‌ای', value: m.officialQualification.pmCertificationScore },
  ]

  return (
    <div
      dir="rtl"
      style={{ background: '#ffffff', color: INK, width: REPORT_WIDTH_PX, padding: '26px 30px 22px', fontFamily: '"Vazirmatn", "Segoe UI", sans-serif', direction: 'rtl', lineHeight: 1.55 }}
    >
      {/* Running header — only drawn at the top of pages 2+ of the PDF (hidden on screen/print). */}
      <div data-pdf-running="" style={{ display: 'none', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '4px 0 6px', borderBottom: `1.5px solid ${ACCENT}` }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 800 }}>
          <img src={logoUrl} alt="" width={18} height={18} style={{ objectFit: 'contain' }} crossOrigin="anonymous" />
          فرین | FARIN
        </span>
        <span style={{ fontSize: 9.5, color: SUB }}>
          گزارش کامل ارزیابی شایستگی — {a.candidateName} — {roleLabel}
        </span>
      </div>

      {/* Branded header */}
      <header data-pdf-header="" style={{ padding: '0 6px 12px', marginBottom: 6, borderBottom: `3px solid ${ACCENT}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={logoUrl} alt="FARIN" width={44} height={44} style={{ objectFit: 'contain' }} crossOrigin="anonymous" />
            <div>
              <p style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
                فرین <span style={{ color: GOLD, fontWeight: 800 }}>FARIN</span>
              </p>
              <p style={{ margin: 0, fontSize: 9.5, color: SUB }}>راهکار جامع مدیریت پروژه و توسعه نیروی انسانی</p>
            </div>
          </div>
          <div style={{ textAlign: 'left' }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: ACCENT }}>گزارش کامل ارزیابی شایستگی</p>
            <p style={{ margin: '2px 0 0', fontSize: 9.5, color: SUB }}>تاریخ تهیه گزارش: {formatJalali(generatedAt)}</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, marginTop: 12, alignItems: 'stretch' }}>
          <div style={{ width: 78, height: 94, flexShrink: 0, borderRadius: 10, overflow: 'hidden', border: `1px solid ${LINE}`, background: SOFT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {photoUrl ? (
              <img src={photoUrl} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 9, color: MUTED }}>بدون عکس</span>
            )}
          </div>
          <div style={{ flex: 1.3, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{a.candidateName}</p>
            <p style={{ margin: '2px 0 6px', fontSize: 11, color: SUB, fontWeight: 600 }}>
              متقاضی سمت: {a.candidatePosition || roleLabel} <span style={{ color: MUTED }}>| شغل مرجع: {roleLabel}</span>
            </p>
            <KV
              rows={[
                ['تاریخ مصاحبه', a.interviewDate ? formatJalali(a.interviewDate) : '—'],
                ['وضعیت فرایند', a.status === 'completed' ? 'ثبت نهایی‌شده' : 'در جریان'],
              ]}
            />
          </div>
          <div style={{ flex: 1, border: `1.5px solid ${status.state === 'final' ? statusInk : LINE}`, borderRadius: 12, padding: '8px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <p style={{ margin: 0, fontSize: 9.5, color: SUB }}>امتیاز کلی فنی {status.state === 'provisional' ? '(موقت)' : ''}</p>
            <p style={{ margin: 0, fontSize: 26, fontWeight: 800, color: status.state === 'final' ? toneForPercent(m.overall) : MUTED, lineHeight: 1.2 }}>
              {m.overall != null ? `٪${fa(m.overall)}` : '—'}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 10.5 }}>
              <span style={{ color: SUB }}>وضعیت: </span>
              <b style={{ color: statusInk }}>{status.label}</b>
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 9, color: SUB }}>{status.detail}</p>
          </div>
        </div>
      </header>

      {/* 1. Candidate profile */}
      <Section n={next()} title="خلاصه مشخصات متقاضی">
        <KV
          rows={[
            ['کد ملی', a.candidateNationalId || '—'],
            ['شماره تماس', a.candidatePhone || '—'],
            ['ایمیل', a.candidateEmail || '—'],
            ['سن', a.candidateAge != null ? `${fa(a.candidateAge)} سال` : '—'],
            ['سابقه کل کار', a.yearsExperienceTotal != null ? `${fa(a.yearsExperienceTotal, 1)} سال` : '—'],
            ['سابقه اجرای خط لوله', a.yearsExperiencePipeline != null ? `${fa(a.yearsExperiencePipeline, 1)} سال` : '—'],
            ['کارفرمای فعلی', a.currentEmployer || '—'],
            ['معلولیت جسمی', a.hasDisability ? a.disabilityNote || 'دارد' : 'ندارد'],
          ]}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 10 }}>
          <MiniList
            title="تحصیلات"
            items={a.education.map((e) => `${e.degree || '—'} ${e.field ? `— ${e.field}` : ''}${e.institution ? ` (${e.institution}${e.year ? `، ${e.year}` : ''})` : ''}`)}
          />
          <MiniList
            title="سوابق شغلی"
            items={a.employmentHistory.slice(0, 6).map((e) => `${e.position || '—'} — ${e.employer || '—'}${e.startDate ? ` (از ${formatJalali(e.startDate)}${e.endDate ? ` تا ${formatJalali(e.endDate)}` : ' تاکنون'})` : ''}`)}
          />
          <MiniList title="گواهینامه‌ها و دوره‌ها" items={a.certifications.map((c) => `${c.title}${c.issuer ? ` — ${c.issuer}` : ''}`)} />
        </div>
        {a.notableProjects && <p style={{ margin: '8px 0 0', fontSize: 9.5, color: SUB }}>پروژه‌های شاخص: {a.notableProjects}</p>}
      </Section>

      {/* 2. Exam design */}
      <Section n={next()} title="طرح ارزیابی و روش‌های به‌کاررفته">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {m.methods.map((x) => (
            <span
              key={x.key}
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                borderRadius: 999,
                padding: '3px 10px',
                border: `1px solid ${x.enabled ? '#c4b5fd' : LINE}`,
                background: x.enabled ? '#f5f3ff' : SOFT,
                color: x.enabled ? ACCENT : MUTED,
              }}
            >
              {x.enabled ? '✓' : '—'} {x.label}
              {!x.enabled && ' (در طرح نیست)'}
            </span>
          ))}
        </div>
        <KV
          rows={[
            ['مدل امتیازدهی فنی', m.isPM ? 'روبریک ثابت مدیر پروژه (۸ حوزه وزنی)' : 'بانک سؤال شغل (۴ دسته وزنی)'],
            ['تعداد سؤالات فنی', `${fa(m.completion.total)} سؤال`],
            ['اندازه پنل داوری', `${fa(a.panelSize)} نفر (${fa(m.panel.length)} عضو ثبت‌شده)`],
            ['مدت هدف مصاحبه', a.durationMinutes ? `${fa(a.durationMinutes)} دقیقه` : 'بدون محدودیت'],
          ]}
        />
      </Section>

      {/* 3. Maturity interpretation */}
      <Section n={next()} title={`تفسیر بلوغ و توصیه استفاده — ${roleLabel}`}>
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: '10px 12px', background: SOFT }}>
          <p style={{ margin: 0, fontSize: 10.5, fontWeight: 800 }}>
            سطح بلوغ: <span style={{ color: interp.source === 'pending' ? SUB : ACCENT }}>{interp.bandLabel}</span>
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 10.5, color: SUB }}>{interp.guidance}</p>
          {interp.source !== 'pending' && (
            <p style={{ margin: '4px 0 0', fontSize: 10.5, fontWeight: 700, color: ACCENT }}>سمت شغلی پیشنهادی: {interp.suggestedPositions}</p>
          )}
          {interp.focusAreas.length > 0 && <p style={{ margin: '4px 0 0', fontSize: 10, color: PRINT_TONE.warn }}>اولویت‌های توسعه این متقاضی: {interp.focusAreas.join('، ')}</p>}
          {status.recommendation?.hasCriticalGap && <p style={{ margin: '4px 0 0', fontSize: 10, color: PRINT_TONE.bad }}>{status.recommendation.reason}</p>}
        </div>
        {patternParagraphs.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <p style={{ margin: '0 0 2px', fontSize: 10.5, fontWeight: 800 }}>تحلیل الگوی پاسخ‌ها</p>
            {patternParagraphs.map((p, i) => (
              <p key={i} style={{ margin: '0 0 3px', fontSize: 10, color: SUB }}>
                {p}
              </p>
            ))}
          </div>
        )}
      </Section>

      {/* 4. Technical scores */}
      <Section n={next()} title="نتایج ارزیابی فنی و تخصصی (حضوری)">
        {m.completion.total === 0 && m.overall == null ? (
          <Empty>ارزیابی فنی حضوری برای این متقاضی هنوز طراحی یا امتیازدهی نشده است.</Empty>
        ) : (
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ width: 320, flexShrink: 0 }}>
              <PrintRadar labels={allDomains.map((d) => d.domain.shortTitle)} values={allDomains.map((d) => d.percentScore)} size={250} />
              <p style={{ margin: 0, textAlign: 'center', fontSize: 9, color: MUTED }}>
                {fa(m.completion.answered)} از {fa(m.completion.total)} سؤال امتیازدهی‌شده (٪{fa(m.completion.percent)})
                {peers.rank != null && `، رتبه ${fa(peers.rank)} از ${fa(peers.total)} متقاضی این شغل`}
              </p>
            </div>
            <table style={{ flex: 1, borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={th}>حوزه / دسته</th>
                  <th style={{ ...th, textAlign: 'center' }}>وزن</th>
                  <th style={{ ...th, width: '40%' }}>امتیاز</th>
                  <th style={{ ...th, textAlign: 'center' }}>پاسخ</th>
                </tr>
              </thead>
              <tbody>
                {allDomains.map((d) => (
                  <tr key={d.domain.key}>
                    <td style={{ ...td, fontWeight: 700 }}>{d.domain.title}</td>
                    <td style={{ ...td, textAlign: 'center', color: SUB }}>{d.domain.weight > 0 ? `٪${fa(d.domain.weight)}` : 'نمایشی'}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Bar value={d.percentScore} color={toneForPercent(d.percentScore)} />
                        <b style={{ width: 34, textAlign: 'left', color: toneForPercent(d.percentScore) }}>{d.percentScore != null ? `٪${fa(d.percentScore)}` : '—'}</b>
                      </div>
                    </td>
                    <td style={{ ...td, textAlign: 'center', color: SUB }}>
                      {fa(d.answeredCount)}/{fa(d.totalCount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(m.strengths.length > 0 || m.weaknesses.length > 0) && (
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            {m.strengths.length > 0 && <Note color={PRINT_TONE.good} title="نقاط قوت (امتیاز ۸۵+)" text={m.strengths.map((s) => s.domain.title).join('، ')} />}
            {m.weaknesses.length > 0 && <Note color={PRINT_TONE.bad} title="نیازمند توسعه (امتیاز زیر ۴۰)" text={m.weaknesses.map((s) => s.domain.title).join('، ')} />}
          </div>
        )}
        {qualification.some((q) => q.value != null) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 10 }}>
            {qualification.map((q) => (
              <div key={q.label} style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: '6px 4px', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: toneForPercent(q.value != null ? q.value * 20 : null) }}>
                  {fa(q.value)} <span style={{ fontSize: 9, color: MUTED }}>/ ۵</span>
                </p>
                <p style={{ margin: 0, fontSize: 9, color: SUB }}>{q.label}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 5. Panel breakdown */}
      <Section n={next()} title="امتیاز به تفکیک داوران و جمع‌بندی داوران" breakable>
        {m.panel.length === 0 ? (
          <Empty>هنوز داوری برای این متقاضی ثبت نشده است.</Empty>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>داور</th>
                  {m.domainScores.map((d) => (
                    <th key={d.domain.key} style={{ ...th, textAlign: 'center' }}>
                      {d.domain.shortTitle}
                    </th>
                  ))}
                  <th style={{ ...th, textAlign: 'center' }}>کل</th>
                  <th style={{ ...th, textAlign: 'center' }}>وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {m.panel.map((p) => (
                  <tr key={p.userId}>
                    <td style={{ ...td, fontWeight: 700 }}>
                      {p.name}
                      {p.isLead && <span style={{ color: GOLD }}> (سرداور)</span>}
                    </td>
                    {p.domainPercents.map((v, i) => (
                      <td key={i} style={{ ...td, textAlign: 'center', color: toneForPercent(v) }}>
                        {v != null ? fa(v) : '—'}
                      </td>
                    ))}
                    <td style={{ ...td, textAlign: 'center', fontWeight: 800, color: toneForPercent(p.overallPercent) }}>{p.overallPercent != null ? `٪${fa(p.overallPercent)}` : '—'}</td>
                    <td style={{ ...td, textAlign: 'center', color: p.submitted ? PRINT_TONE.good : PRINT_TONE.warn }}>{p.submitted ? 'ثبت نهایی' : 'ثبت نهایی نشده'}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...td, fontWeight: 800, background: SOFT }}>امتیاز رسمی (میانگین پنل)</td>
                  {m.domainScores.map((d) => (
                    <td key={d.domain.key} style={{ ...td, textAlign: 'center', fontWeight: 800, background: SOFT }}>
                      {d.percentScore != null ? fa(d.percentScore) : '—'}
                    </td>
                  ))}
                  <td style={{ ...td, textAlign: 'center', fontWeight: 800, background: SOFT, color: ACCENT }}>{m.overall != null ? `٪${fa(m.overall)}` : '—'}</td>
                  <td style={{ ...td, background: SOFT }} />
                </tr>
              </tbody>
            </table>
            {m.panel.some((p) => p.strengths || p.developmentAreas) && (
              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {m.panel
                  .filter((p) => p.strengths || p.developmentAreas)
                  .map((p) => (
                    <div key={p.userId} style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: '6px 9px', breakInside: 'avoid' }}>
                      <p style={{ margin: 0, fontSize: 10, fontWeight: 800 }}>{p.name}</p>
                      {p.strengths && (
                        <p style={{ margin: '2px 0 0', fontSize: 9.5, color: SUB }}>
                          <b style={{ color: PRINT_TONE.good }}>قوت: </b>
                          {p.strengths}
                        </p>
                      )}
                      {p.developmentAreas && (
                        <p style={{ margin: '2px 0 0', fontSize: 9.5, color: SUB }}>
                          <b style={{ color: PRINT_TONE.warn }}>قابل بهبود: </b>
                          {p.developmentAreas}
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
        {m.capstone.score != null && (
          <div style={{ marginTop: 8, border: `1px solid ${LINE}`, borderRadius: 8, padding: '6px 10px' }}>
            <p style={{ margin: 0, fontSize: 10.5, fontWeight: 800 }}>
              سناریوی پایانی (بحران چندوجهی): <span style={{ color: toneForPercent(m.capstone.score * 20) }}>{fa(m.capstone.score, 1)} / ۵</span>
            </p>
            {m.capstone.note && <p style={{ margin: '2px 0 0', fontSize: 9.5, color: SUB }}>{m.capstone.note}</p>}
          </div>
        )}
      </Section>

      {/* 6. Structured interview */}
      <Section n={next()} title="نتایج مصاحبه ساختاریافته" breakable>
        {!a.needsStructuredInterview && interview.length === 0 ? (
          <Empty>مصاحبه ساختاریافته در طرح ارزیابی این متقاضی قرار ندارد.</Empty>
        ) : interview.every((r) => r.ratings.length === 0) ? (
          <Empty>هنوز امتیازی برای مصاحبه ساختاریافته ثبت نشده است.</Empty>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>شایستگی</th>
                <th style={{ ...th, textAlign: 'center' }}>سطح لازم</th>
                <th style={{ ...th, textAlign: 'center' }}>میانگین (۱-۵)</th>
                <th style={th}>امتیاز و یادداشت داوران</th>
              </tr>
            </thead>
            <tbody>
              {interview.map((r) => (
                <tr key={r.competencyId}>
                  <td style={{ ...td, fontWeight: 700 }}>
                    {r.labelFa}
                    {r.isCritical && <span style={{ color: PRINT_TONE.bad }}> ★</span>}
                  </td>
                  <td style={{ ...td, textAlign: 'center', color: SUB }}>
                    {fa(r.requiredLevel)}
                    {r.requiredLabel ? ` (${r.requiredLabel})` : ''}
                  </td>
                  <td style={{ ...td, textAlign: 'center', fontWeight: 800, color: toneForPercent(r.average != null ? ((r.average - 1) / 4) * 100 : null) }}>{fa(r.average, 1)}</td>
                  <td style={{ ...td, color: SUB }}>
                    {r.ratings.length === 0
                      ? '—'
                      : r.ratings.map((x, i) => (
                          <div key={i}>
                            <b style={{ color: INK }}>{x.raterName}:</b> {fa(x.rating)}
                            {x.notes ? ` — ${x.notes}` : ''}
                          </div>
                        ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* 7. Personality */}
      <Section n={next()} title="اثرانگشت رفتاری — Behavioral Fingerprint" breakable>
        {!personality ? (
          <Empty>ارزیابی شخصیت و رفتاری در طرح ارزیابی این متقاضی قرار ندارد.</Empty>
        ) : !personality.snapshot ? (
          <Empty>ارزیابی شخصیت هنوز امتیازدهی نشده است (وضعیت فعلی: {personality.statusLabel}).</Empty>
        ) : (
          <PersonalityBlock snap={personality.snapshot} roleLabel={roleLabel} />
        )}
      </Section>

      {/* 8. Competency gaps */}
      <Section n={next()} title="تحلیل شکاف شایستگی (نمای ۳۶۰ درجه)" breakable>
        {competencyGapRows.length === 0 ? (
          <Empty>پروفایل شایستگی این متقاضی هنوز محاسبه نشده است.</Empty>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['شایستگی', 'الزامی', 'واقعی', 'شکاف', 'اطمینان', 'شواهد', 'وضعیت'].map((h) => (
                    <th key={h} style={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortGapRows(competencyGapRows, 'severity').map((r) => {
                  const st = GAP_STATUS_META[r.score.status]
                  const insufficient = r.score.status === 'INSUFFICIENT_EVIDENCE'
                  return (
                    <tr key={r.competencyId} style={{ color: insufficient ? MUTED : undefined }}>
                      <td style={{ ...td, fontWeight: 700 }}>
                        {r.labelFa}
                        {r.score.isCritical ? ' ★' : ''}
                      </td>
                      <td style={td}>{formatLevel(r.score.requiredLevel)}</td>
                      <td style={td}>{insufficient ? 'نامعلوم' : formatLevel(r.score.actualLevel)}</td>
                      <td style={td}>{r.score.gap == null ? 'نامعلوم' : r.score.gap > 0 ? `${formatLevel(r.score.gap)}−` : r.score.gap < 0 ? `${formatLevel(-r.score.gap)}+` : '۰'}</td>
                      <td style={td}>{GAP_CONFIDENCE_META[r.score.confidence].label}</td>
                      <td style={td}>{fa(r.score.evidenceCount)}</td>
                      <td style={{ ...td, fontWeight: 700, color: insufficient ? '#64748b' : inkTone(st.color) }}>{st.label}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p style={{ margin: '4px 0 0', fontSize: 8.5, color: MUTED }}>★ شایستگی حیاتی، «شواهد ناکافی» یعنی هنوز داده‌ای ثبت نشده — نه ضعف متقاضی.</p>
          </>
        )}
      </Section>

      {/* 9. AI analysis */}
      <Section n={next()} title="خلاصه تحلیل جامع هوش مصنوعی">
        {!ai ? (
          <Empty>تحلیل جامع هوشمند هنوز برای این متقاضی تولید نشده است.</Empty>
        ) : (
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: '8px 12px' }}>
            {ai.stale && <p style={{ margin: '0 0 4px', fontSize: 9.5, color: PRINT_TONE.warn, fontWeight: 700 }}>توجه: پروفایل شایستگی پس از تولید این تحلیل تغییر کرده است.</p>}
            <p style={{ margin: 0, fontSize: 10, color: SUB }}>{ai.summary}</p>
            {ai.roleFit && (
              <p style={{ margin: '5px 0 0', fontSize: 10, color: SUB }}>
                <b style={{ color: INK }}>تطابق با شغل: </b>
                {ai.roleFit}
              </p>
            )}
            <p style={{ margin: '4px 0 0', fontSize: 8.5, color: MUTED }}>تولیدشده در {formatJalali(ai.generatedAt)} — پیش‌نویس کمکی، جایگزین قضاوت ارزیاب نیست.</p>
          </div>
        )}
      </Section>

      {/* 10. IDP */}
      <Section n={next()} title="برنامه توسعه فردی (IDP)" breakable>
        {!developmentPlan ? (
          <Empty>برنامه توسعه فردی برای این متقاضی تهیه نشده است.</Empty>
        ) : (
          <IdpBlock plan={developmentPlan} />
        )}
      </Section>

      {/* 11. Reassessment */}
      {a.previousAssessmentId && (
        <Section n={next()} title="مقایسه با ارزیابی قبلی">
          {!reassessment ? (
            <Empty>داده مقایسه در دسترس نیست.</Empty>
          ) : (
            <>
              <KV
                rows={[
                  ['تاریخ ارزیابی قبلی', formatJalali(reassessment.previousInterviewDate) || '—'],
                  ['شایستگی‌های قابل مقایسه', `${fa(reassessment.summary.comparable)} از ${fa(reassessment.summary.competencies)}`],
                  ['بهبودیافته / افت', `${fa(reassessment.summary.improved)} / ${fa(reassessment.summary.declined)}`],
                  ['شکاف‌ها (قبل ← اکنون)', `${fa(reassessment.summary.gapsBefore)} ← ${fa(reassessment.summary.gapsAfter)}`],
                  ['شکاف بسته‌شده / کاهش‌یافته', `${fa(reassessment.summary.closed)} / ${fa(reassessment.summary.narrowed)}`],
                  ['شکاف جدید / بزرگ‌تر', `${fa(reassessment.summary.newGaps)} / ${fa(reassessment.summary.widened)}`],
                ]}
              />
              {reassessment.competencies.some((c) => c.levelDelta != null && c.levelDelta !== 0) && (
                <p style={{ margin: '6px 0 0', fontSize: 9.5, color: SUB }}>
                  تغییرات سطح:{' '}
                  {reassessment.competencies
                    .filter((c) => c.levelDelta != null && c.levelDelta !== 0)
                    .map((c) => `${c.labelFa} (${(c.levelDelta as number) > 0 ? '+' : '−'}${formatLevel(Math.abs(c.levelDelta as number))})`)
                    .join('، ')}
                </p>
              )}
            </>
          )}
        </Section>
      )}

      {/* 12. Approval / finalization */}
      <Section n={next()} title="جمع‌بندی، تأیید و وضعیت نهایی">
        {(a.strengths || a.developmentAreas) && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
            {a.strengths && <Note color={PRINT_TONE.good} title="نقاط قوت (جمع‌بندی مسئول ارزیابی)" text={a.strengths} />}
            {a.developmentAreas && <Note color={PRINT_TONE.warn} title="زمینه‌های قابل بهبود" text={a.developmentAreas} />}
          </div>
        )}
        <KV
          rows={[
            ['وضعیت ارزیابی', a.status === 'completed' ? 'ثبت نهایی و قفل‌شده' : 'در جریان (قابل ویرایش)'],
            ['تأیید صلاحیت', a.isApproved ? '✓ تأیید شده' : 'تأیید نشده'],
            ['نتیجه', status.label],
            ['بازبینی مشخصات', a.reviewedAt ? `${approval.reviewedByName ?? '—'} — ${formatJalali(a.reviewedAt)}` : '—'],
            ['آخرین بازگشایی', a.reopenedAt ? formatJalali(a.reopenedAt) : '—'],
            ['مسئول ارزیابی', approval.creatorName ?? '—'],
          ]}
        />
        <div style={{ display: 'flex', gap: 24, marginTop: 18 }}>
          {['امضای مسئول ارزیابی', 'امضای سرداور پنل', 'تأیید مدیر منابع انسانی'].map((l) => (
            <div key={l} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ height: 34, borderBottom: `1px dashed ${MUTED}` }} />
              <p style={{ margin: '3px 0 0', fontSize: 9, color: SUB }}>{l}</p>
            </div>
          ))}
        </div>
        <p style={{ margin: '14px 0 0', fontSize: 8.5, color: MUTED, textAlign: 'center' }}>
          تهیه‌شده توسط فرین (FARIN) — راهکار جامع مدیریت پروژه و توسعه نیروی انسانی، ماژول ارزیابی شایستگی. این گزارش محرمانه است.
        </p>
      </Section>
    </div>
  )
}

function MiniList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p style={{ margin: '0 0 3px', fontSize: 10, fontWeight: 800 }}>{title}</p>
      {items.length === 0 ? (
        <p style={{ margin: 0, fontSize: 9.5, color: MUTED }}>ثبت نشده</p>
      ) : (
        <ul style={{ margin: 0, paddingRight: 14, fontSize: 9.5, color: SUB }}>
          {items.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Note({ color, title, text }: { color: string; title: string; text: string }) {
  return (
    <div style={{ flex: 1, borderRight: `3px solid ${color}`, background: SOFT, borderRadius: 6, padding: '5px 9px' }}>
      <p style={{ margin: 0, fontSize: 10, fontWeight: 800, color }}>{title}</p>
      <p style={{ margin: '2px 0 0', fontSize: 9.5, color: SUB }}>{text}</p>
    </div>
  )
}

function PersonalityBlock({ snap, roleLabel }: { snap: FingerprintSnapshot; roleLabel: string }) {
  const v = snap.validity
  const validityTone = !v ? SUB : v.overallStatus === 'VALID' ? PRINT_TONE.good : v.overallStatus === 'ACCEPTABLE' ? PRINT_TONE.info : v.overallStatus === 'REVIEW_REQUIRED' ? PRINT_TONE.warn : PRINT_TONE.bad
  const pct = (x: number) => `٪${fa(Math.round(x * 100))}`
  const families = [...new Set(snap.dimensions.map((d) => d.familyKey))]
  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1, border: `1px solid ${LINE}`, borderRadius: 10, padding: '6px 10px' }}>
          <p style={{ margin: 0, fontSize: 9.5, color: SUB }}>شاخص‌های اعتبار پاسخ‌ها</p>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: validityTone }}>{v ? PERSONALITY_VALIDITY_STATUS_LABEL_FA[v.overallStatus] : 'محاسبه نشده'}</p>
          {v && (
            <p style={{ margin: '2px 0 0', fontSize: 9, color: SUB }}>
              {[
                v.consistencyScore != null ? `سازگاری ${pct(v.consistencyScore)}` : null,
                `تناقض ${fa(v.contradictionCount)}`,
                v.socialDesirabilityScore != null ? `مطلوبیت اجتماعی ${fa(Math.round(v.socialDesirabilityScore))}/۱۰۰` : null,
                v.extremeResponseRate != null ? `پاسخ حدی ${pct(v.extremeResponseRate)}` : null,
                v.missingResponseCount > 0 ? `${fa(v.missingResponseCount)} بی‌پاسخ` : null,
                v.straightLiningFlag ? 'الگوی یکنواخت' : null,
                v.randomPatternFlag ? 'الگوی تصادفی' : null,
                v.completionSeconds != null ? `${fa(Math.max(1, Math.round(v.completionSeconds / 60)))} دقیقه` : null,
              ]
                .filter(Boolean)
                .join('، ')}
            </p>
          )}
        </div>
        <div style={{ flex: 1, border: `1px solid ${LINE}`, borderRadius: 10, padding: '6px 10px' }}>
          <p style={{ margin: 0, fontSize: 9.5, color: SUB }}>تطابق با الزامات رفتاری «{roleLabel}»</p>
          {!snap.hasJobProfile ? (
            <p style={{ margin: 0, fontSize: 10, color: MUTED }}>نیم‌رخ رفتاری این شغل تعریف نشده است.</p>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: snap.alignment.criticalGapCount > 0 ? PRINT_TONE.bad : ACCENT }}>
                {snap.alignment.overallAlignmentPercent != null ? `٪${fa(snap.alignment.overallAlignmentPercent)}` : '—'}
              </p>
              <p style={{ margin: 0, fontSize: 9, color: SUB }}>
                {snap.alignment.criticalGapCount > 0 ? `${fa(snap.alignment.criticalGapCount)} الزام حیاتی برآورده نشده` : 'الزامات حیاتی برآورده شده‌اند'}
              </p>
            </>
          )}
        </div>
      </div>

      {snap.traits.length > 0 && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6, breakInside: 'avoid' }}>
          <div style={{ width: 300, flexShrink: 0 }}>
            <PrintRadar labels={snap.traits.map((t) => t.label.en || t.label.fa)} values={snap.traits.map((t) => t.score)} color="#7c3aed" size={220} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: '0 0 4px', fontSize: 10.5, fontWeight: 800 }}>Big Five Traits (ویژگی‌های شخصیتی — پنج عامل بزرگ)</p>
            {snap.traits.map((t) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2.5px 0' }}>
                <span style={{ width: 170, flexShrink: 0, fontSize: 9.5, color: INK }}>
                  <b style={{ color: inkTone(t.tone) }}>{t.label.en}</b> ({t.label.fa})
                </span>
                <Bar value={t.score} color={t.tone} />
                <span style={{ width: 96, flexShrink: 0, textAlign: 'left', fontSize: 9.5, color: SUB, whiteSpace: 'nowrap' }}>
                  <b style={{ color: INK }}>{t.score != null ? fa(Math.round(t.score)) : '—'}</b> {scoreBandFa(t.score)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {snap.dimensions.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
          <thead>
            <tr>
              <th style={th}>Professional Behavioral Dimension (بعد رفتاری حرفه‌ای)</th>
              <th style={{ ...th, width: '38%' }}>امتیاز (خط سیاه: حداقل الزام شغل)</th>
              <th style={{ ...th, textAlign: 'center' }}>حداقل</th>
              <th style={{ ...th, textAlign: 'center' }}>وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {families.flatMap((fk) => {
              const rows = snap.dimensions.filter((d) => d.familyKey === fk)
              const head = rows[0]
              return [
                <tr key={`f-${fk}`}>
                  <td colSpan={4} style={{ ...td, fontWeight: 800, color: inkTone(head.tone), background: SOFT, fontSize: 9 }}>
                    {head.familyLabelEn} ({head.familyLabelFa})
                  </td>
                </tr>,
                ...rows.map((d) => {
                  const below = d.status === 'BELOW_MIN' || d.status === 'BELOW_PREFERRED'
                  return (
                    <tr key={d.id}>
                      <td style={{ ...td, fontWeight: 700 }}>
                        {d.label.en} <span style={{ fontWeight: 400, color: SUB }}>({d.label.fa})</span>
                        {d.isCritical && <span style={{ color: PRINT_TONE.bad }}> ★</span>}
                      </td>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Bar value={d.score} color={below ? '#dc2626' : d.tone} marker={d.minThreshold} />
                          <b style={{ width: 22, textAlign: 'left' }}>{d.score != null ? fa(Math.round(d.score)) : '—'}</b>
                        </div>
                      </td>
                      <td style={{ ...td, textAlign: 'center', color: SUB }}>{d.minThreshold != null ? fa(d.minThreshold) : '—'}</td>
                      <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: below ? PRINT_TONE.bad : d.status ? PRINT_TONE.good : MUTED }}>
                        {d.status === 'BELOW_MIN'
                          ? 'زیر حداقل'
                          : d.status === 'BELOW_PREFERRED'
                            ? 'زیر بازه ترجیحی'
                            : d.status === 'ABOVE_PREFERRED'
                              ? 'بالاتر از بازه'
                              : d.status === 'MEETS' || d.status === 'MEETS_CRITICAL'
                                ? 'برآورده'
                                : '—'}
                      </td>
                    </tr>
                  )
                }),
              ]
            })}
          </tbody>
        </table>
      )}

      {(snap.patterns.length > 0 || snap.watchpoints.length > 0) && (
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          {snap.patterns.length > 0 && <Note color={PRINT_TONE.good} title="الگوهای برجسته" text={snap.patterns.join('، ')} />}
          {snap.watchpoints.length > 0 && <Note color={PRINT_TONE.warn} title="نقاط قابل بررسی بیشتر" text={snap.watchpoints.join('، ')} />}
        </div>
      )}
    </>
  )
}

function IdpBlock({ plan }: { plan: NonNullable<CompetencyPrintReportProps['developmentPlan']> }) {
  const progress = planProgress(plan.actions)
  const rows = [...plan.actions].filter((x) => x.status !== 'CANCELLED').sort((x, y) => x.sortOrder - y.sortOrder)
  return (
    <>
      <p style={{ margin: '0 0 6px', fontSize: 10, color: SUB }}>
        وضعیت: <b style={{ color: INK }}>{PLAN_STATUS_META[plan.plan.status].label}</b>، پیشرفت: {fa(progress.done)} از {fa(progress.total)} اقدام (٪{fa(progress.percent)})
        {plan.ownerName ? `، مسئول پیگیری: ${plan.ownerName}` : ''}
        {plan.plan.targetReviewDate ? `، بازبینی: ${formatJalali(plan.plan.targetReviewDate)}` : ''}
      </p>
      {plan.plan.summary && <p style={{ margin: '0 0 6px', fontSize: 10, color: SUB }}>{plan.plan.summary}</p>}
      {rows.length === 0 ? (
        <Empty>هنوز اقدامی در این برنامه ثبت نشده است.</Empty>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['شایستگی', 'اقدام', 'نوع', 'اولویت', 'سطح فعلی ← هدف', 'مهلت', 'وضعیت'].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id}>
                <td style={{ ...td, fontWeight: 700 }}>{x.competencyId ? plan.competencyLabel(x.competencyId) : 'عمومی'}</td>
                <td style={td}>{x.title}</td>
                <td style={td}>{ACTION_TYPE_LABEL_FA[x.actionType]}</td>
                <td style={td}>{PRIORITY_META[x.priority].label.replace('اولویت ', '')}</td>
                <td style={td}>{x.actionType === 'EVIDENCE_COLLECTION' ? 'گردآوری شواهد' : `${formatLevel(x.currentLevel)} ← ${formatLevel(x.targetLevel)}`}</td>
                <td style={td}>{x.dueDate ? formatJalali(x.dueDate) : '—'}</td>
                <td style={{ ...td, fontWeight: 700, color: x.status === 'DONE' ? PRINT_TONE.good : x.status === 'IN_PROGRESS' ? PRINT_TONE.info : SUB }}>{ACTION_STATUS_META[x.status].label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
