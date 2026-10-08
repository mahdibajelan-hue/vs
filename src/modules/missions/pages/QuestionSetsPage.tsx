import { useState } from 'react'
import { ChevronDown, Code2, Copy, GitBranch, Layers } from 'lucide-react'
import { useMissionStore } from '../store/useMissionStore'
import { faNum } from '../lib/fa'
import { Card, Pill, SectionHead, TOPIC_ICON } from '../components/ui'
import { VISIT_TYPE_LABEL } from '../types'
import type { Cond, QuestionSet } from '../lib/questionSets'

function condText(c: Cond | undefined): string {
  if (!c) return 'همیشه'
  const parts: string[] = []
  if (c.visitTypeIn) parts.push(`نوع بازدید: ${c.visitTypeIn.map((v) => VISIT_TYPE_LABEL[v]).join(' یا ')}`)
  if (c.projectTypeIn) parts.push(`نوع پروژه: ${c.projectTypeIn.join('/')}`)
  if (c.objectiveTopicIn) parts.push(`هدفی با موضوع ${c.objectiveTopicIn.join('/')}`)
  if (c.missionTextHas) parts.push(`متن مأموریت شامل «${c.missionTextHas.slice(0, 3).join('، ')}…»`)
  if (c.answeredHas) parts.push(`پاسخ قبلی شامل «${c.answeredHas.words.slice(0, 2).join('، ')}»`)
  if (c.hasFinding) parts.push(`وجود ${c.hasFinding.kind}`)
  if (c.all) parts.push(c.all.map(condText).join(' و '))
  if (c.any) parts.push('یکی از: ' + c.any.map(condText).join(' | '))
  if (c.not) parts.push(`نه: ${condText(c.not)}`)
  return parts.join(' ؛ ') || 'همیشه'
}

