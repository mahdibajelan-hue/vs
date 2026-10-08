import { MapPinned } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'
import { MISSIONS_MODULE } from '../../../../modules/missions/integration/manifest'

export function MissionDebriefCard({ onSelect, locked }: { onSelect: () => void; locked?: boolean }) {
  return (
    <ModuleCard
      number="06"
      title={MISSIONS_MODULE.labelFa}
      englishTag={MISSIONS_MODULE.labelEn}
      description={MISSIONS_MODULE.descriptionFa}
      icon={MapPinned}
      accent="#0891b2"
      locked={locked}
      onSelect={onSelect}
    />
  )
}
