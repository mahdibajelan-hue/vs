import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, FileText, GitPullRequestArrow, History, Link2, ListChecks, Pencil, Printer, ShieldCheck, X } from 'lucide-react'
import { useChangeStore } from '../store/useChangeStore'
import { useChangeCtx } from '../lib/useChangeData'
import { actionsFor, canDecideException } from '../lib/changeFlow'
import { PRIORITY_FA, STATUS_FA, TYPE_FA, type ChangeException, type ChangeHistory, type ChangeStep } from '../types'
import { HelpButton } from '../../issues/components/Help'
import { CM_HELP } from '../lib/help'
import { BasisPanel, ResolutionPanel, RouteTrack, jd, type TrackStep } from './RouteTrack'
import { Field, StatusChip, money, nf } from './cm'
import { RequestFormModal } from './RequestFormModal'
import { DecideDialog, ExceptionDecisionDialog, ExceptionDialog, ImplementDialog, ReasonDialog, ResultDialog } from './drawer/Dialogs'
import { HistoryTab, LinksTab } from './drawer/LinksHistory'
import { printRequest } from '../lib/changeExport'

export type DrawerTab = 'flow' | 'impact' | 'exec' | 'links' | 'history'
const TABS: { id: DrawerTab; label: string; icon: typeof FileText }[] = [
  { id: 'flow', label: 'گردش تصویب', icon: GitPullRequestArrow }, { id: 'impact', label: 'آثار و ارزیابی', icon: ListChecks }, { id: 'exec', label: 'اجرا و نتیجه', icon: ShieldCheck },
  { id: 'links', label: 'ارتباط‌ها', icon: Link2 }, { id: 'history', label: 'تاریخچه', icon: History },
]

