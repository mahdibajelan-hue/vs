import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, Lightbulb, Plus, Save, Send, Trash2 } from 'lucide-react'
import { JalaliDateInput } from '../platform'
import { useMissionStore } from '../store/useMissionStore'
import { useNav } from '../nav'
import { TOPIC_KEYS_FOR_OBJECTIVES } from '../lib/questionSets'
import { checkObjective, MEASURE_SUGGESTIONS } from '../lib/objectives'
import { faNum, missionDays, todayIso, addDaysIso } from '../lib/fa'
import { Card, Field, Pill, SectionHead } from '../components/ui'
import { EvidencePanel } from '../components/EvidencePanel'
import { PRIORITY_LABEL, VISIT_TYPE_LABEL, type Priority, type Visitee, type VisitType } from '../types'
import type { MissionDraft, ObjectiveDraft } from '../repo/types'

const EMPTY_OBJECTIVE = (): ObjectiveDraft => ({ title: '', measure: '', topicKey: '', priority: 'medium' })

export function MissionFormPage({ missionId }: { missionId?: string }) {
  const { go } = useNav()
  const user = useMissionStore((s) => s.user)
  const people = useMissionStore((s) => s.people)
  const projects = useMissionStore((s) => s.projects)
  const bundle = useMissionStore((s) => s.bundle)
  const openMission = useMissionStore((s) => s.openMission)
  const saveRequest = useMissionStore((s) => s.saveRequest)
  const transition = useMissionStore((s) => s.transition)

  const [id, setId] = useState(missionId)
  const [draft, setDraft] = useState<MissionDraft>({
    masterProjectId: '',
    requesterPosition: user?.position ?? '',
    needsTicket: true,
    originCity: '',
    ticketNote: '',
    destination: '',
    locationDetail: '',
    startDate: addDaysIso(todayIso(), 3),
    endDate: addDaysIso(todayIso(), 4),
    visitType: 'progress_review',
    visitees: [],
    topicsOfInterest: '',
    expectedOutput: '',
    approverId: null,
  })
  const [objectives, setObjectives] = useState<ObjectiveDraft[]>([EMPTY_OBJECTIVE()])
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!missionId) return
    openMission(missionId).then((b) => {
      if (!b) return
      const m = b.mission
      setDraft({ masterProjectId: m.masterProjectId, requesterPosition: m.requesterPosition, needsTicket: m.needsTicket, originCity: m.originCity, ticketNote: m.ticketNote, destination: m.destination, locationDetail: m.locationDetail, startDate: m.startDate, endDate: m.endDate, visitType: m.visitType, visitees: m.visitees, topicsOfInterest: m.topicsOfInterest, expectedOutput: m.expectedOutput, approverId: m.approverId })
      setObjectives(b.objectives.length ? b.objectives.map((o) => ({ id: o.id, title: o.title, measure: o.measure, topicKey: o.topicKey, priority: o.priority })) : [EMPTY_OBJECTIVE()])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId])

  const set = <K extends keyof MissionDraft>(k: K, v: MissionDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }))
    setSaved(false)
  }
  const patchObjective = (i: number, p: Partial<ObjectiveDraft>) => {
    setObjectives((os) => os.map((o, j) => (j === i ? { ...o, ...p } : o)))
    setSaved(false)
  }
  const patchVisitee = (i: number, p: Partial<Visitee>) => set('visitees', draft.visitees.map((v, j) => (j === i ? { ...v, ...p } : v)))

  const filled = objectives.filter((o) => o.title.trim())
  const checks = useMemo(() => objectives.map(checkObjective), [objectives])
  const approvers = people.filter((p) => p.id !== user?.id)
  const days = draft.startDate && draft.endDate ? missionDays(draft.startDate, draft.endDate) : 0
  const project = projects.find((p) => p.id === draft.masterProjectId)

  function validate(forSubmit: boolean): string[] {
    const e: string[] = []
    if (!draft.masterProjectId) e.push('پروژه را انتخاب کنید.')
    if (forSubmit) {
      if (!draft.destination.trim()) e.push('مقصد و محل بازدید را بنویسید.')
      if (draft.needsTicket && !draft.originCity.trim()) e.push('برای درخواست بلیط، شهر مبدأ را بنویسید.')
      if (!draft.startDate || !draft.endDate || draft.endDate < draft.startDate) e.push('تاریخ شروع و پایان معتبر نیست.')
      if (!filled.length) e.push('حداقل یک هدف برای مأموریت لازم است.')
      if (filled.some((o) => !o.measure.trim())) e.push('برای هر هدف معیار تحقق بنویسید تا بتوان نتیجه را سنجید.')
    }
    return e
  }

  async function save(andSubmit: boolean) {
    const e = validate(andSubmit)
    setErrors(e)
    if (e.length) return
    setSaving(true)
    try {
      const newId = await saveRequest(draft, filled, id)
      setId(newId)
      setSaved(true)
      if (andSubmit) {
        const ok = await transition('submit_request', '', newId)
        if (ok) go({ kind: 'mission', id: newId })
      }
    } catch {
      /* the store already surfaced the error */
    } finally {
      setSaving(false)
    }
  }

  const readonly = bundle && missionId && !['draft', 'returned'].includes(bundle.mission.status)

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <button className="ms-btn ms-btn-ghost ms-btn-sm mb-2" onClick={() => (id ? go({ kind: 'mission', id }) : go({ kind: 'list' }))}>
          <ArrowRight size={14} aria-hidden /> بازگشت
        </button>
        <p className="ms-eyebrow mb-1">{id ? 'ویرایش درخواست' : 'درخواست جدید'}</p>
        <h1 className="text-[22px] font-black leading-9">درخواست مأموریت</h1>
        <p className="ms-ink2 text-[12.5px] leading-7">پیش از اعزام، هدف را قابل‌اندازه‌گیری بنویسید؛ همین اهداف بعداً مسیر گفت‌وگوی گزارش را می‌سازند.</p>
        {bundle?.mission.status === 'returned' && bundle.mission.managerComment && (
          <p className="mt-2 rounded-xl px-4 py-3 text-[12.5px] leading-7" style={{ background: 'color-mix(in srgb, var(--ms-warn) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--ms-warn) 35%, transparent)' }}>
            <b>نظر مجری طرح:</b> {bundle.mission.managerComment}
          </p>
        )}
      </div>

      {readonly && <p className="ms-card-flat p-4 text-[12.5px] leading-7">این درخواست ارسال شده و دیگر ویرایش‌پذیر نیست.</p>}

      <fieldset disabled={!!readonly} className="contents">
        <Card className="p-5">
          <SectionHead eyebrow="۱" title="چه کسی، کجا و کی" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="بازدیدکننده">
              <input className="ms-input" value={user?.name ?? ''} disabled aria-readonly />
            </Field>
            <Field label="سمت">
              <input className="ms-input" value={draft.requesterPosition} onChange={(e) => set('requesterPosition', e.target.value)} placeholder="مثلاً مدیر پروژه" />
            </Field>
            <Field label="پروژه مرتبط" hint={project?.projectType ? `نوع قرارداد: ${project.projectType}` : undefined}>
              <select className="ms-select" value={draft.masterProjectId} onChange={(e) => set('masterProjectId', e.target.value)}>
                <option value="">انتخاب پروژه…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            <Field label="نوع بازدید">
              <select className="ms-select" value={draft.visitType} onChange={(e) => set('visitType', e.target.value as VisitType)}>
                {Object.entries(VISIT_TYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="مقصد">
              <input className="ms-input" value={draft.destination} onChange={(e) => set('destination', e.target.value)} placeholder="مثلاً کارخانه سازنده — کرج" />
            </Field>
            <Field label="محل دقیق / آدرس">
              <input className="ms-input" value={draft.locationDetail} onChange={(e) => set('locationDetail', e.target.value)} placeholder="اختیاری" />
            </Field>
            <Field label="تاریخ شروع">
              <JalaliDateInput value={draft.startDate} onChange={(v) => { set('startDate', v); if (draft.endDate < v) set('endDate', v) }} />
            </Field>
            <Field label="تاریخ پایان" hint={days > 0 ? `مدت مأموریت: ${faNum(days)} روز` : undefined}>
              <JalaliDateInput value={draft.endDate} onChange={(v) => set('endDate', v)} />
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <SectionHead eyebrow="سفر" title="بلیط هواپیما" sub="پس از تأیید مجری طرح، درخواست بلیط برای امور اداری ارسال می‌شود." />
          <label className="flex cursor-pointer items-center gap-3 text-[13px] font-bold">
            <input type="checkbox" checked={draft.needsTicket} onChange={(e) => set('needsTicket', e.target.checked)} />
            برای این مأموریت به بلیط هواپیما نیاز دارم
          </label>
          {draft.needsTicket ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="شهر مبدأ"><input className="ms-input" value={draft.originCity} onChange={(e) => set('originCity', e.target.value)} placeholder="مثلاً تهران" /></Field>
              <Field label="توضیح برای امور اداری (ساعت پرواز مطلوب، همراه، سقف قیمت…)"><input className="ms-input" value={draft.ticketNote} onChange={(e) => set('ticketNote', e.target.value)} placeholder="اختیاری" /></Field>
              <p className="ms-muted text-[11.5px] leading-6 sm:col-span-2">تاریخ رفت و برگشت همان تاریخ شروع و پایان مأموریت است؛ اگر تغییر می‌کند در توضیح بنویسید.</p>
            </div>
          ) : (
            <p className="ms-muted mt-2 text-[12px] leading-7">بدون بلیط: پس از تأیید مجری طرح، مأموریت مستقیم آماده اعزام می‌شود.</p>
          )}
        </Card>

        <Card className="p-5">
          <SectionHead eyebrow="۲" title="افراد و شرکت‌های مورد ملاقات" action={<button className="ms-btn ms-btn-sm" onClick={() => set('visitees', [...draft.visitees, { name: '', org: '', role: '' }])}><Plus size={13} aria-hidden /> افزودن</button>} />
          {draft.visitees.length === 0 ? (
            <p className="ms-muted text-[12.5px]">هنوز کسی اضافه نشده است. نام طرف‌های ملاقات در سؤال‌های گزارش‌گیری استفاده می‌شود.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {draft.visitees.map((v, i) => (
                <li key={i} className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <input className="ms-input" aria-label="نام" placeholder="نام" value={v.name} onChange={(e) => patchVisitee(i, { name: e.target.value })} />
                  <input className="ms-input" aria-label="شرکت" placeholder="شرکت / سازمان" value={v.org} onChange={(e) => patchVisitee(i, { org: e.target.value })} />
                  <input className="ms-input col-span-1" aria-label="سمت" placeholder="سمت" value={v.role} onChange={(e) => patchVisitee(i, { role: e.target.value })} />
                  <button className="ms-btn ms-btn-ghost ms-btn-icon" aria-label="حذف" onClick={() => set('visitees', draft.visitees.filter((_, j) => j !== i))}>
                    <Trash2 size={15} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <SectionHead eyebrow="۳" title="اهداف مأموریت" sub="هر هدف = یک اقدام مشخص + معیاری که نشان دهد محقق شده است" action={<button className="ms-btn ms-btn-sm" onClick={() => { setObjectives((o) => [...o, EMPTY_OBJECTIVE()]); setSaved(false) }}><Plus size={13} aria-hidden /> هدف جدید</button>} />
          <ul className="flex flex-col gap-4">
            {objectives.map((o, i) => {
              const c = checks[i]
              return (
                <li key={o.id ?? i} className="ms-card-flat p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-[12px] font-extrabold"><span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px]" style={{ background: 'var(--ms-accent-soft)', color: 'var(--ms-accent)' }}>{faNum(i + 1)}</span> هدف {faNum(i + 1)}</span>
                    <span className="flex items-center gap-2">
                      {o.title.trim() && <Pill tone={c.score >= 80 ? 'good' : c.score >= 50 ? 'warn' : 'bad'}>{c.score >= 80 ? 'هدف خوب' : c.score >= 50 ? 'قابل بهبود' : 'مبهم'}</Pill>}
                      {objectives.length > 1 && (
                        <button className="ms-btn ms-btn-ghost ms-btn-sm" aria-label="حذف هدف" onClick={() => setObjectives((os) => os.filter((_, j) => j !== i))}><Trash2 size={14} aria-hidden /></button>
                      )}
                    </span>
                  </div>
                  <div className="grid gap-3">
                    <Field label="هدف"><input className="ms-input" value={o.title} onChange={(e) => patchObjective(i, { title: e.target.value })} placeholder="مثلاً: دریافت برنامه زمانی تحویل شیرهای ۳۶ اینچ از سازنده" /></Field>
                    <Field label="معیار تحقق">
                      <input className="ms-input" value={o.measure} onChange={(e) => patchObjective(i, { measure: e.target.value })} placeholder="چه چیزی نشان می‌دهد هدف محقق شد؟" />
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(MEASURE_SUGGESTIONS[o.topicKey] ?? MEASURE_SUGGESTIONS['']).map((s) => (
                          <button key={s} type="button" className="ms-chip" style={{ fontSize: 11 }} onClick={() => patchObjective(i, { measure: s })}>{s}</button>
                        ))}
                      </div>
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="موضوع مرتبط (برای گزارش‌گیری)">
                        <select className="ms-select" value={o.topicKey} onChange={(e) => patchObjective(i, { topicKey: e.target.value })}>
                          {TOPIC_KEYS_FOR_OBJECTIVES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                        </select>
                      </Field>
                      <Field label="اولویت">
                        <select className="ms-select" value={o.priority} onChange={(e) => patchObjective(i, { priority: e.target.value as Priority })}>
                          {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </Field>
                    </div>
                  </div>
                  {o.title.trim() && c.tips.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-1">
                      {c.tips.map((t) => (
                        <li key={t} className="flex items-start gap-2 text-[11.5px] leading-6" style={{ color: 'var(--ms-warn)' }}>
                          <Lightbulb size={13} className="mt-1.5 shrink-0" aria-hidden /> {t}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>

        <Card className="p-5">
          <SectionHead eyebrow="۴" title="موضوعات و خروجی مورد انتظار" />
          <div className="grid gap-4">
            <Field label="موضوعات، مشکلات و مسائل مورد بررسی" hint="هر چه مشخص‌تر، سؤال‌های گزارش‌گیری دقیق‌تر می‌شود (مثلاً نام قلم یا فعالیت).">
              <textarea className="ms-textarea" value={draft.topicsOfInterest} onChange={(e) => set('topicsOfInterest', e.target.value)} placeholder="مثلاً: تأخیر شیرآلات ۳۶ اینچ، وضعیت بازرسی کارخانه، گواهی‌های مواد" />
            </Field>
            <Field label="خروجی مورد انتظار از مأموریت">
              <textarea className="ms-textarea" value={draft.expectedOutput} onChange={(e) => set('expectedOutput', e.target.value)} placeholder="مثلاً: برنامه تحویل مکتوب و صورتجلسه با سازنده" />
            </Field>
            <Field label="مجری طرح (تأییدکننده درخواست و گزارش)" hint="اگر خالی بماند، مجری طرح پس از ارسال، درخواست را برمی‌دارد.">
              <select className="ms-select" value={draft.approverId ?? ''} onChange={(e) => set('approverId', e.target.value || null)}>
                <option value="">انتخاب مجری طرح…</option>
                {approvers.map((p) => <option key={p.id} value={p.id}>{p.name}{p.position ? ` — ${p.position}` : ''}</option>)}
              </select>
            </Field>
          </div>
        </Card>
      </fieldset>

      <Card className="p-5">
        <SectionHead eyebrow="۵" title="مستندات مرتبط" />
        {id ? (
          <EvidencePanel missionId={id} kinds={['file', 'letter', 'technical', 'minutes']} topicKey="" compact />
        ) : (
          <p className="ms-muted text-[12.5px] leading-7">پس از «ذخیره پیش‌نویس»، می‌توانید نامه، صورتجلسه یا مدرک فنی مرتبط را پیوست کنید.</p>
        )}
      </Card>

      {errors.length > 0 && (
        <ul role="alert" className="rounded-xl px-5 py-3 text-[12.5px] leading-7" style={{ background: 'color-mix(in srgb, var(--ms-bad) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--ms-bad) 35%, transparent)' }}>
          {errors.map((e) => <li key={e}>• {e}</li>)}
        </ul>
      )}

      {!readonly && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3" style={{ background: 'color-mix(in srgb, var(--ms-panel) 94%, transparent)', backdropFilter: 'blur(12px)', border: '1px solid var(--ms-line-2)', boxShadow: 'var(--ms-shadow)' }}>
          <p className="ms-ink2 flex items-center gap-2 text-[12px]">
            {saved ? <><Check size={14} style={{ color: 'var(--ms-good)' }} aria-hidden /> ذخیره شد</> : `${faNum(filled.length)} هدف · ${days > 0 ? faNum(days) + ' روز' : '—'}`}
          </p>
          <div className="flex gap-2">
            <button className="ms-btn" disabled={saving} onClick={() => save(false)}>
              <Save size={14} aria-hidden /> ذخیره پیش‌نویس
            </button>
            <button className="ms-btn ms-btn-primary" disabled={saving} onClick={() => save(true)}>
              <Send size={14} aria-hidden /> ارسال برای تأیید
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
