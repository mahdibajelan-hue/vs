import { useEffect, useMemo, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../store/useAuthStore'
import { useIssuesStore } from '../store/useIssuesStore'
import { useIssueWorkStore } from '../store/useIssueWorkStore'
import { useIssueConfigStore } from '../store/useIssueConfigStore'
import { useIssuesCurrentRole } from '../store/useIssuesMembersStore'
import { imCanManage } from '../types'
import { stageOf } from '../lib/imModel'
import { actorRoles } from '../lib/imRoles'
import { StageChip, SeverityChip, SlaBadge, IssueCode } from './ui'
import { OverviewTab } from './drawer/OverviewTab'
import { TasksTab } from './drawer/TasksTab'
import { AnalysisTab } from './drawer/AnalysisTab'
import { ExtensionsTab } from './drawer/ExtensionsTab'
import { LinksTab } from './drawer/LinksTab'
import { HistoryTab } from './drawer/HistoryTab'
import { DecisionsTab } from './drawer/DecisionsTab'
import { useDecisionStore } from '../store/useDecisionStore'

type Tab = 'overview' | 'tasks' | 'decisions' | 'analysis' | 'extensions' | 'links' | 'history'

/** Full issue workspace. Replaces the legacy modal; every action here goes through the server-side workflow guards. */
export function IssueDrawer({ issueId, onClose, initialTab = 'overview' }: { issueId: string; onClose: () => void; initialTab?: Tab }) {
  const issue = useIssuesStore((s) => s.issues.find((i) => i.id === issueId))
  const project = useIssuesStore((s) => (issue ? s.projects.find((p) => p.id === issue.projectId) : undefined))
  const deleteIssue = useIssuesStore((s) => s.deleteIssue)
  const allTasks = useIssueWorkStore((s) => s.tasks)
  const allExt = useIssueWorkStore((s) => s.extensions)
  const events = useIssueWorkStore((s) => s.eventsByIssue[issueId])
  const links = useIssueWorkStore((s) => s.linksByIssue[issueId])
  const attachments = useIssueWorkStore((s) => s.attachmentsByIssue[issueId])
  const fetchDetail = useIssueWorkStore((s) => s.fetchIssueDetail)
  const cfgLoaded = useIssueConfigStore((s) => s.loaded)
  const fetchCfg = useIssueConfigStore((s) => s.fetch)
  const userId = useAuthStore((s) => s.profile?.id)
  const role = useIssuesCurrentRole(issue?.projectId ?? null)
  const decisions = useDecisionStore((s) => s.decisions)
  const decisionsLoaded = useDecisionStore((s) => s.loaded)
  const fetchDecisions = useDecisionStore((s) => s.fetchAll)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const tasks = useMemo(() => allTasks.filter((t) => t.issueId === issueId), [allTasks, issueId])
  const exts = useMemo(() => allExt.filter((e) => e.issueId === issueId), [allExt, issueId])

  useEffect(() => { if (!cfgLoaded) fetchCfg() }, [cfgLoaded, fetchCfg])
  useEffect(() => { if (!decisionsLoaded) fetchDecisions() }, [decisionsLoaded, fetchDecisions])
  useEffect(() => { fetchDetail(issueId) }, [issueId, fetchDetail, tasks.length])
  // opening the issue acknowledges its in-app notifications
  useEffect(() => { supabase.rpc('im_notif_mark_issue_read', { p_issue: issueId }).then(() => undefined) }, [issueId])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!issue) return null
  const roles = actorRoles(issue, role, userId)
  const stage = stageOf(issue)
  const tabs: { id: Tab; label: string; n?: number }[] = [
    { id: 'overview', label: 'نمای کلی' },
    { id: 'tasks', label: 'اقدامات', n: tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled').length },
    { id: 'decisions', label: 'تصمیم‌ها', n: decisions.filter((x) => x.issueId === issueId && x.status === 'pending').length },
    { id: 'analysis', label: 'تحلیل علت' },
    { id: 'extensions', label: 'تمدیدها', n: exts.filter((e) => e.status === 'pending').length },
    { id: 'links', label: 'پیوند و شواهد', n: (links?.length ?? 0) + (attachments?.length ?? 0) },
    { id: 'history', label: 'تاریخچه' },
  ]

  return (
    <div className="im-drawer-ov" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="im-drawer" role="dialog" aria-modal="true" aria-label={issue.title}>
        <div className="im-drawer-head">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}><IssueCode issue={issue} /><StageChip stage={stage} /><SeverityChip level={issue.severity ?? issue.priority} /><SlaBadge issue={issue} /></div>
              <div className="im-modal-title" style={{ lineHeight: 1.6 }}>{issue.title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--im-muted)', marginTop: 3 }}>{project?.name ?? '—'}</div>
            </div>
            <button className="im-modal-close" onClick={onClose} aria-label="بستن"><X size={16} /></button>
          </div>
        </div>
        <div className="im-tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={`im-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}{!!t.n && <span className="n">{t.n}</span>}
            </button>
          ))}
        </div>
        <div className="im-drawer-body">
          {tab === 'overview' && <OverviewTab issue={issue} tasks={tasks} attachments={attachments ?? []} roles={roles} />}
          {tab === 'tasks' && <TasksTab issue={issue} tasks={tasks} roles={roles} />}
          {tab === 'decisions' && <DecisionsTab issue={issue} roles={roles} />}
          {tab === 'analysis' && <AnalysisTab issue={issue} roles={roles} />}
          {tab === 'extensions' && <ExtensionsTab issue={issue} tasks={tasks} extensions={exts} roles={roles} />}
          {tab === 'links' && <LinksTab issue={issue} links={links ?? []} attachments={attachments ?? []} roles={roles} />}
          {tab === 'history' && <HistoryTab events={events ?? []} />}
          {imCanManage(role) && tab === 'overview' && (
            <div style={{ marginTop: 24 }}>
              {confirmDelete ? (
                <div className="im-row"><button className="im-btn im-btn-danger im-btn-sm" onClick={() => { deleteIssue(issue.id); onClose() }}>تأیید حذف (در تاریخچه ثبت می‌شود)</button><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setConfirmDelete(false)}>انصراف</button></div>
              ) : <button className="im-btn im-btn-danger im-btn-sm" onClick={() => setConfirmDelete(true)}><Trash2 size={13} /> حذف مسئله</button>}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
