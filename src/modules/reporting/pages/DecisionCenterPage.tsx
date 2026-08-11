import { useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import {
  DECISION_STATUS_LABEL_FA,
  RASTA_ACTION_PRIORITIES,
  RASTA_ACTION_PRIORITY_LABEL_FA,
  RASTA_ACTION_STATUSES,
  RASTA_ACTION_STATUS_LABEL_FA,
  type DecisionStatus,
  type RastaActionPriority,
  type RastaActionStatus,
} from '../types'
import { EMPTY_ARRAY, useReportingStore } from '../store/useReportingStore'
import { formatJalali } from '../../../lib/jalali'
import { ToneBadge } from '../components/ui'

type Tab = 'decisions' | 'actions'

export function DecisionCenterPage({ masterProjectId }: { masterProjectId: string }) {
  const [tab, setTab] = useState<Tab>('decisions')
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] p-1 w-fit">
        <button onClick={() => setTab('decisions')} className={`rounded-full px-3 py-1.5 text-xs font-medium ${tab === 'decisions' ? 'bg-teal-500/20 text-teal-300' : 'text-secondary hover:bg-white/5'}`}>
          تصمیمات مدیریتی
        </button>
        <button onClick={() => setTab('actions')} className={`rounded-full px-3 py-1.5 text-xs font-medium ${tab === 'actions' ? 'bg-teal-500/20 text-teal-300' : 'text-secondary hover:bg-white/5'}`}>
          اقدامات
        </button>
      </div>
      {tab === 'decisions' ? <DecisionsTab masterProjectId={masterProjectId} /> : <ActionsTab masterProjectId={masterProjectId} />}
    </div>
  )
}

