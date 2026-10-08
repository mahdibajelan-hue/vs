import { useMemo, useState } from 'react'
import { MapPinned, Pencil, Plus, Trash2 } from 'lucide-react'
import { Modal } from '../../platform'
import type { Plot } from '../../types'
import type { Analysis } from '../../lib/kpis'
import { useLandStore } from '../../store/useLandStore'
import { polygonMetrics, utmZoneOf } from '../../lib/utm'
import { faNum } from '../../lib/fa'
import { Badge, EmptyState, Field } from '../ui'

export const parseCorners = (text: string): { corners: [number, number][]; bad: number[] } => {
  const corners: [number, number][] = []
  const bad: number[] = []
  text.split('\n').forEach((line, i) => {
    const t = line.trim()
    if (!t) return
    const nums = t.replace(/[٠-٩۰-۹]/g, (d) => String('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'.indexOf(d) % 10)).split(/[\s,;\t]+/).map(Number)
    if (nums.length === 2 && nums.every(Number.isFinite) && nums[0] > 100000 && nums[0] < 900000 && nums[1] >= 0 && nums[1] <= 10000000) corners.push([nums[0], nums[1]])
    else bad.push(i + 1)
  })
  return { corners, bad }
}
export const fmtArea = (m2: number): string => (m2 >= 10000 ? `${faNum(+(m2 / 10000).toFixed(2))} هکتار` : `${faNum(Math.round(m2))} متر مربع`)

