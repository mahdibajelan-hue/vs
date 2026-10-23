import { useEffect, useMemo, useState } from 'react'
import { Fingerprint, Save } from 'lucide-react'
import { useSupervisionStore } from '../store/useSupervisionStore'
import { fa, monthDays, monthLabel, type Ym } from '../lib/svMonth'
import type { SvSettings } from '../types'
import { Flash, MonthNav, TeamLink } from '../components/common'
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

      <TeamLink />

      <SitesCard />

      <div className="im-card">
        <h2 style={{ fontSize: 16, fontWeight: 900, margin: '0 0 6px' }}><Fingerprint size={17} style={{ display: 'inline', verticalAlign: -3 }} /> کارت ساعت و دستگاه حضور و غیاب</h2>
        <p className="sv-note" style={{ margin: '0 0 12px' }}>
          هر دستگاه کارت‌خوان یا اثرانگشت می‌تواند هر تردد را به‌صورت یک ردیف در جدول <code>sv_clock_events</code> بفرستد (شمارهٔ کارت، زمان، نام دستگاه). شمارهٔ کارت هر نفر در داده‌های پایه (نظارت کارگاهی) و هر خودرو در «نفرات و خودروها» نوشته می‌شود.
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
