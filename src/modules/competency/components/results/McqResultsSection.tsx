import { useEffect, useState } from 'react'
import { CheckCircle2, ChevronDown, Clock, ListChecks, XCircle } from 'lucide-react'
import { tierColor } from '../../lib/competencyModel'
import { fa } from '../../lib/resultsModel'
import { tone } from '../../lib/tone'
import { QUESTION_TYPE_LABEL_FA } from '../../types'
import { fetchMcqTestDetail, formatDuration, MCQ_DIFFICULTY_LABEL_FA, MCQ_OPTION_LETTERS, MCQ_TEST_STATUS_LABEL_FA, type McqTestDetail } from '../../lib/mcqData'
import { EmptyNote } from './ResultsSections'

/**
 * Self-contained results section for the online technical MCQ test («آزمون تستی آنلاین», schema.sql
 * Section 56): overall %, per-topic bars (the same breadth-of-knowledge the test was designed to
 * measure — "جامعیت"), time taken and unanswered count, with an expandable per-question breakdown
 * (chosen vs. correct answer) for staff. Fetches its own data via comp_mcq_get_test_detail so
 * ResultsStage only needs the few lines that mount it — see McqResultsSection's own default export.
 */
export function McqResultsSection({ assessmentId }: { assessmentId: string }) {
  const [test, setTest] = useState<McqTestDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchMcqTestDetail(assessmentId).then(({ data }) => {
      if (active) {
        setTest(data)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [assessmentId])

  if (loading) return <EmptyNote>در حال بارگذاری نتیجه‌ی آزمون تستی…</EmptyNote>
  if (!test || test.status === 'NOT_STARTED') return <EmptyNote>هنوز آزمون تستی برای این متقاضی تولید یا شروع نشده است.</EmptyNote>
  if (test.status !== 'SCORED') {
    return (
      <EmptyNote>
        متقاضی هنوز آزمون تستی را به پایان نرسانده است (وضعیت فعلی: {MCQ_TEST_STATUS_LABEL_FA[test.status]}
        {test.status === 'IN_PROGRESS' && test.questionCount > 0 && ` — ${fa(test.answeredCount)} از ${fa(test.questionCount)} پاسخ داده‌شده`}).
      </EmptyNote>
    )
  }

  const total = test.totalQuestions ?? test.questionCount
  const unanswered = total - test.answeredCount
  const overallColor = tierColor(test.scorePercent)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[auto_1fr]">
        <div className="fx-card flex flex-col items-center justify-center gap-1.5 p-5" style={tone(overallColor)}>
          <div
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full"
            role="img"
            aria-label={`امتیاز کلی آزمون تستی ${test.scorePercent ?? 0} از ۱۰۰`}
            style={{ background: `conic-gradient(${overallColor} ${(test.scorePercent ?? 0) * 3.6}deg, var(--fx-track) 0deg)` }}
          >
            <div className="fx-card flex h-[70px] w-[70px] flex-col items-center justify-center rounded-full">
              <span className="num text-xl font-black leading-none" style={{ color: overallColor }}>
                {fa(test.scorePercent, 0)}
              </span>
              <span className="fx-muted text-[9px]">از ۱۰۰</span>
            </div>
          </div>
          <p className="fx-muted text-[10.5px] font-bold">درصد کل آزمون تستی</p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatTile label="سؤال" value={fa(total)} />
          <StatTile label="پاسخ‌داده‌شده" value={fa(test.answeredCount)} />
          <StatTile label="بدون پاسخ" value={fa(unanswered)} tone={unanswered > 0 ? '#f59e0b' : undefined} />
          <StatTile label="زمان صرف‌شده" value={formatDuration(test.timeSpentSeconds)} icon={Clock} />
        </div>
      </div>

      {test.categoryScores.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {test.categoryScores.map((c) => (
            <span key={c.category} className="fx-sub flex items-center gap-1.5 px-2.5 py-1 text-[10.5px] font-bold" style={tone(tierColor(c.percent))}>
              <span className="fx-tone-text">{QUESTION_TYPE_LABEL_FA[c.category] ?? c.category}</span>
              <span className="num fx-tone-text">{fa(c.percent, 0)}٪</span>
              <span className="fx-muted">({fa(c.correct)}/{fa(c.total)})</span>
            </span>
          ))}
        </div>
      )}

      {test.topicScores.length > 0 && (
        <div className="fx-card p-4">
          <p className="mb-3 flex items-center gap-1.5 text-[12.5px] font-bold">
            <ListChecks size={14} style={{ color: '#2dd4bf' }} /> جامعیت پاسخ‌گویی به موضوعات فنی
          </p>
          <div className="space-y-2">
            {test.topicScores.map((t) => {
              const color = tierColor(t.percent)
              return (
                <div key={`${t.category}-${t.topic}`}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                    <span className="fx-text-2 truncate font-bold">{t.topic}</span>
                    <span className="num shrink-0 font-bold" style={{ color }}>
                      {fa(t.percent, 0)}٪ <span className="fx-muted font-normal">({fa(t.correct)}/{fa(t.total)})</span>
                    </span>
                  </div>
                  <div className="fx-track h-1.5 overflow-hidden rounded-full">
                    <div className="h-full rounded-full" style={{ width: `${t.percent}%`, background: color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Per-item breakdown is only ever present for a module admin — comp_mcq_get_test_detail
          (schema.sql) returns `items: []` to everyone else (the assessment lead, a designer, any
          panelist), by product requirement: raw question-and-answer detail is admin-only, never the
          aggregate scores above. Hiding the toggle entirely when there's nothing to show also keeps
          a non-admin from wondering why the button does nothing. */}
      {test.items.length > 0 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="fx-sub flex w-full items-center justify-between px-3.5 py-2.5 text-[11.5px] font-bold hover:brightness-110"
        >
          نمایش پاسخ به تفکیک هر سؤال (پاسخ متقاضی و پاسخ درست) — فقط ادمین سامانه
          <ChevronDown size={15} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      )}

      {expanded && test.items.length > 0 && (
        <div className="space-y-2">
          {test.items.map((item) => (
            <div key={item.questionId} className="fx-card p-3.5" style={tone(item.isCorrect ? '#34d399' : '#f87171')}>
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span className="num fx-muted text-[9.5px]">#{fa(item.order)}</span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9.5px] font-bold text-secondary">{QUESTION_TYPE_LABEL_FA[item.category] ?? item.category}</span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9.5px] text-muted">{item.topic}</span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9.5px] text-muted">{MCQ_DIFFICULTY_LABEL_FA[item.difficulty]}</span>
                <span className="fx-tone-bg fx-tone-text mr-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold">
                  {item.isCorrect ? <CheckCircle2 size={11} /> : <XCircle size={11} />} {item.isCorrect ? 'پاسخ درست' : item.chosenOption == null ? 'بدون پاسخ' : 'پاسخ نادرست'}
                  {item.responseTimeMs != null && <span className="num"> — {Math.round(item.responseTimeMs / 1000).toLocaleString('fa-IR')} ثانیه</span>}
                </span>
              </div>
              <p className="mb-2 text-[12px] leading-6">{item.stem}</p>
              <div className="space-y-1">
                {item.options.map((opt, i) => {
                  const isCorrectOpt = i === item.correctOption
                  const isChosen = i === item.chosenOption
                  return (
                    <p
                      key={i}
                      className={`flex items-start gap-1.5 rounded-lg px-2 py-1 text-[11px] leading-6 ${
                        isCorrectOpt ? 'bg-emerald-500/12 font-bold text-emerald-300' : isChosen ? 'bg-red-500/12 text-red-300' : 'text-secondary'
                      }`}
                    >
                      <span className="mt-0.5 shrink-0 text-[9.5px] text-muted">{MCQ_OPTION_LETTERS[i]}.</span>
                      <span className="flex-1">{opt}</span>
                      {isCorrectOpt && <CheckCircle2 size={12} className="mt-0.5 shrink-0" />}
                      {isChosen && !isCorrectOpt && <XCircle size={12} className="mt-0.5 shrink-0" />}
                    </p>
                  )
                })}
              </div>
              {item.explanation && <p className="mt-2 text-[10.5px] leading-6 text-muted">توضیح: {item.explanation}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatTile({ label, value, tone: toneColor, icon: Icon }: { label: string; value: string; tone?: string; icon?: typeof Clock }) {
  return (
    <div className="fx-sub flex flex-col items-center justify-center gap-1 p-3 text-center" style={toneColor ? tone(toneColor) : undefined}>
      {Icon && <Icon size={13} className={toneColor ? 'fx-tone-text' : 'fx-muted'} />}
      <p className={`num text-lg font-black leading-none ${toneColor ? 'fx-tone-text' : ''}`}>{value}</p>
      <p className="fx-muted text-[10px] font-bold">{label}</p>
    </div>
  )
}