/** Cadastral plots bought inside this parcel: corner coordinates in UTM, shown on the map with the owner's name. */
export function PlotsTab({ a }: { a: Analysis }) {
  const p = a.parcel
  const save = useLandStore((s) => s.savePlot)
  const del = useLandStore((s) => s.deletePlot)
  const route = useLandStore((s) => s.data?.route)
  const setTab = useLandStore((s) => s.setTab)
  const [editing, setEditing] = useState<Plot | 'new' | null>(null)
  const defaultZone = route?.geometry.length ? utmZoneOf(route.geometry[Math.floor(route.geometry.length / 2)][0]) : 39
  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="la-eyebrow m-0 leading-6">مختصات گوشه‌های هر زمین خریداری‌شده را به‌صورت UTM وارد کنید؛ زمین مثل نقشهٔ کاداستر روی نقشه با نام مالک رسم می‌شود.</p>
        <button className="la-btn la-btn-primary la-btn-sm shrink-0" onClick={() => setEditing('new')}><Plus size={14} /> افزودن زمین</button>
      </div>
      {p.plots.length === 0 ? (
        <div className="la-card-flat"><EmptyState icon={<MapPinned size={20} />} title="زمینی با مختصات ثبت نشده" text="پس از خرید یا توافق، گوشه‌های زمین را از نقشهٔ برداری یا سند وارد کنید." /></div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {p.plots.map((x) => {
            const m = polygonMetrics(x.corners)
            return (
              <li key={x.id} className="la-card-flat flex items-start justify-between gap-3 p-3.5">
                <div className="min-w-0">
                  <p className="m-0 truncate text-[13px] font-bold">{x.ownerName || 'مالک نامشخص'}{x.plotNo && <span className="la-eyebrow font-normal"> · پلاک {x.plotNo}</span>}</p>
                  <p className="la-eyebrow m-0 leading-6">UTM {faNum(x.zone)}{x.north ? 'N' : 'S'} · {faNum(x.corners.length)} گوشه · مساحت {fmtArea(m.area)} · محیط {faNum(Math.round(m.perimeter))} متر</p>
                  {x.corners.length < 3 && <Badge color="#f59e0b">حداقل ۳ گوشه لازم است</Badge>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button className="la-btn la-btn-ghost la-btn-icon" aria-label="ویرایش" onClick={() => setEditing(x)}><Pencil size={14} /></button>
                  <button className="la-btn la-btn-ghost la-btn-icon" aria-label="حذف" onClick={() => del(p.id, x.id)}><Trash2 size={14} /></button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {p.plots.length > 0 && <button className="la-btn la-btn-sm self-start" onClick={() => { useLandStore.getState().selectParcel(null); setTab('map') }}>نمایش روی نقشه</button>}
      {editing && <PlotEditor plot={editing === 'new' ? null : editing} ownerNames={p.owners.map((o) => o.name).filter(Boolean)} defaultZone={defaultZone} onClose={() => setEditing(null)} onSave={async (v) => { await save(p.id, v); setEditing(null) }} />}
    </div>
  )
}

function PlotEditor({ plot, ownerNames, defaultZone, onSave, onClose }: { plot: Plot | null; ownerNames: string[]; defaultZone: number; onSave: (p: Omit<Plot, 'id' | 'parcelId'> & { id?: string }) => Promise<void>; onClose: () => void }) {
  const [owner, setOwner] = useState(plot?.ownerName ?? ownerNames[0] ?? '')
  const [no, setNo] = useState(plot?.plotNo ?? '')
  const [zone, setZone] = useState(plot?.zone ?? defaultZone)
  const [north, setNorth] = useState(plot?.north ?? true)
  const [text, setText] = useState((plot?.corners ?? []).map((c) => `${c[0]} ${c[1]}`).join('\n'))
  const [notes, setNotes] = useState(plot?.notes ?? '')
  const parsed = useMemo(() => parseCorners(text), [text])
  const m = useMemo(() => polygonMetrics(parsed.corners), [parsed])
  const bad = parsed.corners.length < 3 || parsed.bad.length > 0 || zone < 1 || zone > 60
  return (
    <Modal title={plot ? 'ویرایش زمین' : 'افزودن زمین'} subtitle="مختصات گوشه‌ها به متر، UTM / WGS84" onClose={onClose} width="max-w-lg" isDirty={!!text}>
      <div className="la-root grid gap-3 sm:grid-cols-2" dir="rtl">
        <Field label="نام مالک"><input className="la-input" list="la-plot-owners" value={owner} onChange={(e) => setOwner(e.target.value)} /><datalist id="la-plot-owners">{ownerNames.map((n) => <option key={n} value={n} />)}</datalist></Field>
        <Field label="شمارهٔ پلاک / قطعه"><input className="la-input" value={no} onChange={(e) => setNo(e.target.value)} /></Field>
        <Field label="زون UTM" hint="ایران: ۳۸ تا ۴۱ (مثلاً تهران ۳۹)"><input className="la-input la-num" type="number" min={1} max={60} value={zone} onChange={(e) => setZone(Number(e.target.value))} /></Field>
        <Field label="نیم‌کره"><select className="la-select" value={north ? 'N' : 'S'} onChange={(e) => setNorth(e.target.value === 'N')}><option value="N">شمالی (N)</option><option value="S">جنوبی (S)</option></select></Field>
        <Field label="گوشه‌ها: هر خط «Easting Northing» به ترتیب دور زمین" className="sm:col-span-2" hint={parsed.bad.length ? `خط ${parsed.bad.map(faNum).join('، ')} معتبر نیست (دو عدد به متر لازم است).` : parsed.corners.length < 3 ? 'حداقل سه گوشه لازم است. می‌توانید از اکسل یا فایل برداری کپی کنید.' : undefined}>
          <textarea className="la-input la-textarea la-km" style={{ minHeight: 120 }} placeholder={'535100 3949500\n535140 3949500\n535140 3949560\n535100 3949560'} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        {parsed.corners.length >= 3 && <p className="la-eyebrow m-0 sm:col-span-2">مساحت <b>{fmtArea(m.area)}</b> · محیط <b>{faNum(Math.round(m.perimeter))} متر</b> · {faNum(parsed.corners.length)} گوشه</p>}
        <Field label="توضیح" className="sm:col-span-2"><input className="la-input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="mt-2 flex justify-end gap-2 sm:col-span-2">
          <button className="la-btn" onClick={onClose}>انصراف</button>
          <button className="la-btn la-btn-primary" disabled={bad} onClick={() => onSave({ id: plot?.id, plotNo: no.trim(), ownerName: owner.trim(), zone, north, corners: parsed.corners, notes: notes.trim(), isDemo: false })}>ذخیره</button>
        </div>
      </div>
    </Modal>
  )
}
