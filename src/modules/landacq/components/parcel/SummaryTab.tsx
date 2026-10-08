import { useEffect, useState } from 'react'
import { AlertOctagon, CalendarClock, Gauge } from 'lucide-react'
import type { Parcel, AcqRoute, LandType, OwnershipClass } from '../../types'
import type { Analysis } from '../../lib/kpis'
import { useLandStore } from '../../store/useLandStore'
import { AGREEMENT_LABEL, FLAG_LABEL, LAND_TYPES, LAND_TYPE_LABEL, LEVEL_COLOR, OWNERSHIP_CLASSES, OWNERSHIP_LABEL, ROUTE_HINT, ROUTE_LABEL, STAGE_LABEL } from '../../lib/labels'
import { OWNERSHIP_COLOR } from '../../lib/colors'
import { currentStage } from '../../lib/workflow'
import { ownerCountOf } from '../../lib/scoring'
import { fmtDate, fmtDuration, faNum, relDays } from '../../lib/fa'
import { DELAY_HIGHLIGHT_THRESHOLD } from '../../lib/forecast'
import { Field } from '../ui'
import { HelpButton } from '../Help'
import { STATION, STATION_TYPES } from '../../lib/facilities'
import type { StationType } from '../../types'

/** The one-glance answer: where is the problem, what is its state, what must be done — then the editable screening profile. */
export function SummaryTab({ a }: { a: Analysis }) {
  const p = a.parcel
  const update = useLandStore((s) => s.updateParcel)
  const setTab = useLandStore((s) => s.setTab)
  const cur = currentStage(p)
  const ea = a.early

  return (
    <div className="flex flex-col gap-4 p-5">
      {/* ---------------------------------------------------------------- action banner */}
      {ea.state === 'action_required' && (
        <div className="flex gap-3 rounded-2xl p-4" style={{ background: 'color-mix(in srgb, #ef4444 12%, var(--la-surface))', border: '1px solid color-mix(in srgb, #ef4444 45%, transparent)' }}>
          <AlertOctagon size={22} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
          <div className="min-w-0">
            <p className="m-0 text-[13.5px] font-bold" style={{ color: '#ef4444' }}>Land Acquisition Action Required</p>
            <p className="la-eyebrow mt-1 leading-7" style={{ color: 'var(--la-ink-2)' }}>
              تحصیل این قطعه باید از {fmtDate(ea.startBy)} ({relDays(ea.daysToStartBy ?? 0)}) شروع می‌شد و هنوز شروع نشده است.
            </p>
          </div>
        </div>
      )}
      {ea.state !== 'action_required' && ea.state !== 'ready' && ea.state !== 'unscheduled' && (
        <div className="flex gap-3 rounded-2xl p-4" style={{ background: 'var(--la-surface-2)', border: `1px solid ${ea.state === 'delay_expected' ? 'color-mix(in srgb, #f97316 45%, transparent)' : 'var(--la-line)'}` }}>
          <CalendarClock size={20} style={{ color: ea.state === 'delay_expected' ? '#f97316' : 'var(--la-ink-2)', flexShrink: 0, marginTop: 2 }} />
          <p className="m-0 text-[12.5px] leading-7" style={{ color: 'var(--la-ink-2)' }}>
            {ea.state === 'delay_expected' ? <b style={{ color: '#f97316' }}>تأخیر پیش‌بینی می‌شود: </b> : null}
            با روند فعلی، آزادسازی حدود {fmtDate(ea.projectedRelease)} است و فعالیت اجرایی {fmtDate(ea.needBy)} به این قطعه می‌رسد
            {ea.delayDays > 0 ? ` — ${fmtDuration(ea.delayDays)} پس از نیاز برنامه.` : ' — در حال حاضر مشکلی دیده نمی‌شود.'}
          </p>
        </div>
      )}

      {p.kind === 'station' && (
        <section className="la-card-flat grid grid-cols-2 gap-3 p-4">
          <p className="la-title col-span-2 m-0">مشخصات ایستگاه</p>
          <Field label="نوع ایستگاه"><select className="la-select" value={p.stationType} onChange={(e) => update(p.id, { stationType: e.target.value as StationType })}>{STATION_TYPES.map((t) => <option key={t} value={t}>{STATION[t].label}</option>)}</select></Field>
          <Field label="کیلومتر محل"><input className="la-input la-num" type="number" step={0.05} defaultValue={p.kmStart} key={`k${p.kmStart}`} onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== p.kmStart) update(p.id, { kmStart: v, kmEnd: +(v + 0.001).toFixed(3) }) }} /></Field>
          <Field label="مساحت موردنیاز (م²)"><input className="la-input la-num" type="number" min={0} defaultValue={p.areaM2 ?? ''} key={`a${p.areaM2}`} onBlur={(e) => update(p.id, { areaM2: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
          <Field label="طول / عرض جغرافیایی (اختیاری)" hint="برای نمایش دقیق روی نقشه"><div className="flex gap-1.5"><input className="la-input la-km" placeholder="lon" defaultValue={p.siteLon ?? ''} key={`o${p.siteLon}`} onBlur={(e) => update(p.id, { siteLon: e.target.value === '' ? null : Number(e.target.value) })} /><input className="la-input la-km" placeholder="lat" defaultValue={p.siteLat ?? ''} key={`t${p.siteLat}`} onBlur={(e) => update(p.id, { siteLat: e.target.value === '' ? null : Number(e.target.value) })} /></div></Field>
        </section>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="شروع عملیات اجرایی" value={ea.needBy ? fmtDate(ea.needBy) : 'بدون فعالیت مرتبط'} sub={ea.daysToNeedBy != null ? relDays(ea.daysToNeedBy) : undefined} />
        <Stat label="شروع موردنیاز تحصیل" value={ea.startBy ? fmtDate(ea.startBy) : '—'} sub={ea.daysToStartBy != null ? relDays(ea.daysToStartBy) : undefined} danger={ea.daysToStartBy != null && ea.daysToStartBy <= 0 && ea.state !== 'ready'} />
        <Stat label="مدت پیش‌بینی تحصیل" value={a.released ? 'تکمیل شد' : fmtDuration(ea.remaining)} sub={a.released ? undefined : 'باقی‌مانده تا آمادهٔ اجرا'} />
        <Stat label="وضعیت فعلی" value={a.released ? 'آماده برای اجرا' : cur ? STAGE_LABEL[cur.key] : '—'} sub={`${faNum(Math.round(a.progress * 100))}٪ مراحل`} />
      </div>

      {/* ---------------------------------------------------------------- criticality */}
      <section className="la-card-flat p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="la-title m-0 flex items-center gap-2"><Gauge size={15} /> Land Criticality Score</p>
          <span className="text-[22px] font-bold la-num" style={{ color: LEVEL_COLOR[a.crit.level] }}>{faNum(a.crit.score)}</span>
        </div>
        <div className="la-bar mt-2.5" aria-hidden><i style={{ flexGrow: a.crit.score, background: LEVEL_COLOR[a.crit.level] }} /><i style={{ flexGrow: 100 - a.crit.score }} /></div>
        {a.crit.resolved ? <p className="la-eyebrow mt-2 leading-6">زمین آزاد شده است؛ ریسک زمین برطرف شد.</p> : (
          <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">
            {a.crit.factors.slice(0, 6).map((f) => (
              <li key={f.key} className="flex items-center justify-between gap-3 text-[12px]"><span style={{ color: 'var(--la-ink-2)' }}>{f.label}</span><span className="la-num font-semibold">+{faNum(f.points)}</span></li>
            ))}
            {a.crit.factors.length === 0 && <li className="la-eyebrow">عامل خطری ثبت نشده — پروفایل زیر را کامل کنید.</li>}
          </ul>
        )}
      </section>

      {/* ---------------------------------------------------------------- forecast */}
      {!a.released && (
        <section className="la-card-flat p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="la-title m-0">پیش‌بینی تأخیر</p>
            <span className="la-num text-[15px] font-bold" style={{ color: a.forecast.probability >= DELAY_HIGHLIGHT_THRESHOLD ? '#f97316' : 'var(--la-ink)' }}>{faNum(a.forecast.probability)}٪ احتمال</span>
          </div>
          <p className="la-eyebrow mt-1 leading-6">{a.forecast.expectedDelayDays > 0 ? `تأخیر محتمل: حدود ${fmtDuration(a.forecast.expectedDelayDays)} نسبت به نیاز برنامه` : 'تأخیر محسوسی پیش‌بینی نمی‌شود.'}</p>
          {a.forecast.drivers.length > 0 && <ul className="m-0 mt-2 list-disc ps-5 text-[12px] leading-7" style={{ color: 'var(--la-ink-2)' }}>{a.forecast.drivers.map((d) => <li key={d.label}>{d.label}</li>)}</ul>}
        </section>
      )}

      {/* ---------------------------------------------------------------- screening profile */}
      <ProfileEditor p={p} onChange={(patch) => update(p.id, patch)} />
      <button className="la-btn la-btn-sm self-start" onClick={() => setTab('schedule')}>نمایش این قطعه در برنامه زمان‌بندی</button>
      <p className="la-eyebrow">{faNum(ownerCountOf(p))} مالک · {p.owners.length ? `${faNum(p.owners.filter((o) => o.agreement === 'agreed').length)} توافق‌شده (${AGREEMENT_LABEL.agreed})` : 'مالکی ثبت نشده'}</p>
    </div>
  )
}

function Stat({ label, value, sub, danger }: { label: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <div className="la-card-flat p-3">
      <p className="la-eyebrow m-0">{label}</p>
      <p className="m-0 mt-1 text-[13px] font-bold leading-6" style={{ color: danger ? '#ef4444' : undefined }}>{value}</p>
      {sub && <p className="la-eyebrow m-0">{sub}</p>}
    </div>
  )
}

/** Screening profile: chips for the categorical facts, numbers saved on blur — no long form. */
export function ProfileEditor({ p, onChange }: { p: Parcel; onChange: (patch: Partial<Parcel>) => void }) {
  const [text, setText] = useState({ landUse: p.landUse, custodian: p.custodian, title: p.title, notes: p.notes })
  useEffect(() => setText({ landUse: p.landUse, custodian: p.custodian, title: p.title, notes: p.notes }), [p.id, p.landUse, p.custodian, p.title, p.notes])
  const flag = (k: keyof typeof FLAG_LABEL) => onChange({ flags: { ...p.flags, [k]: !p.flags[k] } })
  return (
    <section className="la-card-flat flex flex-col gap-4 p-4">
      <p className="la-title m-0">پروفایل اسکن قطعه</p>
      <Field label="ماهیت مالکیت">
        <div className="flex flex-wrap gap-1.5">
          {OWNERSHIP_CLASSES.map((c) => (
            <button key={c} className="la-chip" aria-pressed={p.ownershipClass === c} onClick={() => onChange({ ownershipClass: c as OwnershipClass })}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: OWNERSHIP_COLOR[c] }} /> {OWNERSHIP_LABEL[c]}
            </button>
          ))}
        </div>
      </Field>
      <Field label="نوع زمین">
        <div className="flex flex-wrap gap-1.5">
          {LAND_TYPES.map((t) => <button key={t} className="la-chip" aria-pressed={p.landType === t} onClick={() => onChange({ landType: t as LandType })}>{LAND_TYPE_LABEL[t]}</button>)}
        </div>
      </Field>
      <Field label="مسیر تحصیل" hint={ROUTE_HINT[p.acquisitionRoute]}>
        <span className="la-hint"><HelpButton topic="routes" label="مسیرها چه فرقی دارند؟" /></span>
        <div className="la-seg" role="group" aria-label="مسیر تحصیل">
          {(Object.keys(ROUTE_LABEL) as AcqRoute[]).map((r) => <button key={r} aria-pressed={p.acquisitionRoute === r} onClick={() => onChange({ acquisitionRoute: r })}>{ROUTE_LABEL[r]}</button>)}
        </div>
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="تعداد مالکین (برآورد)"><input className="la-input la-num" type="number" min={0} defaultValue={p.ownerCountEst} key={`o${p.id}${p.ownerCountEst}`} onBlur={(e) => onChange({ ownerCountEst: Math.max(0, Math.round(Number(e.target.value) || 0)) })} /></Field>
        <Field label="احتمال اختلاف (٪)"><input className="la-input la-num" type="number" min={0} max={100} step={5} defaultValue={p.disputeProbability} key={`d${p.id}${p.disputeProbability}`} onBlur={(e) => onChange({ disputeProbability: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) })} /></Field>
        <Field label="پیچیدگی (۱ تا ۵)">
          <select className="la-select" value={p.complexity} onChange={(e) => onChange({ complexity: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{faNum(n)}</option>)}</select>
        </Field>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-[12.5px]"><input type="checkbox" checked={p.ownerKnown} onChange={(e) => onChange({ ownerKnown: e.target.checked })} /> مالک / مالکین شناسایی شده‌اند</label>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(FLAG_LABEL) as (keyof typeof FLAG_LABEL)[]).map((k) => <button key={k} className="la-chip" aria-pressed={!!p.flags[k]} onClick={() => flag(k)}>{FLAG_LABEL[k]}</button>)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="کاربری زمین"><input className="la-input" value={text.landUse} onChange={(e) => setText({ ...text, landUse: e.target.value })} onBlur={() => text.landUse !== p.landUse && onChange({ landUse: text.landUse })} /></Field>
        <Field label="دستگاه / نهاد متولی"><input className="la-input" value={text.custodian} onChange={(e) => setText({ ...text, custodian: e.target.value })} onBlur={() => text.custodian !== p.custodian && onChange({ custodian: text.custodian })} /></Field>
        <Field label="مدت برآوردی تعیین تکلیف (روز)" hint="خالی = محاسبهٔ خودکار از مسیر و پیچیدگی"><input className="la-input la-num" type="number" min={0} defaultValue={p.estDurationDays ?? ''} key={`e${p.id}${p.estDurationDays}`} onBlur={(e) => onChange({ estDurationDays: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))) })} /></Field>
        <Field label="عنوان کوتاه"><input className="la-input" value={text.title} onChange={(e) => setText({ ...text, title: e.target.value })} onBlur={() => text.title !== p.title && onChange({ title: text.title })} /></Field>
      </div>
      <Field label="توضیح"><textarea className="la-input la-textarea" value={text.notes} onChange={(e) => setText({ ...text, notes: e.target.value })} onBlur={() => text.notes !== p.notes && onChange({ notes: text.notes })} /></Field>
    </section>
  )
}
