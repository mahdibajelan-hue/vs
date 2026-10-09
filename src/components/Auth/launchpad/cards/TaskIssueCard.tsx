import { ListChecks } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'

export function TaskIssueCard({ onSelect, locked }: { onSelect: () => void; locked?: boolean }) {
  return (
    <ModuleCard
      number="09"
      title="مدیریت موانع و اقدامات"
      englishTag="Issue & Task Management"
      description="پایش اقدامات (برج کنترل اقدام‌ها) و پیگیری موانع پروژه‌ها با تقویم، شاخص‌ها و گزارش‌های مدیریتی."
      icon={ListChecks}
      accent="#d97706"
      locked={locked}
      onSelect={onSelect}
    />
  )
}