function DecisionsTab({ masterProjectId }: { masterProjectId: string }) {
  const decisions = useReportingStore((s) => s.decisionsByProject[masterProjectId] ?? EMPTY_ARRAY)
  const createDecision = useReportingStore((s) => s.createDecision)
  const setDecisionStatus = useReportingStore((s) => s.setDecisionStatus)
  const [form, setForm] = useState({ title: '', description: '', reason: '', impact: '', recommendedAction: '', requiredBy: '' })
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState(false)

  const submit = async () => {
    if (!form.title.trim()) return
    setCreating(true)
    await createDecision(masterProjectId, { ...form, requiredBy: form.requiredBy || null })
    setCreating(false)
    setForm({ title: '', description: '', reason: '', impact: '', recommendedAction: '', requiredBy: '' })
    setOpen(false)
  }

  return (
    <div className="space-y-3">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-secondary hover:bg-white/5">
        <Plus size={13} /> تصمیم جدید
      </button>
      {open && (
        <div className="glass-panel space-y-2 rounded-2xl p-4">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="عنوان تصمیم" className="input" />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="شرح" className="input" rows={2} />
          <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="دلیل نیاز به تصمیم" className="input" rows={2} />
          <textarea value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })} placeholder="اثر/پیامد" className="input" rows={2} />
          <textarea value={form.recommendedAction} onChange={(e) => setForm({ ...form, recommendedAction: e.target.value })} placeholder="اقدام پیشنهادی" className="input" rows={2} />
          <label className="block">
            <span className="mb-1 block text-[10px] text-muted">مهلت تصمیم‌گیری</span>
            <input type="date" value={form.requiredBy} onChange={(e) => setForm({ ...form, requiredBy: e.target.value })} className="input" />
          </label>
          <button onClick={submit} disabled={creating || !form.title.trim()} className="flex items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-2 text-xs font-bold text-white hover:bg-teal-400 disabled:opacity-40">
            {creating && <Loader2 size={12} className="animate-spin" />} ثبت تصمیم
          </button>
        </div>
      )}

      {decisions.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted">تصمیمی برای این پروژه ثبت نشده است</p>
      ) : (
        <div className="space-y-2">
          {decisions.map((d) => (
            <div key={d.id} className="glass-panel rounded-2xl p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold">{d.title}</p>
                  {d.description && <p className="mt-0.5 text-[11px] text-secondary">{d.description}</p>}
                </div>
                <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted">{DECISION_STATUS_LABEL_FA[d.status]}</span>
              </div>
              {d.recommendedAction && <p className="mt-1.5 text-[11px] text-secondary">پیشنهاد: {d.recommendedAction}</p>}
              {d.requiredBy && <p className="mt-1 text-[10px] text-muted">مهلت: {formatJalali(d.requiredBy)}</p>}
              {d.status === 'pending' || d.status === 'in_review' ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(['in_review', 'approved', 'rejected', 'deferred'] as DecisionStatus[]).map((st) => (
                    <button
                      key={st}
                      onClick={() => setDecisionStatus(d.id, masterProjectId, st)}
                      className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-secondary hover:bg-white/5"
                    >
                      {DECISION_STATUS_LABEL_FA[st]}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-[10px] text-muted">نتیجه نهایی: {DECISION_STATUS_LABEL_FA[d.status]}{d.decidedAt ? ` — ${formatJalali(d.decidedAt.slice(0, 10))}` : ''}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ActionsTab({ masterProjectId }: { masterProjectId: string }) {
  const actions = useReportingStore((s) => s.actionsByProject[masterProjectId] ?? EMPTY_ARRAY)
  const createAction = useReportingStore((s) => s.createAction)
  const setActionStatus = useReportingStore((s) => s.setActionStatus)
  const [form, setForm] = useState<{ title: string; dueDate: string; priority: RastaActionPriority }>({ title: '', dueDate: '', priority: 'medium' })
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState(false)

  const submit = async () => {
    if (!form.title.trim()) return
    setCreating(true)
    await createAction(masterProjectId, { title: form.title, dueDate: form.dueDate || null, priority: form.priority, source: 'management_report' })
    setCreating(false)
    setForm({ title: '', dueDate: '', priority: 'medium' })
    setOpen(false)
  }

  return (
    <div className="space-y-3">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-secondary hover:bg-white/5">
        <Plus size={13} /> اقدام جدید
      </button>
      {open && (
        <div className="glass-panel space-y-2 rounded-2xl p-4">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="عنوان اقدام" className="input" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] text-muted">مهلت</span>
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] text-muted">اولویت</span>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as RastaActionPriority })} className="input">
                {RASTA_ACTION_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {RASTA_ACTION_PRIORITY_LABEL_FA[p]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button onClick={submit} disabled={creating || !form.title.trim()} className="flex items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-2 text-xs font-bold text-white hover:bg-teal-400 disabled:opacity-40">
            {creating && <Loader2 size={12} className="animate-spin" />} ثبت اقدام
          </button>
        </div>
      )}

      {actions.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted">اقدامی برای این پروژه ثبت نشده است</p>
      ) : (
        <div className="space-y-1.5">
          {actions.map((a) => (
            <div key={a.id} className="glass-panel flex items-center justify-between gap-2 rounded-xl p-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-bold">{a.title}</p>
                <p className="mt-0.5 text-[10px] text-muted">
                  اولویت {RASTA_ACTION_PRIORITY_LABEL_FA[a.priority]}
                  {a.dueDate && ` · مهلت ${formatJalali(a.dueDate)}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {a.dueDate && a.dueDate < new Date().toISOString().slice(0, 10) && a.status !== 'completed' && a.status !== 'cancelled' && <ToneBadge tone="critical" label="عقب‌افتاده" />}
                <select
                  value={a.status}
                  onChange={(e) => setActionStatus(a.id, masterProjectId, e.target.value as RastaActionStatus)}
                  className="rounded-lg bg-black/20 border border-white/10 px-2 py-1 text-[10px]"
                >
                  {RASTA_ACTION_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {RASTA_ACTION_STATUS_LABEL_FA[st]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
