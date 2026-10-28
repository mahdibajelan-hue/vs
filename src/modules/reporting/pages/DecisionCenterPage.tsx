import { useEffect, useRef, useState } from 'react'
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
import { useDeepLinkStore } from '../../../store/useDeepLinkStore'
import { MissionOriginChip } from '../../missions/integration/originChip'
import { supabase } from '../../../lib/supabaseClient'

type Tab = 'decisions' | 'register' | 'actions'

export function DecisionCenterPage({ masterProjectId }: { masterProjectId: string }) {
  // Arrived from a mission finding («مشاهده در مدیریت اقدامات»): start on the actions tab.
  const [tab, setTab] = useState<Tab>(() => (useDeepLinkStore.getState().pending?.module === 'reporting' ? 'actions' : 'decisions'))
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] p-1 w-fit">
        <button onClick={() => setTab('decisions')} className={`rounded-full px-3 py-1.5 text-xs font-medium ${tab === 'decisions' ? 'bg-teal-500/20 text-teal-300' : 'text-secondary hover:bg-white/5'}`}>
          تصمیمات مدیریتی
        </button>
        <button onClick={() => setTab('register')} className={`rounded-full px-3 py-1.5 text-xs font-medium ${tab === 'register' ? 'bg-teal-500/20 text-teal-300' : 'text-secondary hover:bg-white/5'}`}>
          دفتر واحد تصمیم‌ها
        </button>
        <button onClick={() => setTab('actions')} className={`rounded-full px-3 py-1.5 text-xs font-medium ${tab === 'actions' ? 'bg-teal-500/20 text-teal-300' : 'text-secondary hover:bg-white/5'}`}>
          اقدامات
        </button>
      </div>
      {tab === 'decisions' ? <DecisionsTab masterProjectId={masterProjectId} /> : tab === 'register' ? <DecisionRegister masterProjectId={masterProjectId} /> : <ActionsTab masterProjectId={masterProjectId} />}
    </div>
  )
}

