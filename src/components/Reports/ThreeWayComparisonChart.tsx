import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Project } from '../../types'

interface ComparisonRow {
  line: string
  contractor: number
  consultant: number
  owner: number
}

export function ThreeWayComparisonChart({ project }: { project: Project }) {
  const data = useMemo<ComparisonRow[]>(() => {
    const byLine = new Map<string, ComparisonRow>()
    for (const log of project.logs) {
      // Only entries that have at least been through consultant approval are meaningful to compare.
      if (log.consultantLengthDone == null) continue
      const line = project.lines.find((l) => l.id === log.lineId)
      const key = line?.svgElementId ?? log.lineId
      const row = byLine.get(key) ?? { line: key, contractor: 0, consultant: 0, owner: 0 }
      row.contractor += log.contractorLengthDone
      row.consultant += log.consultantLengthDone
      row.owner += log.ownerLengthDone ?? log.consultantLengthDone
      byLine.set(key, row)
    }
    return [...byLine.values()]
  }, [project.logs, project.lines])

  if (data.length === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-muted">هنوز رکورد تایید‌شده‌ای برای مقایسه وجود ندارد</div>
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
        <XAxis dataKey="line" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} unit="m" />
        <Tooltip
          contentStyle={{
            background: 'var(--bg-panel-solid)',
            border: '1px solid var(--border-soft)',
            borderRadius: 10,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="contractor" name="پیمانکار" fill="#3498db" radius={[4, 4, 0, 0]} />
        <Bar dataKey="consultant" name="مشاور" fill="#f1c40f" radius={[4, 4, 0, 0]} />
        <Bar dataKey="owner" name="کارفرما" fill="#2ecc71" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
