import { useMemo, useState } from 'react'
import { openRecord } from '../integration/recordSystems'
import { FileSearch } from 'lucide-react'
import { useMissionStore } from '../store/useMissionStore'
import { useNav } from '../nav'
import { faNum } from '../lib/fa'
import { Card, EmptyState } from '../components/ui'
import { FindingCard } from '../components/FindingCard'
import { liveFindings } from '../lib/reportBuilder'
import { FINDING_KIND_SHORT, type FindingKind } from '../types'

const KINDS: FindingKind[] = ['issue', 'risk', 'action', 'commitment', 'decision']
const STATES = [
  { key: 'all', label: 'همه' },
  { key: 'proposed', label: 'در انتظار تأیید' },
  { key: 'transferred', label: 'منتقل‌شده' },
  { key: 'overdue', label: 'از موعد گذشته' },
]

/** Registry of everything discovered across visits — the Discovery & Intelligence layer's own view. */
export function FindingsPage() {
  const { go } = useNav()
  const portfolio = useMissionStore((s) => s.portfolio)
  const user = useMissionStore((s) => s.user)
  const transfer = useMissionStore((s) => s.transfer)
  const decide = useMissionStore((s) => s.decideFinding)
  const [kind, setKind] = useState<FindingKind | 'all'>('all')
  const [state, setState] = useState('all')
  const [moving, setMoving] = useState<string | null>(null)

  const all = useMemo(() => liveFindings(portfolio?.findings ?? []).filter((f) => KINDS.includes(f.kind)), [portfolio])
  const today = new Date().toISOString().slice(0, 10)
  const shown = all.filter((f) => (kind === 'all' || f.kind === kind) && (state === 'all' || (state === 'proposed' && !f.transferredId && f.approval === 'proposed') || (state === 'transferred' && !!f.transferredId) || (state === 'overdue' && !!f.dueDate && f.dueDate < today && !f.transferredId)))
  const missions = portfolio?.missions ?? []

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <p className="ms-eyebrow mb-1">لایه کشف</p>
        <h1 className="text-[22px] font-black leading-9">یافته‌های بازدیدها</h1>
        <p className="ms-ink2 text-[12.5px] leading-7">مسئله، ریسک، اقدام، تعهد و تصمیم‌هایی که از گفت‌وگوها بیرون آمده است. Issue و Risk پس از تأیید در سامانه اصلی ثبت می‌شوند و وضعیت آنها از همان‌جا خوانده می‌شود.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="نوع">
        <button className={`ms-chip ${kind === 'all' ? 'is-on' : ''}`} aria-pressed={kind === 'all'} onClick={() => setKind('all')}>همه انواع {faNum(all.length)}</button>
        {KINDS.map((k) => (
          <button key={k} className={`ms-chip ms-k-${k} ${kind === k ? 'is-on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
            <span className="h-2 w-2 rounded-full" style={{ background: 'var(--c)' }} aria-hidden /> {FINDING_KIND_SHORT[k]} {faNum(all.filter((f) => f.kind === k).length)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="وضعیت">
        {STATES.map((s) => <button key={s.key} className={`ms-chip ${state === s.key ? 'is-on' : ''}`} aria-pressed={state === s.key} onClick={() => setState(s.key)}>{s.label}</button>)}
      </div>

      {shown.length === 0 ? (
        <Card><EmptyState icon={FileSearch} title="موردی پیدا نشد" text="پس از اولین گزارش‌گیری، یافته‌ها اینجا جمع می‌شوند." /></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {shown.map((f) => {
            const m = missions.find((x) => x.id === f.missionId)
            const canAct = !!user?.isManager && m?.status === 'report_review'
            return (
              <FindingCard
                key={f.id}
                finding={f}
                linked={portfolio?.linked.find((l) => l.findingId === f.id)}
                missionLabel={m ? `${m.code} · ${m.projectName}` : undefined}
                onOpenMission={() => m && go({ kind: m.status === 'report_review' ? 'report' : 'mission', id: m.id })}
                onDecide={canAct ? (a) => decide(f.id, a) : undefined}
                onTransfer={canAct ? async (t, params) => { setMoving(f.id); await transfer(f.id, t, params); setMoving(null) } : undefined}
                onOpenLinked={(() => { const l = portfolio?.linked.find((x) => x.findingId === f.id); return l && m ? () => openRecord(l.target, l.linkedId, m.masterProjectId) : undefined })()}
                transferring={moving === f.id}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
