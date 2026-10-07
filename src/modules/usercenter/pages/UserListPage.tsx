import { useMemo, useState } from 'react'
import { ArrowDownUp, ChevronLeft, ChevronRight, Eye, KeyRound, Pencil, Power, RefreshCw, Search, ShieldCheck, SlidersHorizontal, UserPlus, Users, X } from 'lucide-react'
import { useAuthStore } from '../../../store/useAuthStore'
import { useUserCenterStore } from '../store/useUserCenterStore'
import { useAccessData, useDirectoryStats } from '../lib/useAccessModel'
import { displayName, faNum, fmtDateTime, relTime } from '../lib/format'
import { USER_TYPES, USER_TYPE_LABEL, type UcUser, type UserType } from '../types'
import { Avatar, Badge, EmptyState, Segmented, StatusBadge, TypeBadge } from '../components/ui'
import { StatusDialog } from '../components/StatusDialog'
import type { ProfileTab } from './UserProfilePage'

export type Quick = 'all' | 'active' | 'inactive' | 'admin' | 'noproject' | 'never'
export type SortKey = 'name' | 'status' | 'projects' | 'lastSignIn' | 'created'
export interface ListState {
  quick: Quick
  query: string
  type: UserType | ''
  roleId: string
  org: string
  sort: SortKey
  dir: 'asc' | 'desc'
  page: number
  showFilters: boolean
}
export const INITIAL_LIST_STATE: ListState = { quick: 'all', query: '', type: '', roleId: '', org: '', sort: 'name', dir: 'asc', page: 0, showFilters: false }

const PAGE_SIZE = 12

