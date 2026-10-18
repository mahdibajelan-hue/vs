import { CalendarClock } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'

export function SchedulingControlCard({ onSelect, locked, badge }: { onSelect: () => void; locked?: boolean; badge?: number }) {
  return (
    <ModuleCard
      number="16"
      title="برنامه‌ریزی و کنترل زمان پروژه"
      englishTag="Project Scheduling & Time Control"
      description="ورود برنامهٔ Excel و Primavera P6، نسخه‌ها و خط مبنای مصوب، گانت و مسیر بحرانی، انحراف و پیش‌بینی تکمیل، اتصال به اجرا، مهندسی، تأمین، ریسک و مسائل و تحلیل کمی ریسک (P50/P80/P90)."
      icon={CalendarClock}
      accent="#0ea5a4"
      locked={locked}
      badge={badge}
      onSelect={onSelect}
    />
  )
}
