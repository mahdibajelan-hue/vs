import { useState } from 'react'
import {
  ArrowLeft, Check, CheckSquare, ChevronDown, ClipboardList, Lock, MessageSquareText,
  Paperclip, ShieldAlert, ShieldCheck, Target, X,
} from 'lucide-react'
import { useAuthStore } from '../../../store/useAuthStore'
import { useLifecycleStore } from '../store/useLifecycleStore'
import { useProjectAnalysis } from '../lib/useProjectAnalysis'
import { nextStageKey } from '../lib/templates'
import {
  CHECKLIST_CATEGORY_LABEL_FA, CHECKLIST_STATUS_LABEL_FA, GATE_STATUS_LABEL_FA,
  PRE_PROJECT_CATEGORIES, STAGE_LABEL_FA, isChecklistOverdue,
  type ChecklistCategory, type ChecklistItem, type ChecklistStatus, type StageKey,
} from '../types'
import { Bar, EmptyState, StatusDot, STATUS_COLOR, STATUS_TEXT_COLOR, fa, faNum } from '../components/ui'
import { EvidencePanel } from '../components/EvidencePanel'
import { TowerTile } from '../components/TowerTile'

/**
 * Stage detail: the checklist that determines readiness, and the gate that consumes it.
 *
 * Bento layout to match the Control Tower and Portfolio pages this sits between — a stage page
 * reached by clicking a gate row should not feel like a different, older product once it opens.
 *
 * When the stage is PRE-PROJECT the checklist is grouped by the six spec categories (strategic,
 * technical, commercial, risk, stakeholder, governance) and shows a category-by-category
 * readiness breakdown — the Pre-Project Readiness screen of §4 is this same page, specialised,
 * rather than a second implementation of the same table.
 */
