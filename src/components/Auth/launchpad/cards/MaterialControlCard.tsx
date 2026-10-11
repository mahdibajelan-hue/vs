import { PackageSearch } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'

export function MaterialControlCard({ onSelect, locked }: { onSelect: () => void; locked?: boolean }) {
  return (
    <ModuleCard
      number="13"
      title="کنترل و تأمین کالا"
      englishTag="Material Supply Control"
      description="بانک متریال و MTO پیمان/طراحی، مغایرت‌یابی، بسته‌های خرید با پیشرفت وزنی، موجودی و مصرف، بالانس نهایی و ریسک و مسئلهٔ تأمین."
      icon={PackageSearch}
      accent="#f59e0b"
      locked={locked}
      onSelect={onSelect}
    />
  )
}
