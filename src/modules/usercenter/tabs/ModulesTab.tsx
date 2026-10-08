import { useMemo, useState } from 'react'
import { Ban, Check, ChevronDown, Lock, MoreHorizontal, RotateCcw, ShieldCheck, UserCheck } from 'lucide-react'
import type { PermissionAction } from '../../masterdata/rbacTypes'
import { useUserCenterStore } from '../store/useUserCenterStore'
import { useAccessData, useUserAccess } from '../lib/useAccessModel'
import { useAccessActions } from '../lib/useAccessActions'
import { ALL_ACTIONS, PRIMARY_ACTIONS, moduleGrantCount, permissionCell, type PermissionCell } from '../lib/access'
import { faNum } from '../lib/format'
import type { UcUser } from '../types'
import { Badge, Popover, Switch, useToast } from '../components/ui'
import type { ModuleKeyRef } from '../../masterdata/rbacTypes'

const CELL_ICON = { role: Check, direct: UserCheck, denied: Ban, none: null } as const

export function ModulesTab({ user }: { user: UcUser }) {
  const setOverrides = useUserCenterStore((s) => s.setOverrides)
  const clearOverrides = useUserCenterStore((s) => s.clearOverrides)
  const { modules } = useAccessData()
  const { permCtx, blockedModules, overrides } = useUserAccess(user.id)
  const actions = useAccessActions(user.id)
  const notify = useToast()
  const [more, setMore] = useState(false)
  const list = modules.filter((m) => m.isActive)
  const columns = more ? ALL_ACTIONS : PRIMARY_ACTIONS

  const totals = useMemo(() => {
    let role = 0, direct = 0, denied = 0
    for (const m of list) for (const a of ALL_ACTIONS) {
      const c = permissionCell(permCtx, m.key, a.action)
      if (c.source === 'role') role++
      else if (c.source === 'direct') direct++
      else if (c.source === 'denied') denied++
    }
    return { role, direct, denied }
  }, [list, permCtx])

  const apply = async (c: PermissionCell, effect: 'allow' | 'deny' | 'clear', label: string) => {
    if (!c.permissionId) return notify('این مجوز برای این ماژول تعریف نشده است', 'warn')
    const res = effect === 'clear' ? await clearOverrides(user.id, [c.permissionId]) : await setOverrides(user.id, [c.permissionId], effect)
    notify(res.ok ? (effect === 'allow' ? `«${label}» به‌صورت اختصاصی داده شد` : effect === 'deny' ? `«${label}» برای این کاربر ممنوع شد` : `«${label}» به حالت نقش‌ها برگشت`) : (res.error ?? 'ثبت نشد'), res.ok ? 'ok' : 'bad')
  }

  const moduleBulk = async (moduleKey: string, kind: 'grantPrimary' | 'clear') => {
    const ids = (kind === 'grantPrimary' ? PRIMARY_ACTIONS : ALL_ACTIONS).map((a) => permissionCell(permCtx, moduleKey, a.action)).filter((c) => c.permissionId && (kind === 'clear' ? overrides.some((o) => o.permissionId === c.permissionId) : c.source !== 'role' && c.source !== 'direct')).map((c) => c.permissionId!)
    if (!ids.length) return notify('تغییری لازم نبود', 'warn')
    const res = kind === 'grantPrimary' ? await setOverrides(user.id, ids, 'allow') : await clearOverrides(user.id, ids)
    notify(res.ok ? (kind === 'grantPrimary' ? `${faNum(ids.length)} مجوز اختصاصی داده شد` : `${faNum(ids.length)} مورد اختصاصی پاک شد`) : (res.error ?? 'ثبت نشد'), res.ok ? 'ok' : 'bad')
  }

  return (
    <div className="flex flex-col gap-4">
      {user.isAdmin && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: 'color-mix(in srgb, var(--uc-warn) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--uc-warn) 30%, transparent)' }}>
          <ShieldCheck size={18} style={{ color: 'var(--uc-warn)' }} />
          <p className="text-[12.5px] leading-7">این کاربر مدیر سیستم است و در بخش‌های مدیریتی بدون قید دسترسی دارد؛ ماتریس زیر مجوزهای ماژولی او را نشان می‌دهد.</p>
        </div>
      )}

      <section className="uc-card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h3 className="uc-section-title">ماتریس مجوزها</h3>
            <p className="uc-eyebrow mt-0.5">{faNum(totals.role)} مجوز ارثی از نقش‌ها · {faNum(totals.direct)} اختصاصی · {faNum(totals.denied)} ممنوع‌شده. روی هر خانه کلیک کنید.</p>
          </div>
          <button className="uc-btn uc-btn-sm" onClick={() => setMore((v) => !v)} aria-expanded={more}>
            <ChevronDown size={14} style={{ transform: more ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} /> {more ? 'فقط عملیات اصلی' : `نمایش همهٔ عملیات (${faNum(ALL_ACTIONS.length)})`}
          </button>
        </header>
        <div className="overflow-x-auto">
          <table className="uc-matrix" style={{ minWidth: more ? 880 : 640 }}>
            <thead>
              <tr>
                <th>ماژول</th>
                {columns.map((a) => (
                  <th key={a.action} title={a.en}><span className="block">{a.label}</span><span className="block text-[10px] font-normal opacity-70" dir="ltr">{a.en}</span></th>
                ))}
                <th style={{ width: 48 }} />
              </tr>
            </thead>
            <tbody>
              {list.map((m) => {
                const closed = blockedModules.has(m.key)
                const grants = moduleGrantCount(permCtx, m.key)
                return (
                  <tr key={m.key} className={closed ? 'is-blocked' : ''}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Switch checked={!closed} label={`دسترسی به ماژول ${m.labelFa}`} onChange={(on) => actions.setModule(m.key as ModuleKeyRef, on)} />
                        <div className="min-w-0">
                          <span className="block max-w-[200px] truncate text-[13px] font-bold">{m.labelFa}</span>
                          <span className="uc-eyebrow flex items-center gap-1.5">{closed ? <Badge tone="bad"><Lock size={10} /> دسترسی بسته</Badge> : `${faNum(grants)} از ${faNum(ALL_ACTIONS.length)} مجوز`}</span>
                        </div>
                      </div>
                    </td>
                    {columns.map((a) => {
                      const c = permissionCell(permCtx, m.key, a.action as PermissionAction)
                      const Icon = CELL_ICON[c.source]
                      const label = `${a.label} — ${m.labelFa}`
                      const has = overrides.some((o) => o.permissionId === c.permissionId)
                      return (
                        <td key={a.action}>
                          <Popover
                            label={label}
                            align="start"
                            trigger={({ toggle }) => (
                              <button className={`uc-cell is-${c.source}`} onClick={toggle} disabled={!c.permissionId} aria-label={`${label}: ${c.source === 'role' ? 'ارثی از نقش' : c.source === 'direct' ? 'اختصاصی' : c.source === 'denied' ? 'ممنوع' : 'ندارد'}`} title={label}>
                                {Icon && <Icon size={14} strokeWidth={2.6} />}
                              </button>
                            )}
                          >
                            {(close) => (
                              <>
                                <div className="px-2.5 pb-1.5 pt-1">
                                  <p className="text-[12.5px] font-bold">{label}</p>
                                  <p className="uc-eyebrow mt-0.5 leading-6">
                                    {c.source === 'role' ? `از نقش: ${c.roleNames.join('، ')}` : c.source === 'direct' ? 'به‌صورت اختصاصی به این کاربر داده شده' : c.source === 'denied' ? `برای این کاربر ممنوع شده${c.roleNames.length ? ` (نقش‌ها می‌دادند: ${c.roleNames.join('، ')})` : ''}` : 'در حال حاضر ندارد'}
                                  </p>
                                </div>
                                <hr className="uc-hair my-1" />
                                {c.source !== 'direct' && <button className="uc-pop-item" onClick={() => { close(); apply(c, 'allow', label) }}><UserCheck size={14} style={{ color: 'var(--uc-direct)' }} /> اعطای اختصاصی</button>}
                                {c.source !== 'denied' && <button className="uc-pop-item" onClick={() => { close(); apply(c, 'deny', label) }}><Ban size={14} style={{ color: 'var(--uc-bad)' }} /> ممنوع کردن برای این کاربر</button>}
                                {has && <button className="uc-pop-item" onClick={() => { close(); apply(c, 'clear', label) }}><RotateCcw size={14} /> بازگشت به حالت نقش‌ها<small>حذف مورد اختصاصی</small></button>}
                              </>
                            )}
                          </Popover>
                        </td>
                      )
                    })}
                    <td>
                      <Popover label={`گزینه‌های ${m.labelFa}`} align="start" trigger={({ toggle }) => <button className="uc-btn uc-btn-ghost uc-btn-icon" style={{ minWidth: 28, minHeight: 28 }} onClick={toggle} aria-label={`گزینه‌های ${m.labelFa}`}><MoreHorizontal size={15} /></button>}>
                        {(close) => (
                          <>
                            <button className="uc-pop-item" onClick={() => { close(); moduleBulk(m.key, 'grantPrimary') }}><UserCheck size={14} /> اعطای اختصاصی عملیات اصلی</button>
                            <button className="uc-pop-item" onClick={() => { close(); moduleBulk(m.key, 'clear') }}><RotateCcw size={14} /> پاک‌کردن مجوزهای اختصاصی ماژول</button>
                          </>
                        )}
                      </Popover>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <footer className="uc-legend border-t px-4 py-3" style={{ borderColor: 'var(--uc-line)' }}>
          <span><span className="uc-cell is-role"><Check size={11} strokeWidth={2.8} /></span> ارثی از نقش</span>
          <span><span className="uc-cell is-direct"><UserCheck size={11} strokeWidth={2.8} /></span> اختصاصی</span>
          <span><span className="uc-cell is-denied"><Ban size={11} strokeWidth={2.8} /></span> ممنوع‌شده</span>
          <span><span className="uc-cell is-none" /> ندارد</span>
          <span><Lock size={12} /> کلید ابتدای ردیف، ورود به کل ماژول را باز یا بسته می‌کند</span>
        </footer>
      </section>
    </div>
  )
}

