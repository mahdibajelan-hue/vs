import { Users } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'

export function UserManagementCard({ onSelect }: { onSelect: () => void }) {
  return (
    <ModuleCard
      number="06"
      title="مدیریت کاربران"
      englishTag="Users, Roles & Access Control"
      description="کاربران، نقش‌ها، سازمان و کنترل دسترسی یکپارچه به همه ماژول‌های پلتفرم."
      icon={Users}
      accent="#c9a227"
      onSelect={onSelect}
    />
  )
}
