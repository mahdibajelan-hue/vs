import { useMemo, useState } from 'react'
import { Plus, Scissors, Search, Wand2 } from 'lucide-react'
import { ParcelBuilder } from '../components/ParcelBuilder'
import { Modal } from '../platform'
import { useLandStore, useLandAnalysis } from '../store/useLandStore'
import type { OwnershipClass } from '../types'
import { makeStages } from '../lib/workflow'
import { LAND_TYPE_LABEL, OWNERSHIP_CLASSES, OWNERSHIP_LABEL, STAGE_LABEL } from '../lib/labels'
import { OWNERSHIP_COLOR, progressColor } from '../lib/colors'
import { currentStage } from '../lib/workflow'
import { fmtKm, fmtKmRange } from '../lib/dates'
import { faNum, fmtLen } from '../lib/fa'
import { Card, EmptyState, Field, LevelBadge, StatusBadge } from '../components/ui'
import { NoRoute } from '../components/shared'
import type { ParcelDraft } from '../repo/types'

/** Land Screening: cut the route into km parcels, profile each one, see the preliminary picture of the whole route. */
export function ParcelsPage() {
  const data = useLandStore((s) => s.data)
  const addParcel = useLandStore((s) => s.addParcel)
  const splitParcel = useLandStore((s) => s.splitParcel)
  const select = useLandStore((s) => s.selectParcel)
  const selectedId = useLandStore((s) => s.selectedId)
  const { rows } = useLandAnalysis()
  const [q, setQ] = useState('')
  const [own, setOwn] = useState<OwnershipClass | 'all'>('all')
  const [lvl, setLvl] = useState<'all' | 'critical' | 'high' | 'open'>('all')
  const [builder, setBuilder] = useState(false)
  const [adding, setAdding] = useState(false)
  const [splitting, setSplitting] = useState<string | null>(null)

  const shown = useMemo(
    () =>
      rows.filter((r) => {
        if (own !== 'all' && r.parcel.ownershipClass !== own) return false
        if (lvl === 'critical' && (r.released || r.crit.level !== 'critical')) return false
        if (lvl === 'high' && (r.released || (r.crit.level !== 'critical' && r.crit.level !== 'high'))) return false
        if (lvl === 'open' && r.released) return false
        if (q.trim()) {
          const t = q.trim().toLowerCase()
          if (!`${r.parcel.code} ${r.parcel.title} ${r.parcel.custodian} ${r.parcel.landUse} ${fmtKm(r.parcel.kmStart)}`.toLowerCase().includes(t)) return false
        }
        return true
      }),
    [rows, q, own, lvl],
  )
  const summary = useMemo(() => {
    const by: Record<OwnershipClass, number> = { private: 0, natural_resources: 0, exempt: 0, governmental: 0, unknown: 0 }
    for (const r of rows) by[r.parcel.ownershipClass] += r.length
    return by
  }, [rows])

  if (!data?.route) return <NoRoute />
  const route = data.route

  if (rows.length === 0) {
    return (
      <div className="la-card mx-auto mt-6 max-w-xl p-2">
        <EmptyState
          icon={<Wand2 size={22} />}
          title="مسیر را به قطعه‌های کیلومتری بشکنید"
          text={`مسیر ${faNum(route.totalKm)} کیلومتری به قطعه‌های هم‌اندازه تقسیم می‌شود؛ بعد برای هر قطعه نوع زمین، مالکیت و پیچیدگی را ثبت می‌کنید. قطعه‌های حساس را می‌توانید بعداً جدا کنید.`}
          action={<button className="la-btn la-btn-primary mt-2" onClick={() => setBuilder(true)}>ساخت قطعه‌ها (خودکار یا دستی)</button>}
        />
        {builder && <ParcelBuilder replace={false} onClose={() => setBuilder(false)} />}
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-4">
      <Card title="ارزیابی اولیه مسیر" hint="سهم هر ماهیت مالکیت از کل طول مسیر">
        <div className="la-bar" role="img" aria-label="سهم ماهیت مالکیت">
          {OWNERSHIP_CLASSES.map((c) => <i key={c} title={`${OWNERSHIP_LABEL[c]}: ${fmtLen(summary[c])} km`} style={{ flexGrow: summary[c], background: OWNERSHIP_COLOR[c] }} />)}
        </div>
        <ul className="m-0 mt-3 flex list-none flex-wrap gap-x-5 gap-y-1.5 p-0 text-[12px]" style={{ color: 'var(--la-ink-2)' }}>
          {OWNERSHIP_CLASSES.map((c) => (
            <li key={c} className="flex items-center gap-1.5"><span style={{ width: 10, height: 10, borderRadius: 3, background: OWNERSHIP_COLOR[c] }} />{OWNERSHIP_LABEL[c]} <b className="la-num" style={{ color: 'var(--la-ink)' }}>{fmtLen(summary[c])} km</b></li>
          ))}
        </ul>
      </Card>

      <Card
        help="parcels"
        pad={false}
        title={`قطعه‌ها (${faNum(shown.length)} از ${faNum(rows.length)})`}
        action={
          <div className="flex flex-wrap gap-2">
            <button className="la-btn la-btn-sm" onClick={() => setBuilder(true)}><Wand2 size={14} /> ساخت دوبارهٔ قطعه‌ها</button>
            <button className="la-btn la-btn-sm" onClick={() => setAdding(true)}><Plus size={14} /> قطعهٔ جدید</button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3 pt-3">
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} aria-hidden style={{ position: 'absolute', insetInlineStart: 11, top: 11, color: 'var(--la-muted)' }} />
            <input className="la-input" style={{ paddingInlineStart: 32 }} placeholder="جستجو: کد، کیلومتر، متولی…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="جستجوی قطعه" />
          </div>
          <select className="la-select" style={{ width: 'auto' }} value={own} onChange={(e) => setOwn(e.target.value as OwnershipClass | 'all')} aria-label="فیلتر مالکیت">
            <option value="all">همهٔ مالکیت‌ها</option>
            {OWNERSHIP_CLASSES.map((c) => <option key={c} value={c}>{OWNERSHIP_LABEL[c]}</option>)}
          </select>
          <select className="la-select" style={{ width: 'auto' }} value={lvl} onChange={(e) => setLvl(e.target.value as typeof lvl)} aria-label="فیلتر Criticality">
            <option value="all">همهٔ سطوح</option>
            <option value="open">فقط آزادنشده</option>
            <option value="high">High و Critical</option>
            <option value="critical">فقط Critical</option>
          </select>
        </div>
        {shown.length === 0 ? <EmptyState icon={<Search size={20} />} title="قطعه‌ای با این فیلتر نیست" /> : (
          <ul className="m-0 list-none border-t p-0" style={{ borderColor: 'var(--la-line)' }}>
            {shown.map((r) => {
              const cur = currentStage(r.parcel)
              return (
                <li key={r.parcel.id} className="flex items-center" style={{ borderBottom: '1px solid var(--la-line)' }}>
                  <button className="la-row" style={{ borderBottom: 0 }} aria-pressed={selectedId === r.parcel.id} onClick={() => select(r.parcel.id)}>
                    <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: OWNERSHIP_COLOR[r.parcel.ownershipClass] }} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2"><b className="la-km text-[13px]">{fmtKmRange(r.parcel.kmStart, r.parcel.kmEnd)}</b><span className="la-eyebrow">{r.parcel.code}</span></span>
                      <span className="la-eyebrow block truncate leading-6">{OWNERSHIP_LABEL[r.parcel.ownershipClass]} · {LAND_TYPE_LABEL[r.parcel.landType]}{r.parcel.custodian ? ` · ${r.parcel.custodian}` : ''} · {r.released ? 'آماده برای اجرا' : cur ? STAGE_LABEL[cur.key] : '—'}</span>
                    </span>
                    <span className="hidden w-24 shrink-0 sm:block" aria-hidden><span className="la-bar" style={{ height: 6 }}><i style={{ flexGrow: r.progress, background: progressColor(r.progress) }} /><i style={{ flexGrow: 1 - r.progress }} /></span></span>
                    {r.status !== 'critical' && <span className="hidden shrink-0 md:block"><StatusBadge status={r.status} /></span>}
                    <LevelBadge level={r.crit.level} score={r.crit.score} />
                  </button>
                  <button className="la-btn la-btn-ghost la-btn-icon me-2" onClick={() => setSplitting(r.parcel.id)} aria-label={`برش قطعه ${r.parcel.code}`} title="برش قطعه در یک کیلومتر"><Scissors size={14} /></button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {builder && <ParcelBuilder replace onClose={() => setBuilder(false)} />}
      {adding && <AddParcelDialog onClose={() => setAdding(false)} onSave={async (d) => { await addParcel(d); setAdding(false) }} startKm={route.startKm} endKm={route.startKm + route.totalKm} />}
      {splitting && (() => {
        const p = rows.find((r) => r.parcel.id === splitting)?.parcel
        return p ? <SplitDialog code={p.code} from={p.kmStart} to={p.kmEnd} onClose={() => setSplitting(null)} onSplit={async (at) => { await splitParcel(p.id, at); setSplitting(null) }} /> : null
      })()}
    </div>
  )
}

function AddParcelDialog({ startKm, endKm, onSave, onClose }: { startKm: number; endKm: number; onSave: (d: ParcelDraft) => Promise<void>; onClose: () => void }) {
  const [code, setCode] = useState('')
  const [a, setA] = useState(startKm)
  const [b, setB] = useState(startKm + 1)
  const bad = !(b > a) || a < startKm || b > endKm
  return (
    <Modal title="قطعهٔ جدید" subtitle={`بازه باید داخل ${fmtKm(startKm)} تا ${fmtKm(endKm)} باشد`} onClose={onClose} width="max-w-md" isDirty={code !== ''}>
      <div className="la-root grid grid-cols-2 gap-3" dir="rtl">
        <Field label="کد قطعه" className="col-span-2"><input className="la-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="مثلاً LP-120" /></Field>
        <Field label="کیلومتر شروع"><input className="la-input la-num" type="number" step={0.1} value={a} onChange={(e) => setA(Number(e.target.value))} /></Field>
        <Field label="کیلومتر پایان"><input className="la-input la-num" type="number" step={0.1} value={b} onChange={(e) => setB(Number(e.target.value))} /></Field>
        {bad && <p className="la-hint col-span-2" style={{ color: 'var(--la-bad)' }}>بازهٔ کیلومتر معتبر نیست.</p>}
        <div className="col-span-2 mt-2 flex justify-end gap-2">
          <button className="la-btn" onClick={onClose}>انصراف</button>
          <button className="la-btn la-btn-primary" disabled={bad} onClick={() => onSave({ code: code.trim() || `LP-${Math.round(a * 10)}`, title: '', kmStart: a, kmEnd: b, landType: 'unknown', ownershipClass: 'unknown', landUse: '', ownerCountEst: 0, ownerKnown: false, custodian: '', disputeProbability: 0, complexity: 1, estDurationDays: null, flags: {}, acquisitionRoute: 'normal', areaM2: null, estCost: null, notes: '', stages: makeStages() })}>ثبت قطعه</button>
        </div>
      </div>
    </Modal>
  )
}

function SplitDialog({ code, from, to, onSplit, onClose }: { code: string; from: number; to: number; onSplit: (at: number) => Promise<void>; onClose: () => void }) {
  const [at, setAt] = useState(+((from + to) / 2).toFixed(2))
  const bad = !(at > from + 0.01 && at < to - 0.01)
  return (
    <Modal title={`برش قطعهٔ ${code}`} subtitle="مراحل و مالکین برای بخش اول می‌ماند؛ بخش دوم از نو شروع می‌شود." onClose={onClose} width="max-w-sm">
      <div className="la-root" dir="rtl">
        <Field label={`کیلومتر برش (بین ${fmtKm(from)} و ${fmtKm(to)})`}><input className="la-input la-num" type="number" step={0.05} value={at} onChange={(e) => setAt(Number(e.target.value))} /></Field>
        <div className="mt-4 flex justify-end gap-2">
          <button className="la-btn" onClick={onClose}>انصراف</button>
          <button className="la-btn la-btn-primary" disabled={bad} onClick={() => onSplit(at)}>برش بده</button>
        </div>
      </div>
    </Modal>
  )
}

