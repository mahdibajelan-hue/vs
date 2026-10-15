import { AlertTriangle } from 'lucide-react'
import { useEffect } from 'react'
import { useEpcStore } from '../../store/useEpcStore'

/** Loads the EPC-control tables once and, when migration 010 has not been applied, says so instead of letting each page fail on its own. */
export function EpcGate({ children }: { children: React.ReactNode }) {
  const available = useEpcStore((s) => s.available)
  const loaded = useEpcStore((s) => s.loaded)
  const fetchAll = useEpcStore((s) => s.fetchAll)
  useEffect(() => { if (!loaded) void fetchAll() }, [loaded, fetchAll])
  if (loaded && !available) return (
    <div className="im-card" style={{ padding: '14px 16px', display: 'flex', gap: 10, borderInlineStart: '3px solid var(--im-amber)' }}>
      <AlertTriangle size={18} style={{ color: 'var(--im-amber)', flex: 'none' }} />
      <div><b>جدول‌های کنترل EPC هنوز در پایگاه داده ساخته نشده‌اند.</b>
        <p className="im-helper" style={{ margin: '4px 0 0' }}>فایل <code dir="ltr">supabase/execution/010_epc_control.sql</code> باید یک بار اجرا شود. تا آن زمان این بخش فقط داده‌های موجود گزارش روزانه را نشان می‌دهد و ذخیره‌ٔ داده‌های جدید ممکن نیست.</p></div>
    </div>
  )
  return <>{children}</>
}
