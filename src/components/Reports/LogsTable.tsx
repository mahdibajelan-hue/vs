import { useMemo, useState } from 'react'
import { Trash2, Check, X, Pencil, ShieldCheck } from 'lucide-react'
import type { ApprovalStatus, DailyLog, LineStatus, Project } from '../../types'
import { APPROVAL_COLOR, APPROVAL_LABEL_FA, STATUS_LABEL_FA } from '../../types'
import { useStore } from '../../store/useStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useCurrentRole } from '../../store/useMembersStore'
import { canApprove, canAudit, canEdit } from '../../lib/permissions'
import { JalaliDateInput } from '../common/JalaliDateInput'
import { formatJalali } from '../../lib/jalali'
import { DailyLogForm } from '../IsoViewer/DailyLogForm'
import { OwnerAuditModal } from './OwnerAuditModal'

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
  const updateLog = useStore((s) => s.updateLog)
  const role = useCurrentRole()
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin ?? false)
  const reviewerName = useAuthStore((s) => s.currentUser()?.fullName ?? '')
  const canAuditLogs = canAudit(role) || isAdmin
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [contractor, setContractor] = useState('all')
  const [status, setStatus] = useState<LineStatus | 'all'>('all')
  const [approval, setApproval] = useState<ApprovalStatus | 'all'>('all')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [editingLog, setEditingLog] = useState<DailyLog | null>(null)
  const [auditingLog, setAuditingLog] = useState<DailyLog | null>(null)

  const contractors = useMemo(() => [...new Set(project.lines.map((l) => l.contractor).filter(Boolean))], [project.lines])

  const rows = useMemo(() => {
    return [...project.logs]
      .filter((log) => {
        if (from && log.date < from) return false
        if (to && log.date > to) return false
        if (contractor !== 'all' && log.contractor !== contractor) return false
        if (approval !== 'all' && log.approvalStatus !== approval) return false
        const line = project.lines.find((l) => l.id === log.lineId)
        if (status !== 'all' && line?.status !== status) return false
        return true
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((log) => ({ log, line: project.lines.find((l) => l.id === log.lineId) }))
  }, [project.logs, project.lines, from, to, contractor, status, approval])

  const approve = (logId: string) => {
    updateLog(project.id, logId, { approvalStatus: 'approved', reviewedBy: reviewerName, reviewNote: '' })
  }
  const confirmReject = (logId: string) => {
    updateLog(project.id, logId, { approvalStatus: 'rejected', reviewedBy: reviewerName, reviewNote: rejectNote.trim() })
    setRejectingId(null)
    setRejectNote('')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b" style={{ borderColor: 'var(--border-soft)' }}>
        <label className="flex items-center gap-1.5 text-xs text-secondary">
          از تاریخ
          <JalaliDateInput value={from} onChange={setFrom} className="!w-40" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-secondary">
          تا تاریخ
          <JalaliDateInput value={to} onChange={setTo} className="!w-40" />
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
        <select value={approval} onChange={(e) => setApproval(e.target.value as ApprovalStatus | 'all')} className="input !w-auto">
          <option value="all">همه وضعیت‌های تایید</option>
          {(Object.keys(APPROVAL_LABEL_FA) as ApprovalStatus[]).map((a) => (
            <option key={a} value={a}>
              {APPROVAL_LABEL_FA[a]}
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
              <th className="p-2.5 text-right font-medium">تایید</th>
              <th className="p-2.5 text-right font-medium">ممیزی کارفرما</th>
              <th className="p-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--border-soft)' }}>
            {rows.map(({ log, line }) => (
              <tr key={log.id} className="hover:bg-white/[0.03]">
                <td className="p-2.5 num whitespace-nowrap">{formatJalali(log.date)}</td>
                <td className="p-2.5 font-mono text-xs">{line?.svgElementId ?? '—'}</td>
                <td className="p-2.5 num">{log.lengthDone}m</td>
                <td className="p-2.5 num">{log.weldCount}</td>
                <td className="p-2.5">{WELD_PASS_LABEL[log.weldPass]}</td>
                <td className="p-2.5">{log.contractor}</td>
                <td className="p-2.5 max-w-[220px] truncate text-secondary" title={log.notes || log.delayReason}>
                  {log.delayReason ? <span className="text-amber-400">{log.delayReason}</span> : log.notes}
                </td>
                <td className="p-2.5">
                  {rejectingId === log.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        placeholder="علت رد"
                        className="w-28 rounded-md bg-black/20 border border-white/10 px-2 py-1 text-xs outline-none focus:border-brand-400"
                      />
                      <button onClick={() => confirmReject(log.id)} className="text-red-400 hover:underline text-xs">
                        ثبت
                      </button>
                      <button onClick={() => setRejectingId(null)} className="text-muted hover:underline text-xs">
                        لغو
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap"
                        style={{
                          background: `${APPROVAL_COLOR[log.approvalStatus]}22`,
                          color: 'var(--text-primary)',
                          border: `1px solid ${APPROVAL_COLOR[log.approvalStatus]}66`,
                        }}
                        title={log.reviewNote || undefined}
                      >
                        {APPROVAL_LABEL_FA[log.approvalStatus]}
                      </span>
                      {canApprove(role) && log.approvalStatus !== 'approved' && (
                        <button onClick={() => approve(log.id)} className="text-green-400 hover:text-green-300" title="تایید">
                          <Check size={14} />
                        </button>
                      )}
                      {canApprove(role) && log.approvalStatus !== 'rejected' && (
                        <button onClick={() => setRejectingId(log.id)} className="text-red-400 hover:text-red-300" title="رد">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </td>
                <td className="p-2.5">
                  {log.approvalStatus !== 'approved' ? (
                    <span className="text-[11px] text-muted">پس از تایید مشاور</span>
                  ) : log.ownerReviewedAt ? (
                    <button
                      onClick={() => canAuditLogs && setAuditingLog(log)}
                      disabled={!canAuditLogs}
                      className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] text-green-400 border border-green-500/30 disabled:cursor-default"
                      title={log.ownerNote || 'بررسی‌شده توسط کارفرما'}
                    >
                      <ShieldCheck size={12} /> بررسی‌شده
                    </button>
                  ) : canAuditLogs ? (
                    <button
                      onClick={() => setAuditingLog(log)}
                      className="flex items-center gap-1 rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-secondary hover:bg-white/5 transition-colors"
                    >
                      <ShieldCheck size={12} /> ممیزی
                    </button>
                  ) : (
                    <span className="text-[11px] text-muted">—</span>
                  )}
                </td>
                <td className="p-2.5">
                  <div className="flex items-center gap-2">
                    {canEdit(role) && (
                      <button onClick={() => setEditingLog(log)} className="text-muted hover:text-brand-400 transition-colors" title="ویرایش">
                        <Pencil size={14} />
                      </button>
                    )}
                    {canEdit(role) && (
                      <button onClick={() => deleteLog(project.id, log.id)} className="text-muted hover:text-red-400 transition-colors" title="حذف">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="p-8 text-center text-xs text-muted">
                  رکوردی یافت نشد
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingLog && (
        <DailyLogForm projectId={project.id} lines={project.lines} initialLineId={null} editingLog={editingLog} onClose={() => setEditingLog(null)} />
      )}
      {auditingLog && <OwnerAuditModal projectId={project.id} log={auditingLog} onClose={() => setAuditingLog(null)} />}
    </div>
  )
}
