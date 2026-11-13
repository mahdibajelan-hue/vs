import { useState } from 'react'
import { CloudSunRain, Layers, ListChecks, Target, Users } from 'lucide-react'
import type { OutlookCtx } from '../../lib/useOutlook'
import { GROUND_FA, WX_CLASSES, WX_FA, type ActivityOutlook, type GroundState } from '../../lib/engine/outlook'
import { jalaliText } from '../../lib/periods'
import { Chip, DataTable, type Col } from '../../../finance/components/fn'
import { Bar, fa, pct } from '../../components/common'
import { OlCard, OlHead } from '../../components/outlook/olUi'

const CONF = { high: { t: 'good', l: 'بالا' }, medium: { t: 'warn', l: 'متوسط' }, low: { t: 'bad', l: 'کم' } } as const
const REASON: Record<ActivityOutlook['reason'], string> = { '': '', done: 'تکمیل‌شده', no_history: 'نه کارکرد دارد، نه اکیپ، نه تاریخ برنامه', no_rate: 'نرخ قابل محاسبه نیست', plan_based: 'بر پایهٔ برنامه', queued: 'در نوبت اکیپ', beyond: 'اکیپ فعلی در افق ۴ ساله به آن نمی‌رسد' }
const signDays = (n: number) => (n === 0 ? 'طبق برنامه' : n > 0 ? `${fa(n)} روز دیرتر` : `${fa(-n)} روز زودتر`)

