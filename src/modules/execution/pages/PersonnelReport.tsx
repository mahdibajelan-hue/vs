import { useMemo, useState } from 'react'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionModel } from '../lib/useExecutionModel'
import { monthOf } from '../lib/periods'
import { rankWelders, welderQuality } from '../lib/welderQuality'
import { Chip, KpiCard, Section } from '../../finance/components/fn'
import { Empty, fa } from '../components/common'

/** Welders and coating applicators whose qualification card was ISSUED in the Competency module for this project: identity, repair % and the rank among the project's welders (rank 1 = lowest repair %). Everything is read, nothing is typed here. */
export function PersonnelReport({ projectId }: { projectId: string }) {
  const m = useExecutionModel(projectId)
  const welders = useEpcStore((s) => s.welders)
  const [period, setPeriod] = useState('ALL')
  const [minTested, setMinTested] = useState(5)
  const people = useMemo(() => welders.filter((w) => w.projectId === projectId && w.cardStatus === 'issued'), [welders, projectId])
  const quality = useMemo(() => {
    const rep = new Map(m.reports.filter((r) => !['draft', 'rejected', 'returned', 'incomplete'].includes(r.status)).map((r) => [r.id, r]))
    const rows = m.lines.flatMap((l) => { const r = rep.get(l.reportId); return r && (r.formKey === 'welding' || r.formKey === 'tie_in' || r.formKey === 'rt_report') ? [{ formKey: r.formKey, date: r.reportDate, detail: l.detail }] : [] })
    return welderQuality(rows, (iso) => { const p = monthOf(iso); return { key: p.key, label: p.label } })
  }, [m.lines, m.reports])
  const ranks = useMemo(() => rankWelders(quality, period, minTested), [quality, period, minTested])
  const months = useMemo(() => { const set = new Map<string, string>(); for (const v of quality.values()) for (const x of v.months) set.set(x.key, x.label); return [...set].sort((a, b) => b[0].localeCompare(a[0])) }, [quality])
  const curMonth = monthOf(new Date().toISOString().slice(0, 10)).key
  const rows = useMemo(() => people.map((w) => {
    const q = w.kind === 'welder' ? quality.get(w.key) : undefined, rk = w.kind === 'welder' ? ranks.get(w.key) : undefined
    const inPeriod = rk && rk.tested > 0 ? rk : undefined
    return { w, q, rk: inPeriod, cm: q?.months.find((x) => x.key === curMonth) }
  }).sort((a, b) => (a.w.kind === b.w.kind ? 0 : a.w.kind === 'welder' ? -1 : 1) || (a.rk?.rank ?? 1e9) - (b.rk?.rank ?? 1e9) || a.w.key.localeCompare(b.w.key, undefined, { numeric: true })), [people, quality, ranks, curMonth])
  const ranked = [...ranks.values()].filter((r) => r.rank).length
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard label="جوشکاران تأییدصلاحیت‌شدهٔ پروژه" value={fa(people.filter((w) => w.kind === 'welder').length)} />
        <KpiCard i={1} label="عایق‌کاران تأییدصلاحیت‌شده" value={fa(people.filter((w) => w.kind === 'coater').length)} />
        <KpiCard i={2} label="دارای رتبه" value={fa(ranked)} sub={`حداقل ${fa(minTested)} سرجوش دارای RT`} />
      </div>
      <Section title="جوشکاران و عایق‌کاران پروژه" hint="فقط افرادی که کارت صلاحیتشان در «ارزیابی شایستگی ← صلاحیت جوشکاران و عایق‌کاران» برای همین پروژه صادر شده است. ٪ ریپیر از نتیجهٔ اولین RT هر سرجوش در سامانهٔ کیفیت می‌آید؛ رتبهٔ ۱ = کمترین ٪ ریپیر بین جوشکاران پروژه.">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
          <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="دوره"><option value="ALL">کل دوره</option>{months.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>حداقل سرجوش دارای RT برای رتبه<input type="number" min={1} value={minTested} onChange={(e) => setMinTested(Math.max(1, Number(e.target.value) || 1))} style={{ width: 70 }} /></label>
        </div>
        {rows.length === 0 ? <Empty>برای این پروژه هنوز کارت صلاحیتی صادر نشده است.</Empty> : (
          <div className="fn-tbl-wrap" style={{ maxHeight: 560 }}><table className="ex-lines"><thead><tr><th>نوع</th><th>شناسه (نشانه)</th><th>نام</th><th>کد ملی</th><th className="num">سرجوش دارای RT</th><th className="num">٪ ریپیر (دوره)</th><th className="num">٪ ریپیر ماه جاری</th><th className="num">رتبه</th><th className="num">نمره</th></tr></thead>
            <tbody>{rows.map(({ w, q, rk, cm }) => (
              <tr key={w.id}><td>{w.kind === 'welder' ? 'جوشکار' : 'عایق‌کار'}</td><td dir="ltr"><b>{w.raw}</b></td><td>{w.fullName || '—'}</td><td dir="ltr">{w.nationalId || '—'}</td>
                {w.kind === 'welder' ? <>
                  <td className="num">{rk ? fa(rk.tested) : '—'}</td><td className="num">{rk ? `${fa(rk.rate, 1)}٪` : '—'}</td><td className="num">{cm ? `${fa(cm.rate, 1)}٪` : '—'}</td>
                  <td className="num">{rk?.rank ? <Chip tone={rk.rank <= Math.max(1, Math.ceil(rk.of / 3)) ? 'good' : rk.rank > Math.ceil((rk.of * 2) / 3) ? 'bad' : 'neutral'}>{fa(rk.rank)} از {fa(rk.of)}</Chip> : <span className="sub">{rk ? 'نمونهٔ کم' : '—'}</span>}</td>
                  <td className="num">{rk?.score != null ? fa(rk.score, 1) : '—'}</td></> : <td colSpan={5} className="sub">اندازهٔ ریپیر برای عایق‌کار تعریف نشده است</td>}
                {q ? null : null}</tr>))}</tbody></table></div>
        )}
      </Section>
    </div>
  )
}
