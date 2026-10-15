import { Ruler } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'

export function EngineeringControlCard({ onSelect, locked, badge }: { onSelect: () => void; locked?: boolean; badge?: number }) {
  return (
    <ModuleCard
      number="15"
      title="پیشرفت مهندسی و آمادگی اجرا"
      englishTag="Engineering Progress & Readiness"
      description="فهرست مدارک مهندسی با وزن و تاریخ، پیشرفت وزنی تهیه و تأیید، ارتباط مدارک با فعالیت‌ها، آمادگی اجرا و پیش‌بینی اثر تأخیر مدارک بر برنامه و تاریخ تکمیل پروژه."
      icon={Ruler}
      accent="#6366f1"
      locked={locked}
      badge={badge}
      onSelect={onSelect}
    />
  )
}