export function OutlookActivities({ ctx, onGo }: { ctx: OutlookCtx; onGo: (sub: string) => void }) {
  const { m, o, inputs } = ctx
  const [sel, setSel] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const picked = sel ? o.activities.find((a) => a.activity.id === sel) ?? null : null
  const cur = (picked?.model ? picked : null) || o.activities.filter((a) => a.model && a.remaining > 0).sort((a, b) => b.activity.weight - a.activity.weight)[0] || null
  const rows = o.activities.filter((a) => a.remaining > 0 && (!q.trim() || a.activity.title.includes(q.trim()) || (a.activity.crew ?? '').includes(q.trim())))

  const cols: Col<ActivityOutlook>[] = [
    { key: 't', label: 'فعالیت', render: (a) => <><span className="strong">{a.activity.title}</span><span className="sub">{a.activity.group || 'کل پروژه'} · وزن {fa(a.activity.weight, 1)}</span></> },
    { key: 'cr', label: 'اکیپ', render: (a) => a.activity.crew ? <span className="olx-crewtag">{a.activity.crew}{inputs.crewSource[a.activity.id] === 'suggested' && <small>پیشنهادی</small>}</span> : <span className="sub">بدون اکیپ</span> },
    { key: 'r', label: 'باقیمانده', num: true, render: (a) => `${fa(a.remaining, 1)} ${a.activity.unit}`, sort: (a) => a.remaining },
    { key: 'p', label: 'پیشرفت', render: (a) => <><Bar value={a.activity.baseQty > 0 ? Math.min(1, a.activity.doneQty / a.activity.baseQty) : 0} /><span className="sub">{pct(a.activity.baseQty > 0 ? a.activity.doneQty / a.activity.baseQty : 0, 0)}</span></>, sort: (a) => (a.activity.baseQty ? a.activity.doneQty / a.activity.baseQty : 0) },
    { key: 'k', label: 'هر اکیپ در روز صاف', num: true, hint: 'خروجی یک اکیپ کامل در یک روز کاری صاف و خشک', render: (a) => (a.model ? fa(a.model.perCrewRate ?? a.model.clearDayRate, 1) : '—') },
    { key: 'w1', label: 'هفتهٔ آینده', num: true, render: (a) => (a.model || a.reason === 'queued' ? fa(a.next7, 1) : '—'), sort: (a) => a.next7 },
    { key: 'w4', label: '۴ هفتهٔ آینده', num: true, render: (a) => (a.model || a.reason === 'queued' ? fa(a.next28, 1) : '—'), sort: (a) => a.next28 },
    { key: 'f', label: 'پایان پیش‌بینی', render: (a) => a.finish ? <><span className="strong">{jalaliText(a.finish)}</span><span className="sub">{a.reason === 'plan_based' ? 'مدت برنامه ÷ شاخص عملکرد' : a.reason === 'queued' ? `اکیپ از ${a.start ? jalaliText(a.start) : '—'} به آن می‌رسد` : a.finishP10 && a.finishP90 && a.finish !== m.today ? `بازه ${jalaliText(a.finishP10)} تا ${jalaliText(a.finishP90)}` : ''}</span></> : <span className="sub">{REASON[a.reason] || '—'}</span>, sort: (a) => a.finish ?? '9999' },
    { key: 's', label: 'نسبت به برنامه', render: (a) => (a.slipDays == null ? <span className="sub">{a.activity.plannedEnd ? '—' : 'بدون تاریخ برنامه'}</span> : <Chip tone={a.slipDays > 14 ? 'bad' : a.slipDays > 0 ? 'warn' : 'good'}>{signDays(a.slipDays)}</Chip>), sort: (a) => a.slipDays ?? -9999 },
    { key: 'c', label: 'مبنا', render: (a) => (a.model ? <Chip tone={CONF[a.model.confidence].t}>{`کارکرد خودش · ${CONF[a.model.confidence].l}`}</Chip> : a.reason === 'queued' ? <Chip>نوبت اکیپ</Chip> : a.reason === 'plan_based' ? <Chip>برنامه</Chip> : '—') },
  ]

  return (
    <div className="olx-grid">
      <OlCard i={0}>
        <OlHead icon={ListChecks} color="#14b8a6" title="کارکرد آتی و پایان هر فعالیت" hint="روی هر ردیف بزنید تا عوامل اثرگذار آن را ببینید. اکیپ هر فعالیت در «تعاریف و تنظیمات» تعیین می‌شود."
          action={<><input className="im-input olx-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجوی فعالیت یا اکیپ…" aria-label="جست‌وجوی فعالیت یا اکیپ" /><button type="button" className="olx-btn" onClick={() => onGo('setup')}>تعیین اکیپ‌ها</button></>} />
        <div className="olx-flush"><DataTable cols={cols} rows={rows} rowKey={(a) => a.activity.id} onRow={(a) => setSel(a.activity.id)} empty={q ? 'فعالیتی با این عبارت نیست.' : 'همهٔ فعالیت‌ها تکمیل شده‌اند.'} /></div>
      </OlCard>

      {picked && !picked.model && <p className="im-helper" style={{ margin: 0 }}>«{picked.activity.title}» {picked.reason === 'queued' ? 'هنوز کارکردی ندارد؛ اکیپ خودش پس از کارهای جاری به آن می‌رسد.' : picked.reason === 'plan_based' ? 'هنوز کارکردی ندارد و اکیپش هم کارکردی ثبت نکرده؛ پایانش از مدت برنامه‌ای و شاخص عملکرد پروژه برآورد شده است.' : 'مدلی برای نمایش ندارد.'} عوامل زیر مربوط به «{cur?.activity.title}» است.</p>}
      {cur?.model && (() => {
        const md = cur.model, b = md.backtest
        return (
          <OlCard i={1}>
            <OlHead icon={Target} color="#8b5cf6" title={`عوامل اثرگذار: ${cur.activity.title}`} hint={`از ${fa(md.days)} روز کاری اکیپ (${fa(md.positiveDays)} روز با کارکرد) — واحد ${cur.activity.unit}`} />
            <div className="ex-ol-drivers">
              <div className="ex-ol-card"><h4><Users size={15} aria-hidden /> اکیپ: {cur.activity.crew ?? 'تعیین نشده'}</h4>
                {md.perCrewRate != null ? <>
                  <p><b>کارکرد هر اکیپ کامل در روز صاف: {fa(md.perCrewRate, 1)} {cur.activity.unit}</b><small>میانگین سابقه {fa(md.crewMean ?? 0, 1)} اکیپ کامل در روز</small></p>
                  <p><b>اثر یک اکیپ کامل اضافه: {fa(md.gamma, 2)}</b><small>{md.gamma >= 0.95 ? 'هر اکیپ کامل اضافه تقریباً کارکرد کامل خودش را اضافه می‌کند' : 'اکیپ اضافه کمتر از سهم کامل خود می‌افزاید (تداخل جبهه‌ها)'} · {md.gammaData > 0.5 ? 'برآوردشده از داده' : md.gammaData > 0.15 ? 'ترکیب داده و پیش‌فرض' : 'پیش‌فرض (تعداد اکیپ‌ها ثابت بوده)'}</small></p>
                </> : <p><small>این فعالیت به اکیپی وصل نیست؛ تعداد اکیپ در پیش‌بینی آن اثری ندارد.</small></p>}
              </div>
              <div className="ex-ol-card"><h4><CloudSunRain size={15} aria-hidden /> هوا (نسبت به روز صاف)</h4>
                {WX_CLASSES.map((c) => <p key={c} className="ex-ol-f"><span>{WX_FA[c]}</span><Bar value={Math.min(1, md.wx[c].factor)} /><b>{fa(md.wx[c].factor * 100)}٪</b><small>{md.wx[c].days ? `${fa(md.wx[c].days)} روز` : 'پیش‌فرض'}</small></p>)}
              </div>
              <div className="ex-ol-card"><h4><Layers size={15} aria-hidden /> زمین (نسبت به خشک)</h4>
                {(Object.keys(md.ground) as GroundState[]).map((g) => <p key={g} className="ex-ol-f"><span>{GROUND_FA[g]}</span><Bar value={Math.min(1, md.ground[g].factor)} /><b>{fa(md.ground[g].factor * 100)}٪</b><small>{md.ground[g].days ? `${fa(md.ground[g].days)} روز` : 'پیش‌فرض'}</small></p>)}
              </div>
              <div className="ex-ol-card"><h4><Target size={15} aria-hidden /> دقت روی گذشته</h4>
                {b ? <>
                  <p><b>خطای مدل اکیپ و هوا: {fa(b.modelErrPct ?? 0)}٪</b><small>پیش‌بینی یک‌روز‌جلوتر در {fa(b.origins)} روز اخیر</small></p>
                  <p><b>خطای میانگین ساده: {fa(b.naiveErrPct ?? 0)}٪</b><small>همان آزمون با میانگین دو هفتهٔ قبل</small></p>
                  <p><small>سهم مدل در برآورد نهایی: {pct(b.blendWeight, 0)}</small></p>
                </> : <p><small>پس‌آزمون از ۸ روز کارکرد این فعالیت؛ تا آن زمان مدل و میانگین ساده هم‌وزن‌اند.</small></p>}
                <p><b>نوسان روزانه: {pct(md.cv, 0)}</b><small>پهنای بازهٔ پیش‌بینی از همین عدد می‌آید</small></p>
              </div>
            </div>
          </OlCard>
        )
      })()}
    </div>
  )
}
