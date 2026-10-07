import { useState } from 'react'
import { Check, ChevronDown, FastForward } from 'lucide-react'
import { JalaliDateInput } from '../../platform'
import type { AcqRoute, Stage, StageStatus } from '../../types'
import type { Analysis } from '../../lib/kpis'
import { useLandStore } from '../../store/useLandStore'
import { ROUTE_HINT, ROUTE_LABEL, STAGE_LABEL, STAGE_STATUS_LABEL } from '../../lib/labels'
import { STAGE_ORDER, currentStage, stageDelay, stageOf } from '../../lib/workflow'
import { fmtDateShort, faNum, fmtDuration } from '../../lib/fa'
import { Badge } from '../ui'

const STATUS_COLOR: Record<StageStatus, string> = { not_started: 'var(--la-muted)', in_progress: 'var(--la-accent)', done: 'var(--la-ok)', blocked: 'var(--la-bad)', skipped: 'var(--la-muted)' }

/** The ten-step acquisition flow of one parcel — with the three routes, owner per step, planned vs actual dates and delay. */
export function WorkflowTab({ a }: { a: Analysis }) {
  const p = a.parcel
  const setStage = useLandStore((s) => s.setStage)
  const advance = useLandStore((s) => s.advanceStage)
  const update = useLandStore((s) => s.updateParcel)
  const today = useLandStore((s) => s.today)
  const cur = currentStage(p)
  const [open, setOpen] = useState<string | null>(cur?.key ?? null)

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="مسیر تحصیل">
        {(Object.keys(ROUTE_LABEL) as AcqRoute[]).map((r) => (
          <button key={r} role="radio" aria-checked={p.acquisitionRoute === r} onClick={() => update(p.id, { acquisitionRoute: r })} className="rounded-xl p-3 text-right" style={{ border: `1px solid ${p.acquisitionRoute === r ? 'var(--la-accent)' : 'var(--la-line)'}`, background: p.acquisitionRoute === r ? 'var(--la-accent-soft)' : 'var(--la-surface-2)', fontFamily: 'inherit', color: 'inherit', cursor: 'pointer' }}>
            <span className="block text-[12.5px] font-bold">{ROUTE_LABEL[r]}</span>
            <span className="la-eyebrow mt-1 block leading-6">{ROUTE_HINT[r]}</span>
          </button>
        ))}
      </div>

      {cur && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-3" style={{ background: 'var(--la-accent-soft)', border: '1px solid color-mix(in srgb, var(--la-accent) 35%, transparent)' }}>
          <p className="m-0 text-[12.5px]">مرحلهٔ جاری: <b>{STAGE_LABEL[cur.key]}</b></p>
          <button className="la-btn la-btn-primary la-btn-sm" onClick={() => advance(p.id)}><FastForward size={13} /> انجام شد؛ برو مرحلهٔ بعد</button>
        </div>
      )}

      <ol className="la-flow">
        {STAGE_ORDER.map((key, i) => {
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
                    <span className="la-eyebrow block leading-6">
                      {s.plannedDate ? `برنامه: ${fmtDateShort(s.plannedDate)}` : 'بدون تاریخ برنامه‌ای'}
                      {s.actualDate ? ` · واقعی: ${fmtDateShort(s.actualDate)}` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {delay > 0 && <Badge color="#ef4444">{fmtDuration(delay)} تأخیر</Badge>}
                    <Badge color={STATUS_COLOR[s.status]}>{STAGE_STATUS_LABEL[s.status]}</Badge>
                    <ChevronDown size={14} style={{ transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform .2s', color: 'var(--la-muted)' }} />
                  </span>
                </button>
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
      <div><span className="la-label">تاریخ برنامه‌ای</span>
        <div className="flex gap-1.5"><div className="min-w-0 flex-1"><JalaliDateInput value={stage.plannedDate ?? ''} onChange={(iso) => onSave({ plannedDate: iso })} /></div>{stage.plannedDate && <button className="la-btn la-btn-icon la-btn-sm" aria-label="پاک کردن" onClick={() => onSave({ plannedDate: null })}>×</button>}</div></div>
      <div><span className="la-label">تاریخ واقعی</span>
        <div className="flex gap-1.5"><div className="min-w-0 flex-1"><JalaliDateInput value={stage.actualDate ?? ''} onChange={(iso) => onSave({ actualDate: iso })} /></div>{stage.actualDate && <button className="la-btn la-btn-icon la-btn-sm" aria-label="پاک کردن" onClick={() => onSave({ actualDate: null })}>×</button>}</div></div>
      <label className="sm:col-span-2"><span className="la-label">یادداشت</span><input className="la-input" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== stage.note && onSave({ note })} /></label>
    </div>
  )
}