function DecisionsTab({ masterProjectId }: { masterProjectId: string }) {
  const decisions = useReportingStore((s) => s.decisionsByProject[masterProjectId] ?? EMPTY_ARRAY)
  const createDecision = useReportingStore((s) => s.createDecision)
  const setDecisionStatus = useReportingStore((s) => s.setDecisionStatus)
  const cancelDecision = useReportingStore((s) => s.cancelDecision)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [form, setForm] = useState({ title: '', description: '', reason: '', impact: '', recommendedAction: '', requiredBy: '' })
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState(false)
  // approved/rejected require a rationale (enforced server-side too — see schema.sql section 17e)
  // so those two verdicts open an inline prompt instead of firing immediately like in_review/deferred.
  const [finalizing, setFinalizing] = useState<{ id: string; status: 'approved' | 'rejected' } | null>(null)
  const [rationale, setRationale] = useState('')

  const submitFinal = async () => {
    if (!finalizing || !rationale.trim()) return
    await setDecisionStatus(finalizing.id, masterProjectId, finalizing.status, rationale.trim())
    setFinalizing(null)
    setRationale('')
  }

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
                finalizing?.id === d.id ? (
                  <div className="mt-2 space-y-1.5">
                    <textarea
                      value={rationale}
                      onChange={(e) => setRationale(e.target.value)}
                      placeholder={finalizing.status === 'approved' ? 'دلیل تایید این تصمیم را بنویسید' : 'دلیل رد این تصمیم را بنویسید'}
                      className="input"
                      rows={2}
                      autoFocus
                    />
                    <div className="flex gap-1.5">
                      <button
                        onClick={submitFinal}
                        disabled={!rationale.trim()}
                        className="rounded-full bg-teal-500 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-teal-400 disabled:opacity-40"
                      >
                        ثبت {DECISION_STATUS_LABEL_FA[finalizing.status]}
                      </button>
                      <button
                        onClick={() => {
                          setFinalizing(null)
                          setRationale('')
                        }}
                        className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-secondary hover:bg-white/5"
                      >
                        انصراف
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(['in_review', 'deferred'] as DecisionStatus[]).map((st) => (
                      <button
                        key={st}
                        onClick={() => setDecisionStatus(d.id, masterProjectId, st)}
                        className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-secondary hover:bg-white/5"
                      >
                        {DECISION_STATUS_LABEL_FA[st]}
                      </button>
                    ))}
                    {(['approved', 'rejected'] as const).map((st) => (
                      <button
                        key={st}
                        onClick={() => setFinalizing({ id: d.id, status: st })}
                        className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-secondary hover:bg-white/5"
                      >
                        {DECISION_STATUS_LABEL_FA[st]}
                      </button>
                    ))}
                    <button onClick={() => { setCancelling(d.id); setCancelReason('') }} className="rounded-full border border-red-400/30 px-2.5 py-1 text-[10px] text-red-300 hover:bg-red-500/10">لغو با دلیل</button>
                    {cancelling === d.id && (
                      <div className="mt-1.5 w-full space-y-1.5">
                        <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="چرا این تصمیم دیگر لازم نیست؟ تصمیم حذف نمی‌شود و دلیل لغو در سابقه می‌ماند." className="input" rows={2} autoFocus />
                        <div className="flex gap-1.5">
                          <button disabled={!cancelReason.trim()} onClick={async () => { await cancelDecision(d.id, masterProjectId, cancelReason); setCancelling(null) }} className="rounded-full bg-red-500/80 px-2.5 py-1 text-[10px] font-bold text-white disabled:opacity-40">ثبت لغو</button>
                          <button onClick={() => setCancelling(null)} className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-secondary">انصراف</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              ) : (
                <p className="mt-2 text-[10px] text-muted">
                  نتیجه نهایی: {DECISION_STATUS_LABEL_FA[d.status]}
                  {d.decidedAt ? ` — ${formatJalali(d.decidedAt.slice(0, 10))}` : ''}
                  {d.finalDecision ? ` — ${d.finalDecision}` : ''}
                  {d.status === 'cancelled' && d.cancelReason ? ` — دلیل لغو: ${d.cancelReason}` : ''}
                </p>
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

  // Highlight the action a mission finding pointed at, once, then drop the request.
  const pendingLink = useDeepLinkStore((s) => s.pending)
  const clearLink = useDeepLinkStore((s) => s.clear)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const highlightRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (pendingLink?.module === 'reporting' && actions.some((a) => a.id === pendingLink.recordId)) {
      setHighlightId(pendingLink.recordId)
      clearLink()
    }
  }, [pendingLink, actions, clearLink])
  useEffect(() => {
    if (highlightId) highlightRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlightId])

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
            <div
              key={a.id}
              ref={a.id === highlightId ? highlightRef : undefined}
              className={`glass-panel flex items-center justify-between gap-2 rounded-xl p-3 ${a.id === highlightId ? 'ring-2 ring-teal-400' : ''}`}
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-bold">{a.title}</p>
                <MissionOriginChip recordId={a.id} className="mt-1" />
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

interface RegisterRow { id: string; level: 'project' | 'gate' | 'portfolio'; title: string; status: string; outcome: string; rationale: string; due_by: string | null; at: string; voided: boolean }
const LEVEL_FA: Record<RegisterRow['level'], { label: string; c: string }> = { project: { label: 'پروژه', c: '#94a3b8' }, gate: { label: 'کمیتهٔ گیت', c: '#0ea5e9' }, portfolio: { label: 'سبد', c: '#a78bfa' } }

/** One register over the three places decisions are taken: the decision centre, Stage-Gate committees and the
 *  portfolio board (view v_decision_register; each source keeps its own rules and permissions). */
function DecisionRegister({ masterProjectId }: { masterProjectId: string }) {
  const [rows, setRows] = useState<RegisterRow[] | null>(null)
  const [level, setLevel] = useState<'all' | RegisterRow['level']>('all')
  const [showVoided, setShowVoided] = useState(false)
  useEffect(() => {
    let live = true
    setRows(null)
    void supabase.from('v_decision_register').select('*').eq('master_project_id', masterProjectId).order('at', { ascending: false }).then(({ data }) => { if (live) setRows((data ?? []) as RegisterRow[]) })
    return () => { live = false }
  }, [masterProjectId])
  if (!rows) return <div className="flex h-32 items-center justify-center"><Loader2 size={18} className="animate-spin text-muted" /></div>
  const list = rows.filter((r) => (level === 'all' || r.level === level) && (showVoided || !r.voided))
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {(['all', 'project', 'gate', 'portfolio'] as const).map((l) => (
          <button key={l} onClick={() => setLevel(l)} className={`rounded-full px-2.5 py-1 text-[11px] ${level === l ? 'bg-teal-500/20 text-teal-300' : 'border border-white/10 text-secondary'}`}>
            {l === 'all' ? 'همه' : LEVEL_FA[l].label} ({rows.filter((r) => l === 'all' || r.level === l).length.toLocaleString('fa-IR')})
          </button>
        ))}
        <label className="ms-auto flex items-center gap-1 text-[11px] text-muted"><input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} /> نمایش لغو/ابطال‌شده‌ها</label>
      </div>
      {!list.length ? <p className="py-8 text-center text-xs text-muted">تصمیمی در این دسته ثبت نشده است</p> : list.map((r) => (
        <div key={r.id} className={`glass-panel rounded-2xl p-3 ${r.voided ? 'opacity-60' : ''}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: LEVEL_FA[r.level].c, background: `${LEVEL_FA[r.level].c}1f` }}>{LEVEL_FA[r.level].label}</span>
            <b className="text-xs">{r.title}</b>
            {r.outcome && r.outcome !== r.title && <span className="text-[11px] text-secondary">— {r.outcome}</span>}
            {r.voided && <span className="text-[10px] text-red-300">لغو/ابطال‌شده</span>}
            <span className="ms-auto text-[10px] text-muted">{formatJalali(r.at.slice(0, 10))}{r.due_by ? ` · موعد ${formatJalali(r.due_by)}` : ''}</span>
          </div>
          {r.rationale && <p className="mt-1 text-[11px] leading-5 text-secondary">{r.rationale}</p>}
        </div>
      ))}
    </div>
  )
}
