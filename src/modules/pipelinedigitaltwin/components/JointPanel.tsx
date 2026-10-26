import { useEffect, useState, type CSSProperties } from 'react'
import { ClipboardPen, History, Loader2, MapPin, X } from 'lucide-react'
import type { GeoPoint, Joint, Pipe } from '../types'
import { FINAL_STATUS_COLOR, FINAL_STATUS_LABEL_FA } from '../lib/progressEngine'
import { formatChainage } from '../lib/chainage'
import { formatJalali } from '../../../lib/jalali'
import { jointNoOfId, STAGE_FA, STAGE_FIELD, STAGE_OPTIONS, STAGE_ORDER, type StageKey } from '../lib/twinCore'
import { jointEvents, type JointEventRow } from '../repo'
import { usePdtStore } from '../store/usePdtStore'
import { STAGE_COLOR } from './EntryDrawer'

const TONE: Record<string, string> = { done: '#22c55e', bad: '#ef4444', neutral: '#94a3b8' }
const FIELD_FA: Record<string, string> = { weldingStatus: STAGE_FA.welding, ndtStatus: STAGE_FA.ndt, coatingStatus: STAGE_FA.coating, loweringStatus: STAGE_FA.lowering, backfillStatus: STAGE_FA.backfill, notes: 'یادداشت' }
const label = (field: string, v: string) => { const st = (Object.keys(STAGE_FIELD) as StageKey[]).find((k) => STAGE_FIELD[k] === field); return st ? STAGE_OPTIONS[st].find((o) => o.value === v)?.label ?? v : v }

interface JointPanelProps {
  joint: Joint
  pipe: Pipe
  position: GeoPoint
  prevJointNumber: string | null
  nextJointNumber: string | null
  editable: boolean
  onUpdate: (field: 'weldingStatus' | 'ndtStatus' | 'coatingStatus' | 'loweringStatus' | 'backfillStatus' | 'notes', value: string) => void
  onClose: () => void
  /** opens bulk entry starting at this joint */
  onEntryFrom?: (jointNo: number) => void
  startKm?: number
}

