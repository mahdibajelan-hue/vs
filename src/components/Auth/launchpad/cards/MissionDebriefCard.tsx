import { MapPinned } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'
import { MISSIONS_MODULE } from '../../../../modules/missions/integration/manifest'

export function MissionDebriefCard({ onSelect, locked }: { onSelect: () => void; locked?: boolean }) {
  return (
    <ModuleCard
      number="07"
      title={MISSIONS_MODULE.labelFa}
      englishTag={MISSIONS_MODULE.labelEn}
      description={MISSIONS_MODULE.descriptionFa}
      icon={MapPinned}
      accent={MISSIONS_MODULE.accent}
      locked={locked}
      onSelect={onSelect}
    />
  )
}
