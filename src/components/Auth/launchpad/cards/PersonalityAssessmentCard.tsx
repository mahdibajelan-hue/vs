import { BrainCircuit } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'

export function PersonalityAssessmentCard({ onSelect, locked }: { onSelect: () => void; locked?: boolean }) {
  return (
    <ModuleCard
      number="07"
      title="ارزیابی شخصیت و رفتاری"
      englishTag="Personality & Behavioral Assessment"
      description="سنجش تمایلات رفتاری حرفه‌ای مبتنی بر شواهد، مکمل ارزیابی شایستگی فنی."
      icon={BrainCircuit}
      accent="#f472b6"
      locked={locked}
      onSelect={onSelect}
    />
  )
}
