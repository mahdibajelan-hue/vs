import { useState } from 'react'
import { Check, ChevronDown, FastForward } from 'lucide-react'
import { JalaliDateInput } from '../../platform'
import type { AcqRoute, Stage, StageStatus } from '../../types'
import type { Analysis } from '../../lib/kpis'
import { useLandStore } from '../../store/useLandStore'
import { ART9_STEP_HINT, ROUTE_HINT, ROUTE_LABEL, STAGE_LABEL, STAGE_STATUS_LABEL } from '../../lib/labels'
import { currentStage, orderOf, stageDelay, stageOf } from '../../lib/workflow'
import { fmtDateShort, faNum, fmtDuration } from '../../lib/fa'
import { Badge } from '../ui'
import { HelpButton } from '../Help'
import { plannedFinishOf, startOf } from '../../lib/autoplan'
import { totalExpectedDays } from '../../lib/workflow'

const STATUS_COLOR: Record<StageStatus, string> = { not_started: 'var(--la-muted)', in_progress: 'var(--la-accent)', done: 'var(--la-ok)', blocked: 'var(--la-bad)', skipped: 'var(--la-muted)' }

/** The ten-step acquisition flow of one parcel — with the three routes, owner per step, planned vs actual dates and delay. */
export function WorkflowTab({ a }: { a: Analysis }) {
  const p = a.parcel
  const setStage = useLandStore((s) => s.setStage)
  const advance = useLandStore((s) => s.advanceStage)
  const update = useLandStore((s) => s.updateParcel)
  const planParcel = useLandStore((s) => s.planParcel)
  const today = useLandStore((s) => s.today)
  const cur = currentStage(p)
  const [open, setOpen] = useState<string | null>(cur?.key ?? null)

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="مسیر تحصیل">
        {(Object.keys(ROUTE_LABEL) as AcqRoute[]).map((r) => (
          <button key={r} role="radio" aria-checked={p.acquisitionRoute === r} onClick={() => update(p.id, { acquisitionRoute: r })} className="rounded-xl p-3 text-right" style={{ border: `1px solid ${p.acquisitionRoute === r ? 'var(--la-accent)' : 'var(--la-line)'}`, background: p.acquisitionRoute === r ? 'var(--la-accent-soft)' : 'var(--la-surface-2)', fontFamily: 'inherit', color: 'inherit', cursor: 'pointer' }}>
            <span className="block text-[12.5px] font-bold">{ROUTE_LABEL[r]}</span>
            <span className="la-eyebrow mt-1 block leading-6">{ROUTE_HINT[r]}</span>
          </button>
        ))}
      </div>

      <section className="la-card-flat flex flex-col gap-3 p-4" aria-label="برنامهٔ این قطعه">
        <p className="la-title m-0 flex items-center gap-1.5">برنامهٔ تحصیل این قطعه <HelpButton topic="plan" /></p>
        <div className="grid gap-3 sm:grid-cols-[1fr_130px_auto] sm:items-end">
          <div><span className="la-label">تاریخ شروع عملیات تحصیل</span><JalaliDateInput value={p.planStart ?? ''} onChange={(iso) => iso && planParcel(p.id, iso)} /></div>
          <label className="block"><span className="la-label">مدت کل (روز)</span><input className="la-input la-num" type="number" min={1} defaultValue={totalExpectedDays(p)} key={`t${p.id}${totalExpectedDays(p)}`} onBlur={(e) => { const v = Math.round(Number(e.target.value)); const st = p.planStart ?? startOf(p); if (v > 0 && v !== totalExpectedDays(p)) void (st ? planParcel(p.id, st, v) : update(p.id, { estDurationDays: v })) }} /></label>
          <button className="la-btn la-btn-primary" disabled={!(p.planStart ?? startOf(p))} onClick={() => planParcel(p.id, (p.planStart ?? startOf(p))!)}>ساخت دوبارهٔ تاریخ‌ها</button>
        </div>
        <p className="la-eyebrow m-0 leading-7">
          {p.planStart ? <>با وارد کردن تاریخ شروع، تاریخ برنامه‌ایِ همهٔ مراحل باقی‌مانده خودکار ساخته می‌شود{plannedFinishOf(p) ? <> — پایان تحصیل و آزادسازی: <b>{fmtDateShort(plannedFinishOf(p))}</b></> : null}. هر مرحله‌ای که واقعاً تمام شود، تاریخ مراحل بعد را همراه خودش جابه‌جا می‌کند.</> : 'تاریخ شروع را بدهید تا تاریخ برنامه‌ای همهٔ مراحل خودکار ساخته شود؛ می‌توانید هر تاریخ را پایین‌تر دستی هم تغییر دهید.'}
        </p>
      </section>

      {cur && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-3" style={{ background: 'var(--la-accent-soft)', border: '1px solid color-mix(in srgb, var(--la-accent) 35%, transparent)' }}>
          <p className="m-0 text-[12.5px]">مرحلهٔ جاری: <b>{STAGE_LABEL[cur.key]}</b></p>
          <button className="la-btn la-btn-primary la-btn-sm" onClick={() => advance(p.id)}><FastForward size={13} /> انجام شد؛ برو مرحلهٔ بعد</button>
        </div>
      )}

      {p.acquisitionRoute === 'art9' && <Art9Banner a={a} />}

      <ol className="la-flow">
        {orderOf(p).map((key, i) => {
          const s = stageOf(p, key)!
          const delay = stageDelay(s, today)
          const isNow = cur?.key === key
          const cls = s.status === 'done' || s.status === 'skipped' ? 'is-done' : s.status === 'blocked' ? 'is-blocked' : isNow ? 'is-now' : ''
          const expanded = open === key
          return (
            <li key={key} className={cls}>
              <span className="la-dot">{s.status === 'done' ? <Check size={14} strokeWidth={3} /> : faNum(i + 1)}</span>
              <div className="min-w-0 flex-1">
                <button className="flex w-full items-center justify-between gap-2 border-0 bg-transparent p-0 text-right" style={{ fontFamily: 'inherit', color: 'inherit', cursor: 'pointer' }} onClick={() => setOpen(expanded ? null : key)} aria-expanded={expanded}>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold">{STAGE_LABEL[key]}</span>
                    {ART9_STEP_HINT[key] && <span className="la-eyebrow block leading-6" style={{ color: 'var(--la-ink-2)' }}>{ART9_STEP_HINT[key]}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {delay > 0 && <Badge color="#ef4444">{fmtDuration(delay)} تأخیر</Badge>}
                    <Badge color={STATUS_COLOR[s.status]}>{STAGE_STATUS_LABEL[s.status]}</Badge>
                    <ChevronDown size={14} style={{ transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform .2s', color: 'var(--la-muted)' }} />
                  </span>
                </button>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div><span className="la-eyebrow">تاریخ برنامه‌ای</span><JalaliDateInput value={s.plannedDate ?? ''} onChange={(iso) => iso !== (s.plannedDate ?? '') && setStage(p.id, key, { plannedDate: iso || null })} /></div>
                  <div><span className="la-eyebrow">تاریخ واقعی (انجام)</span><JalaliDateInput value={s.actualDate ?? ''} onChange={(iso) => iso !== (s.actualDate ?? '') && setStage(p.id, key, iso ? { actualDate: iso, status: 'done' } : { actualDate: null, status: s.status === 'done' ? 'in_progress' : s.status })} /></div>
                </div>
                {expanded && <StageEditor parcelId={p.id} stage={s} onSave={(patch) => setStage(p.id, key, patch)} />}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function StageEditor({ stage, onSave }: { parcelId: string; stage: Stage; onSave: (patch: Partial<Stage>) => void }) {
  const [resp, setResp] = useState(stage.responsible)
  const [note, setNote] = useState(stage.note)
  return (
    <div className="la-rise mt-3 grid gap-3 rounded-xl p-3 sm:grid-cols-2" style={{ background: 'var(--la-surface-2)', border: '1px solid var(--la-line)' }}>
      <label><span className="la-label">وضعیت</span>
        <select className="la-select" value={stage.status} onChange={(e) => onSave({ status: e.target.value as StageStatus })}>
          {(Object.keys(STAGE_STATUS_LABEL) as StageStatus[]).map((s) => <option key={s} value={s}>{STAGE_STATUS_LABEL[s]}</option>)}
        </select></label>
      <label><span className="la-label">مسئول</span><input className="la-input" value={resp} onChange={(e) => setResp(e.target.value)} onBlur={() => resp !== stage.responsible && onSave({ responsible: resp })} /></label>
      <label className="sm:col-span-2"><span className="la-label">یادداشت</span><input className="la-input" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== stage.note && onSave({ note })} /></label>
    </div>
  )
}

/** The 3-month payment window of Article 9 and the owner's right to have the works stayed, stated where the steps are. */
function Art9Banner({ a }: { a: Analysis }) {
  const pay = a.clocks.find((c) => c.key === 'art9_payment')
  const tone = pay?.status === 'overdue' ? '#ef4444' : pay?.status === 'due_soon' ? '#f59e0b' : 'var(--la-accent)'
  return (
    <div className="rounded-xl p-3.5" style={{ border: `1px solid color-mix(in srgb, ${tone} 45%, transparent)`, background: `color-mix(in srgb, ${tone} 8%, var(--la-surface))` }}>
      <p className="m-0 text-[12.5px] font-bold" style={{ color: tone }}>
        {a.stay ? 'عملیات اجرایی به دستور دادگاه متوقف است' : pay ? (pay.status === 'done' ? 'بها پرداخت یا تودیع شد' : pay.status === 'overdue' ? `مهلت قانونی پرداخت ${faNum(-pay.daysLeft)} روز است گذشته` : `${faNum(pay.daysLeft)} روز تا پایان مهلت سه‌ماههٔ پرداخت`) : 'مهلت سه‌ماههٔ پرداخت از تاریخ تصرف شروع می‌شود'}
      </p>
      <p className="la-eyebrow m-0 mt-1.5 leading-7">
        تبصرهٔ ماده ۹: اگر دستگاه اجرایی در مهلت سه‌ماهه بها را نپردازد، مالک یا صاحب حق می‌تواند با مراجعه به دادگاه صالح، خارج از نوبت درخواست توقف عملیات اجرایی را تا زمان پرداخت بنماید؛ با پرداخت یا تودیع قیمت، دستور توقیف فوراً رفع می‌شود. تاریخ‌های درخواست و دستور توقف را در تب «مواعد قانونی» ثبت کنید.
      </p>
    </div>
  )
}
