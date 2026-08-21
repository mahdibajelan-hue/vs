import { useMemo, useState } from 'react'
import { Check, Lock, Search, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useMasterDataStore } from '../store/useMasterDataStore'
import { useAccessStore } from '../store/useAccessStore'
import type { ModuleKeyRef, RastaModule } from '../rbacTypes'

// A small accent per module, purely visual — echoes each module's own brand color on the hub
// carousel so admins can pattern-match a column to the product they already recognize.
const MODULE_ACCENT: Record<string, string> = {
  risk: '#e74c3c',
  issues: '#a78bfa',
  pipepulse: '#0ea5e9',
  reporting: '#2dd4bf',
  executive: '#6366f1',
  finance: '#10b981',
  material: '#f59e0b',
  pipelinedigitaltwin: '#38bdf8',
  competency: '#a855f7',
  admin: '#c9a227',
}

/**
 * The primary "who can open what" screen: one row per user, one column per module, one toggle
 * per cell. Deliberately simpler than the roles/permissions/scope model below it — this answers
 * exactly one question (can this user even enter this module) rather than which fine-grained
 * actions they can perform once inside. No row in rasta_user_module_access for a (user, module)
 * pair means access is granted, so a freshly-added user or a freshly-added module both start open
 * — an admin only ever acts to narrow access, never to unlock it from some closed default.
 */
export function ModuleAccessMatrixSection({ orderedModules }: { orderedModules: RastaModule[] }) {
  const users = useMasterDataStore((s) => s.users)
  const moduleAccess = useAccessStore((s) => s.moduleAccess)
  const setUserModuleAccess = useAccessStore((s) => s.setUserModuleAccess)
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<string | null>(null)

  const denySet = useMemo(() => {
    const s = new Set<string>()
    for (const a of moduleAccess) if (!a.hasAccess) s.add(`${a.userId}:${a.moduleKey}`)
    return s
  }, [moduleAccess])

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => (u.fullName || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
  }, [users, query])

  const toggle = async (userId: string, moduleKey: ModuleKeyRef, currentlyGranted: boolean) => {
    const cellKey = `${userId}:${moduleKey}`
    setPending(cellKey)
    await setUserModuleAccess(userId, moduleKey, !currentlyGranted)
    setPending(null)
  }

  return (
    <div className="space-y-3">
      <div className="glass-panel flex flex-wrap items-center gap-3 rounded-2xl p-3.5">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی کاربر بر اساس نام یا ایمیل..."
            className="input w-full !pr-9"
          />
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] text-emerald-300">
          <Check size={12} /> دسترسی فعال
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-300">
          <Lock size={12} /> محدودشده
        </div>
      </div>

      {users.length === 0 ? (
        <p className="glass-panel rounded-2xl p-6 text-center text-xs text-muted">کاربری یافت نشد</p>
      ) : (
        <div className="glass-panel overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border-soft)' }}>
                  <th className="sticky right-0 z-10 bg-[var(--bg-panel-solid)] px-4 py-3 text-right font-bold text-secondary">کاربر</th>
                  {orderedModules.map((mod) => (
                    <th key={mod.key} className="px-2 py-3 text-center font-bold" style={{ minWidth: 84 }}>
                      <div className="flex flex-col items-center gap-1">
                        <span className="h-1.5 w-6 rounded-full" style={{ background: MODULE_ACCENT[mod.key] ?? 'var(--border-soft)' }} />
                        <span className="text-[10.5px] leading-tight text-secondary">{mod.labelFa}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u, rowIndex) => (
                  <tr
                    key={u.id}
                    className={rowIndex % 2 === 1 ? 'bg-white/[0.015]' : undefined}
                    style={{ borderBottom: '1px solid var(--border-soft)' }}
                  >
                    <td className="sticky right-0 z-10 bg-[var(--bg-panel-solid)] px-4 py-2.5">
                      <p className="truncate text-[12px] font-medium" style={{ maxWidth: 180 }}>
                        {u.fullName || u.email}
                      </p>
                      {u.fullName && <p className="truncate text-[10px] text-muted" style={{ maxWidth: 180 }}>{u.email}</p>}
                    </td>
                    {orderedModules.map((mod) => {
                      const cellKey = `${u.id}:${mod.key}`
                      const granted = !denySet.has(cellKey)
                      const isPending = pending === cellKey
                      return (
                        <td key={mod.key} className="px-2 py-2.5 text-center">
                          <button
                            onClick={() => toggle(u.id, mod.key, granted)}
                            disabled={isPending}
                            title={granted ? `دسترسی به «${mod.labelFa}» فعال است` : `دسترسی به «${mod.labelFa}» محدود شده`}
                            className={`mx-auto flex h-6 w-11 items-center rounded-full border px-0.5 transition-colors disabled:opacity-50 ${
                              granted ? 'justify-end border-emerald-400/50 bg-emerald-500/25' : 'justify-start border-red-400/40 bg-red-500/10'
                            }`}
                          >
                            <span
                              className={`flex h-4.5 w-4.5 items-center justify-center rounded-full shadow ${
                                granted ? 'bg-emerald-400 text-emerald-950' : 'bg-red-400/80 text-red-950'
                              }`}
                              style={{ height: 18, width: 18 }}
                            >
                              {granted ? <Check size={11} /> : <X size={11} />}
                            </span>
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-brand-400/20 bg-brand-500/5 px-3.5 py-2.5 text-[11px] leading-5 text-secondary">
        <Sparkles size={13} className="mt-0.5 shrink-0 text-brand-300" />
        <p>
          به‌صورت پیش‌فرض همه‌ی کاربران به همه‌ی محیط‌ها دسترسی دارند — از جمله کاربرانی که بعداً اضافه می‌شوند یا ماژول‌هایی که بعداً به پلتفرم اضافه می‌شوند. خاموش‌کردن یک
          کلید یعنی آن کاربر دیگر آن محیط را در فهرست ماژول‌های خود نمی‌بیند و نمی‌تواند وارد شود؛ روشن‌کردن دوباره، دسترسی را فوراً بازمی‌گرداند.
        </p>
      </div>
      <div className="flex items-center gap-2 px-1 text-[10.5px] text-muted">
        <ShieldCheck size={12} /> ادمین‌های سامانه همیشه به همه‌ی محیط‌ها دسترسی دارند و از این طریق قابل محدودسازی نیستند — برای جلوگیری از قفل‌شدن حساب ادمین.
      </div>
    </div>
  )
}