export function UserListPage({
  state,
  setState,
  onOpen,
  onCreate,
}: {
  state: ListState
  setState: (patch: Partial<ListState>) => void
  onOpen: (id: string, tab?: ProfileTab, edit?: boolean) => void
  onCreate: () => void
}) {
  const users = useUserCenterStore((s) => s.users)
  const loading = useUserCenterStore((s) => s.loading)
  const loaded = useUserCenterStore((s) => s.loaded)
  const authInfoAvailable = useUserCenterStore((s) => s.authInfoAvailable)
  const load = useUserCenterStore((s) => s.load)
  const { roles, userRoles } = useAccessData()
  const stats = useDirectoryStats(useMemo(() => users.map((u) => u.id), [users]))
  const [statusFor, setStatusFor] = useState<UcUser | null>(null)
  const myId = useAuthStore((s) => s.profile?.id)

  const counts = useMemo(
    () => ({
      all: users.length,
      active: users.filter((u) => u.accountStatus === 'active').length,
      inactive: users.filter((u) => u.accountStatus !== 'active').length,
      admin: users.filter((u) => u.isAdmin).length,
      noproject: users.filter((u) => (stats.get(u.id)?.projects ?? 0) === 0 && !u.isAdmin).length,
      never: users.filter((u) => !u.lastSignInAt).length,
    }),
    [users, stats],
  )
  const orgs = useMemo(() => [...new Set(users.map((u) => u.organization.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fa')), [users])

  const filtered = useMemo(() => {
    const q = state.query.trim().toLowerCase()
    const list = users.filter((u) => {
      if (state.quick === 'active' && u.accountStatus !== 'active') return false
      if (state.quick === 'inactive' && u.accountStatus === 'active') return false
      if (state.quick === 'admin' && !u.isAdmin) return false
      if (state.quick === 'noproject' && ((stats.get(u.id)?.projects ?? 0) > 0 || u.isAdmin)) return false
      if (state.quick === 'never' && u.lastSignInAt) return false
      if (state.type && u.userType !== state.type) return false
      if (state.org && u.organization.trim() !== state.org) return false
      if (state.roleId && !(userRoles[u.id] ?? []).includes(state.roleId)) return false
      if (q && ![u.fullName, u.email, u.phone, u.organization, u.positionTitle].some((v) => v.toLowerCase().includes(q))) return false
      return true
    })
    const dir = state.dir === 'asc' ? 1 : -1
    const val = (u: UcUser): string | number => {
      switch (state.sort) {
        case 'status': return u.accountStatus
        case 'projects': return stats.get(u.id)?.projects ?? 0
        case 'lastSignIn': return u.lastSignInAt ? new Date(u.lastSignInAt).getTime() : 0
        case 'created': return new Date(u.createdAt).getTime()
        default: return displayName(u)
      }
    }
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b)
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'fa')) * dir
    })
  }, [users, stats, userRoles, state])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const page = Math.min(state.page, pages - 1)
  const shown = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  const activeFilters = [state.type, state.org, state.roleId].filter(Boolean).length

  const sortBy = (key: SortKey) => setState(state.sort === key ? { dir: state.dir === 'asc' ? 'desc' : 'asc', page: 0 } : { sort: key, dir: key === 'name' || key === 'status' ? 'asc' : 'desc', page: 0 })
  const Th = ({ k, children }: { k: SortKey; children: string }) => (
    <th aria-sort={state.sort === k ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => sortBy(k)}>
        {children} <ArrowDownUp size={11} style={{ opacity: state.sort === k ? 1 : 0.35, color: state.sort === k ? 'var(--uc-accent)' : undefined }} />
      </button>
    </th>
  )

  const kpis: { key: Quick; label: string; value: number; sub: string }[] = [
    { key: 'all', label: 'همهٔ کاربران', value: counts.all, sub: 'در سامانه ثبت شده‌اند' },
    { key: 'active', label: 'حساب فعال', value: counts.active, sub: `${faNum(counts.all ? Math.round((counts.active / counts.all) * 100) : 0)}٪ از کل` },
    { key: 'inactive', label: 'غیرفعال یا مسدود', value: counts.inactive, sub: 'ورود بسته است' },
    { key: 'admin', label: 'مدیر سیستم', value: counts.admin, sub: 'دسترسی کامل' },
    { key: 'noproject', label: 'بدون دسترسی پروژه', value: counts.noproject, sub: 'نیازمند تعیین پروژه' },
    ...(authInfoAvailable ? [{ key: 'never' as Quick, label: 'هرگز وارد نشده', value: counts.never, sub: 'دعوت‌شده یا بی‌استفاده' }] : []),
  ]

  const RowActions = ({ u }: { u: UcUser }) => (
    <div className="uc-row-actions" onClick={(e) => e.stopPropagation()}>
      <button className="uc-btn uc-btn-ghost uc-btn-icon" title="مشاهده پروفایل" aria-label={`مشاهده ${displayName(u)}`} onClick={() => onOpen(u.id)}><Eye size={15} /></button>
      <button className="uc-btn uc-btn-ghost uc-btn-icon" title="ویرایش اطلاعات" aria-label={`ویرایش ${displayName(u)}`} onClick={() => onOpen(u.id, 'info', true)}><Pencil size={15} /></button>
      <button className="uc-btn uc-btn-ghost uc-btn-icon" title="مدیریت دسترسی" aria-label={`مدیریت دسترسی ${displayName(u)}`} onClick={() => onOpen(u.id, 'access')}><KeyRound size={15} /></button>
      <button className="uc-btn uc-btn-ghost uc-btn-icon" title={u.accountStatus === 'active' ? 'غیرفعال‌سازی' : 'فعال‌سازی / تغییر وضعیت'} aria-label={`تغییر وضعیت ${displayName(u)}`} onClick={() => setStatusFor(u)} style={{ color: u.accountStatus === 'active' ? 'var(--uc-warn)' : 'var(--uc-ok)' }}><Power size={15} /></button>
    </div>
  )

  return (
    <div className="uc-rise mx-auto flex w-full max-w-[1280px] flex-col gap-5">
      {/* ------------------------------------------------------------------ title */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="uc-eyebrow mb-1">User 360° Management Center</p>
          <h1 className="text-[22px] font-bold leading-9">مرکز مدیریت کاربران</h1>
          <p className="uc-eyebrow mt-0.5 leading-6">چرخهٔ کامل کاربر — از ساخت حساب تا نقش، پروژه، دسترسی و غیرفعال‌سازی — در یک‌جا.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="uc-btn uc-btn-icon" onClick={() => load()} disabled={loading} title="بروزرسانی" aria-label="بروزرسانی"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
          <button className="uc-btn uc-btn-primary" onClick={onCreate}><UserPlus size={15} /> افزودن کاربر</button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ KPI strip = quick filters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <button key={k.key} className="uc-kpi" aria-pressed={state.quick === k.key} onClick={() => setState({ quick: state.quick === k.key && k.key !== 'all' ? 'all' : k.key, page: 0 })}>
            <span className="uc-kpi-label">{k.label}</span>
            <span className="uc-kpi-value">{faNum(k.value)}</span>
            <span className="uc-kpi-sub">{k.sub}</span>
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------------ toolbar */}
      <div className="uc-card">
        <div className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search size={15} className="pointer-events-none absolute top-1/2 -translate-y-1/2" style={{ insetInlineStart: 12, color: 'var(--uc-muted)' }} />
            <input className="uc-input" style={{ paddingInlineStart: 36 }} value={state.query} onChange={(e) => setState({ query: e.target.value, page: 0 })} placeholder="جستجو: نام، ایمیل، موبایل، سمت یا شرکت…" aria-label="جستجوی کاربران" />
          </div>
          <Segmented<Quick>
            label="وضعیت"
            value={state.quick === 'active' || state.quick === 'inactive' ? state.quick : 'all'}
            onChange={(v) => setState({ quick: v, page: 0 })}
            options={[{ value: 'all', label: 'همه' }, { value: 'active', label: 'فعال' }, { value: 'inactive', label: 'غیرفعال / مسدود' }]}
          />
          <button className="uc-btn" aria-expanded={state.showFilters} onClick={() => setState({ showFilters: !state.showFilters })}>
            <SlidersHorizontal size={14} /> فیلتر پیشرفته {activeFilters > 0 && <Badge tone="accent">{faNum(activeFilters)}</Badge>}
          </button>
        </div>
        {state.showFilters && (
          <div className="uc-rise grid gap-3 border-t p-3 sm:grid-cols-3" style={{ borderColor: 'var(--uc-line)' }}>
            <label><span className="uc-label">نوع کاربر</span>
              <select className="uc-select" value={state.type} onChange={(e) => setState({ type: e.target.value as UserType | '', page: 0 })}>
                <option value="">همه</option>{USER_TYPES.map((t) => <option key={t} value={t}>{USER_TYPE_LABEL[t]}</option>)}
              </select></label>
            <label><span className="uc-label">نقش سازمانی</span>
              <select className="uc-select" value={state.roleId} onChange={(e) => setState({ roleId: e.target.value, page: 0 })}>
                <option value="">همه</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select></label>
            <label><span className="uc-label">شرکت / سازمان</span>
              <select className="uc-select" value={state.org} onChange={(e) => setState({ org: e.target.value, page: 0 })}>
                <option value="">همه</option>{orgs.map((o) => <option key={o} value={o}>{o}</option>)}
              </select></label>
            {activeFilters > 0 && <div className="sm:col-span-3"><button className="uc-btn uc-btn-ghost uc-btn-sm" onClick={() => setState({ type: '', roleId: '', org: '', page: 0 })}><X size={13} /> پاک‌کردن فیلترها</button></div>}
          </div>
        )}

        {/* ---------------------------------------------------------------- desktop table */}
        {!loaded && loading ? (
          <div className="flex flex-col gap-2 p-4">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="uc-skeleton h-12" />)}</div>
        ) : shown.length === 0 ? (
          <EmptyState icon={<Users size={20} />} title="کاربری با این فیلتر پیدا نشد" text="عبارت جستجو یا فیلترها را تغییر دهید." action={<button className="uc-btn uc-btn-sm" onClick={() => setState({ ...INITIAL_LIST_STATE })}>حذف همهٔ فیلترها</button>} />
        ) : (
          <>
            <div className="hidden overflow-x-auto border-t lg:block" style={{ borderColor: 'var(--uc-line)' }}>
              <table className="uc-table">
                <thead>
                  <tr>
                    <Th k="name">کاربر</Th>
                    <th>سمت / شرکت</th>
                    <th>موبایل</th>
                    <th>نقش / نوع</th>
                    <Th k="status">وضعیت</Th>
                    <Th k="projects">پروژه‌ها</Th>
                    <Th k="lastSignIn">آخرین ورود</Th>
                    <th style={{ width: 150 }} aria-label="عملیات" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((u) => {
                    const st = stats.get(u.id)
                    return (
                      <tr key={u.id} onClick={() => onOpen(u.id)}>
                        <td>
                          <div className="flex items-center gap-3">
                            <Avatar user={u} size={36} />
                            <div className="min-w-0">
                              <button className="block max-w-[210px] truncate text-right text-[13px] font-bold" style={{ background: 'none', border: 0, color: 'inherit', padding: 0, font: 'inherit', fontWeight: 700, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onOpen(u.id) }}>{displayName(u)}{u.id === myId && <span className="uc-eyebrow"> (شما)</span>}</button>
                              <span className="uc-eyebrow block max-w-[210px] truncate" dir="ltr" style={{ textAlign: 'right' }}>{u.email}</span>
                            </div>
                          </div>
                        </td>
                        <td><span className="block max-w-[190px] truncate">{u.positionTitle || '—'}</span><span className="uc-eyebrow block max-w-[190px] truncate">{u.organization || '—'}</span></td>
                        <td dir="ltr" className="uc-num" style={{ textAlign: 'right' }}>{u.phone || '—'}</td>
                        <td><div className="flex flex-wrap items-center gap-1.5">{u.isAdmin ? <Badge tone="warn"><ShieldCheck size={11} /> مدیر سیستم</Badge> : <TypeBadge type={u.userType} />}{(st?.roleCount ?? 0) > 0 && <Badge title="تعداد نقش‌های سازمانی">{faNum(st!.roleCount)} نقش</Badge>}</div></td>
                        <td><StatusBadge status={u.accountStatus} /></td>
                        <td className="uc-num">{u.isAdmin ? <Badge tone="warn" title="دسترسی کامل">همه</Badge> : (st?.projects ?? 0) === 0 ? <span style={{ color: 'var(--uc-muted)' }}>—</span> : <b>{faNum(st!.projects)}</b>}</td>
                        <td title={fmtDateTime(u.lastSignInAt)} style={{ color: u.lastSignInAt ? undefined : 'var(--uc-muted)' }}>{authInfoAvailable ? relTime(u.lastSignInAt) : '—'}</td>
                        <td><RowActions u={u} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* -------------------------------------------------------------- mobile cards */}
            <ul className="divide-y border-t lg:hidden" style={{ borderColor: 'var(--uc-line)' }}>
              {shown.map((u) => {
                const st = stats.get(u.id)
                return (
                  <li key={u.id} className="flex flex-col gap-2.5 p-4" onClick={() => onOpen(u.id)} style={{ cursor: 'pointer' }}>
                    <div className="flex items-center gap-3">
                      <Avatar user={u} size={42} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-bold">{displayName(u)}{u.id === myId && <span className="uc-eyebrow"> (شما)</span>}</p>
                        <p className="uc-eyebrow truncate">{[u.positionTitle, u.organization].filter(Boolean).join(' · ') || u.email}</p>
                      </div>
                      <StatusBadge status={u.accountStatus} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {u.isAdmin ? <Badge tone="warn"><ShieldCheck size={11} /> مدیر سیستم</Badge> : <TypeBadge type={u.userType} />}
                      <Badge>{u.isAdmin ? 'همهٔ پروژه‌ها' : `${faNum(st?.projects ?? 0)} پروژه`}</Badge>
                      {authInfoAvailable && <span className="uc-eyebrow">آخرین ورود: {relTime(u.lastSignInAt)}</span>}
                    </div>
                    <RowActions u={u} />
                  </li>
                )
              })}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3" style={{ borderColor: 'var(--uc-line)' }}>
              <p className="uc-eyebrow">{faNum(filtered.length)} کاربر{filtered.length !== users.length && ` از ${faNum(users.length)}`}</p>
              {pages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button className="uc-btn uc-btn-icon uc-btn-sm" disabled={page === 0} onClick={() => setState({ page: page - 1 })} aria-label="صفحهٔ قبل"><ChevronRight size={15} /></button>
                  <span className="uc-eyebrow uc-num px-2">{faNum(page + 1)} / {faNum(pages)}</span>
                  <button className="uc-btn uc-btn-icon uc-btn-sm" disabled={page >= pages - 1} onClick={() => setState({ page: page + 1 })} aria-label="صفحهٔ بعد"><ChevronLeft size={15} /></button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {statusFor && <StatusDialog user={statusFor} onClose={() => setStatusFor(null)} />}
    </div>
  )
}
