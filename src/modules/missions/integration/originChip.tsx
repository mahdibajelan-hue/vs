import { useEffect, useState } from 'react'
import { MapPinned } from 'lucide-react'
import { MISSIONS_MODULE } from './manifest'
import { loadRecordOrigin, openMission, type RecordOrigin } from './recordSystems'

/**
 * «از بازدید MIS-…» — shown by the Issue, Risk and Action screens (and the Project Radar) on a record that was
 * transferred from a mission finding. Clicking it opens the mission. Renders nothing for any other record.
 * The record id is the Issue / Risk / Action id; a Radar signal id like `issue-<uuid>` is accepted too.
 */
export function MissionOriginChip({ recordId, className = '' }: { recordId: string | null | undefined; className?: string }) {
  const [origin, setOrigin] = useState<RecordOrigin | null>(null)
  const raw = recordId?.replace(/^(issue|risk|action)-/, '') ?? null
  // Demo/mock records carry non-uuid ids; they can never have come from a mission.
  const id = raw && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw) ? raw : null

  useEffect(() => {
    let live = true
    setOrigin(null)
    if (id) loadRecordOrigin(id).then((o) => live && setOrigin(o))
    return () => {
      live = false
    }
  }, [id])

  if (!origin) return null
  const accent = MISSIONS_MODULE.accent
  return (
    <button
      type="button"
      title={`ثبت‌شده از بازدید پروژه — ${origin.findingTitle}`}
      onClick={(e) => {
        e.stopPropagation()
        openMission(origin.missionId)
      }}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold leading-4 ${className}`}
      style={{ color: accent, background: `${accent}1f`, border: `1px solid ${accent}55` }}
    >
      <MapPinned size={11} aria-hidden />
      <span>از بازدید {origin.missionCode}</span>
    </button>
  )
}
