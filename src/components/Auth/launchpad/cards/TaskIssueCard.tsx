import { ListChecks } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'

export function TaskIssueCard({ onSelect, locked }: { onSelect: () => void; locked?: boolean }) {
  return (
    <ModuleCard
      number="09"
      title="مدیریت موانع و اقدامات"
      englishTag="Issue & Task Management"
      description="مدیریت هوشمند مسائل، اقدام‌ها، تصمیم‌ها و پیگیری‌ها: گردش‌کار، تقویم کاری، شاخص‌های تصویری، اعلان و تشدید."
      icon={ListChecks}
      accent="#d97706"
      locked={locked}
      onSelect={onSelect}
    />
  )
}
