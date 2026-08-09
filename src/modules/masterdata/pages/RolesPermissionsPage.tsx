import { useEffect, useState } from 'react'
import { Check, ChevronDown, Plus, Shield, ShieldCheck, Trash2, Users2, X } from 'lucide-react'
import { useMasterDataStore } from '../store/useMasterDataStore'
import { useAccessStore } from '../store/useAccessStore'
import { PERMISSION_ACTION_LABEL_FA, SCOPE_LEVEL_LABEL_FA, SCOPE_LEVELS, type ModuleKeyRef, type ScopeLevel } from '../rbacTypes'

const MODULE_ORDER: ModuleKeyRef[] = ['risk', 'issues', 'pipepulse', 'reporting', 'admin']
const MODULE_LABEL_FA: Record<ModuleKeyRef, string> = {
  risk: 'مدیریت ریسک',
  issues: 'مدیریت مسائل',
  pipepulse: 'PipePulse',
  reporting: 'گزارش‌گیری',
  admin: 'مدیریت کاربران',
}

type SubTab = 'roles' | 'users'

export function RolesPermissionsPage() {
  const [subTab, setSubTab] = useState<SubTab>('roles')
  const loaded = useAccessStore((s) => s.loaded)
  const fetchAll = useAccessStore((s) => s.fetchAll)

  useEffect(() => {
    if (!loaded) fetchAll()
  }, [loaded, fetchAll])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-extrabold">نقش‌ها و دسترسی‌ها</h2>
        <p className="text-xs text-secondary">
          مدل کنترل دسترسی مبتنی بر نقش (RBAC) — این صفحه فقط داده‌ها را تعریف می‌کند؛ اعمال آن روی ماژول‌های موجود (ریسک، مسائل، PipePulse)
          مرحله بعدی و جداگانه‌ای است که هنوز انجام نشده.
        </p>
      </div>

      <div className="flex items-center gap-1 rounded-xl border p-1 w-fit" style={{ borderColor: 'var(--border-soft)' }}>
        <button
          onClick={() => setSubTab('roles')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${
            subTab === 'roles' ? 'bg-brand-500/15 text-brand-300 font-medium' : 'text-secondary hover:bg-white/5'
          }`}
        >
          <Shield size={13} /> نقش‌ها و مجوزها
        </button>
        <button
          onClick={() => setSubTab('users')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${
            subTab === 'users' ? 'bg-brand-500/15 text-brand-300 font-medium' : 'text-secondary hover:bg-white/5'
          }`}
        >
          <Users2 size={13} /> دسترسی کاربران
        </button>
      </div>

      {subTab === 'roles' ? <RolesSection /> : <UserAccessSection />}
    </div>
  )
}

