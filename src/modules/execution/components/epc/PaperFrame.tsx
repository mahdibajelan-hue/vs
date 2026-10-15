import { useEffect, type ReactNode } from 'react'
import { useExecutionStore } from '../../store/useExecutionStore'
import { useEpcStore } from '../../store/useEpcStore'
import { epcSettings } from '../../lib/epcSettings'
import { EMPTY_PARTIES, type Parties } from '../../epcTypes'
import type { Report } from '../../types'

const LABEL: Record<keyof Parties, string> = { employer: 'کارفرما', consultant: 'مشاور', contractor: 'پیمانکار' }

/** Official letterhead (names + logos of the three parties) above and the fixed contractual-reservation text below every printed report. The letterhead frozen into the report at first submission is used when present, so old reports keep their historical header. */
export function PaperFrame({ report, children }: { report: Report; children: ReactNode }) {
  const settings = useExecutionStore((s) => s.settingsByProject.get(report.projectId))
  const legal = useEpcStore((s) => s.legalByProject.get(report.projectId))
  const available = useEpcStore((s) => s.available)
  useEffect(() => { if (available) void useEpcStore.getState().loadLegal(report.projectId) }, [available, report.projectId])
  const live = epcSettings(settings as unknown as Record<string, unknown>).parties
  const parties: Parties = { ...EMPTY_PARTIES, ...(report.letterhead ?? live) }
  const show = (Object.keys(LABEL) as (keyof Parties)[]).filter((k) => parties[k]?.name || parties[k]?.logo)
  return (
    <div className="mt-printable ex-wrap">
      {show.length > 0 && (
        <div className="ex-brand" style={{ gridTemplateColumns: `repeat(${show.length}, 1fr)` }}>
          {show.map((k) => <div key={k}>{parties[k].logo && <img src={parties[k].logo} alt={`لوگوی ${LABEL[k]}`} />}<b dir="auto">{parties[k].name}</b><small>{LABEL[k]}</small></div>)}
        </div>
      )}
      {children}
      {legal && <div className="ex-legal"><b>تحفظ قراردادی:</b> {legal.body}{legal.status !== 'legal_approved' && <i> (پیش‌نویس — در انتظار تأیید واحد حقوقی)</i>}</div>}
    </div>
  )
}
