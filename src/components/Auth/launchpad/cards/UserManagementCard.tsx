import { Users } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'

export function UserManagementCard({ onSelect, locked }: { onSelect: () => void; locked?: boolean }) {
  return (
    <ModuleCard
      number="06"
      title="مدیریت کاربران"
      englishTag="Users, Roles & Access Control"
      description="کاربران، نقش‌ها، سازمان و کنترل دسترسی یکپارچه به همه ماژول‌ها."
      icon={Users}
      accent="#c9a227"
      locked={locked}
      onSelect={onSelect}
    />
  )
}
