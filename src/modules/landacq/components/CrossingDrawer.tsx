import { useMemo, useState } from 'react'
import { ArrowUpRight, Check, Lock, Save, Trash2, TriangleAlert } from 'lucide-react'
import { JalaliDateInput, useAuthStore } from '../platform'
import type { Crossing, CrossingType, PermitStatus, UndertakingStatus } from '../types'
import type { CrossingInput } from '../repo/types'
import { useLandStore, useLandAnalysis } from '../store/useLandStore'
import { CROSSING, CROSSING_STATUS_COLOR, CROSSING_STATUS_LABEL, CROSSING_TYPES, PERMIT_LABEL, UNDERTAKING_LABEL, crossingDrafts, crossingState } from '../lib/facilities'
import { openRecord } from '../integration/records'
import { fmtDate, fmtMoney } from '../lib/fa'
import { Badge, ConfirmDialog, Drawer, Field } from './ui'

export const blankCrossing = (km: number, type: CrossingType = 'paved_road'): CrossingInput => ({ code: '', crossingType: type, name: '', km, custodian: CROSSING[type].custodian, permitStatus: 'not_started', permitRequestedDate: null, permitIssuedDate: null, permitNumber: '', undertakingRequired: true, undertakingStatus: 'pending', undertakingDate: null, undertakingNote: '', feeRequired: false, feeAmount: 0, feePaidAmount: 0, feePaidDate: null, legalNotes: '', conditions: '', responsible: '', nextDeadline: null, nextDeadlineLabel: '', isDemo: false })

