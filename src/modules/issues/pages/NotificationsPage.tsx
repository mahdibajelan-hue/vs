import { Bell } from 'lucide-react'
import { useAuthStore } from '../../../store/useAuthStore'
import { NotificationSettings } from '../components/NotificationSettings'
import { HelpButton } from '../components/Help'

export function NotificationsPage() {
  const isAdmin = !!useAuthStore((s) => s.profile?.isAdmin)
  return (
    <div className="im-page">
      <div className="im-topbar">
        <div><div className="im-page-title"><Bell size={22} style={{ color: 'var(--im-rose)' }} />موتور اعلان و تشدید</div><div className="im-page-sub">یادآوری، هشدار پلکانی و وضعیت ارسال</div></div>
        <HelpButton topic="notifications" />
      </div>
      <NotificationSettings isAdmin={isAdmin} />
    </div>
  )
}
