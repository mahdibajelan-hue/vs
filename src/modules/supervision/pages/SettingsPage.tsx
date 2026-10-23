import { useEffect, useMemo, useState } from 'react'
import { Clock3, Fingerprint, Save } from 'lucide-react'
import { useSupervisionStore } from '../store/useSupervisionStore'
import { fa, faNum, monthDays, monthLabel, type Ym } from '../lib/svMonth'
import { dayHours } from '../lib/svCalc'
import type { SvPerson, SvSettings } from '../types'
import { Flash, MonthNav } from '../components/common'
import { TimeField } from '../components/TimeField'
import { SitesCard } from '../components/SitesCard'

const FIELDS: { k: keyof SvSettings; label: string; hint: string; step?: number }[] = [
  { k: 'dutyDays', label: 'روز موظفی در ماه', hint: 'از ۳۰ روز؛ بقیه روز استراحت است (پنجشنبه و جمعه هم روز کاری‌اند).' },
  { k: 'standardHours', label: 'ساعت موظفی روزانه', hint: 'از ساعت ورود تا خروج، تا این مقدار کارکرد عادی و بیشتر از آن اضافه‌کار است.', step: 0.5 },
  { k: 'overtimeMin', label: 'کف اضافه‌کار ماهانه (ساعت)', hint: 'در گزارش، کمتر از این مقدار با رنگ زرد نشان داده می‌شود.' },
  { k: 'overtimeMax', label: 'سقف اضافه‌کار ماهانه (ساعت)', hint: 'پیش‌فرض هر نفر؛ برای هر نفر جداگانه هم قابل تغییر است.' },
  { k: 'vehicleHours', label: 'ساعت کار روزانهٔ خودرو', hint: 'روز کارکرد خودرو با این مقدار ثبت می‌شود.', step: 0.5 },
  { k: 'networkMaxM', label: 'حداکثر خطای موقعیت آنتن (متر)', hint: 'وقتی GPS گوشی دقیق نیست، موقعیت آنتن/شبکهٔ گوشی تا این خطا پذیرفته می‌شود (به شرط رسیدن دایرهٔ خطا به محل). کمتر = سخت‌گیرانه‌تر. پیش‌فرض ۲۰۰۰.' },
  { k: 'entryGraceDays', label: 'مهلت ثبت (روز)', hint: 'هر روز را تا این تعداد روز بعد می‌توان بی‌دلیل ثبت کرد؛ بعد از آن نوشتن دلیل لازم است و «ثبت با تأخیر» در گزارش شمرده می‌شود.' },
]

/** تنظیمات — the rules behind the report, and the time-clock bridge. */
export function SettingsPage({ month, onMonth }: { month: Ym; onMonth: (m: Ym) => void }) {
  const settings = useSupervisionStore((s) => s.settings)
  const saveSettings = useSupervisionStore((s) => s.saveSettings)
  const clockCount = useSupervisionStore((s) => s.clockCount)
  const applyClock = useSupervisionStore((s) => s.applyClock)
  const projectId = useSupervisionStore((s) => s.projectId)
  const [f, setF] = useState(settings)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [clockMsg, setClockMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [punches, setPunches] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => setF(settings), [settings])
  const range = useMemo(() => { const d = monthDays(month); return { from: d[0].iso, to: d[d.length - 1].iso } }, [month])
  useEffect(() => { setPunches(null); void clockCount(range.from, range.to).then(setPunches) }, [range, clockCount, projectId])

  const save = async () => {
    if (f.overtimeMin > f.overtimeMax) return setMsg({ ok: false, text: 'کف اضافه‌کار از سقف بیشتر است.' })
    const r = await saveSettings(f)
    setMsg(r.ok ? { ok: true, text: 'تنظیمات ذخیره شد.' } : { ok: false, text: r.error ?? '' })
  }
  const apply = async () => {
    setBusy(true); setClockMsg(null)
    const r = await applyClock(range.from, range.to)
    setBusy(false)
    setClockMsg(r.ok ? { ok: true, text: `${fa(r.people ?? 0)} روزِ نفرات و ${fa(r.vehicles ?? 0)} روزِ خودرو از کارت ساعت ثبت شد. روزهایی که دستی ثبت شده‌اند و روزهای ماه‌های امضاشده دست نخوردند.` } : { ok: false, text: r.error ?? '' })
  }

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 860 }}>
      <div className="im-card">
        <h2 style={{ fontSize: 16, fontWeight: 900, margin: '0 0 12px' }}>قواعد حضور و اضافه‌کار این پروژه</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
          {FIELDS.map((x) => (
            <div key={x.k} className="im-field" style={{ margin: 0 }}>
              <label htmlFor={`sv-set-${x.k}`}>{x.label}</label>
              <input id={`sv-set-${x.k}`} type="number" min={0} step={x.step ?? 1} value={f[x.k]} onChange={(e) => setF({ ...f, [x.k]: Number(e.target.value) })} />
              <small className="sv-note">{x.hint}</small>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}><button className="im-btn im-btn-primary" onClick={save}><Save size={15} /> ذخیرهٔ قواعد</button><Flash msg={msg} /></div>
      </div>

      <ShiftCard />

      <SitesCard />

      <div className="im-card">
        <h2 style={{ fontSize: 16, fontWeight: 900, margin: '0 0 6px' }}><Fingerprint size={17} style={{ display: 'inline', verticalAlign: -3 }} /> کارت ساعت و دستگاه حضور و غیاب</h2>
        <p className="sv-note" style={{ margin: '0 0 12px' }}>
          هر دستگاه کارت‌خوان یا اثرانگشت می‌تواند هر تردد را به‌صورت یک ردیف در جدول <code>sv_clock_events</code> بفرستد (شمارهٔ کارت، زمان، نام دستگاه). برای هر نفر یا خودرو، شمارهٔ کارت را در «نفرات و خودروها» وارد کنید.
          با دکمهٔ زیر، اولین تردد هر روز «ورود» و آخرین تردد «خروج» حساب می‌شود و ساعت کار و اضافه‌کار خودکار ثبت می‌شود. روزهایی که دستی ثبت شده‌اند تغییر نمی‌کنند.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <MonthNav value={month} onChange={onMonth} />
          <span className="sv-note">{punches === null ? '…' : `${fa(punches)} تردد در ${monthLabel(month)}`}</span>
          <button className="im-btn im-btn-ghost" disabled={busy || !punches} onClick={apply}>{busy ? 'در حال ثبت…' : 'ثبت حضور از روی ترددها'}</button>
        </div>
        <Flash msg={clockMsg} />
      </div>
    </div>
  )
}

