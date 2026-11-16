import { IcUsersAdmin } from '../hubIcons'
import { ModuleCard } from '../ModuleCard'

export function UserManagementCard({ onSelect, locked, badge }: { onSelect: () => void; locked?: boolean; badge?: number }) {
  return (
    <ModuleCard
      number="08"
      title="مدیریت کاربران و داده‌های پایه"
      englishTag="Users, Access & Master Data"
      description="کاربران و دسترسی‌ها، سازمان‌ها، پورتفولیو و طرح‌ها، پروژه‌ها و ساختار منابع انسانی هر پروژه."
      icon={IcUsersAdmin}
      accent="#475569"
      locked={locked}
      badge={badge}
      onSelect={onSelect}
    />
  )
}