/** Read-only view of the Question Engine's configuration — proof that questions are data, not code. */
export function QuestionSetsPage() {
  const sets = useMissionStore((s) => s.sets)
  const user = useMissionStore((s) => s.user)
  const [open, setOpen] = useState<string | null>(null)
  const [json, setJson] = useState<QuestionSet | null>(null)
  const set = sets[0]

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div>
        <p className="ms-eyebrow mb-1">موتور سؤال</p>
        <h1 className="text-[22px] font-black leading-9">مجموعه‌های سؤال و منطق گفت‌وگو</h1>
        <p className="ms-ink2 text-[12.5px] leading-7">سؤال‌ها، شرط‌ها، سؤال‌های تکمیلی و قاعدهٔ «کافی بودن» همگی داده هستند، نه کد. مجموعه‌های تازه بدون تغییر هستهٔ نرم‌افزار قابل افزودن‌اند (جدول <code dir="ltr">ms_question_sets</code>).</p>
      </div>

      <Card className="p-5">
        <SectionHead eyebrow="مجموعه فعال" title={set.title} sub={`نسخه ${faNum(set.version)} · ${faNum(set.topics.length)} موضوع`} action={<button className="ms-btn ms-btn-sm" onClick={() => setJson(set)}><Code2 size={13} aria-hidden /> مشاهده JSON</button>} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Fact icon={<Layers size={15} aria-hidden />} title="سؤال اصلی و تکمیلی" text="هر موضوع چند سؤال اصلی دارد؛ بعد از هر پاسخ، موتور اطلاعات ناقص را تشخیص می‌دهد و فقط همان را می‌پرسد." />
          <Fact icon={<GitBranch size={15} aria-hidden />} title="شرطی و وابسته" text="موضوع‌ها و سؤال‌ها بر اساس نوع پروژه، نوع بازدید، اهداف و پاسخ‌های قبلی فعال یا حذف می‌شوند." />
          <Fact icon={<Copy size={15} aria-hidden />} title="پایان هر موضوع" text="وقتی سؤال‌های اصلی پاسخ داده شد و اطلاعات لازم هر یافته (علت، اثر، مسئول، موعد…) کامل شد، موضوع بسته می‌شود." />
        </div>
      </Card>

      <ul className="flex flex-col gap-3">
        {set.topics.map((t) => {
          const Icon = TOPIC_ICON[t.icon]
          const isOpen = open === t.key
          return (
            <li key={t.key}>
              <Card className="p-0">
                <button className="flex w-full items-center gap-3 p-4 text-right" onClick={() => setOpen(isOpen ? null : t.key)} aria-expanded={isOpen}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--ms-accent-soft)', color: 'var(--ms-accent)' }}>{Icon && <Icon size={17} aria-hidden />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2"><b className="text-[13.5px]">{t.title}</b>{t.core ? <Pill tone="accent">همیشه</Pill> : <Pill>شرطی</Pill>}{t.noFindings && <Pill>خلاصه‌ای</Pill>}</span>
                    <span className="ms-muted block text-[11.5px] leading-6">{t.description}</span>
                  </span>
                  <span className="ms-muted text-[11px]">{faNum(t.mainQuestions.length)} سؤال</span>
                  <ChevronDown size={16} className="ms-muted" style={{ transform: isOpen ? 'rotate(180deg)' : undefined }} aria-hidden />
                </button>
                {isOpen && (
                  <div className="flex flex-col gap-3 border-t p-4" style={{ borderColor: 'var(--ms-line)' }}>
                    <p className="text-[12px] leading-7"><b>اعمال می‌شود: </b>{t.core ? 'در همه مأموریت‌ها' : condText(t.relevantWhen)}</p>
                    {t.mandatoryWhen && <p className="text-[12px] leading-7"><b>اجباری وقتی: </b>{condText(t.mandatoryWhen)}</p>}
                    <p className="text-[12px] leading-7"><b>حداکثر سؤال تکمیلی: </b>{faNum(t.maxFollowUps)}</p>
                    <ol className="flex flex-col gap-2">
                      {t.mainQuestions.map((q) => (
                        <li key={q.id} className="ms-card-flat p-3">
                          <p className="text-[12.5px] leading-7">{q.text}</p>
                          {q.when && <p className="ms-muted mt-1 text-[11px]">پرسیده می‌شود اگر: {condText(q.when)}</p>}
                          {q.repeatForObjective && <p className="ms-muted mt-1 text-[11px]">برای هر هدف مأموریت تکرار می‌شود</p>}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </Card>
            </li>
          )
        })}
      </ul>

      <Card className="p-5">
        <SectionHead eyebrow="سؤال‌های تکمیلی" title="اطلاعاتی که برای هر نوع یافته لازم است" />
        <div className="grid gap-3 sm:grid-cols-2">
          {(['issue', 'risk', 'action', 'commitment'] as const).map((k) => (
            <div key={k} className="ms-card-flat p-3.5">
              <p className="text-[12.5px] font-extrabold">{({ issue: 'مسئله (Issue)', risk: 'ریسک (Risk)', action: 'اقدام', commitment: 'تعهد' } as const)[k]}</p>
              <p className="ms-ink2 mt-1 text-[12px] leading-7">لازم: {set.slots[k].required.map((s) => set.followUps[s][0].split('؟')[0].replace(/«\{title\}»/g, '…')).join(' · ') || '—'}</p>
              {set.slots[k].requiredIfHigh && <p className="ms-muted text-[11px]">اگر شدت زیاد باشد: {set.slots[k].requiredIfHigh!.join('، ')}</p>}
            </div>
          ))}
        </div>
        {user?.isAdmin ? <p className="ms-muted mt-3 text-[11.5px] leading-6">مدیر سامانه می‌تواند با افزودن ردیف به <code dir="ltr">ms_question_sets</code> مجموعه‌ای با همان کلید را جایگزین یا مجموعهٔ جدید اضافه کند.</p> : null}
      </Card>

      {json && (
        <Card className="p-5">
          <SectionHead eyebrow="تعریف داده" title="JSON مجموعه سؤال" action={<button className="ms-btn ms-btn-ghost ms-btn-sm" onClick={() => setJson(null)}>بستن</button>} />
          <pre dir="ltr" className="ms-card-flat max-h-96 overflow-auto p-3 text-[11px] leading-5">{JSON.stringify(json, null, 2)}</pre>
        </Card>
      )}
    </div>
  )
}

function Fact({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="ms-card-flat p-3.5">
      <p className="flex items-center gap-2 text-[12.5px] font-extrabold" style={{ color: 'var(--ms-accent)' }}>{icon}{title}</p>
      <p className="ms-ink2 mt-1 text-[12px] leading-7">{text}</p>
    </div>
  )
}
