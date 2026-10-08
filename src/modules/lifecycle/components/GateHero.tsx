import { ListTree } from 'lucide-react'
import { GATE_META, GATE_LIFECYCLE_LABEL_FA, PHASE_LABEL_FA, type GateLifecycleStatus } from '../lib/gateModel'
import type { ProjectGate, ProjectStage } from '../types'
import { faNum } from './ui'

const STATUS_BADGE: Record<GateLifecycleStatus, string> = {
  not_ready: '#64748b', ready_for_review: '#3b82f6', conditional: '#a855f7', passed: '#10b981', blocked: '#ef4444',
}

export function lifecycleStatusOf(s: string | undefined): GateLifecycleStatus {
  return s === 'approved' ? 'passed' : s === 'conditional' ? 'conditional' : s === 'ready' ? 'ready_for_review' : s === 'blocked' || s === 'rejected' ? 'blocked' : 'not_ready'
}

/** Dark header of the gate detail page: step N of M, owner, status, and the three big numbers. */
export function GateHero({ stage, gate, index, total, status, actual, planned, ownerName, canEdit, onCreateSubtasks }: {
  stage: ProjectStage | undefined; gate: ProjectGate | undefined; index: number; total: number
  status: string | undefined; actual: number; planned: number; ownerName: string
  canEdit: boolean; onCreateSubtasks: () => void
}) {
  const meta = GATE_META[index]
  const life = lifecycleStatusOf(status)
  const dev = Math.round(actual - planned)
  const devColor = dev < -5 ? '#f87171' : dev > 2 ? '#39ff8a' : '#93c5fd'
  return (
    <div className="rounded-2xl p-4 md:p-5" style={{ background: 'radial-gradient(ellipse 100% 120% at 100% 0%, #123159 0%, #060b16 75%)', border: '1px solid rgba(255,255,255,.08)' }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold" style={{ color: '#93c5fd' }}>
            مرحله {faNum(index + 1)} از {faNum(total)}{meta ? ` · ${PHASE_LABEL_FA[gate?.phaseGroup ?? meta.phase]}` : ''}
          </p>
          <h2 className="mt-1 text-lg font-extrabold text-white">
            <span className="me-2">{gate?.icon || meta?.icon}</span>{stage?.nameFa ?? '—'}
          </h2>
          <p className="mt-1 text-[11px]" style={{ color: '#94a3b8' }}>
            مسئول گیت: <b style={{ color: '#e2e8f0' }}>{ownerName || gate?.ownerRole || meta?.owner || '—'}</b>
            {(gate?.approvalDoc || meta?.approvalDoc) && <> · سند تأیید: <b style={{ color: '#e2e8f0' }}>{gate?.approvalDoc || meta?.approvalDoc}</b></>}
          </p>
        </div>
        <span className="rounded-full px-3 py-1 text-[11px] font-extrabold text-white" style={{ background: STATUS_BADGE[life] }}>
          {GATE_LIFECYCLE_LABEL_FA[life]}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Big label="پیشرفت واقعی" value={`${faNum(Math.round(actual))}٪`} color="#39ff8a" />
        <Big label="پیشرفت برنامه‌ای" value={`${faNum(Math.round(planned))}٪`} color="#fb923c" />
        <Big label="انحراف" value={`${dev >= 0 ? '+' : ''}${faNum(dev)}٪`} color={devColor} />
      </div>

      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={onCreateSubtasks} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold text-white"
            style={{ borderColor: 'rgba(255,255,255,.18)', background: 'rgba(255,255,255,.06)' }}>
            <ListTree size={13} /> ایجاد زیرفعالیت‌ها از اهداف مرحله
          </button>
        </div>
      )}
    </div>
  )
}

function Big({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)' }}>
      <p className="text-2xl font-extrabold leading-none md:text-3xl" style={{ color }}>{value}</p>
      <p className="mt-1 text-[10px]" style={{ color: '#94a3b8' }}>{label}</p>
    </div>
  )
}
