import { Users } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'

export function UserManagementCard({ onSelect, locked }: { onSelect: () => void; locked?: boolean }) {
  return (
    <ModuleCard
      number="08"
      title="مدیریت کاربران و داده‌های پایه"
      englishTag="Users, Access & Master Data"
      description="کاربران و دسترسی‌ها، سازمان‌ها، پورتفولیو و طرح‌ها، پروژه‌ها و ساختار منابع انسانی هر پروژه."
      icon={Users}
      accent="#475569"
      locked={locked}
      onSelect={onSelect}
    />
  )
}
