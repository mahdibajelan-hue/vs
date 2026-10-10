import { Landmark } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'

export function FinanceControlCard({ onSelect, locked }: { onSelect: () => void; locked?: boolean }) {
  return (
    <ModuleCard
      number="12"
      title="کنترل قراردادها و مالی"
      englishTag="Contract & Portfolio Finance Control"
      description="شناسنامه و الحاقیه‌های قرارداد، صورت‌وضعیت و پرداخت، بودجه و جریان نقدی، هزینهٔ نهایی پیش‌بینی‌شده، تملک اراضی و اثر تغییرات مصوب در سطح پروژه و سبد."
      icon={Landmark}
      accent="#c9a654"
      locked={locked}
      onSelect={onSelect}
    />
  )
}