/** ساعت کاری هر نفر — the shift a «present» day takes when no clock times are typed (day or night). */
function ShiftCard() {
  const people = useSupervisionStore((s) => s.people)
  const settings = useSupervisionStore((s) => s.settings)
  const active = people.filter((p) => p.active)
  return (
    <div className="im-card">
      <h2 style={{ fontSize: 16, fontWeight: 900, margin: '0 0 6px' }}><Clock3 size={17} style={{ display: 'inline', verticalAlign: -3 }} /> ساعت کاری نفرات</h2>
      <p className="sv-note" style={{ margin: '0 0 12px' }}>ساعت شروع و پایان کار هر نفر؛ روزی که «حاضر» زده می‌شود همین ساعت‌ها را می‌گیرد و {fa(settings.standardHours)} ساعت اول موظفی و بقیه اضافه‌کار حساب می‌شود. برای شیفت شب، خروج را صبح روز بعد بنویسید (مثلاً ۱۹:۰۰ تا ۰۷:۰۰). خالی = {fa(settings.standardHours)} ساعت بدون اضافه‌کار. ساعت ورود و خروج هر روز را در جدول حضور هم می‌توان جداگانه تغییر داد.</p>
      {active.length === 0 ? <p className="sv-note">نفر فعالی نیست.</p> : (
        <div className="im-table-wrap"><table className="im-table">
          <thead><tr><th>نام</th><th>شروع</th><th>پایان</th><th>کارکرد روزانه</th><th /></tr></thead>
          <tbody>{active.map((p) => <ShiftRow key={p.id} p={p} />)}</tbody>
        </table></div>
      )}
    </div>
  )
}

function ShiftRow({ p }: { p: SvPerson }) {
  const settings = useSupervisionStore((s) => s.settings)
  const savePerson = useSupervisionStore((s) => s.savePerson)
  const [v, setV] = useState({ start: p.shiftStart ?? '', end: p.shiftEnd ?? '' })
  const [state, setState] = useState<'' | 'saved' | string>('')
  useEffect(() => setV({ start: p.shiftStart ?? '', end: p.shiftEnd ?? '' }), [p.shiftStart, p.shiftEnd])
  const dirty = v.start !== (p.shiftStart ?? '') || v.end !== (p.shiftEnd ?? '')
  const h = dayHours(v.start || null, v.end || null, settings)
  const save = async () => {
    if (!!v.start !== !!v.end) return setState('هر دو ساعت را بنویسید یا هر دو را خالی بگذارید.')
    const r = await savePerson({ id: p.id, shiftStart: v.start || null, shiftEnd: v.end || null })
    setState(r.ok ? 'saved' : r.error ?? 'ذخیره نشد')
  }
  return (
    <tr>
      <td><b>{p.fullName}</b><div className="sv-sub">{p.roleTitle}</div></td>
      <td><TimeField label={`شروع کار ${p.fullName}`} value={v.start} onChange={(x) => { setV({ ...v, start: x }); setState('') }} /></td>
      <td><TimeField label={`پایان کار ${p.fullName}`} value={v.end} onChange={(x) => { setV({ ...v, end: x }); setState('') }} /></td>
      <td className="sv-num">{faNum(h.hours)} ساعت{h.overtime > 0 && <span className="sv-warn"> (+{faNum(h.overtime)} اضافه‌کار)</span>}</td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <button className="im-btn im-btn-ghost im-btn-sm" disabled={!dirty} onClick={save}><Save size={13} /> ذخیره</button>
        {state === 'saved' ? <span className="sv-ok" style={{ fontSize: 12, marginInlineStart: 6 }}>ذخیره شد</span> : state && <span className="sv-bad" style={{ fontSize: 12, marginInlineStart: 6 }}>{state}</span>}
      </td>
    </tr>
  )
}
