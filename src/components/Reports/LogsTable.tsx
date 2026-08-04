import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { DailyLog, LineStatus, Project } from '../../types'
import { STATUS_LABEL_FA } from '../../types'
import { useStore } from '../../store/useStore'

const WELD_PASS_LABEL: Record<DailyLog['weldPass'], string> = {
  root: 'ریشه',
  hot: 'داغ',
  fill: 'پرکننده',
  cap: 'نهایی',
  ndt: 'NDT',
  hydrotest: 'هیدروتست',
}

export function LogsTable({ project }: { project: Project }) {
  const deleteLog = useStore((s) => s.deleteLog)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [contractor, setContractor] = useState('all')
  const [status, setStatus] = useState<LineStatus | 'all'>('all')

  const contractors = useMemo(() => [...new Set(project.lines.map((l) => l.contractor).filter(Boolean))], [project.lines])

  const rows = useMemo(() => {
    return [...project.logs]
      .filter((log) => {
        if (from && log.date < from) return false
        if (to && log.date > to) return false
        if (contractor !== 'all' && log.contractor !== contractor) return false
        const line = project.lines.find((l) => l.id === log.lineId)
        if (status !== 'all' && line?.status !== status) return false
        return true
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((log) => ({ log, line: project.lines.find((l) => l.id === log.lineId) }))
  }, [project.logs, project.lines, from, to, contractor, status])

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b" style={{ borderColor: 'var(--border-soft)' }}>
        <label className="flex items-center gap-1.5 text-xs text-secondary">
          از تاریخ
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input !w-auto num" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-secondary">
          تا تاریخ
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input !w-auto num" />
        </label>
        <select value={contractor} onChange={(e) => setContractor(e.target.value)} className="input !w-auto">
          <option value="all">همه پیمانکاران</option>
          {contractors.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as LineStatus | 'all')} className="input !w-auto">
          <option value="all">همه وضعیت‌ها</option>
          {(Object.keys(STATUS_LABEL_FA) as LineStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL_FA[s]}
            </option>
          ))}
        </select>
        <span className="mr-auto text-xs text-muted">{rows.length} رکورد</span>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--bg-panel-solid)]">
            <tr className="text-xs text-secondary">
              <th className="p-2.5 text-right font-medium">تاریخ</th>
              <th className="p-2.5 text-right font-medium">خط</th>
              <th className="p-2.5 text-right font-medium">متراژ</th>
              <th className="p-2.5 text-right font-medium">سرجوش</th>
              <th className="p-2.5 text-right font-medium">پاس/تست</th>
              <th className="p-2.5 text-right font-medium">پیمانکار</th>
              <th className="p-2.5 text-right font-medium">توضیحات</th>
              <th className="p-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--border-soft)' }}>
            {rows.map(({ log, line }) => (
              <tr key={log.id} className="hover:bg-white/[0.03]">
                <td className="p-2.5 num whitespace-nowrap">{log.date}</td>
                <td className="p-2.5 font-mono text-xs">{line?.svgElementId ?? '—'}</td>
                <td className="p-2.5 num">{log.lengthDone}m</td>
                <td className="p-2.5 num">{log.weldCount}</td>
                <td className="p-2.5">{WELD_PASS_LABEL[log.weldPass]}</td>
                <td className="p-2.5">{log.contractor}</td>
                <td className="p-2.5 max-w-[220px] truncate text-secondary" title={log.notes || log.delayReason}>
                  {log.delayReason ? <span className="text-amber-400">{log.delayReason}</span> : log.notes}
                </td>
                <td className="p-2.5">
                  <button onClick={() => deleteLog(project.id, log.id)} className="text-muted hover:text-red-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-xs text-muted">
                  رکوردی یافت نشد
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
