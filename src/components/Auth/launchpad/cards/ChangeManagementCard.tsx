import { GitPullRequestArrow } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'

export function ChangeManagementCard({ onSelect, locked }: { onSelect: () => void; locked?: boolean }) {
  return (
    <ModuleCard
      number="11"
      title="مدیریت تغییرات"
      englishTag="Project Change Management"
      description="ثبت و ارزیابی درخواست تغییر، تعیین خودکار مسیر تصویب از ماتریس اختیارات، پیگیری اجرا و کنترل تغییرات تجمعی قرارداد."
      icon={GitPullRequestArrow}
      accent="#f59e0b"
      locked={locked}
      onSelect={onSelect}
    />
  )
}