/** One crossing: permit, undertaking (تعهدنامه), fee, legal follow-up — with alarms and one-click Issue / Risk hand-over. */
export function CrossingDrawer({ crossing, onClose }: { crossing: Crossing | null; onClose: () => void }) {
  const save = useLandStore((s) => s.saveCrossing)
  const del = useLandStore((s) => s.deleteCrossing)
  const transfer = useLandStore((s) => s.transferCrossing)
  const activities = useLandStore((s) => s.data?.activities)
  const total = useLandStore((s) => (s.data?.route ? s.data.route.startKm + s.data.route.totalKm : 0))
  const startKm = useLandStore((s) => s.data?.route?.startKm ?? 0)
  const role = useLandStore((s) => s.data?.myRole ?? null)
  const isAdmin = !!useAuthStore((s) => s.profile?.isAdmin)
  const { today } = useLandAnalysis()
  const [f, setF] = useState<CrossingInput>(() => (crossing ? { ...crossing } : blankCrossing(startKm)))
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const canEdit = isAdmin || role === 'contractor' || !role
  const live: Crossing = { ...(crossing ?? ({} as Crossing)), ...f, id: crossing?.id ?? '', masterProjectId: crossing?.masterProjectId ?? '', riskId: crossing?.riskId ?? null, issueId: crossing?.issueId ?? null }
  const st = useMemo(() => crossingState(live, activities ?? [], today), [live, activities, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const drafts = useMemo(() => crossingDrafts(live, st, today), [live, st, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof CrossingInput>(k: K, v: CrossingInput[K]) => setF((x) => ({ ...x, [k]: v }))
  const date = (k: 'permitRequestedDate' | 'permitIssuedDate' | 'undertakingDate' | 'feePaidDate', label: string) => (
    <div><span className="la-label">{label}</span><div className="flex gap-1.5"><div className="min-w-0 flex-1"><JalaliDateInput value={f[k] ?? ''} onChange={(iso) => set(k, iso)} /></div>{f[k] && <button type="button" className="la-btn la-btn-icon la-btn-sm" aria-label="پاک کردن" onClick={() => set(k, null)}>×</button>}</div></div>
  )
  const bad = f.km < startKm || f.km > total
  const color = CROSSING_STATUS_COLOR[st.status]

  return (
    <>
      <Drawer
        onClose={onClose}
        title={crossing ? `${CROSSING[f.crossingType].label}${f.name ? ` · ${f.name}` : ''}` : 'عبور جدید از تأسیسات'}
        subtitle={`KM ${f.km} · متولی: ${f.custodian || '—'}`}
        badge={<Badge color={color}>{CROSSING_STATUS_LABEL[st.status]}</Badge>}
        footer={
          <>
            {crossing && canEdit && <button className="la-btn la-btn-danger la-btn-sm me-auto" onClick={() => setConfirm(true)}><Trash2 size={13} /> حذف</button>}
            <button className="la-btn" onClick={onClose}>بستن</button>
            <button className="la-btn la-btn-primary" disabled={busy || bad || !canEdit} onClick={async () => { setBusy(true); await save(f); setBusy(false); onClose() }}><Save size={14} /> ذخیره</button>
          </>
        }
      >
        <div className="flex flex-col gap-4 p-5">
          {!canEdit && (
            <div role="alert" className="flex gap-3 rounded-xl p-3.5" style={{ background: 'color-mix(in srgb, #f59e0b 12%, var(--la-surface))', border: '1px solid color-mix(in srgb, #f59e0b 45%, transparent)' }}>
              <Lock size={17} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
              <p className="m-0 text-[12.5px] leading-7"><b>امکان تغییر اطلاعات وجود ندارد.</b> ورود اطلاعات عبورها با پیمانکار است؛ نقش شما فقط بررسی و پیگیری است.</p>
            </div>
          )}
          {st.alarms.length > 0 && (
            <section className="rounded-xl p-4" style={{ border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`, background: `color-mix(in srgb, ${color} 7%, var(--la-surface))` }}>
              <p className="m-0 flex items-center gap-2 text-[13px] font-bold"><TriangleAlert size={16} style={{ color }} /> هشدارها</p>
              <ul className="m-0 mt-2 list-disc ps-5 text-[12px] leading-7">{st.alarms.map((a) => <li key={a.key} style={{ color: a.level === 'critical' ? 'var(--la-ink)' : 'var(--la-ink-2)' }}>{a.text}</li>)}</ul>
            </section>
          )}
          <ol className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {st.steps.filter((s) => s.applicable).map((s) => (
              <li key={s.key} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold" style={{ background: s.done ? 'color-mix(in srgb, #22c55e 14%, transparent)' : 'var(--la-surface-2)', border: `1px solid ${s.done ? 'color-mix(in srgb, #22c55e 40%, transparent)' : 'var(--la-line)'}` }}>
                {s.done && <Check size={12} style={{ color: '#22c55e' }} />} {s.label}
              </li>
            ))}
          </ol>
          {st.needBy && <p className="la-eyebrow m-0 leading-7">نیاز اجرایی: <b>{fmtDate(st.needBy)}</b> · آخرین زمان ارسال درخواست مجوز: <b>{fmtDate(st.requestBy)}</b> (زمان معمول بررسی {CROSSING[f.crossingType].leadDays.toLocaleString('fa-IR')} روز)</p>}

          <fieldset disabled={!canEdit} className="m-0 grid gap-3 border-0 p-0 sm:grid-cols-2" style={{ minWidth: 0 }}>
            <Field label="نوع تأسیسات / مانع"><select className="la-select" value={f.crossingType} onChange={(e) => { const t = e.target.value as CrossingType; setF((x) => ({ ...x, crossingType: t, custodian: x.custodian && x.custodian !== CROSSING[x.crossingType].custodian ? x.custodian : CROSSING[t].custodian })) }}>{CROSSING_TYPES.map((t) => <option key={t} value={t}>{CROSSING[t].label}</option>)}</select></Field>
            <Field label="کیلومتر عبور" hint={bad ? 'خارج از بازهٔ مسیر است' : undefined}><input className="la-input la-num" type="number" step={0.05} value={f.km} onChange={(e) => set('km', Number(e.target.value))} /></Field>
            <Field label="نام / شرح (مثلاً رودخانهٔ کرج)"><input className="la-input" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="دستگاه متولی"><input className="la-input" value={f.custodian} onChange={(e) => set('custodian', e.target.value)} /></Field>
            <Field label="وضعیت مجوز"><select className="la-select" value={f.permitStatus} onChange={(e) => set('permitStatus', e.target.value as PermitStatus)}>{(Object.keys(PERMIT_LABEL) as PermitStatus[]).map((k) => <option key={k} value={k}>{PERMIT_LABEL[k]}</option>)}</select></Field>
            <Field label="شمارهٔ مجوز"><input className="la-input la-km" value={f.permitNumber} onChange={(e) => set('permitNumber', e.target.value)} /></Field>
            {date('permitRequestedDate', 'تاریخ درخواست مجوز')}
            {date('permitIssuedDate', 'تاریخ صدور مجوز')}
            <label className="flex items-center gap-2 text-[12.5px] sm:col-span-2"><input type="checkbox" checked={f.undertakingRequired} onChange={(e) => set('undertakingRequired', e.target.checked)} /> تعهدنامهٔ مخصوص لازم است</label>
            {f.undertakingRequired && (
              <>
                <Field label="وضعیت تعهدنامه"><select className="la-select" value={f.undertakingStatus} onChange={(e) => set('undertakingStatus', e.target.value as UndertakingStatus)}>{(Object.keys(UNDERTAKING_LABEL) as UndertakingStatus[]).map((k) => <option key={k} value={k}>{UNDERTAKING_LABEL[k]}</option>)}</select></Field>
                {date('undertakingDate', 'تاریخ ارسال / امضا')}
                <Field label="مفاد اصلی تعهدنامه (مسئولیت‌ها، ضمانت‌ها)" className="sm:col-span-2"><textarea className="la-input la-textarea" value={f.undertakingNote} onChange={(e) => set('undertakingNote', e.target.value)} /></Field>
              </>
            )}
            <label className="flex items-center gap-2 text-[12.5px] sm:col-span-2"><input type="checkbox" checked={f.feeRequired} onChange={(e) => set('feeRequired', e.target.checked)} /> پرداخت هزینهٔ عبور لازم است</label>
            {f.feeRequired && (
              <>
                <Field label="هزینهٔ عبور (ریال)" hint={fmtMoney(f.feeAmount)}><input className="la-input la-num" type="number" min={0} value={f.feeAmount} onChange={(e) => set('feeAmount', Number(e.target.value))} /></Field>
                <Field label="پرداخت‌شده (ریال)" hint={st.feeRemaining > 0 ? `باقی‌مانده ${fmtMoney(st.feeRemaining)}` : 'تسویه شد'}><input className="la-input la-num" type="number" min={0} value={f.feePaidAmount} onChange={(e) => set('feePaidAmount', Number(e.target.value))} /></Field>
                {date('feePaidDate', 'تاریخ آخرین پرداخت')}
              </>
            )}
            <Field label="شرایط و الزامات متولی (مثلاً عمق، غلاف، ناظر)" className="sm:col-span-2"><textarea className="la-input la-textarea" value={f.conditions} onChange={(e) => set('conditions', e.target.value)} /></Field>
            <Field label="پیگیری حقوقی (نامه‌ها، جلسات، مصوبات)" className="sm:col-span-2"><textarea className="la-input la-textarea" value={f.legalNotes} onChange={(e) => set('legalNotes', e.target.value)} /></Field>
            <Field label="مسئول پیگیری" className="sm:col-span-2"><input className="la-input" value={f.responsible} onChange={(e) => set('responsible', e.target.value)} /></Field>
          </fieldset>

          {crossing && (
            <section className="la-card-flat p-4">
              <p className="la-title m-0">ثبت در مسائل و ریسک</p>
              <p className="la-eyebrow m-0 mt-1 leading-6">{drafts.issue ? 'مشکل شناسایی شد؛ متن آماده است.' : 'مشکل مهمی شناسایی نشده؛ در صورت نیاز می‌توانید دستی ثبت کنید.'}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(['issue', 'risk'] as const).map((t) => {
                  const id = t === 'issue' ? crossing.issueId : crossing.riskId
                  const d = t === 'issue' ? drafts.issue : drafts.risk
                  return id ? (
                    <button key={t} className="la-btn la-btn-sm" onClick={() => openRecord(t, id, crossing.masterProjectId)}>{t === 'issue' ? 'مسئله ثبت شد' : 'ریسک ثبت شد'} <ArrowUpRight size={12} /></button>
                  ) : (
                    <button key={t} className="la-btn la-btn-sm" disabled={!d && !canEdit} onClick={() => transfer(crossing.id, t, d?.params)}>{t === 'issue' ? 'ثبت در مدیریت مسائل' : 'ثبت در مدیریت ریسک'}</button>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      </Drawer>
      {confirm && crossing && <ConfirmDialog title="حذف عبور" confirmLabel="حذف" description="این عبور با همهٔ اطلاعات مجوز و تعهدنامه‌اش حذف می‌شود." onClose={() => setConfirm(false)} onConfirm={async () => { await del(crossing.id); setConfirm(false); onClose() }} />}
    </>
  )
}