export function StageGatePage({ stageKey, onBack }: { stageKey: string; onBack: () => void }) {
  const bundle = useLifecycleStore((s) => s.bundle)
  const updateChecklistItem = useLifecycleStore((s) => s.updateChecklistItem)
  const approveGate = useLifecycleStore((s) => s.approveGate)
  const rejectGate = useLifecycleStore((s) => s.rejectGate)
  const overrideGate = useLifecycleStore((s) => s.overrideGate)
  const advanceStage = useLifecycleStore((s) => s.advanceStage)
  const profile = useAuthStore((s) => s.profile)
  const analysis = useProjectAnalysis(bundle)

  const [gateComment, setGateComment] = useState('')
  const [overrideMode, setOverrideMode] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [openEvidence, setOpenEvidence] = useState<string | null>(null)

  const readiness = analysis.readiness.find((r) => r.stageKey === stageKey)
  const gate = bundle.gates.find((g) => g.stageKey === stageKey)
  const derivedGateStatus = analysis.gateStatuses.get(stageKey) ?? gate?.status ?? 'not_started'
  const items = bundle.checklist.filter((c) => c.stageKey === stageKey)
  const isPreProject = stageKey === 'pre_project'
  const isCurrent = bundle.lifecycle?.currentStageKey === stageKey
  const stageName = STAGE_LABEL_FA[stageKey as StageKey] ?? stageKey

  const categories: ChecklistCategory[] = isPreProject
    ? PRE_PROJECT_CATEGORIES
    : [...new Set(items.map((i) => i.category))]

  async function setStatus(item: ChecklistItem, status: ChecklistStatus) {
    await updateChecklistItem(item, {
      status,
      completionDate: status === 'completed' ? new Date().toISOString().slice(0, 10) : null,
    })
  }

  const canAdvance = derivedGateStatus === 'approved' && isCurrent
  const next = nextStageKey(stageKey, bundle.stages.sort((a, b) => a.sequence - b.sequence).map((s) => s.stageKey))
  const readinessTone = !readiness ? undefined : readiness.blockers.length > 0 ? 'red' : readiness.isReady ? 'green' : 'yellow'

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted transition-colors hover:text-primary">
          <ArrowLeft size={13} /> بازگشت به برج کنترل
        </button>
        <div className="flex items-center gap-2">
          {readinessTone && <StatusDot status={readinessTone} size={8} />}
          <h1 className="text-sm font-extrabold">{stageName}</h1>
          {isCurrent && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: '#0ea5e9' }}>
              مرحله جاری
            </span>
          )}
        </div>
      </div>

      <div className="plc-bento">
        {/* ── Readiness summary ────────────────────────────────────── */}
        <TowerTile span={8} variant="raised" icon={<Target size={13} />} eyebrow="Stage readiness"
          title={isPreProject ? 'ارزیابی آمادگی پیش‌پروژه' : 'آمادگی این مرحله'} edge={readinessTone}>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" style={{ flex: 1 }}>
              <MiniStat label="الزامی تکمیل‌شده" value={`${faNum(readiness?.mandatoryDone ?? 0)}/${faNum(readiness?.mandatoryTotal ?? 0)}`} />
              <MiniStat label="اختیاری تکمیل‌شده" value={`${faNum(readiness?.optionalDone ?? 0)}/${faNum(readiness?.optionalTotal ?? 0)}`} />
              <MiniStat label="دارای تأخیر" value={faNum(readiness?.overdueCount ?? 0)} danger={(readiness?.overdueCount ?? 0) > 0} />
              <MiniStat label="موانع عبور" value={faNum(readiness?.blockers.length ?? 0)} danger={(readiness?.blockers.length ?? 0) > 0} />
            </div>
            <div className="shrink-0 text-left">
              <div className="plc-stat-value" style={readinessTone ? { color: STATUS_TEXT_COLOR[readinessTone] } : undefined}>
                {faNum(readiness?.percent ?? 0)}٪
              </div>
              <div className="plc-stat-sub">آمادگی مرحله</div>
            </div>
          </div>

          <Bar percent={readiness?.percent ?? 0} blocked={(readiness?.blockers.length ?? 0) > 0} />

          {/* The rule that matters: % never opens a gate, blockers do. */}
          {readiness && readiness.blockers.length > 0 && (
            <div className="mt-3 rounded-xl border p-3" style={{ borderColor: `${STATUS_COLOR.red}44`, background: `${STATUS_COLOR.red}0a` }}>
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold" style={{ color: STATUS_TEXT_COLOR.red }}>
                <ShieldAlert size={13} /> این مرحله آماده عبور نیست
              </p>
              <p className="mb-2 plc-stat-sub">
                حتی با درصد آمادگی بالا، تا زمانی که الزامات زیر برآورده نشوند گیت باز نمی‌شود.
              </p>
              <ul className="space-y-1">
                {readiness.blockers.map((b, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px]">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full" style={{ background: STATUS_COLOR.red }} />
                    <span>
                      <b>{b.label}</b> — <span className="text-muted">{b.detail}{b.dueDate ? ` (${fa(b.dueDate)})` : ''}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TowerTile>

        {/* ── Gate ──────────────────────────────────────────────────── */}
        <TowerTile
          span={4}
          icon={<ShieldCheck size={13} />}
          eyebrow="Gate"
          title={gate?.name ?? 'گیت این مرحله'}
          accent={['engineering', 'procurement', 'execution'].includes(stageKey) ? 'var(--plc-amber)' : undefined}
        >
          {!gate ? (
            <EmptyState
              message={
                ['engineering', 'procurement'].includes(stageKey)
                  ? 'این مرحله ذیل گیت EPC در برج کنترل تصمیم‌گیری می‌شود'
                  : 'این مرحله گیت رسمی ندارد'
              }
            />
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <StatusDot
                  status={
                    derivedGateStatus === 'approved' ? 'green'
                    : derivedGateStatus === 'blocked' || derivedGateStatus === 'rejected' ? 'red'
                    : derivedGateStatus === 'ready' ? 'green' : 'yellow'
                  }
                />
                <span className="text-[12px] font-extrabold">{GATE_STATUS_LABEL_FA[derivedGateStatus]}</span>
              </div>
              <p className="plc-stat-sub mb-1">آستانه آمادگی: {faNum(gate.readinessThreshold)}٪</p>
              {gate.approvalDate && <p className="plc-stat-sub mb-1">تاریخ تصویب: {fa(gate.approvalDate)}</p>}

              {gate.overrideBy && (
                <div className="mb-3 rounded-lg border p-2.5" style={{ borderColor: `${STATUS_COLOR.yellow}55`, background: `${STATUS_COLOR.yellow}0d` }}>
                  <p className="text-[11px] font-bold" style={{ color: STATUS_TEXT_COLOR.yellow }}>
                    این گیت با Override تصویب شده است
                  </p>
                  <p className="mt-0.5 plc-stat-sub">دلیل ثبت‌شده: {gate.overrideReason || '—'}</p>
                </div>
              )}

              {gate.status !== 'approved' && (
                <>
                  <textarea
                    value={gateComment}
                    onChange={(e) => setGateComment(e.target.value)}
                    placeholder="توضیحات تصمیم گیت..."
                    rows={2}
                    className="mb-2 w-full rounded-lg border bg-black/20 px-2.5 py-2 text-xs outline-none"
                    style={{ borderColor: 'var(--border-soft)' }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      disabled={derivedGateStatus !== 'ready'}
                      onClick={() => approveGate(gate, gateComment)}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                      style={{ background: STATUS_COLOR.green }}
                      title={derivedGateStatus !== 'ready' ? 'تا رفع همه موانع، تصویب ممکن نیست' : undefined}
                    >
                      <ShieldCheck size={13} /> تصویب گیت
                    </button>
                    <button
                      onClick={() => rejectGate(gate, gateComment)}
                      className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs"
                      style={{ borderColor: 'var(--border-soft)' }}
                    >
                      <X size={13} /> رد گیت
                    </button>
                    {profile?.isAdmin && derivedGateStatus !== 'ready' && (
                      <button
                        onClick={() => setOverrideMode((v) => !v)}
                        className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs"
                        style={{ borderColor: `${STATUS_COLOR.yellow}55`, color: STATUS_COLOR.yellow }}
                      >
                        <Lock size={13} /> Override مدیریتی
                      </button>
                    )}
                  </div>

                  {overrideMode && (
                    <div className="mt-3 rounded-lg border p-3" style={{ borderColor: `${STATUS_COLOR.yellow}55` }}>
                      <p className="mb-2 plc-stat-sub">
                        عبور از گیت با وجود الزامات برآورده‌نشده. کاربر، تاریخ و دلیل به‌صورت دائمی در سابقه تغییرات ثبت می‌شود.
                      </p>
                      <input
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder="دلیل Override (الزامی)"
                        className="mb-2 w-full rounded-lg border bg-black/20 px-2.5 py-2 text-xs outline-none"
                        style={{ borderColor: 'var(--border-soft)' }}
                      />
                      <button
                        disabled={!overrideReason.trim()}
                        onClick={async () => {
                          await overrideGate(gate, overrideReason.trim())
                          setOverrideMode(false)
                          setOverrideReason('')
                        }}
                        className="rounded-lg px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                        style={{ background: STATUS_COLOR.yellow }}
                      >
                        ثبت Override و تصویب گیت
                      </button>
                    </div>
                  )}
                </>
              )}

              {canAdvance && next && (
                <button
                  onClick={() => advanceStage(gate.projectId, stageKey, next)}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold text-white"
                  style={{ background: '#3b82f6' }}
                >
                  <Check size={14} /> انتقال به مرحله «{STAGE_LABEL_FA[next as StageKey] ?? next}»
                </button>
              )}
            </>
          )}
        </TowerTile>

        {/* ── Pre-project: per-category readiness ─────────────────────── */}
        {isPreProject && (
          <TowerTile span={12} icon={<CheckSquare size={13} />} eyebrow="By category" title="آمادگی به تفکیک دسته">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {categories.map((cat) => {
                const catItems = items.filter((i) => i.category === cat)
                const done = catItems.filter((i) => i.status === 'completed' || i.status === 'waived').length
                const pct = catItems.length === 0 ? 0 : Math.round((done / catItems.length) * 100)
                const missingMandatory = catItems.filter((i) => i.isMandatory && i.status !== 'completed' && i.status !== 'waived').length
                return (
                  <div key={cat} className="rounded-xl border px-2.5 py-2" style={{ borderColor: 'var(--border-soft)' }}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[12px] font-bold">{CHECKLIST_CATEGORY_LABEL_FA[cat]}</span>
                      <span className="text-[11px] font-extrabold">{faNum(pct)}٪</span>
                    </div>
                    <Bar percent={pct} blocked={missingMandatory > 0} />
                    <p className="mt-1 plc-stat-sub">
                      {faNum(done)} از {faNum(catItems.length)}
                      {missingMandatory > 0 && <span style={{ color: STATUS_TEXT_COLOR.red }}> · {faNum(missingMandatory)} الزامی ناقص</span>}
                    </p>
                  </div>
                )
              })}
            </div>
          </TowerTile>
        )}

        {/* ── Checklist ─────────────────────────────────────────────── */}
        <TowerTile span={12} icon={<ClipboardList size={13} />} eyebrow="Checklist" title={`چک‌لیست مرحله (${faNum(items.length)})`}>
          {items.length === 0 ? (
            <EmptyState message="بندی برای این مرحله تعریف نشده است" />
          ) : (
            <div className="space-y-4">
              {categories.map((cat) => {
                const catItems = items.filter((i) => i.category === cat).sort((a, b) => a.sequence - b.sequence)
                if (catItems.length === 0) return null
                return (
                  <div key={cat}>
                    {categories.length > 1 && (
                      <h3 className="mb-1.5 text-[11px] font-bold text-muted">{CHECKLIST_CATEGORY_LABEL_FA[cat]}</h3>
                    )}
                    <ul className="space-y-1.5">
                      {catItems.map((item) => {
                        const overdue = isChecklistOverdue(item)
                        const done = item.status === 'completed' || item.status === 'waived'
                        const missingDoc = item.requiresDocument && !item.evidenceUrl
                        const expanded = openEvidence === item.id
                        return (
                          <li
                            key={item.id}
                            className="rounded-xl border px-3 py-2.5 transition-colors"
                            style={{
                              borderColor: overdue
                                ? `${STATUS_COLOR.red}55`
                                : missingDoc && done
                                  ? `${STATUS_COLOR.yellow}55`
                                  : 'var(--border-soft)',
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className={`text-[12px] ${done ? 'text-muted line-through' : 'font-bold'}`}>
                                    {item.title}
                                  </span>
                                  {item.isMandatory && (
                                    <span className="rounded px-1.5 py-px text-[9px] font-bold"
                                      style={{ background: 'var(--border-soft)' }}>الزامی</span>
                                  )}
                                  {item.requiresDocument && (
                                    <span
                                      className="inline-flex items-center gap-0.5 rounded px-1.5 py-px text-[9px] font-bold"
                                      style={
                                        item.evidenceUrl
                                          ? { background: `${STATUS_COLOR.green}22`, color: STATUS_COLOR.green }
                                          : { background: `${STATUS_COLOR.yellow}22`, color: STATUS_COLOR.yellow }
                                      }
                                    >
                                      <Paperclip size={9} />
                                      {item.evidenceUrl ? 'مدرک پیوست شد' : 'نیازمند مدرک'}
                                    </span>
                                  )}
                                  {item.requiresApproval && (
                                    <span className="text-[9px] text-muted">نیازمند تأیید</span>
                                  )}
                                </div>
                                {item.guidance && <p className="mt-0.5 plc-stat-sub">{item.guidance}</p>}
                                {item.comment && !expanded && (
                                  <p className="mt-1 flex items-start gap-1 plc-stat-sub text-secondary">
                                    <MessageSquareText size={10} className="mt-0.5 shrink-0 text-muted" />
                                    {item.comment}
                                  </p>
                                )}
                                <div className="mt-1 flex flex-wrap gap-2 plc-stat-sub">
                                  {item.dueDate && (
                                    <span style={overdue ? { color: STATUS_TEXT_COLOR.red } : undefined}>
                                      سررسید {fa(item.dueDate)}{overdue && ' (گذشته)'}
                                    </span>
                                  )}
                                  {item.completionDate && <span>تکمیل {fa(item.completionDate)}</span>}
                                  {missingDoc && done && (
                                    <span style={{ color: STATUS_TEXT_COLOR.yellow }}>این بند بدون مدرک تکمیل شده است</span>
                                  )}
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-1">
                                {/* The upload entry point sits on the item itself, so "where do I attach it?" never needs asking. */}
                                <button
                                  onClick={() => setOpenEvidence(expanded ? null : item.id)}
                                  title="بارگذاری مدرک و ثبت توضیح"
                                  className="flex items-center gap-0.5 rounded-md border px-1.5 py-1 text-[10px] transition-colors hover:border-sky-400/60 hover:text-sky-400"
                                  style={{
                                    borderColor: missingDoc ? `${STATUS_COLOR.yellow}66` : 'var(--border-soft)',
                                    color: missingDoc ? STATUS_COLOR.yellow : undefined,
                                  }}
                                >
                                  <Paperclip size={11} />
                                  <ChevronDown size={10} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                                </button>
                                <select
                                  value={item.status}
                                  onChange={(e) => setStatus(item, e.target.value as ChecklistStatus)}
                                  className="rounded-md border bg-black/20 px-1.5 py-1 text-[11px] outline-none"
                                  style={{ borderColor: 'var(--border-soft)' }}
                                >
                                  {(Object.keys(CHECKLIST_STATUS_LABEL_FA) as ChecklistStatus[]).map((s) => (
                                    <option key={s} value={s}>{CHECKLIST_STATUS_LABEL_FA[s]}</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {expanded && <EvidencePanel item={item} onClose={() => setOpenEvidence(null)} />}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </TowerTile>
      </div>
    </div>
  )
}

function MiniStat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-xl border px-2.5 py-2" style={{ borderColor: 'var(--border-soft)' }}>
      <div className="plc-stat-sub">{label}</div>
      <div className="text-[15px] font-extrabold" style={danger ? { color: STATUS_TEXT_COLOR.red } : undefined}>{value}</div>
    </div>
  )
}