/** One girth weld: where it is, its five activities (one tap each, saved at once) and every change ever recorded on it — including bulk entries that covered it. */
export function JointPanel({ joint, pipe, position, prevJointNumber, nextJointNumber, editable, onUpdate, onClose, onEntryFrom, startKm = 0 }: JointPanelProps) {
  const projectId = usePdtStore((s) => s.projectId)
  const saving = usePdtStore((s) => s.saving)
  const [showHistory, setShowHistory] = useState(false)
  const [events, setEvents] = useState<JointEventRow[] | null>(null)
  const no = jointNoOfId(joint.id)
  const color = FINAL_STATUS_COLOR[joint.finalStatus]
  const stageAt = (s: StageKey) => joint.history.find((h) => h.field === STAGE_FIELD[s])?.at ?? null

  useEffect(() => {
    if (!showHistory || !projectId) return
    let alive = true
    setEvents(null)
    void jointEvents(projectId, no).then((e) => alive && setEvents(e))
    return () => { alive = false }
  }, [showHistory, projectId, no, joint])

  return (
    <div className="glass-panel absolute left-3 top-3 z-20 flex max-h-[calc(100%-1.5rem)] w-[22rem] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3.5 py-3" style={{ borderColor: 'var(--border-soft)' }}>
        <div className="flex items-center gap-2">
          <p className="text-sm font-extrabold" dir="ltr">{joint.jointNumber}</p>
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${color}22`, color }}>{FINAL_STATUS_LABEL_FA[joint.finalStatus]}</span>
          {saving && <Loader2 size={13} className="animate-spin text-muted" />}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={() => setShowHistory((v) => !v)} title="تاریخچهٔ تغییرات" aria-pressed={showHistory} className={`rounded-lg p-1.5 ${showHistory ? 'bg-white/15' : 'hover:bg-white/10'}`}><History size={14} /></button>
          <button onClick={onClose} aria-label="بستن" className="rounded-lg p-1.5 hover:bg-white/10"><X size={14} /></button>
        </div>
      </div>

      {showHistory ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
          {events == null ? <p className="text-[11px] text-muted"><Loader2 size={12} className="inline animate-spin" /> در حال خواندن…</p>
            : events.length === 0 ? <p className="text-[11px] text-muted">هنوز تغییری روی این سرجوش ثبت نشده است.</p>
            : (
              <ul className="space-y-2">
                {events.map((h) => (
                  <li key={h.id} className="rounded-lg border border-white/10 p-2 text-[11px]">
                    <p className="flex justify-between"><b>{FIELD_FA[h.field] ?? h.field}: {label(h.field, h.value)}</b><span className="num text-muted">{formatJalali(h.at.slice(0, 10))}</span></p>
                    <p className="text-muted">{h.by || '—'}{h.from !== h.to ? ` · ثبت گروهی سرجوش ${h.from.toLocaleString('fa-IR')} تا ${h.to.toLocaleString('fa-IR')}` : ''}</p>
                    {h.note && <p className="text-secondary">{h.note}</p>}
                  </li>
                ))}
              </ul>
            )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5 text-xs">
          <div className="tw-sec">
            <Info label="کیلومتر" value={formatChainage(startKm * 1000 + joint.chainageMeters)} ltr />
            <Info label="مختصات" value={`${position.lat.toFixed(5)}, ${position.lon.toFixed(5)}`} icon={<MapPin size={10} />} ltr />
            <Info label="ارتفاع" value={position.elevation != null ? `${position.elevation.toFixed(1)} m` : '—'} />
            <Info label="سرجوش قبل / بعد" value={`${prevJointNumber ?? '—'} / ${nextJointNumber ?? '—'}`} ltr />
            <Info label="لوله" value={`Ø${pipe.diameterInch}″ · ${pipe.wallThicknessMm} mm · ${pipe.material}`} ltr />
          </div>

          <div className="tw-stages">
            {STAGE_ORDER.map((s) => {
              const field = STAGE_FIELD[s], at = stageAt(s)
              return (
                <div key={s} className="tw-stage" style={{ borderInlineStart: `3px solid ${STAGE_COLOR[s]}` }}>
                  <div>{STAGE_FA[s]}<small>{at ? formatJalali(at.slice(0, 10)) : ''}</small></div>
                  {editable ? (
                    <div className="tw-seg" role="group" aria-label={STAGE_FA[s]}>
                      {STAGE_OPTIONS[s].map((o) => <button key={o.value} type="button" aria-pressed={joint[field] === o.value} style={{ '--c': TONE[o.tone] } as CSSProperties} onClick={() => onUpdate(field, o.value)}>{o.label}</button>)}
                    </div>
                  ) : <span className="text-secondary">{STAGE_OPTIONS[s].find((o) => o.value === joint[field])?.label}</span>}
                </div>
              )
            })}
          </div>
          {joint.welders.length > 0 && <Info label="جوشکاران" value={joint.welders.join('، ')} />}

          <div>
            <p className="mb-1 text-[10px] text-muted">یادداشت</p>
            {editable
              ? <textarea key={joint.id} defaultValue={joint.notes} onBlur={(e) => e.target.value !== joint.notes && onUpdate('notes', e.target.value)} rows={2} className="w-full resize-none rounded-lg border border-white/10 bg-white/5 p-1.5 text-[11px] outline-none focus:border-brand-400" />
              : <p className="text-[11px] text-secondary">{joint.notes || '—'}</p>}
          </div>
          {editable && onEntryFrom && <button type="button" className="tw-btn is-acc w-full" onClick={() => onEntryFrom(no)}><ClipboardPen size={13} /> ثبت گروهی از این سرجوش</button>}
          {!editable && <p className="tw-hint">در نمای تاریخ گذشته ویرایش ممکن نیست؛ جدول زمانی را به «امروز» برگردانید.</p>}
        </div>
      )}
    </div>
  )
}

function Info({ label, value, icon, ltr }: { label: string; value: string; icon?: React.ReactNode; ltr?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1 text-muted">{icon}{label}</span>
      <span className="num font-medium" dir={ltr ? 'ltr' : undefined}>{value}</span>
    </div>
  )
}
