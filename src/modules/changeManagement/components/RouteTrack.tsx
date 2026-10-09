import { AlertTriangle, Ban, Check, CornerUpLeft, Hourglass, Landmark, MessageSquareText, Stamp, X } from 'lucide-react'
import type { ResolvedStep, StepKind, StepStatus, Basis, RouteResolution } from '../types'
import { STEP_KIND_FA, STEP_STATUS_FA } from '../types'
import { formatJalali } from '../../../lib/jalali'
import { money, nf, pct } from './cm'

export interface TrackStep { key: string; label: string; role: string; kind: StepKind; status: StepStatus | 'preview'; meta?: string; who?: string }
const COLOR: Record<StepStatus | 'preview', string> = { waiting: '#94a3b8', active: '#f59e0b', approved: '#22c55e', rejected: '#ef4444', returned: '#f97316', skipped: '#64748b', preview: '#38bdf8' }
const KIND_ICON = { opinion: MessageSquareText, approval: Stamp, body: Landmark } as const

/** The approval path as nodes on a rail: who decides, what is current, what comes next. */
export function RouteTrack({ steps }: { steps: TrackStep[] }) {
  return (
    <div className="cm-track" role="list" aria-label="مسیر تصویب">
      {steps.map((s) => {
        const Icon = s.status === 'approved' ? Check : s.status === 'rejected' ? X : s.status === 'returned' ? CornerUpLeft : s.status === 'skipped' ? Ban : s.status === 'waiting' ? Hourglass : KIND_ICON[s.kind]
        return (
          <div key={s.key} role="listitem" className={`cm-node ${s.status === 'active' ? 'active' : ''} ${s.status === 'waiting' ? 'waiting' : ''} ${s.status === 'approved' ? 'done' : ''}`} style={{ ['--c' as string]: COLOR[s.status] }}>
            <span className="cm-dot"><Icon size={18} aria-hidden /></span>
            <div><span className="k">{STEP_KIND_FA[s.kind]}{s.status !== 'preview' ? ' · ' + STEP_STATUS_FA[s.status] : ''}</span></div>
            <div className="t">{s.label || s.role}</div>
            <div className="r">{s.role}</div>
            {(s.who || s.meta) && <div className="m">{s.who}{s.who && s.meta ? ' · ' : ''}{s.meta}</div>}
          </div>
        )
      })}
    </div>
  )
}

export const stepsFromResolved = (st: ResolvedStep[]): TrackStep[] => st.map((s, i) => ({ key: 'p' + i, label: s.label, role: s.role, kind: s.kind, status: 'preview', meta: s.sla_days ? `مهلت ${s.sla_days} روز` : undefined }))
export const jd = (iso: string | null | undefined) => (iso ? formatJalali(iso.slice(0, 10)) : '')

const SRC: Record<string, string> = { contract: 'قرارداد', project: 'پروژه', manual: 'ورود دستی', none: 'نامشخص' }

/** Base, current %, cumulative %, extension days — everything the route decision was based on, visible and explained. */
export function BasisPanel({ basis, thresholds = [] }: { basis: Basis; thresholds?: number[] }) {
  const cum = basis.cum_pct ?? 0
  const max = Math.max(30, ...thresholds, cum + 5)
  const tone = (t: number) => (cum > t ? 'var(--im-coral)' : 'var(--im-accent)')
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="cm-basis">
        <div><div className="l">مبلغ پایه (اولیه قرارداد)</div><div className="v cm-mono">{money(basis.base_amount)}</div><div className="h">منبع: {SRC[basis.base_source] ?? basis.base_source}{basis.base_source === 'manual' ? ' — دستی؛ بهتر است قرارداد ثبت شود' : ''}</div></div>
        <div><div className="l">درصد این تغییر</div><div className="v cm-mono">{pct(basis.current_pct)}</div><div className="h">{nf(Math.abs(basis.current_cost))} ریال</div></div>
        <div className={thresholds.some((t) => cum > t) ? 'hot' : ''}><div className="l">درصد تجمعی (با تصویب‌شده‌های قبلی)</div><div className="v cm-mono">{pct(basis.cum_pct)}</div><div className="h">قبلی: {money(basis.cum_prev_amount)}</div></div>
        <div><div className="l">در انتظار تصویب (سایر)</div><div className="v cm-mono">{money(basis.pending_other_amount)}</div><div className="h">با آن‌ها: {pct(basis.pending_pct)}</div></div>
        <div><div className="l">تمدید این تغییر</div><div className="v cm-mono">{basis.current_days ? nf(basis.current_days) + ' روز' : '—'}</div><div className="h">{pct(basis.current_days_pct)} از مدت ({basis.duration_days ?? '؟'} روز)</div></div>
        <div><div className="l">تمدید تجمعی</div><div className="v cm-mono">{nf(basis.cum_days)} روز</div><div className="h">{pct(basis.cum_days_pct)} · قبلی {nf(basis.cum_prev_days)} روز</div></div>
      </div>
      {basis.base_amount ? (
        <div>
          <div className="cm-pctbar" aria-label={`تجمعی ${cum}٪`}>
            <i style={{ width: `${Math.min(100, cum / max * 100)}%`, background: thresholds.some((t) => cum > t) ? 'var(--im-coral)' : 'var(--im-accent)' }} />
            {thresholds.map((t) => <b key={t} style={{ insetInlineStart: `${t / max * 100}%`, background: tone(t) }} />)}
          </div>
          {thresholds.length > 0 && <div className="im-helper" style={{ marginTop: 4 }}>خط‌ها حدود تعریف‌شده در قواعد فعال هستند: {thresholds.map((t) => t + '٪').join('، ')}</div>}
        </div>
      ) : null}
    </div>
  )
}

/** Route outcome: the chosen path with its reason, or the reason the request is stopped (never a guess). */
export function ResolutionPanel({ res, thresholds, compact }: { res: RouteResolution; thresholds?: number[]; compact?: boolean }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {!compact && <BasisPanel basis={res.basis} thresholds={thresholds} />}
      {res.status === 'blocked' ? (
        <div className="cm-warn" role="alert"><AlertTriangle size={18} style={{ flex: 'none', color: 'var(--im-coral)', marginTop: 3 }} aria-hidden /><div><b>مسیر تصویب تعیین نشد؛ درخواست برای تعیین تکلیف متوقف می‌شود.</b>{res.blockers.map((b, i) => <div key={i}>• {b.message}</div>)}</div></div>
      ) : res.route ? (
        <>
          <div className="cm-note"><Stamp size={18} style={{ flex: 'none', color: 'var(--im-accent)', marginTop: 3 }} aria-hidden /><div><b>{res.route.title}</b>{res.route.combined ? ' (ترکیبی)' : ''}<div>{res.route.reason}</div><div className="im-helper">مجموعه قواعد: نسخهٔ {res.rule_set?.version} — {res.rule_set?.name} · قواعد اعمال‌شده: {(res.applied_rules ?? []).join('، ') || '—'}</div></div></div>
          <RouteTrack steps={stepsFromResolved(res.route.steps)} />
        </>
      ) : null}
    </div>
  )
}
