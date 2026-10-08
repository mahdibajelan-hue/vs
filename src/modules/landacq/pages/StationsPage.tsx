import { useMemo, useState } from 'react'
import { Factory, Plus } from 'lucide-react'
import { Modal } from '../platform'
import { useLandStore, useLandAnalysis } from '../store/useLandStore'
import type { StationType } from '../types'
import { STATION, STATION_TYPES } from '../lib/facilities'
import { makeStages, currentStage } from '../lib/workflow'
import { STAGE_LABEL } from '../lib/labels'
import { fmtKm } from '../lib/dates'
import { faNum } from '../lib/fa'
import { APPROVAL_LABEL } from '../lib/approval'
import { Card, EmptyState, Field, LevelBadge, StatusBadge } from '../components/ui'
import { Kpi, NoRoute } from '../components/shared'

/** Land for the project's stations: each one is a parcel of its own (same workflow, owners, documents, legal clocks and approval chain). */
export function StationsPage() {
  const data = useLandStore((s) => s.data)
  const addParcel = useLandStore((s) => s.addParcel)
  const select = useLandStore((s) => s.selectParcel)
  const selectedId = useLandStore((s) => s.selectedId)
  const { stations } = useLandAnalysis()
  const [adding, setAdding] = useState(false)
  const byType = useMemo(() => STATION_TYPES.map((t) => ({ t, rows: stations.filter((r) => r.parcel.stationType === t) })), [stations])
  if (!data?.route) return <NoRoute />
  const released = stations.filter((r) => r.released).length
  const problem = stations.filter((r) => !r.released && (r.crit.level === 'high' || r.crit.level === 'critical')).length
  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="ایستگاه‌های پروژه" value={faNum(stations.length)} sub="ارسال و دریافت توپک، شیرها، فشار، حفاظت کاتدیک" />
        <Kpi label="زمین آزاد" value={faNum(released)} color="#22c55e" sub={`${faNum(stations.length - released)} در جریان`} />
        <Kpi label="دارای ریسک" value={faNum(problem)} color="#f97316" alert={problem > 0} />
        <Kpi label="مساحت موردنیاز" value={<>{faNum(Math.round(stations.reduce((n, r) => n + (r.parcel.areaM2 ?? 0), 0) / 1000) / 10)} <small className="text-[13px]">هکتار</small></>} />
      </div>

      <Card title="ایستگاه‌ها" hint="تحصیل زمین هر ایستگاه مثل یک قطعه: مالک، مراحل، مواعد قانونی و زنجیرهٔ تأیید" action={<button className="la-btn la-btn-primary la-btn-sm" onClick={() => setAdding(true)}><Plus size={14} /> ایستگاه جدید</button>} pad={false}>
        {stations.length === 0 ? (
          <EmptyState icon={<Factory size={20} />} title="ایستگاهی ثبت نشده" text="ایستگاه ارسال توپک، شیرهای بین‌راهی و انشعاب، ایستگاه‌های کنترل و تقلیل فشار، حفاظت کاتدیک و دریافت توپک را با کیلومتر محل اضافه کنید." />
        ) : (
          byType.filter((g) => g.rows.length > 0).map(({ t, rows }) => (
            <section key={t} className="border-t" style={{ borderColor: 'var(--la-line)' }}>
              <h3 className="m-0 flex items-center gap-2 px-4 pb-1 pt-3 text-[12.5px] font-bold"><span className="rounded-md px-1.5 py-0.5 text-[10.5px] text-white" style={{ background: STATION[t].color }}>{STATION[t].short}</span> {STATION[t].label} <span className="la-eyebrow">{faNum(rows.length)}</span></h3>
              <ul className="m-0 list-none p-0">
                {rows.map((r) => {
                  const cur = currentStage(r.parcel)
                  return (
                    <li key={r.parcel.id}>
                      <button className="la-row" aria-pressed={selectedId === r.parcel.id} onClick={() => select(r.parcel.id)}>
                        <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: STATION[t].color }} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-bold">{r.parcel.title || r.parcel.code} <span className="la-km la-eyebrow">KM {fmtKm(r.parcel.kmStart)}</span></span>
                          <span className="la-eyebrow block truncate leading-6">{r.parcel.areaM2 ? `${faNum(r.parcel.areaM2)} متر مربع · ` : ''}{r.released ? 'آماده برای اجرا' : cur ? STAGE_LABEL[cur.key] : '—'} · {APPROVAL_LABEL[r.parcel.approvalStatus]}</span>
                        </span>
                        <span className="hidden md:block"><StatusBadge status={r.status} /></span>
                        <LevelBadge level={r.crit.level} score={r.crit.score} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))
        )}
      </Card>
      {adding && <AddStation total={data.route.startKm + data.route.totalKm} start={data.route.startKm} count={stations.length} onClose={() => setAdding(false)} onSave={async (d) => { const p = await addParcel(d); setAdding(false); if (p) select(p.id) }} />}
    </div>
  )
}

function AddStation({ start, total, count, onSave, onClose }: { start: number; total: number; count: number; onSave: (d: Parameters<ReturnType<typeof useLandStore.getState>['addParcel']>[0]) => Promise<void>; onClose: () => void }) {
  const [type, setType] = useState<StationType>('line_valve')
  const [km, setKm] = useState(start)
  const [title, setTitle] = useState('')
  const [area, setArea] = useState(STATION.line_valve.areaM2)
  const [lon, setLon] = useState('')
  const [lat, setLat] = useState('')
  const bad = km < start || km > total || area < 0 || (lon !== '' && !(Math.abs(Number(lon)) <= 180)) || (lat !== '' && !(Math.abs(Number(lat)) <= 90))
  return (
    <Modal title="ایستگاه جدید" subtitle="مختصات اختیاری است؛ بدون آن روی مسیر در کیلومتر محل نمایش داده می‌شود" onClose={onClose} width="max-w-md" isDirty={!!title}>
      <div className="la-root grid grid-cols-2 gap-3" dir="rtl">
        <Field label="نوع ایستگاه" className="col-span-2"><select className="la-select" value={type} onChange={(e) => { const t = e.target.value as StationType; setType(t); setArea(STATION[t].areaM2) }}>{STATION_TYPES.map((t) => <option key={t} value={t}>{STATION[t].label}</option>)}</select></Field>
        <Field label="عنوان / نام محل" className="col-span-2"><input className="la-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`مثلاً ${STATION[type].label} شمارهٔ ۱`} /></Field>
        <Field label="کیلومتر محل"><input className="la-input la-num" type="number" step={0.1} value={km} onChange={(e) => setKm(Number(e.target.value))} /></Field>
        <Field label="مساحت موردنیاز (م²)" hint="پیش‌فرض بر اساس نوع ایستگاه"><input className="la-input la-num" type="number" min={0} value={area} onChange={(e) => setArea(Number(e.target.value))} /></Field>
        <Field label="طول جغرافیایی (اختیاری)"><input className="la-input la-km" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="51.3890" /></Field>
        <Field label="عرض جغرافیایی (اختیاری)"><input className="la-input la-km" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="35.6892" /></Field>
        <div className="col-span-2 mt-2 flex justify-end gap-2">
          <button className="la-btn" onClick={onClose}>انصراف</button>
          <button className="la-btn la-btn-primary" disabled={bad} onClick={() => onSave({ code: `ST-${STATION[type].short}-${String(count + 1).padStart(2, '0')}`, title: title.trim(), kmStart: km, kmEnd: +(km + 0.001).toFixed(3), kind: 'station', stationType: type, siteLon: lon === '' ? null : Number(lon), siteLat: lat === '' ? null : Number(lat), landType: 'unknown', ownershipClass: 'unknown', landUse: '', ownerCountEst: 0, ownerKnown: false, custodian: '', disputeProbability: 0, complexity: 2, estDurationDays: null, flags: { critical_for_execution: true }, acquisitionRoute: 'normal', areaM2: area, estCost: null, notes: '', stages: makeStages() })}>ثبت ایستگاه</button>
        </div>
      </div>
    </Modal>
  )
}
