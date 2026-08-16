import { useState } from 'react'
import { FileText, History, MapPin, X } from 'lucide-react'
import type { BackfillStatus, CoatingStatus, GeoPoint, Joint, LoweringStatus, NdtStatus, Pipe, WeldingStatus } from '../types'
import { FINAL_STATUS_COLOR, FINAL_STATUS_LABEL_FA } from '../lib/progressEngine'
import { formatChainage } from '../lib/chainage'
import { formatJalali } from '../../../lib/jalali'

const WELDING_OPTIONS: { value: WeldingStatus; label: string }[] = [
  { value: 'not_started', label: 'شروع‌نشده' },
  { value: 'welded', label: 'جوش‌شده' },
  { value: 'repaired', label: 'تعمیرشده' },
  { value: 'accepted', label: 'پذیرفته‌شده' },
]
const NDT_OPTIONS: { value: NdtStatus; label: string }[] = [
  { value: 'pending', label: 'در انتظار' },
  { value: 'passed', label: 'قبول' },
  { value: 'failed', label: 'مردود' },
  { value: 'repair_required', label: 'نیاز به تعمیر' },
]
const COATING_OPTIONS: { value: CoatingStatus; label: string }[] = [
  { value: 'pending', label: 'در انتظار' },
  { value: 'completed', label: 'انجام‌شده' },
  { value: 'failed', label: 'ناموفق' },
]
const LOWERING_OPTIONS: { value: LoweringStatus; label: string }[] = [
  { value: 'pending', label: 'در انتظار' },
  { value: 'completed', label: 'انجام‌شده' },
]
const BACKFILL_OPTIONS: { value: BackfillStatus; label: string }[] = [
  { value: 'pending', label: 'در انتظار' },
  { value: 'completed', label: 'انجام‌شده' },
]

const FIELD_LABEL_FA: Record<string, string> = {
  weldingStatus: 'جوشکاری',
  ndtStatus: 'رادیوگرافی (NDT)',
  coatingStatus: 'پوشش',
  loweringStatus: 'پایین‌آوری',
  backfillStatus: 'خاک‌ریزی',
  notes: 'یادداشت',
}

interface JointPanelProps {
  joint: Joint
  pipe: Pipe
  position: GeoPoint
  prevJointNumber: string | null
  nextJointNumber: string | null
  editable: boolean
  onUpdate: (field: 'weldingStatus' | 'ndtStatus' | 'coatingStatus' | 'loweringStatus' | 'backfillStatus' | 'notes', value: string) => void
  onClose: () => void
}

