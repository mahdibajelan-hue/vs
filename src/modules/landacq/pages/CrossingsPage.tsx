import { useMemo, useState } from 'react'
import { Plus, Route as RouteIcon } from 'lucide-react'
import { useLandStore, useLandAnalysis } from '../store/useLandStore'
import type { CrossingType } from '../types'
import { CROSSING, CROSSING_STATUS_COLOR, CROSSING_STATUS_LABEL, CROSSING_TYPES, PERMIT_LABEL, UNDERTAKING_LABEL } from '../lib/facilities'
import { fmtKm } from '../lib/dates'
import { faNum, fmtDate, fmtMoney } from '../lib/fa'
import { Badge, Card, EmptyState } from '../components/ui'
import { Kpi, NoRoute } from '../components/shared'
import { CrossingDrawer } from '../components/CrossingDrawer'

/** Crossings of roads, rail, rivers, qanats, canals, pipelines and HV cables: permits, undertakings (تعهدنامه), fees and legal follow-up. */
export function CrossingsPage() {
  const data = useLandStore((s) => s.data)
  const selectedCrossingId = useLandStore((s) => s.selectedCrossingId)
  const selectCrossing = useLandStore((s) => s.selectCrossing)
  const { crossings } = useLandAnalysis()
  const [type, setType] = useState<CrossingType | 'all'>('all')
  const [creating, setCreating] = useState(false)
  const shown = useMemo(() => crossings.filter((x) => type === 'all' || x.c.crossingType === type), [crossings, type])
  if (!data?.route) return <NoRoute />
  const attention = crossings.filter((x) => x.st.status === 'attention' || x.st.status === 'critical').length
  const pendingUnd = crossings.filter((x) => x.c.undertakingRequired && x.c.undertakingStatus !== 'signed').length
  const fees = crossings.reduce((n, x) => n + x.st.feeRemaining, 0)
  const selected = data.crossings.find((c) => c.id === selectedCrossingId) ?? null
  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="عبورها" value={faNum(crossings.length)} sub="جاده، راه‌آهن، رودخانه، قنات، لوله، کابل" />
        <Kpi label="مجوز صادرشده" value={faNum(crossings.filter((x) => x.c.permitStatus === 'issued').length)} color="#22c55e" />
        <Kpi label="نیازمند توجه" value={faNum(attention)} color="#ef4444" alert={attention > 0} />
        <Kpi label="تعهدنامهٔ ناقص" value={faNum(pendingUnd)} color="#f97316" alert={pendingUnd > 0} />
        <Kpi label="هزینهٔ عبور پرداخت‌نشده" value={<span className="text-[17px]">{fmtMoney(fees)}</span>} color="#eab308" />
      </div>
      <Card
        title="عبور از تأسیسات و ابنیه"
        hint="هر عبور مجوز متولی، تعهدنامهٔ مخصوص و در صورت لزوم هزینه دارد؛ مهلت درخواست از روی برنامهٔ اجرایی و زمان معمول هر متولی حساب می‌شود"
        action={<button className="la-btn la-btn-primary la-btn-sm" onClick={() => setCreating(true)}><Plus size={14} /> عبور جدید</button>}
        pad={false}
      >
        <div className="flex flex-wrap gap-1.5 px-4 pb-3 pt-3" role="group" aria-label="نوع تأسیسات">
          <button className="la-chip" aria-pressed={type === 'all'} onClick={() => setType('all')}>همه ({faNum(crossings.length)})</button>
          {CROSSING_TYPES.map((t) => { const n = crossings.filter((x) => x.c.crossingType === t).length; return n ? <button key={t} className="la-chip" aria-pressed={type === t} onClick={() => setType(t)}><span style={{ width: 8, height: 8, borderRadius: 2, background: CROSSING[t].color }} /> {CROSSING[t].label} ({faNum(n)})</button> : null })}
        </div>
        {shown.length === 0 ? (
          <EmptyState icon={<RouteIcon size={20} />} title="عبوری ثبت نشده" text="هر محل تقاطع خط لوله با جاده، راه‌آهن، رودخانه، مسیل، قنات، کانال، لوله یا کابل را با کیلومتر ثبت کنید تا مجوز و تعهدنامه‌اش پیگیری شود." />
        ) : (
          <ul className="m-0 list-none border-t p-0" style={{ borderColor: 'var(--la-line)' }}>
            {shown.map(({ c, st }) => (
              <li key={c.id}>
                <button className="la-row" aria-pressed={selectedCrossingId === c.id} onClick={() => selectCrossing(c.id)}>
                  <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: CROSSING[c.crossingType].color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold">{CROSSING[c.crossingType].label}{c.name ? ` · ${c.name}` : ''} <span className="la-km la-eyebrow">KM {fmtKm(c.km)}</span></span>
                    <span className="la-eyebrow block truncate leading-6">{c.custodian || '—'} · {PERMIT_LABEL[c.permitStatus]}{c.undertakingRequired ? ` · تعهدنامه: ${UNDERTAKING_LABEL[c.undertakingStatus]}` : ''}{c.feeRequired ? ` · هزینه ${fmtMoney(c.feeAmount)}` : ''}{st.needBy && !st.ready ? ` · نیاز اجرا ${fmtDate(st.needBy)}` : ''}</span>
                  </span>
                  <span className="hidden w-20 shrink-0 sm:block" aria-hidden><span className="la-bar" style={{ height: 6 }}><i style={{ flexGrow: st.progress, background: CROSSING_STATUS_COLOR[st.status] }} /><i style={{ flexGrow: 1 - st.progress }} /></span></span>
                  <Badge color={CROSSING_STATUS_COLOR[st.status]}>{CROSSING_STATUS_LABEL[st.status]}{st.alarms.length > 0 ? ` · ${faNum(st.alarms.length)}` : ''}</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {(selected || creating) && <CrossingDrawer key={selected?.id ?? 'new'} crossing={selected} onClose={() => { selectCrossing(null); setCreating(false) }} />}
    </div>
  )
}
