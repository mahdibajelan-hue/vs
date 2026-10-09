import { useEffect, useState } from 'react'
import { CheckCircle2, CornerUpLeft, Gavel, Hourglass, Ban } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { useLifecycleStore } from '../store/useLifecycleStore'
import {
  DECISION_LABEL_FA, gateReadiness, type DecisionInput, type GateDecisionKind, type GateItemLite,
} from '../lib/gateModel'
import type { GateDecision, ProjectGate } from '../types'
import { STATUS_COLOR, STATUS_TEXT_COLOR, fa } from './ui'

const KIND_ICON = { pass: CheckCircle2, conditional: Hourglass, return: CornerUpLeft, cancel: Ban } as const
const KIND_COLOR: Record<GateDecisionKind, string> = {
  pass: STATUS_COLOR.green, conditional: '#a855f7', return: STATUS_COLOR.yellow, cancel: STATUS_COLOR.red,
}

interface Person { id: string; name: string }

/** Pass / Conditional / Return / Cancel for a gate, with the immutable decision history. */
export function GateDecisionPanel({ gate, items, progress, canDecide }: {
  gate: ProjectGate; items: GateItemLite[]; progress: number; canDecide: boolean
}) {
  const decide = useLifecycleStore((s) => s.decideGate)
  const decisions = useLifecycleStore((s) => s.bundle.decisions).filter((d) => d.gateId === gate.id)
  const [kind, setKind] = useState<GateDecisionKind | null>(null)
  const [reason, setReason] = useState('')
  const [condText, setCondText] = useState('')
  const [condOwner, setCondOwner] = useState('')
  const [condDeadline, setCondDeadline] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [people, setPeople] = useState<Person[]>([])

  useEffect(() => {
    if (kind !== 'conditional' || people.length > 0) return
    supabase.from('profiles').select('id, full_name, email').order('full_name').then(({ data }) => {
      setPeople((data ?? []).map((p) => ({ id: p.id as string, name: (p.full_name as string) || (p.email as string) })))
    })
  }, [kind, people.length])

  const readiness = gateReadiness(items, progress, gate.readinessThreshold)
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? (id ? '—' : '')

  async function submit() {
    if (!kind) return
    const input: DecisionInput = {
      kind, reason, conditionText: condText, conditionOwnerId: condOwner || null, conditionDeadline: condDeadline || null,
    }
    const err = await decide(gate, items, progress, input)
    setError(err)
    if (!err) { setKind(null); setReason(''); setCondText(''); setCondOwner(''); setCondDeadline('') }
  }

  return (
    <div className="space-y-2.5">
      {readiness.badge && (
        <span className="inline-block rounded-full px-2.5 py-1 text-[10px] font-bold"
          style={{ background: `${STATUS_COLOR.red}22`, color: STATUS_TEXT_COLOR.red }}>
          {readiness.badge}
        </span>
      )}

      {gate.status === 'conditional' && gate.conditionText && (
        <div className="rounded-lg border p-2.5" style={{ borderColor: '#a855f766', background: '#a855f711' }}>
          <p className="text-[11px] font-bold" style={{ color: '#c084fc' }}>تصویب مشروط — شرط باز</p>
          <p className="mt-0.5 text-[11px]">{gate.conditionText}</p>
          <p className="plc-stat-sub mt-0.5">مهلت: {fa(gate.conditionDeadline)}</p>
        </div>
      )}

      {canDecide && gate.status !== 'approved' && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(DECISION_LABEL_FA) as GateDecisionKind[]).map((k) => {
              const Icon = KIND_ICON[k]
              const active = kind === k
              return (
                <button key={k} onClick={() => { setKind(active ? null : k); setError(null) }}
                  className="flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[11px] font-bold transition-colors"
                  style={{
                    borderColor: active ? KIND_COLOR[k] : 'var(--border-soft)',
                    background: active ? `${KIND_COLOR[k]}22` : undefined,
                    color: active ? KIND_COLOR[k] : undefined,
                  }}>
                  <Icon size={13} /> {DECISION_LABEL_FA[k]}
                </button>
              )
            })}
          </div>

          {kind && (
            <div className="space-y-2 rounded-lg border p-2.5" style={{ borderColor: 'var(--border-soft)' }}>
              {kind === 'conditional' && (
                <>
                  <input value={condText} onChange={(e) => setCondText(e.target.value)} placeholder="متن شرط (الزامی)"
                    className="w-full rounded-lg border bg-black/20 px-2.5 py-2 text-xs outline-none" style={{ borderColor: 'var(--border-soft)' }} />
                  <select value={condOwner} onChange={(e) => setCondOwner(e.target.value)}
                    className="w-full rounded-lg border bg-black/20 px-2.5 py-2 text-xs outline-none" style={{ borderColor: 'var(--border-soft)' }}>
                    <option value="">مسئول رفع شرط (الزامی)</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <div className="flex items-center gap-2">
                    <span className="plc-stat-sub shrink-0">مهلت (الزامی)</span>
                    <JalaliDateInput value={condDeadline} onChange={setCondDeadline} />
                  </div>
                </>
              )}
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                placeholder={kind === 'return' || kind === 'cancel' ? 'دلیل (الزامی)' : 'توضیحات تصمیم'}
                className="w-full rounded-lg border bg-black/20 px-2.5 py-2 text-xs outline-none" style={{ borderColor: 'var(--border-soft)' }} />
              {error && <p className="text-[11px]" style={{ color: STATUS_TEXT_COLOR.red }}>{error}</p>}
              <button onClick={submit} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white"
                style={{ background: KIND_COLOR[kind] }}>
                <Gavel size={13} /> ثبت تصمیم
              </button>
            </div>
          )}
        </>
      )}

      {decisions.length > 0 && (
        <div>
          <p className="plc-stat-sub mb-1 font-bold">سوابق تصمیم‌ها</p>
          <ul className="space-y-1">
            {decisions.map((d: GateDecision) => (
              <li key={d.id} className="flex items-start gap-1.5 text-[11px]">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: KIND_COLOR[d.decision] }} />
                <span>
                  <b>{DECISION_LABEL_FA[d.decision]}</b> · {fa(d.decidedAt)}
                  {d.reason && <span className="text-muted"> — {d.reason}</span>}
                  {d.conditionText && <span className="text-muted"> — شرط: {d.conditionText} ({nameOf(d.conditionOwnerId)} تا {fa(d.conditionDeadline)})</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
