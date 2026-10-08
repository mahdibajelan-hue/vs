import { useMemo, useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { useLandStore, useLandAnalysis } from '../store/useLandStore'
import { NoRoute } from '../components/shared'
import { Card, EmptyState } from '../components/ui'
import { HelpButton } from '../components/Help'
import { IssueButton } from '../components/IssueButton'
import { adviseFronts, frontsOf, READINESS_COLOR, READINESS_FA, READINESS_HINT, READINESS_LABEL, READINESS_ORDER, type Front } from '../lib/plan'
import { fmtKmRange } from '../lib/dates'
import { faNum, fmtDateShort } from '../lib/fa'

/** Phase 4 — which stretches a crew can work on, which are held up, and where to move meanwhile. */
export function FrontsPage() {
  const data = useLandStore((s) => s.data)
  const select = useLandStore((s) => s.selectParcel)
  const { rows, today } = useLandAnalysis()
  const [sel, setSel] = useState<string | null>(null)
  const fronts = useMemo(() => frontsOf(rows, today), [rows, today])
  const advice = useMemo(() => adviseFronts(fronts, data?.activities ?? [], today), [fronts, data?.activities, today])
  if (!data?.route) return <NoRoute />
  const route = data.route
  const total = route.totalKm || 1
  const pct = (km: number) => ((km - route.startKm) / total) * 100
  const sum = (r: Front['readiness']) => fronts.filter((f) => f.readiness === r).reduce((n, f) => n + f.length, 0)
  const chosen = fronts.find((f) => f.id === sel) ?? null
  const worst = (f: Front) => [...f.parcels].sort((a, b) => b.crit.score - a.crit.score)[0]

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-4">
      <Card title="وضعیت جبهه‌های کاری" hint="هر چند قطعهٔ پشت‌سرهم با وضعیت یکسان یک جبهه است" help="readiness">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {READINESS_ORDER.map((r) => (
            <div key={r} className="la-card-flat p-3" title={READINESS_HINT[r]}>
              <p className="m-0 flex items-center gap-2 text-[12px] font-bold"><span style={{ width: 10, height: 10, borderRadius: 3, background: READINESS_COLOR[r] }} /> {READINESS_LABEL[r]} <span className="la-eyebrow">· {READINESS_FA[r]}</span></p>
              <p className="la-num m-0 mt-1 text-[22px] font-bold" style={{ color: READINESS_COLOR[r] }}>{faNum(+sum(r).toFixed(1))} <small className="text-[12px]">km</small></p>
              <p className="la-eyebrow m-0">{faNum(fronts.filter((f) => f.readiness === r).length)} جبهه</p>
            </div>
          ))}
        </div>
        <div className="relative mt-4 h-14 overflow-hidden rounded-xl" dir="ltr" role="group" aria-label="جبهه‌ها روی مسیر" style={{ background: 'var(--la-surface-3)' }}>
          {fronts.map((f) => (
            <button key={f.id} className="absolute top-0 h-full border-0 p-0" aria-pressed={sel === f.id} title={`${f.id} · ${fmtKmRange(f.kmStart, f.kmEnd)} · ${READINESS_LABEL[f.readiness]}`} onClick={() => setSel(sel === f.id ? null : f.id)} style={{ left: `${pct(f.kmStart)}%`, width: `calc(${pct(f.kmEnd) - pct(f.kmStart)}% - 2px)`, background: READINESS_COLOR[f.readiness], opacity: sel && sel !== f.id ? 0.45 : 1, cursor: 'pointer' }} />
          ))}
          {advice.map((x) => <span key={x.activity.id} className="absolute bottom-0 top-0 w-0.5" style={{ left: `${pct(x.atKm)}%`, background: 'var(--la-ink)' }} title={`${x.activity.name}: ${x.atKm.toFixed(1)} km`} />)}
        </div>
        <p className="la-eyebrow mt-1.5">خط‌های سفید محل فعلی پیشروی فعالیت‌ها هستند. روی یک جبهه بزنید تا قطعه‌هایش دیده شود.</p>
        {chosen && (
          <div className="la-card-flat mt-3 p-3">
            <p className="m-0 text-[13px] font-bold">{chosen.id} · {fmtKmRange(chosen.kmStart, chosen.kmEnd)} — {READINESS_LABEL[chosen.readiness]} <span className="la-eyebrow">({faNum(+chosen.length.toFixed(1))} km)</span></p>
            <p className="la-eyebrow m-0 mt-1">{READINESS_HINT[chosen.readiness]}</p>
            <ul className="m-0 mt-2 flex list-none flex-wrap gap-1.5 p-0">{chosen.parcels.map((a) => <li key={a.parcel.id}><button className="la-chip" onClick={() => select(a.parcel.id)}>{a.parcel.code}</button></li>)}</ul>
          </div>
        )}
      </Card>

      <Card title="پیشنهاد تغییر توالی عملیات" hint="برای هر فعالیت: اولین مانع تملکی پیش رو و جبهه‌های آماده‌ای که تا آزادسازی می‌تواند در آن‌ها کار کند" help="fronts" pad={false}>
        {advice.length === 0 ? <EmptyState icon={<ArrowLeftRight size={20} />} title="مانعی پیش روی فعالیت‌ها نیست" text={(data.activities.length === 0 ? 'ابتدا فعالیت‌های پیمانکار را در «تطبیق با برنامه» وارد کنید. ' : '') + 'وقتی فعالیتی به بازه‌ای برسد که تا آن زمان آزاد نمی‌شود، جبهه‌های جایگزین اینجا پیشنهاد می‌شود.'} /> : (
          <ul className="m-0 list-none p-0">
            {advice.map((x) => (
              <li key={x.activity.id} className="flex flex-col gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--la-line)' }}>
                <p className="m-0 text-[13px] font-bold"><span style={{ color: 'var(--la-accent)' }}>{x.activity.name}</span> در KM {faNum(+x.atKm.toFixed(1))} · {fmtDateShort(x.arrival)} به <span style={{ color: READINESS_COLOR[x.blocked.readiness] }}>{x.blocked.id} ({fmtKmRange(x.blocked.kmStart, x.blocked.kmEnd)})</span> می‌رسد</p>
                <p className="la-eyebrow m-0 leading-6">این بازه {READINESS_FA[x.blocked.readiness]} است و تا {fmtDateShort(x.blocked.expectedRelease)} آزاد نمی‌شود{x.idleDays > 0 ? ` — بدون تغییر توالی، پیمانکار حدود ${faNum(x.idleDays)} روز بیکار می‌ماند` : ''}.</p>
                <p className="m-0 text-[12.5px] leading-7">{x.alternatives.length ? <>پیشنهاد: ابتدا در {x.alternatives.map((f) => <b key={f.id}>{f.id} ({fmtKmRange(f.kmStart, f.kmEnd)}، {faNum(+f.length.toFixed(1))} km) </b>)} کار کند و پس از آزادسازی به {x.blocked.id} بازگردد.</> : <span style={{ color: '#f97316' }}>جبههٔ آمادهٔ مناسبی پیش رو نیست؛ تسریع آزادسازی {x.blocked.id} ضروری است.</span>}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button className="la-btn la-btn-sm" onClick={() => select(worst(x.blocked).parcel.id)}>بحرانی‌ترین قطعهٔ مانع: {worst(x.blocked).parcel.code}</button>
                  <IssueButton a={worst(x.blocked)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="جبهه‌های آماده و قابل اجرا" hint="بازه‌هایی که همین حالا می‌توان در آن‌ها کار کرد" pad={false} action={<HelpButton topic="readiness" />}>
        <ul className="m-0 list-none p-0">
          {fronts.filter((f) => f.readiness === 'ready').sort((a, b) => b.length - a.length).map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-4 py-2.5 text-[12.5px]" style={{ borderTop: '1px solid var(--la-line)' }}>
              <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: READINESS_COLOR.ready }} />
              <b className="la-km">{f.id}</b><span className="la-km flex-1">{fmtKmRange(f.kmStart, f.kmEnd)}</span><span className="la-num">{faNum(+f.length.toFixed(1))} km · {faNum(f.parcels.length)} قطعه</span>
            </li>
          ))}
          {fronts.every((f) => f.readiness !== 'ready') && <li className="la-eyebrow px-4 py-4">جبههٔ آماده‌ای وجود ندارد.</li>}
        </ul>
      </Card>
    </div>
  )
}