/** "Joint History" panel — every field here is real: derived from the joint's own stage fields, its interpolated position on the route, the project's pipe spec, and its own append-only change log (never a separate stored snapshot). */
export function JointPanel({ joint, pipe, position, prevJointNumber, nextJointNumber, editable, onUpdate, onClose }: JointPanelProps) {
  const [showHistory, setShowHistory] = useState(false)
  const color = FINAL_STATUS_COLOR[joint.finalStatus]
  const lastActivityAt = joint.history.length > 0 ? joint.history[joint.history.length - 1].at : null

  return (
    <div className="glass-panel absolute left-3 top-3 z-20 flex max-h-[calc(100%-1.5rem)] w-80 flex-col overflow-hidden rounded-2xl">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3.5 py-3" style={{ borderColor: 'var(--border-soft)' }}>
        <div className="flex items-center gap-2">
          <p className="text-sm font-extrabold">{joint.jointNumber}</p>
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${color}22`, color }}>
            {FINAL_STATUS_LABEL_FA[joint.finalStatus]}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={() => setShowHistory((v) => !v)} title="تاریخچه تغییرات" className={`rounded-lg p-1.5 ${showHistory ? 'bg-white/15' : 'hover:bg-white/10'}`}>
            <History size={13} />
          </button>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10">
            <X size={13} />
          </button>
        </div>
      </div>

      {showHistory ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
          {joint.history.length === 0 ? (
            <p className="text-[11px] text-muted">هنوز تغییری ثبت نشده است.</p>
          ) : (
            <ul className="space-y-2">
              {[...joint.history]
                .reverse()
                .map((h) => (
                  <li key={h.id} className="rounded-lg border border-white/10 p-2 text-[10px]">
                    <p className="num text-muted">{formatJalali(h.at.slice(0, 10))}</p>
                    <p className="mt-0.5 font-medium">{FIELD_LABEL_FA[h.field] ?? h.field}</p>
                    <p className="text-muted">
                      {h.fromValue || '—'} ← {h.toValue}
                    </p>
                  </li>
                ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-3.5 text-xs">
          <Section>
            <InfoRow label="چینج (Chainage)" value={formatChainage(joint.chainageMeters)} />
            <InfoRow label="آخرین فعالیت" value={lastActivityAt ? formatJalali(lastActivityAt.slice(0, 10)) : '—'} />
            <InfoRow label="مختصات" value={`${position.lat.toFixed(4)}, ${position.lon.toFixed(4)}`} icon={<MapPin size={10} />} />
            <InfoRow label="ارتفاع" value={position.elevation != null ? `${position.elevation.toFixed(1)} m` : '—'} />
          </Section>

          <Section title="مشخصات لوله">
            <InfoRow label="سرجوش قبل" value={prevJointNumber ?? '—'} />
            <InfoRow label="سرجوش بعد" value={nextJointNumber ?? '—'} />
            <InfoRow label="قطر" value={`Ø${pipe.diameterInch}″`} />
            <InfoRow label="ضخامت جدار" value={`${pipe.wallThicknessMm} mm`} />
            <InfoRow label="جنس" value={pipe.material} />
          </Section>

          <Section title="فعالیت‌های ساخت">
            <StatusRow label={FIELD_LABEL_FA.weldingStatus} value={joint.weldingStatus} options={WELDING_OPTIONS} editable={editable} onChange={(v) => onUpdate('weldingStatus', v)} />
            <StatusRow label={FIELD_LABEL_FA.ndtStatus} value={joint.ndtStatus} options={NDT_OPTIONS} editable={editable} onChange={(v) => onUpdate('ndtStatus', v)} />
            <StatusRow label={FIELD_LABEL_FA.coatingStatus} value={joint.coatingStatus} options={COATING_OPTIONS} editable={editable} onChange={(v) => onUpdate('coatingStatus', v)} />
            <StatusRow label={FIELD_LABEL_FA.loweringStatus} value={joint.loweringStatus} options={LOWERING_OPTIONS} editable={editable} onChange={(v) => onUpdate('loweringStatus', v)} />
            <StatusRow label={FIELD_LABEL_FA.backfillStatus} value={joint.backfillStatus} options={BACKFILL_OPTIONS} editable={editable} onChange={(v) => onUpdate('backfillStatus', v)} />
          </Section>

          <Section>
            <p className="mb-1 text-[10px] text-muted">{FIELD_LABEL_FA.notes}</p>
            {editable ? (
              <textarea
                defaultValue={joint.notes}
                onBlur={(e) => onUpdate('notes', e.target.value)}
                rows={2}
                className="w-full resize-none rounded-lg border border-white/10 bg-white/5 p-1.5 text-[11px] outline-none focus:border-brand-400"
              />
            ) : (
              <p className="text-[11px] text-secondary">{joint.notes || '—'}</p>
            )}
          </Section>

          <div className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] text-muted">
            <FileText size={12} /> اسناد پیوست‌شده: ۰
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div>
      {title && <p className="mb-1.5 text-[10px] font-bold text-secondary">{title}</p>}
      <div className="space-y-1.5 rounded-xl border border-white/10 p-2.5">{children}</div>
    </div>
  )
}

function InfoRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1 text-muted">
        {icon}
        {label}
      </span>
      <span className="num font-medium">{value}</span>
    </div>
  )
}

function StatusRow<V extends string>({
  label,
  value,
  options,
  editable,
  onChange,
}: {
  label: string
  value: V
  options: { value: V; label: string }[]
  editable: boolean
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted">{label}</span>
      {editable ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/5 px-1.5 py-1 text-[11px] outline-none focus:border-brand-400"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <span className="font-medium">{options.find((o) => o.value === value)?.label ?? value}</span>
      )}
    </div>
  )
}
