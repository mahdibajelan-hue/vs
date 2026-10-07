import { Sprout } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'
import { LANDACQ_MODULE } from '../../../../modules/landacq/integration/manifest'

export function LandAcquisitionCard({ onSelect, locked }: { onSelect: () => void; locked?: boolean }) {
  return (
    <ModuleCard
      number="08"
      title={LANDACQ_MODULE.labelFa}
      englishTag={LANDACQ_MODULE.labelEn}
      description={LANDACQ_MODULE.descriptionFa}
      icon={Sprout}
      accent={LANDACQ_MODULE.accent}
      locked={locked}
      onSelect={onSelect}
    />
  )
}
