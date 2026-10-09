import { ShieldAlert } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'

export function RiskManagementCard({ onSelect, locked }: { onSelect: () => void; locked?: boolean }) {
  return (
    <ModuleCard
      number="10"
      title="مدیریت ریسک"
      englishTag="Enterprise Risk Management"
      description="شناسایی، ارزیابی ذاتی/فعلی/باقیمانده، اقدامات کاهشی، شاخص‌های هشدار و اثربخشی کنترل‌ها در سطح پروژه، طرح و پورتفولیو."
      icon={ShieldAlert}
      accent="#e11d48"
      locked={locked}
      onSelect={onSelect}
    />
  )
}