function RolesSection() {
  const roles = useAccessStore((s) => s.roles)
  const permissions = useAccessStore((s) => s.permissions)
  const rolePermissions = useAccessStore((s) => s.rolePermissions)
  const createRole = useAccessStore((s) => s.createRole)
  const deleteRole = useAccessStore((s) => s.deleteRole)
  const setRolePermission = useAccessStore((s) => s.setRolePermission)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const permsByModule = MODULE_ORDER.map((mod) => ({ mod, perms: permissions.filter((p) => p.moduleKey === mod) }))

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2 text-xs font-medium text-white hover:bg-brand-400 transition-colors"
        >
          <Plus size={14} /> نقش جدید
        </button>
      </div>

      {showNew && (
        <div className="glass-panel rounded-2xl p-4 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="نام نقش" className="input" autoFocus />
            <input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="توضیح کوتاه" className="input" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowNew(false)} className="rounded-lg px-3.5 py-1.5 text-xs text-secondary hover:bg-white/5">
              انصراف
            </button>
            <button
              onClick={async () => {
                if (!newName.trim()) return
                await createRole(newName, newDescription)
                setNewName('')
                setNewDescription('')
                setShowNew(false)
              }}
              disabled={!newName.trim()}
              className="rounded-lg bg-brand-500 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-brand-400 disabled:opacity-40 transition-colors"
            >
              ایجاد
            </button>
          </div>
        </div>
      )}

      {roles.length === 0 ? (
        <p className="p-6 text-center text-xs text-muted">هنوز نقشی تعریف نشده است</p>
      ) : (
        <div className="space-y-2">
          {roles.map((role) => {
            const granted = rolePermissions[role.id] ?? new Set<string>()
            const isOpen = expandedId === role.id
            return (
              <div key={role.id} className="glass-panel rounded-2xl overflow-hidden">
                <button onClick={() => setExpandedId(isOpen ? null : role.id)} className="flex w-full items-center gap-3 px-4 py-3 text-right">
                  <ChevronDown size={15} className={`shrink-0 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{role.name}</p>
                      {role.isSystem && (
                        <span className="shrink-0 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
                          سیستمی
                        </span>
                      )}
                    </div>
                    {role.description && <p className="text-[11px] text-muted truncate">{role.description}</p>}
                  </div>
                  <span className="shrink-0 text-[11px] text-muted num">{granted.size} مجوز</span>
                  {!role.isSystem &&
                    (confirmDeleteId === role.id ? (
                      <span
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteRole(role.id)
                          setConfirmDeleteId(null)
                        }}
                        className="shrink-0 text-[11px] text-red-400 hover:underline"
                      >
                        تایید حذف
                      </span>
                    ) : (
                      <span
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmDeleteId(role.id)
                        }}
                        className="shrink-0 text-muted hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={13} />
                      </span>
                    ))}
                </button>

                {isOpen && (
                  <div className="border-t px-4 py-3 space-y-3" style={{ borderColor: 'var(--border-soft)' }}>
                    {permsByModule.map(({ mod, perms }) => (
                      <div key={mod}>
                        <p className="mb-1.5 text-[11px] font-bold text-secondary">{MODULE_LABEL_FA[mod]}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {perms.map((perm) => {
                            const isGranted = granted.has(perm.id)
                            return (
                              <button
                                key={perm.id}
                                onClick={() => setRolePermission(role.id, perm.id, !isGranted)}
                                className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] transition-colors ${
                                  isGranted ? 'border-brand-400/50 bg-brand-500/15 text-brand-300' : 'border-white/10 text-muted hover:bg-white/5'
                                }`}
                              >
                                {isGranted && <Check size={11} />}
                                {PERMISSION_ACTION_LABEL_FA[perm.action]}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function UserAccessSection() {
  const users = useMasterDataStore((s) => s.users)
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const projects = useMasterDataStore((s) => s.projects)
  const roles = useAccessStore((s) => s.roles)
  const userRoles = useAccessStore((s) => s.userRoles)
  const userScopes = useAccessStore((s) => s.userScopes)
  const setUserRoles = useAccessStore((s) => s.setUserRoles)
  const setUserScope = useAccessStore((s) => s.setUserScope)
  const clearUserScope = useAccessStore((s) => s.clearUserScope)

  const [scopeFormFor, setScopeFormFor] = useState<string | null>(null)
  const [scopeLevel, setScopeLevel] = useState<ScopeLevel>('all')
  const [scopeTargetId, setScopeTargetId] = useState('')

  const scopeLabel = (userId: string) => {
    const scopes = userScopes.filter((s) => s.userId === userId)
    if (scopes.length === 0) return null
    return scopes
  }

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      {users.length === 0 ? (
        <p className="p-6 text-center text-xs text-muted">کاربری یافت نشد</p>
      ) : (
        <div className="divide-y" style={{ borderColor: 'var(--border-soft)' }}>
          {users.map((u) => {
            const assignedRoleIds = userRoles[u.id] ?? []
            const scopes = scopeLabel(u.id)
            return (
              <div key={u.id} className="p-4 space-y-2.5">
                <p className="text-sm font-medium truncate">{u.fullName || u.email}</p>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="shrink-0 text-[10px] font-bold text-muted" style={{ minWidth: '4.5rem' }}>
                    نقش‌ها
                  </span>
                  {roles.map((role) => {
                    const has = assignedRoleIds.includes(role.id)
                    return (
                      <button
                        key={role.id}
                        onClick={() => setUserRoles(u.id, has ? assignedRoleIds.filter((id) => id !== role.id) : [...assignedRoleIds, role.id])}
                        className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] transition-colors ${
                          has ? 'border-brand-400/50 bg-brand-500/15 text-brand-300' : 'border-dashed border-white/15 text-muted hover:bg-white/5'
                        }`}
                      >
                        {has && <ShieldCheck size={11} />}
                        {role.name}
                      </button>
                    )
                  })}
                  {roles.length === 0 && <span className="text-[11px] text-muted">ابتدا در تب «نقش‌ها و مجوزها» یک نقش تعریف کنید</span>}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="shrink-0 text-[10px] font-bold text-muted" style={{ minWidth: '4.5rem' }}>
                    محدوده پروژه
                  </span>
                  {scopes?.map((s) => (
                    <span
                      key={s.id}
                      className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px]"
                    >
                      {SCOPE_LEVEL_LABEL_FA[s.scopeLevel]}
                      {s.scopeLevel === 'portfolio' && `: ${portfolios.find((p) => p.id === s.portfolioId)?.name ?? '—'}`}
                      {s.scopeLevel === 'program' && `: ${programs.find((p) => p.id === s.programId)?.name ?? '—'}`}
                      {s.scopeLevel === 'project' && `: ${projects.find((p) => p.id === s.projectId)?.officialName ?? '—'}`}
                      <button onClick={() => clearUserScope(s.id, u.id)} className="text-muted hover:text-red-400 transition-colors">
                        <X size={11} />
                      </button>
                    </span>
                  ))}

                  {scopeFormFor === u.id ? (
                    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-brand-400/30 bg-brand-500/5 px-2 py-1">
                      <select
                        value={scopeLevel}
                        onChange={(e) => {
                          setScopeLevel(e.target.value as ScopeLevel)
                          setScopeTargetId('')
                        }}
                        className="rounded-md bg-black/20 border border-white/10 px-1.5 py-0.5 text-[10px] outline-none focus:border-brand-400"
                      >
                        {SCOPE_LEVELS.map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {SCOPE_LEVEL_LABEL_FA[lvl]}
                          </option>
                        ))}
                      </select>
                      {scopeLevel === 'portfolio' && (
                        <select value={scopeTargetId} onChange={(e) => setScopeTargetId(e.target.value)} className="rounded-md bg-black/20 border border-white/10 px-1.5 py-0.5 text-[10px] outline-none">
                          <option value="">انتخاب...</option>
                          {portfolios.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {scopeLevel === 'program' && (
                        <select value={scopeTargetId} onChange={(e) => setScopeTargetId(e.target.value)} className="rounded-md bg-black/20 border border-white/10 px-1.5 py-0.5 text-[10px] outline-none">
                          <option value="">انتخاب...</option>
                          {programs.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {scopeLevel === 'project' && (
                        <select value={scopeTargetId} onChange={(e) => setScopeTargetId(e.target.value)} className="rounded-md bg-black/20 border border-white/10 px-1.5 py-0.5 text-[10px] outline-none">
                          <option value="">انتخاب...</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.officialName}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={async () => {
                          if (scopeLevel !== 'all' && !scopeTargetId) return
                          await setUserScope(u.id, {
                            scopeLevel,
                            portfolioId: scopeLevel === 'portfolio' ? scopeTargetId : undefined,
                            programId: scopeLevel === 'program' ? scopeTargetId : undefined,
                            projectId: scopeLevel === 'project' ? scopeTargetId : undefined,
                          })
                          setScopeFormFor(null)
                        }}
                        disabled={scopeLevel !== 'all' && !scopeTargetId}
                        className="text-[10px] font-medium text-brand-300 hover:underline disabled:opacity-40"
                      >
                        افزودن
                      </button>
                      <button onClick={() => setScopeFormFor(null)} className="text-muted hover:text-current transition-colors">
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setScopeFormFor(u.id)
                        setScopeLevel('all')
                        setScopeTargetId('')
                      }}
                      className="flex items-center gap-1 rounded-lg border border-dashed border-white/15 px-2 py-1 text-[11px] text-secondary hover:bg-white/5 transition-colors"
                    >
                      <Plus size={11} /> افزودن محدوده
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
