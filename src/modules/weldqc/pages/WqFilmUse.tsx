import { useMemo, useState, type CSSProperties } from 'react'
import { Download, Film } from 'lucide-react'
import { useWqStore } from '../store/useWqStore'
import { fa, monthKey, monthLabel, useQc } from '../lib/useQc'
import { filmUse, repeatRate, type UseFilm, type UseRow } from '../lib/filmuse'
import { natural } from '../lib/passport'

type By = 'month' | 'section' | 'size'
const pc = (v: number | null) => (v == null ? '—' : `${fa(v * 100, 1)}٪`)

/** مصرف فیلم رادیوگرافی — exposed films and metres of film, with repeats split by who pays; the figures the material balance needs. */
export function WqFilmUse() {
  const st = useWqStore(); const q = useQc()
  const [by, setBy] = useState<By>('month')
  const films = useMemo(() => st.films.map((f) => { const r = q.byId.get(f.weldId); return { round: f.round, quality: f.quality, lenMm: f.lenMm, date: (f.shotAt ?? f.createdAt).slice(0, 10), odMm: r?.odMm ?? null, sec: r?.weld.sec ?? '' } }), [st.films, q.byId])
  const u = useMemo(() => filmUse(films as (UseFilm & { sec: string })[], (f) => (by === 'month' ? monthKey(f.date) : by === 'section' ? (f as UseFilm & { sec: string }).sec || '—' : f.odMm ? `${Math.round(f.odMm / 25.4)}` : '—')), [films, by])
  const rows = by === 'month' ? u.rows : [...u.rows].sort((a, b) => natural(a.key, b.key))
  const label = (k: string) => (by === 'month' ? monthLabel(k) : by === 'section' ? `مقطع ${k}` : k === '—' ? 'قطر نامعلوم' : `${fa(Number(k))} اینچ`)
  const noLen = films.filter((f) => f.lenMm == null).length
  const cells = (r: UseRow) => [r.films, r.first, r.rs, r.retake, r.reshoot, r.pending]
  const exportXlsx = async () => {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('مصرف فیلم', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] })
    ws.addRow([by === 'month' ? 'ماه' : by === 'section' ? 'مقطع' : 'قطر', 'کل فیلم پرتودهی‌شده', 'رادیوگرافی اولیه (RT)', 'پس از تعمیر (RS) — هزینه با پیمانکار جوش', 'ریتیک — هزینه با کارفرما', 'ریشوت — هزینه با پیمانکار RT', 'منتظر بررسی کیفیت', 'متراژ فیلم (m)', 'نرخ تکرار (٪)'])
    for (const r of [...rows, u.total]) ws.addRow([r.key === 'total' ? 'جمع' : label(r.key), ...cells(r), Math.round(r.metres * 100) / 100, repeatRate(r) == null ? '' : Math.round(repeatRate(r)! * 1000) / 10])
    ws.getRow(1).font = { bold: true }; ws.lastRow!.font = { bold: true }; ws.columns.forEach((c) => { c.width = 22 })
    const buf = await wb.xlsx.writeBuffer(), a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf])); a.download = 'rt-film-consumption.xlsx'; a.click(); URL.revokeObjectURL(a.href)
  }
  const t = u.total
  return (
    <div className="wq-assist">
      <section className="ps-kpis">
        <div className="ps-kpi" style={{ '--c': '#0ea5e9' } as CSSProperties}><small>فیلم پرتودهی‌شده</small><b>{fa(t.films)}</b><span>{fa(t.metres, 1)} متر فیلم</span></div>
        <div className="ps-kpi" style={{ '--c': '#22c55e' } as CSSProperties}><small>رادیوگرافی اولیه</small><b>{fa(t.first)}</b><span>{fa(t.accepted)} فیلم تأییدشده</span></div>
        <div className="ps-kpi" style={{ '--c': '#f59e0b' } as CSSProperties}><small>پس از تعمیر (RS) و ریتیک</small><b>{fa(t.rs)} / {fa(t.retake)}</b><span>RS با پیمانکار جوش · ریتیک با کارفرما</span></div>
        <div className="ps-kpi" style={{ '--c': '#ef4444' } as CSSProperties}><small>ریشوت</small><b>{fa(t.reshoot)}</b><span>هزینه با پیمانکار RT · نرخ تکرار کل {pc(repeatRate(t))}</span></div>
      </section>
      <section className="wq-card">
        <header className="wq-card-head"><Film size={16} aria-hidden /><h3>مصرف فیلم رادیوگرافی</h3><button type="button" className="ps-btn is-primary wq-head-link" disabled={!t.films} onClick={() => void exportXlsx()}><Download size={14} aria-hidden /> خروجی اکسل برای بالانس متریال</button></header>
        <div className="wq-seg" role="group" aria-label="تفکیک">{([['month', 'ماهانه'], ['section', 'به تفکیک مقطع'], ['size', 'به تفکیک قطر']] as [By, string][]).map(([k, l]) => <button key={k} type="button" aria-pressed={by === k} onClick={() => setBy(k)}>{l}</button>)}</div>
        {t.films ? (
          <div className="wq-tbl-wrap" style={{ marginTop: '.6rem' }}><table className="wq-tbl"><thead><tr><th>{by === 'month' ? 'ماه' : by === 'section' ? 'مقطع' : 'قطر'}</th><th>کل فیلم</th><th>RT اولیه</th><th>RS (پس از تعمیر)</th><th>ریتیک</th><th>ریشوت</th><th>منتظر بررسی</th><th>متراژ فیلم (m)</th><th>نرخ تکرار</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.key}><th scope="row">{label(r.key)}</th>{cells(r).map((v, i) => <td key={i} className={i === 4 && v ? 'is-bad' : ''}>{fa(v)}</td>)}<td>{fa(r.metres, 1)}</td><td>{pc(repeatRate(r))}</td></tr>)}
              <tr className="wq-total"><th scope="row">جمع</th>{cells(t).map((v, i) => <td key={i}>{fa(v)}</td>)}<td>{fa(t.metres, 1)}</td><td>{pc(repeatRate(t))}</td></tr></tbody></table></div>
        ) : <p className="ps-hint">هنوز فیلمی بارگذاری نشده است.</p>}
        <p className="ps-meta">متراژ از «طول جوش زیر فیلم» هر فیلم جمع می‌شود{noLen ? `؛ ${fa(noLen)} فیلم قدیمی این طول را ندارند و در متراژ نیامده‌اند` : ''}. برای مصرف واقعی انبار، هم‌پوشانی دو سر هر فیلم و ضایعات برش را به این عدد اضافه کنید. ریتیک = تکرار به درخواست کارفرما؛ ریشوت = فیلم ناخوانا، به هزینهٔ پیمانکار رادیوگرافی؛ RS = رادیوگرافی ناحیهٔ تعمیر.</p>
      </section>
    </div>
  )
}