/** One change request: approval track, the numbers behind the route, execution and the full audit trail. Closes only with × / the close button. */
export function RequestDrawer({ requestId, initialTab = 'flow', onClose }: { requestId: string; initialTab?: DrawerTab; onClose: () => void }) {
  const r = useChangeStore((s) => s.requests.find((x) => x.id === requestId))
  const allSteps = useChangeStore((s) => s.steps)
  const links = useChangeStore((s) => s.links)
  const loadDetail = useChangeStore((s) => s.loadDetail)
  const updateDraft = useChangeStore((s) => s.updateDraft)
  const rpc = useChangeStore((s) => s.rpc)
  const ctx = useChangeCtx()
  const [tab, setTab] = useState<DrawerTab>(initialTab)
  const [detail, setDetail] = useState<{ history: ChangeHistory[]; exceptions: ChangeException[] }>({ history: [], exceptions: [] })
  const [dlg, setDlg] = useState<null | { kind: 'decide'; step: ChangeStep } | { kind: 'impl' } | { kind: 'result' } | { kind: 'close' } | { kind: 'cancel' } | { kind: 'exc' } | { kind: 'excDecide'; id: string } | { kind: 'edit' }>(null)
  const [ev, setEv] = useState<{ note: string; q: string; s: string } | null>(null)
  const [msg, setMsg] = useState('')
  const reload = useCallback(async () => { setDetail(await loadDetail(requestId)) }, [loadDetail, requestId])
  useEffect(() => { reload() }, [reload, r?.status, r?.attempt])
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !dlg) onClose() }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [onClose, dlg])
  const steps = useMemo(() => allSteps.filter((s) => s.requestId === requestId && r && s.attempt === r.attempt).sort((a, b) => a.seq - b.seq), [allSteps, requestId, r])
  if (!r) return null
  const perms = ctx.perms(r.masterProjectId)
  const authorised = detail.exceptions.some((x) => x.status === 'authorised')
  const act = actionsFor(r, steps, perms, authorised)
  const thresholds = [...new Set((ctx.activeRules?.rules ?? []).filter((x) => x.dimension === 'cost' && x.active).flatMap((x) => [x.pctMin, x.pctMax]).filter((x): x is number => x != null))].sort((a, b) => a - b)
  const res = r.routeSnapshot
  const live = ctx.preview(r)
  const pendingEx = detail.exceptions.find((x) => x.status === 'requested')
  const track: TrackStep[] = steps.map((s) => ({ key: s.id, label: s.label, role: s.roleName, kind: s.kind, status: s.status, who: s.decidedByName ? s.decidedByName + (s.decidedAsAdmin ? ' (مدیر سامانه)' : '') : undefined, meta: s.decidedAt ? jd(s.decidedAt) : s.status === 'active' && s.dueAt ? `مهلت ${jd(s.dueAt)}` : undefined }))
  const lastActiveGroup = (s: ChangeStep) => !steps.some((x) => x.id !== s.id && x.status === 'waiting')
  const evalEditable = (r.status === 'submitted' || r.status === 'evaluating') && perms && (act.completeEvaluation || act.startEvaluation)
  const evState = ev ?? { note: r.evaluationNote, q: r.impactQuality, s: r.impactSafety }
  const saveEval = async () => { const x = await updateDraft(r.id, { evaluationNote: evState.note, impactQuality: evState.q, impactSafety: evState.s }); setMsg(x.ok ? 'ذخیره شد.' : x.error ?? '') }
  const run = async (name: string, args: Record<string, unknown>) => { const x = await rpc(name, args, r.id); setMsg(x.ok ? '' : x.error ?? ''); if (x.ok) reload(); return x }

  return (
    <div className="im-drawer-ov">
      <aside className="im-drawer rk-drawer-wide" role="dialog" aria-modal="true" aria-label={`درخواست تغییر ${r.crNumber}`}>
        <div className="im-drawer-head">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                <span className="im-code">{r.crNumber}</span><StatusChip status={r.status} />{r.changeType && <span className="im-helper">{TYPE_FA[r.changeType]}</span>}
                {r.executedUnderException && <span className="cm-chip" style={{ ['--c' as string]: '#ef4444' }}>اجرا تحت استثنا</span>}{r.implementedAsApproved === false && <span className="cm-chip" style={{ ['--c' as string]: '#ef4444' }}>مغایر با مصوبه</span>}
              </div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900, lineHeight: 1.7 }}>{r.title}</h2>
              <div className="im-helper">{ctx.projectName(r.masterProjectId)} · {ctx.contractLabel(r)} · اولویت {PRIORITY_FA[r.priority]} · مرحله از {jd(r.stageEnteredAt)}</div>
            </div>
            <div className="im-actions" style={{ flexWrap: 'nowrap' }}>
              <button className="im-btn im-btn-ghost" onClick={() => printRequest(r, steps, detail.history, ctx)} aria-label="چاپ فرم"><Printer size={14} /></button>
              <HelpButton content={CM_HELP.drawer} /><button className="im-modal-close" onClick={onClose} aria-label="بستن"><X size={16} /></button>
            </div>
          </div>
          <div className="cm-basis" style={{ marginTop: 10 }}>
            <div><div className="l">اثر مالی درخواستی</div><div className="v cm-mono">{money(r.proposedCost)}</div><div className="h">مصوب: {r.approvedCost == null ? '—' : money(r.approvedCost)}</div></div>
            <div><div className="l">اثر زمانی درخواستی</div><div className="v cm-mono">{r.proposedDays ? nf(r.proposedDays) + ' روز' : '—'}</div><div className="h">مصوب: {r.approvedDays == null ? '—' : nf(r.approvedDays) + ' روز'}</div></div>
            <div><div className="l">درصد تجمعی</div><div className="v cm-mono">{(res?.basis ?? live.basis).cum_pct == null ? '—' : (res?.basis ?? live.basis).cum_pct + '٪'}</div><div className="h">جاری {(res?.basis ?? live.basis).current_pct ?? '—'}٪</div></div>
          </div>
        </div>
        <div className="rk-tabs" role="tablist" style={{ padding: '0 14px', margin: 0 }}>
          {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={`im-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}><t.icon size={13} aria-hidden />{t.label}{t.id === 'links' && links.some((l) => l.requestId === r.id) ? <span className="n">{links.filter((l) => l.requestId === r.id).length}</span> : null}</button>)}
        </div>
        <div className="im-drawer-body">
          {msg && <div className="im-err" role="alert" style={{ marginBottom: 8 }}>{msg}</div>}

          {tab === 'flow' && (
            <div style={{ display: 'grid', gap: 14 }}>
              {r.routeStatus === 'blocked' && (
                <div className="cm-warn" role="alert"><AlertTriangle size={18} style={{ flex: 'none', color: 'var(--im-coral)', marginTop: 3 }} aria-hidden /><div><b>درخواست برای تعیین تکلیف متوقف شده است.</b>{r.routeBlockers.map((b, i) => <div key={i}>• {b.message}</div>)}<div className="im-helper">مدیر سامانه باید قواعد را در «قواعد تصویب» اصلاح کند؛ سپس «تکمیل ارزیابی» را دوباره بزنید.</div></div></div>
              )}
              {steps.length > 0 ? <RouteTrack steps={track} /> : r.routeStatus !== 'blocked' && (r.status === 'draft' || r.status === 'submitted' || r.status === 'evaluating') ? (
                <div><div className="im-section-title">مسیر پیش‌بینی‌شده (قطعی پس از تکمیل ارزیابی)</div><ResolutionPanel res={live} thresholds={thresholds} compact /></div>
              ) : r.routeStatus === 'blocked' ? null : <div className="im-empty">مسیر تصویبی ثبت نشده است.</div>}
              {res?.route && steps.length > 0 && <div className="cm-note"><ShieldCheck size={18} style={{ flex: 'none', color: 'var(--im-accent)', marginTop: 3 }} aria-hidden /><div><b>چرا این مسیر؟</b> {res.route.reason}<div className="im-helper">نسخهٔ قواعد: {res.rule_set?.version} — {res.rule_set?.name} · قواعد: {(res.applied_rules ?? []).join('، ')}</div></div></div>}
              {(r.status === 'rejected' || r.status === 'returned' || r.status === 'cancelled') && <div className="cm-warn"><div><b>{STATUS_FA[r.status]}:</b> {r.status === 'cancelled' ? r.cancelReason : r.decisionNote}</div></div>}
              {steps.some((s) => s.opinion || s.referenceNo) && (
                <div><div className="im-section-title">نظرات و تصمیم‌ها</div>
                  <div className="im-grid" style={{ gap: 6 }}>{steps.filter((s) => s.opinion || s.referenceNo).map((s) => <div key={s.id} className="im-card-flat"><b style={{ fontSize: 12.5 }}>{s.label || s.roleName}</b> <span className="im-helper">— {s.decidedByName} · {jd(s.decidedAt)}</span><div style={{ fontSize: 12.5, lineHeight: 1.8 }}>{s.opinion}{s.referenceNo ? ` · شمارهٔ مصوبه ${s.referenceNo}` : ''}</div></div>)}</div>
                </div>
              )}
              {detail.exceptions.length > 0 && (
                <div><div className="im-section-title">مجوز استثنا (اجرای پیش از تصویب)</div>
                  {detail.exceptions.map((x) => <div key={x.id} className="im-card-flat" style={{ marginBottom: 6 }}><b style={{ fontSize: 12.5 }}>{x.status === 'authorised' ? 'مجاز شد' : x.status === 'refused' ? 'رد شد' : 'در انتظار تصمیم'}</b> <span className="im-helper">· {ctx.userName(x.requestedBy)} · {jd(x.requestedAt)}</span><div style={{ fontSize: 12.5, lineHeight: 1.8 }}>{x.justification} <span className="im-helper">({x.evidenceRef})</span></div>{x.decisionNote && <div className="im-helper">تصمیم: {x.decisionNote}</div>}
                    {x.status === 'requested' && canDecideException(perms) && x.requestedBy !== perms.userId && <button className="im-btn" style={{ marginTop: 6 }} onClick={() => setDlg({ kind: 'excDecide', id: x.id })}>تصمیم دربارهٔ استثنا</button>}</div>)}
                </div>
              )}
              <div className="im-actions">
                {act.edit && <button className="im-btn" onClick={() => setDlg({ kind: 'edit' })}><Pencil size={14} /> ویرایش</button>}
                {act.submit && <button className="im-btn im-btn-primary" onClick={() => run('cm_submit', { p_request: r.id })}>ارسال برای ارزیابی</button>}
                {act.completeEvaluation && r.routeStatus === 'blocked' && <button className="im-btn im-btn-primary" onClick={() => run('cm_complete_evaluation', { p_request: r.id, p_note: r.evaluationNote })}>تلاش دوباره برای تعیین مسیر (پس از اصلاح قواعد)</button>}
                {act.startEvaluation && <button className="im-btn im-btn-primary" onClick={() => run('cm_start_evaluation', { p_request: r.id })}>شروع ارزیابی</button>}
                {act.decide.map((s) => <button key={s.id} className="im-btn im-btn-primary" onClick={() => setDlg({ kind: 'decide', step: s })}>تصمیم: {s.label || s.roleName}</button>)}
                {act.requestException && !pendingEx && <button className="im-btn im-btn-ghost" onClick={() => setDlg({ kind: 'exc' })}>درخواست مجوز استثنا</button>}
                {act.startImplementation && <button className="im-btn im-btn-primary" onClick={() => setDlg({ kind: 'impl' })}>شروع اجرا</button>}
                {act.cancel && <button className="im-btn im-btn-danger" onClick={() => setDlg({ kind: 'cancel' })}>لغو درخواست</button>}
              </div>
              {r.status === 'awaiting_approval' && act.decide.length === 0 && steps.some((s) => s.status === 'active') && <div className="im-helper">منتظر تصمیم: {steps.filter((s) => s.status === 'active').map((s) => s.roleName).join('، ')}. {r.createdBy === perms.userId ? 'ثبت‌کنندهٔ درخواست نمی‌تواند آن را تصویب کند.' : ''}</div>}
            </div>
          )}

          {tab === 'impact' && (
            <div style={{ display: 'grid', gap: 14 }}>
              <BasisPanel basis={(res?.basis ?? live.basis)} thresholds={thresholds} />
              {!res && <div className="im-helper">پیش‌نمایش با قواعد فعال؛ مبنای قطعی هنگام تکمیل ارزیابی ثبت می‌شود.</div>}
              <div className="im-grid" style={{ gap: 8 }}>
                <div className="im-card-flat"><b style={{ fontSize: 12.5 }}>شرح</b><div style={{ fontSize: 12.5, lineHeight: 1.9 }}>{r.description}</div></div>
                <div className="im-card-flat"><b style={{ fontSize: 12.5 }}>دلیل تغییر</b><div style={{ fontSize: 12.5, lineHeight: 1.9 }}>{r.reason}</div></div>
              </div>
              <div>
                <div className="im-section-title">ارزیابی فنی، قراردادی و اجرایی</div>
                {evalEditable ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <Field label="جمع‌بندی ارزیابی (اثر بر قرارداد، هزینه، زمان)" htmlFor="cm-en"><textarea id="cm-en" rows={3} value={evState.note} onChange={(e) => setEv({ ...evState, note: e.target.value })} /></Field>
                    <div className="im-row"><Field label="اثر بر کیفیت"><textarea rows={2} value={evState.q} onChange={(e) => setEv({ ...evState, q: e.target.value })} /></Field><Field label="اثر بر ایمنی (HSE)"><textarea rows={2} value={evState.s} onChange={(e) => setEv({ ...evState, s: e.target.value })} /></Field></div>
                    <div className="im-actions"><button className="im-btn" onClick={saveEval}>ذخیرهٔ ارزیابی</button>{act.completeEvaluation && <button className="im-btn im-btn-primary" onClick={async () => { await saveEval(); const x = await run('cm_complete_evaluation', { p_request: r.id, p_note: evState.note }); if (x.ok) { const d = x.data as { status?: string } | null; if (d?.status === 'blocked') setTab('flow'); else setTab('flow') } }}>تکمیل ارزیابی و تعیین مسیر تصویب</button>}</div>
                    {!act.completeEvaluation && r.status === 'submitted' && <div className="im-helper">ابتدا «شروع ارزیابی» را در تب گردش تصویب بزنید.</div>}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 6 }}>{r.evaluationNote || r.impactQuality || r.impactSafety ? <><div className="im-card-flat" style={{ fontSize: 12.5, lineHeight: 1.9 }}>{r.evaluationNote || '—'}</div><div className="im-row"><div className="im-card-flat" style={{ flex: 1, fontSize: 12.5 }}><b>کیفیت:</b> {r.impactQuality || '—'}</div><div className="im-card-flat" style={{ flex: 1, fontSize: 12.5 }}><b>ایمنی:</b> {r.impactSafety || '—'}</div></div></> : <div className="im-empty">ارزیابی‌ای ثبت نشده است.</div>}</div>
                )}
              </div>
              {r.affectedDocuments.length > 0 && <div><div className="im-section-title">اسناد متأثر</div><div className="im-grid" style={{ gap: 4 }}>{r.affectedDocuments.map((d, i) => <div key={i} className="im-card-flat" style={{ fontSize: 12.5 }}><span dir="ltr">{d.docNumber}</span> · {d.title}</div>)}</div></div>}
            </div>
          )}

          {tab === 'exec' && (
            <div style={{ display: 'grid', gap: 12 }}>
              {['approved', 'implementing', 'implemented', 'closed'].includes(r.status) ? (
                <>
                  <div className="cm-basis">
                    <div><div className="l">مسئول اجرا</div><div className="v" style={{ fontSize: 14 }}>{ctx.userName(r.implementationOwnerId)}</div><div className="h">مهلت: {jd(r.implementationDue) || '—'}</div></div>
                    <div><div className="l">هزینهٔ واقعی</div><div className="v cm-mono">{r.actualCost == null ? '—' : money(r.actualCost)}</div><div className="h">مصوب: {money(r.approvedCost)}</div></div>
                    <div><div className="l">تأخیر/تمدید واقعی</div><div className="v cm-mono">{r.actualDelayDays == null ? '—' : nf(r.actualDelayDays) + ' روز'}</div><div className="h">مصوب: {r.approvedDays == null ? '—' : nf(r.approvedDays) + ' روز'}</div></div>
                    <div className={r.implementedAsApproved === false ? 'hot' : ''}><div className="l">انطباق با مصوبه</div><div className="v" style={{ fontSize: 14 }}>{r.implementedAsApproved == null ? '—' : r.implementedAsApproved ? 'مطابق' : 'مغایر'}</div><div className="h">{r.documentsUpdated ? 'مدارک به‌روز شد' : 'مدارک: —'}</div></div>
                  </div>
                  {r.resultNote && <div className="im-card-flat" style={{ fontSize: 12.5, lineHeight: 1.9 }}>{r.resultNote}</div>}
                  <div className="im-actions">
                    {act.startImplementation && <button className="im-btn im-btn-primary" onClick={() => setDlg({ kind: 'impl' })}>ابلاغ و شروع اجرا</button>}
                    {act.recordResult && <button className="im-btn im-btn-primary" onClick={() => setDlg({ kind: 'result' })}>ثبت نتیجهٔ اجرا</button>}
                    {act.close && <button className="im-btn im-btn-primary" onClick={() => setDlg({ kind: 'close' })}>بستن درخواست</button>}
                  </div>
                  {r.status === 'implementing' && r.executedUnderException && !r.approvedAt && <div className="cm-warn"><div>این تغییر تحت مجوز استثنا در حال اجراست و تصویب نهایی هنوز کامل نشده است؛ بستن درخواست پیش از تصویب ممکن نیست.</div></div>}
                </>
              ) : <div className="im-empty">اجرا پس از تصویب (یا با مجوز استثنا) آغاز می‌شود.</div>}
            </div>
          )}

          {tab === 'links' && <LinksTab request={r} canLink={perms.isAdmin || ['draft', 'submitted', 'evaluating', 'awaiting_approval', 'approved', 'implementing', 'returned'].includes(r.status)} />}
          {tab === 'history' && <HistoryTab history={detail.history} canComment requestId={r.id} onComment={reload} />}
        </div>
        <div style={{ padding: '10px 20px', borderTop: '1px solid var(--im-line)' }}><button className="im-btn im-btn-ghost" onClick={onClose}>بستن</button></div>
      </aside>

      {dlg?.kind === 'decide' && <DecideDialog step={dlg.step} request={r} isLast={lastActiveGroup(dlg.step)} onClose={() => setDlg(null)} onDone={reload} />}
      {dlg?.kind === 'impl' && <ImplementDialog request={r} onClose={() => { setDlg(null); reload() }} />}
      {dlg?.kind === 'result' && <ResultDialog request={r} onClose={() => { setDlg(null); reload() }} />}
      {dlg?.kind === 'close' && <ReasonDialog title="بستن درخواست" label="یادداشت بستن (اختیاری)" confirm="بستن" rpcName="cm_close" args={(t) => ({ p_request: r.id, p_note: t })} refresh={r.id} onClose={() => { setDlg(null); reload() }} />}
      {dlg?.kind === 'cancel' && <ReasonDialog title="لغو درخواست" label="دلیل لغو (الزامی)" confirm="لغو درخواست" danger rpcName="cm_cancel" args={(t) => ({ p_request: r.id, p_reason: t })} refresh={r.id} onClose={() => { setDlg(null); reload() }} />}
      {dlg?.kind === 'exc' && <ExceptionDialog request={r} onClose={() => setDlg(null)} onDone={reload} />}
      {dlg?.kind === 'excDecide' && <ExceptionDecisionDialog id={dlg.id} requestId={r.id} onClose={() => setDlg(null)} onDone={reload} />}
      {dlg?.kind === 'edit' && <RequestFormModal request={r} onClose={() => setDlg(null)} onSaved={reload} />}
    </div>
  )
}
