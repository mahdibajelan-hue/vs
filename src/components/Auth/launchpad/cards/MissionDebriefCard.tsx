import { IcMission } from '../hubIcons'
import { ModuleCard } from '../ModuleCard'
import { MISSIONS_MODULE } from '../../../../modules/missions/integration/manifest'

export function MissionDebriefCard({ onSelect, locked, badge }: { onSelect: () => void; locked?: boolean; badge?: number }) {
  return (
    <ModuleCard
      number="06"
      title={MISSIONS_MODULE.labelFa}
      englishTag={MISSIONS_MODULE.labelEn}
      description={MISSIONS_MODULE.descriptionFa}
      icon={IcMission}
      accent="#0891b2"
      locked={locked}
      badge={badge}
      onSelect={onSelect}
    />
  )
}
