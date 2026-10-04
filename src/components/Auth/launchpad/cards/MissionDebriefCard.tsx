import { MapPinned } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'

export function MissionDebriefCard({ onSelect, locked }: { onSelect: () => void; locked?: boolean }) {
  return (
    <ModuleCard
      number="07"
      title="مأموریت و بازدید پروژه"
      englishTag="Mission & Visit Debrief"
      description="درخواست مأموریت، گزارش‌گیری هوشمند پس از بازدید، کشف Issue/Risk و اقدام مدیریتی."
      icon={MapPinned}
      accent="#f2a93b"
      locked={locked}
      onSelect={onSelect}
    />
  )
}
