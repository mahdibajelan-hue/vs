import { useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, ClipboardList, MapPin, Search } from 'lucide-react'
import { useMissionStore } from '../store/useMissionStore'
import { useNav } from '../nav'
import { nextStepFor, STEPS, stepIndex } from '../lib/workflow'
import { faNum, shamsi, missionDays } from '../lib/fa'
import { Avatar, Card, EmptyState, Pill, StatusPill } from '../components/ui'
import { MISSION_STATUS_LABEL, VISIT_TYPE_LABEL, type Mission, type MissionStatus } from '../types'

const FILTERS: { key: string; label: string; test: (m: Mission) => boolean }[] = [
  { key: 'all', label: 'همه', test: () => true },
  { key: 'active', label: 'جاری', test: (m) => ['approved', 'debrief', 'pending_approval', 'report_review', 'revision_requested', 'returned'].includes(m.status) },
  { key: 'pending_approval', label: 'منتظر تأیید درخواست', test: (m) => m.status === 'pending_approval' },
  { key: 'report_review', label: 'گزارش منتظر تأیید', test: (m) => m.status === 'report_review' },
  { key: 'incomplete', label: 'گزارش ناقص', test: (m) => m.status === 'debrief' || m.status === 'revision_requested' },
  { key: 'done', label: 'تکمیل‌شده', test: (m) => m.status === 'ready_for_claim' || m.status === 'claimed' },
  { key: 'draft', label: 'پیش‌نویس', test: (m) => m.status === 'draft' || m.status === 'returned' },
]

export function MissionListPage({ initialFilter }: { initialFilter?: string }) {
  const { go } = useNav()
  const portfolio = useMissionStore((s) => s.portfolio)
  const user = useMissionStore((s) => s.user)
  const [filter, setFilter] = useState(FILTERS.some((f) => f.key === initialFilter) ? (initialFilter as string) : 'all')
  const [q, setQ] = useState('')

  const missions = useMemo(() => portfolio?.missions ?? [], [portfolio])
  const shown = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0]
    const needle = q.trim()
    return missions.filter((m) => f.test(m) && (!needle || [m.code, m.projectName, m.requesterName, m.destination].some((t) => t.includes(needle))))
  }, [missions, filter, q])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="ms-eyebrow mb-1">فهرست</p>
          <h1 className="text-[22px] font-black leading-9">مأموریت‌ها</h1>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={15} className="ms-muted pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" aria-hidden />
          <input className="ms-input" style={{ paddingRight: 36 }} placeholder="جستجو: کد، پروژه، نام، مقصد…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="جستجو" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="فیلتر وضعیت">
        {FILTERS.map((f) => {
          const n = missions.filter(f.test).length
          return (
            <button key={f.key} className={`ms-chip ${filter === f.key ? 'is-on' : ''}`} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label} <span className="ms-muted">{faNum(n)}</span>
            </button>
          )
        })}
      </div>

      {shown.length === 0 ? (
        <Card>
          <EmptyState icon={ClipboardList} title="مأموریتی با این فیلتر پیدا نشد" text="فیلتر را عوض کنید یا درخواست مأموریت جدید ثبت کنید." action={<button className="ms-btn ms-btn-primary mt-2" onClick={() => go({ kind: 'form' })}>درخواست مأموریت</button>} />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((m) => {
            const next = nextStepFor(m, user)
            const idx = stepIndex(m.status)
            return (
              <li key={m.id}>
                <Card className="p-0 transition-colors hover:border-[var(--ms-line-2)]">
                  <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                    <button className="flex min-w-0 flex-1 items-start gap-3 text-right" onClick={() => go({ kind: 'mission', id: m.id })}>
                      <Avatar name={m.requesterName} size={38} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <b className="text-[13.5px]">{m.projectName}</b>
                          <span className="ms-muted text-[11.5px]">{m.code}</span>
                          <StatusPill status={m.status as MissionStatus} />
                        </span>
                        <span className="ms-ink2 mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[12px] leading-6">
                          <span>{m.requesterName}</span>
                          <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden />{m.destination || '—'}</span>
                          <span className="inline-flex items-center gap-1"><CalendarDays size={12} aria-hidden />{shamsi(m.startDate)} · {faNum(missionDays(m.startDate, m.endDate))} روز</span>
                          <span>{VISIT_TYPE_LABEL[m.visitType]}</span>
                        </span>
                        {idx >= 0 && (
                          <span className="mt-2 flex items-center gap-1.5" aria-label={`مرحله ${STEPS[Math.min(idx, STEPS.length - 1)]}`}>
                            {STEPS.map((s, i) => (
                              <span key={s} title={s} className="h-1.5 flex-1 rounded-full" style={{ background: i < idx ? 'var(--ms-good)' : i === idx ? 'var(--ms-accent)' : 'var(--ms-line-2)' }} />
                            ))}
                          </span>
                        )}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-3 md:w-64 md:justify-end">
                      {m.qualityScore != null && <Pill tone={m.qualityScore >= 75 ? 'good' : m.qualityScore >= 60 ? 'warn' : 'bad'} title="امتیاز کیفیت گزارش">کیفیت {faNum(Math.round(m.qualityScore))}</Pill>}
                      {next ? (
                        <button className={`ms-btn ms-btn-sm ${next.tone === 'good' || next.tone === 'accent' ? 'ms-btn-primary' : ''}`} onClick={() => go(next.view)}>
                          {next.label} <ArrowLeft size={13} aria-hidden />
                        </button>
                      ) : (
                        <button className="ms-btn ms-btn-ghost ms-btn-sm" onClick={() => go({ kind: 'mission', id: m.id })}>جزئیات</button>
                      )}
                    </div>
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
      <p className="ms-muted text-[11px]">{MISSION_STATUS_LABEL.draft} و {MISSION_STATUS_LABEL.returned} فقط برای خود درخواست‌دهنده قابل ویرایش است.</p>
    </div>
  )
}
