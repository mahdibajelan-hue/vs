import { useMemo } from 'react'
import type { ExecutionModel } from '../lib/useExecutionModel'
import { deviationDrivers } from '../lib/progress'
import { Bar, fa, pct } from './common'

/**
 * «عوامل اصلی عقب‌افتادگی»: the activities that make up most of the gap between planned and approved progress, in
 * points of overall progress — the list a project manager or planner works down first. `limit` rows; the rest summed.
 */
export function DriversTable({ m, limit = 8, compact = false }: { m: ExecutionModel; limit?: number; compact?: boolean }) {
  const employer = ((m.settings as unknown as { employerStep?: string }).employerStep === 'binding' ? 'binding' : 'off') as 'binding' | 'off'
  const all = useMemo(() => deviationDrivers({ activities: m.activities, baselines: m.baselines, blines: m.blines, reports: m.reports, lines: m.lines, asOf: m.today, groupWeights: m.settings.groupWeights, employer }), [m, employer])
  const behind = all.filter((d) => d.points > 0.0005)
  const gap = behind.reduce((s, d) => s + d.points, 0)
  if (!behind.length) return <p className="im-helper" style={{ margin: 0 }}>هیچ فعالیتی از برنامه عقب نیست.</p>
  const top = behind.slice(0, limit), rest = gap - top.reduce((s, d) => s + d.points, 0)
  return (
    <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}>
      <table className="ex-lines">
        <thead><tr><th>فعالیت</th>{!compact && <th className="num">برنامه تا امروز</th>}<th>واقعی (تأییدشده)</th><th className="num">سهم از عقب‌افتادگی کل</th>{!compact && <th className="num">باقی‌مانده</th>}</tr></thead>
        <tbody>
          {top.map((d) => (
            <tr key={d.activity.id}>
              <td style={{ minWidth: 220 }}><b>{d.activity.title}</b><span className="sub fn-code">{d.activity.itemNo}{d.activity.front ? ` · ${d.activity.front}` : ''}</span></td>
              {!compact && <td className="num">{pct(d.planned, 0)}</td>}
              <td style={{ minWidth: 130 }}><Bar value={d.actual} planned={d.planned} /><span className="sub">{pct(d.actual, 0)}</span></td>
              <td className="num"><b>{fa(d.points * 100, 2)}</b> واحد درصد<span className="sub">{pct(d.points / gap, 0)} از کل عقب‌افتادگی</span></td>
              {!compact && <td className="num">{fa(d.remaining, 0)} {d.activity.unit}</td>}
            </tr>
          ))}
          {rest > 0.0005 && <tr><td colSpan={compact ? 2 : 3} className="sub">سایر فعالیت‌ها ({fa(behind.length - top.length)})</td><td className="num">{fa(rest * 100, 2)} واحد درصد</td>{!compact && <td />}</tr>}
        </tbody>
      </table>
    </div>
  )
}
