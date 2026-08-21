import { useState } from 'react'
import { useAuthStore } from '../../../store/useAuthStore'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { formatJalali } from '../../../lib/jalali'
import { useIssuesStore } from '../store/useIssuesStore'
import { EMPTY_MEMBERS, useIssuesCurrentRole, useIssuesMembersStore } from '../store/useIssuesMembersStore'
import { IM_PRIORITIES, IM_PRIORITY_LABEL_FA, IM_STATUS_LABEL_FA, imCanManage, type ImIssuePriority } from '../types'
import { ringState } from '../lib/issueRing'
import { IssueRing } from './IssueRing'

export function IssueDetailModal({ issueId, onClose }: { issueId: string; onClose: () => void }) {
  const issue = useIssuesStore((s) => s.issues.find((i) => i.id === issueId))
  const project = useIssuesStore((s) => (issue ? s.projects.find((p) => p.id === issue.projectId) : undefined))
  const setIssueStatus = useIssuesStore((s) => s.setIssueStatus)
  const setActionDate = useIssuesStore((s) => s.setActionDate)
  const updateIssue = useIssuesStore((s) => s.updateIssue)
  const deleteIssue = useIssuesStore((s) => s.deleteIssue)
  const members = useIssuesMembersStore((s) => (issue ? (s.membersByProject[issue.projectId] ?? EMPTY_MEMBERS) : EMPTY_MEMBERS))
  const myUserId = useAuthStore((s) => s.profile?.id)
  const role = useIssuesCurrentRole(issue?.projectId ?? null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPriority, setEditPriority] = useState<ImIssuePriority>('medium')
  const [editPursuerId, setEditPursuerId] = useState('')
  const [editApproverId, setEditApproverId] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  if (!issue) return null

  const pursuer = members.find((m) => m.userId === issue.pursuerId)
  const approver = members.find((m) => m.userId === issue.approverId)
  const canAct = imCanManage(role) || myUserId === issue.pursuerId
  const canApprove = imCanManage(role) || myUserId === issue.approverId
  const canEditIssue = imCanManage(role)
  const rs = ringState(issue)

  const startEditing = () => {
    setEditTitle(issue.title)
    setEditDescription(issue.description)
    setEditPriority(issue.priority)
    setEditPursuerId(issue.pursuerId ?? '')
    setEditApproverId(issue.approverId ?? '')
    setEditing(true)
  }

  const saveEdit = async () => {
    if (!editTitle.trim()) return
    setSavingEdit(true)
    try {
      await updateIssue(issue.id, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        priority: editPriority,
        pursuerId: editPursuerId || null,
        approverId: editApproverId || null,
      })
      setEditing(false)
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div className="im-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="im-modal">
        <div className="im-modal-head">
          <div>
            <div className="im-modal-title">{issue.title}</div>
            <div style={{ fontSize: 11.5, color: 'var(--im-muted)', marginTop: 4 }}>{project?.name ?? '—'}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {canEditIssue && !editing && (
              <button className="im-btn im-btn-ghost im-btn-sm" onClick={startEditing}>
                ویرایش
              </button>
            )}
            <button className="im-modal-close" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <IssueRing issue={issue} size={64} />
          <div>
            <div className={`im-status-tag im-st-${issue.status}`} style={{ display: 'inline-block', marginBottom: 6 }}>
              {IM_STATUS_LABEL_FA[issue.status]}
            </div>
            <div style={{ fontSize: 12, color: 'var(--im-muted)' }}>{rs.overdue ? `${rs.days} روز تاخیر از مهلت` : `مهلت باقی‌مانده: ${rs.days} روز`}</div>
          </div>
        </div>

        {editing ? (
          <div style={{ marginBottom: 14 }}>
            <div className="im-field">
              <label>عنوان مشکل</label>
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} autoFocus />
            </div>
            <div className="im-field">
              <label>توضیحات</label>
              <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
            </div>
            <div className="im-row">
              <div className="im-field">
                <label>مسئول انجام</label>
                <select value={editPursuerId} onChange={(e) => setEditPursuerId(e.target.value)}>
                  <option value="">— انتخاب نشده —</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.fullName || m.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="im-field">
                <label>مسئول تایید</label>
                <select value={editApproverId} onChange={(e) => setEditApproverId(e.target.value)}>
                  <option value="">— انتخاب نشده —</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.fullName || m.email}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="im-field">
              <label>اولویت</label>
              <select value={editPriority} onChange={(e) => setEditPriority(e.target.value as ImIssuePriority)}>
                {IM_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {IM_PRIORITY_LABEL_FA[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className="im-row">
              <button className="im-btn im-btn-primary im-btn-sm" onClick={saveEdit} disabled={savingEdit || !editTitle.trim()}>
                {savingEdit ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
              </button>
              <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setEditing(false)}>
                انصراف
              </button>
            </div>
          </div>
        ) : (
          <>
            {issue.description && (
              <div style={{ fontSize: 13.5, color: 'var(--im-muted-2)', background: 'var(--im-panel-2)', padding: 12, borderRadius: 12, marginBottom: 14 }}>
                {issue.description}
              </div>
            )}

            <div className="im-kv">
              <span>اولویت</span>
              <span className={`im-pr-${issue.priority}`} style={{ fontWeight: 700 }}>
                {IM_PRIORITY_LABEL_FA[issue.priority]}
              </span>
            </div>
            <div className="im-kv">
              <span>مسئول انجام</span>
              <span>{pursuer?.fullName || pursuer?.email || '—'}</span>
            </div>
            <div className="im-kv">
              <span>مسئول تایید</span>
              <span>{approver?.fullName || approver?.email || '—'}</span>
            </div>
            <div className="im-kv">
              <span>تاریخ ثبت</span>
              <span>{formatJalali(issue.createdAt.slice(0, 10))}</span>
            </div>
            <div className="im-kv" style={{ borderBottom: issue.actionDate ? undefined : 'none' }}>
              <span>مهلت اقدام</span>
              <span>
                {formatJalali(issue.deadlineDate)} ({issue.deadlineDays} روز)
              </span>
            </div>
            {issue.actionDate && (
              <div className="im-kv" style={{ borderBottom: 'none' }}>
                <span>تاریخ اقدام</span>
                <span style={{ color: 'var(--im-mint)', fontWeight: 700 }}>{formatJalali(issue.actionDate)}</span>
              </div>
            )}
          </>
        )}

        {canAct && issue.status !== 'approved' && issue.status !== 'rejected' && (
          <>
            <div className="im-divider" />
            <div className="im-section-title">اقدام (مسئول انجام)</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11.5, color: 'var(--im-muted)', marginBottom: 7 }}>تاریخ انجام کار رو ثبت کن، بعد بفرست برای تایید</div>
              <JalaliDateInput value={issue.actionDate ?? ''} onChange={(iso) => setActionDate(issue.id, iso)} />
            </div>
            <div className="im-row">
              <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setIssueStatus(issue.id, 'in_progress')}>
                شروع اقدام
              </button>
              <button className="im-btn im-btn-primary im-btn-sm" onClick={() => setIssueStatus(issue.id, 'pending_approval')}>
                ارسال برای تایید
              </button>
            </div>
          </>
        )}

        {canApprove && issue.status === 'pending_approval' && (
          <>
            <div className="im-divider" />
            <div className="im-section-title">تایید نهایی (مسئول تایید)</div>
            <div className="im-row">
              <button className="im-btn im-btn-danger im-btn-sm" onClick={() => setIssueStatus(issue.id, 'rejected')}>
                رد کردن
              </button>
              <button className="im-btn im-btn-primary im-btn-sm" onClick={() => setIssueStatus(issue.id, 'approved')}>
                تایید نهایی
              </button>
            </div>
          </>
        )}

        {(canAct || imCanManage(role)) && issue.status === 'rejected' && (
          <>
            <div className="im-divider" />
            <div className="im-section-title">بازگشایی</div>
            <div style={{ fontSize: 11.5, color: 'var(--im-muted)', marginBottom: 7 }}>
              این مشکل رد شده است. برای ادامه اقدام روی آن، دوباره بازش کنید.
            </div>
            <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setIssueStatus(issue.id, 'in_progress')}>
              بازگشایی مشکل
            </button>
          </>
        )}

        {imCanManage(role) && (
          <>
            <div className="im-divider" />
            {confirmDelete ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="im-btn im-btn-danger im-btn-sm"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => {
                    deleteIssue(issue.id)
                    onClose()
                  }}
                >
                  تایید و حذف
                </button>
                <button className="im-btn im-btn-ghost im-btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setConfirmDelete(false)}>
                  انصراف
                </button>
              </div>
            ) : (
              <button className="im-btn im-btn-danger im-btn-sm" onClick={() => setConfirmDelete(true)}>
                حذف مشکل
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
