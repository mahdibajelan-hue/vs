import { useMemo, useState } from 'react'
import { Plus, Trash2, Wand2, ListPlus } from 'lucide-react'
import { Modal } from '../platform'
import { useLandStore } from '../store/useLandStore'
import { faNum } from '../lib/fa'
import { Field, Segmented } from './ui'

interface Row { from: string; to: string; title: string }
const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace('٫', '.')))

/**
 * Cuts the route into parcels in one of two ways: automatically (give the length of a parcel — the count follows from the
 * length of the project), or by hand (a row per parcel with its start and end kilometre).
 */
export function ParcelBuilder({ onClose, replace }: { onClose: () => void; replace: boolean }) {
  const route = useLandStore((s) => s.data?.route)
  const build = useLandStore((s) => s.buildParcels)
  const [mode, setMode] = useState<'auto' | 'manual'>('auto')
  const total = route?.totalKm ?? 0
  const start = route?.startKm ?? 0
  const end = start + total
  // a sensible default: about 25 parcels for the whole route, in round steps
  const suggest = useMemo(() => { const raw = total / 25; return raw >= 1 ? Math.round(raw) : raw >= 0.5 ? 0.5 : 0.25 }, [total])
  const [seg, setSeg] = useState(suggest || 1)
  const [rows, setRows] = useState<Row[]>([{ from: String(start), to: '', title: '' }])
  const [busy, setBusy] = useState(false)

  const autoRanges = useMemo(() => {
    const out: { kmStart: number; kmEnd: number }[] = []
    if (!(seg > 0)) return out
    for (let k = start; k < end - 1e-6; k += seg) out.push({ kmStart: +k.toFixed(3), kmEnd: +Math.min(k + seg, end).toFixed(3) })
    return out
  }, [seg, start, end])

  const parsed = rows.map((r) => ({ a: num(r.from), b: num(r.to), title: r.title }))
  const problems = parsed.map((r, i) => {
    if (!Number.isFinite(r.a) || !Number.isFinite(r.b)) return i === parsed.length - 1 && !rows[i].to ? '' : 'کیلومتر شروع و پایان را وارد کنید'
    if (r.b <= r.a) return 'پایان باید بزرگ‌تر از شروع باشد'
    if (r.a < start - 1e-6 || r.b > end + 1e-6) return `خارج از مسیر (${faNum(start)} تا ${faNum(end)})`
    for (let j = 0; j < parsed.length; j++) if (j !== i && Number.isFinite(parsed[j].a) && Number.isFinite(parsed[j].b) && parsed[j].a < r.b - 1e-6 && parsed[j].b > r.a + 1e-6 && j < i) return 'با ردیف بالاتر هم‌پوشانی دارد'
    return ''
  })
  const valid = parsed.filter((r, i) => Number.isFinite(r.a) && Number.isFinite(r.b) && !problems[i])
  const manualOk = valid.length > 0 && problems.every((p, i) => p === '' || (i === parsed.length - 1 && !rows[i].to))
  const covered = valid.reduce((n, r) => n + (r.b - r.a), 0)

  const addRow = () => setRows((rs) => { const last = num(rs[rs.length - 1]?.to ?? ''); return [...rs, { from: Number.isFinite(last) ? String(last) : '', to: '', title: '' }] })
  const patch = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)))
  const go = async () => {
    setBusy(true)
    await build(mode === 'auto' ? autoRanges : valid.map((r) => ({ kmStart: r.a, kmEnd: r.b, title: r.title })), replace)
    setBusy(false)
    onClose()
  }

  return (
    <Modal title="ساخت قطعه‌های مسیر" onClose={onClose} width="max-w-2xl">
      <div className="la-root flex flex-col gap-4" dir="rtl">
        <Segmented label="روش ساخت" value={mode} onChange={setMode} options={[{ value: 'auto', label: 'خودکار — طول هر قطعه' }, { value: 'manual', label: 'دستی — کیلومتر شروع و پایان' }]} />
        {replace && <p className="m-0 rounded-lg px-3 py-2 text-[12px] leading-6" style={{ background: 'color-mix(in srgb, #ef4444 10%, var(--la-surface))', border: '1px solid color-mix(in srgb, #ef4444 40%, transparent)' }}>قطعه‌های فعلی مسیر (با مراحل، مالکین و اسنادشان) حذف و دوباره ساخته می‌شوند. ایستگاه‌ها و عبورها دست نمی‌خورند.</p>}

        {mode === 'auto' ? (
          <div className="flex flex-col gap-3">
            <p className="la-eyebrow m-0 leading-7">مسیر از KM {faNum(start)} تا KM {faNum(end)} ({faNum(+total.toFixed(2))} کیلومتر) است. طول هر قطعه را بدهید؛ تعداد قطعه‌ها خودکار از طول پروژه به‌دست می‌آید.</p>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="طول هر قطعه (کیلومتر)"><input className="la-input la-num" style={{ width: 140 }} type="number" min={0.05} step={0.25} value={seg} onChange={(e) => setSeg(Number(e.target.value))} /></Field>
              <div className="flex gap-1.5" role="group" aria-label="پیشنهادها">{[0.5, 1, 2, 5, 10].filter((v) => v < total).map((v) => <button key={v} className="la-chip" aria-pressed={seg === v} onClick={() => setSeg(v)}>{faNum(v)} km</button>)}</div>
            </div>
            <p className="m-0 text-[13px]">تعداد قطعه‌ها: <b className="la-num" style={{ color: 'var(--la-accent)' }}>{faNum(autoRanges.length)}</b> {autoRanges.length > 120 && <span style={{ color: '#f59e0b' }}> — تعداد زیاد است؛ طول بیشتری انتخاب کنید.</span>}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="la-eyebrow m-0 leading-7">برای هر قطعه یک ردیف بسازید و کیلومتر شروع و پایان را بزنید. ردیف بعدی با کیلومتر پایان قبلی شروع می‌شود.</p>
            <div className="max-h-[46vh] overflow-y-auto pe-1">
              <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
                <thead><tr style={{ color: 'var(--la-muted)' }}><th className="px-1 py-1.5 text-right font-semibold">#</th><th className="px-1 text-right font-semibold">از کیلومتر</th><th className="px-1 text-right font-semibold">تا کیلومتر</th><th className="px-1 text-right font-semibold">عنوان (اختیاری)</th><th /></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--la-line)' }}>
                      <td className="la-num px-1 py-1.5" style={{ color: 'var(--la-muted)' }}>{faNum(i + 1)}</td>
                      <td className="px-1 py-1"><input className="la-input la-num" style={{ minHeight: 34 }} inputMode="decimal" value={r.from} onChange={(e) => patch(i, { from: e.target.value })} aria-label={`شروع ردیف ${i + 1}`} /></td>
                      <td className="px-1 py-1"><input className="la-input la-num" style={{ minHeight: 34 }} inputMode="decimal" value={r.to} onChange={(e) => patch(i, { to: e.target.value })} aria-label={`پایان ردیف ${i + 1}`} /></td>
                      <td className="px-1 py-1"><input className="la-input" style={{ minHeight: 34 }} value={r.title} onChange={(e) => patch(i, { title: e.target.value })} aria-label={`عنوان ردیف ${i + 1}`} />{problems[i] && <span className="block text-[11px]" style={{ color: '#ef4444' }}>{problems[i]}</span>}</td>
                      <td className="px-1"><button className="la-btn la-btn-ghost la-btn-icon" aria-label="حذف ردیف" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button className="la-btn la-btn-sm" onClick={addRow}><Plus size={13} /> افزودن ردیف</button>
              <p className="la-eyebrow m-0">{faNum(valid.length)} قطعهٔ معتبر · {faNum(+covered.toFixed(2))} از {faNum(+total.toFixed(2))} کیلومتر پوشش{covered < total - 0.01 ? ' (بخش‌های بدون قطعه را بعداً می‌توانید اضافه کنید)' : ''}</p>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button className="la-btn" onClick={onClose}>انصراف</button>
          <button className="la-btn la-btn-primary" disabled={busy || (mode === 'auto' ? autoRanges.length === 0 : !manualOk)} onClick={go}>{mode === 'auto' ? <Wand2 size={14} /> : <ListPlus size={14} />} {busy ? 'در حال ساخت…' : `ساخت ${faNum(mode === 'auto' ? autoRanges.length : valid.length)} قطعه`}</button>
        </div>
      </div>
    </Modal>
  )
}
