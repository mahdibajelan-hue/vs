import { useMemo, useState, type CSSProperties } from 'react'
import { ArrowDownUp, ChevronLeft, ChevronRight, Eye, FolderX, KeyRound, LogIn, Pencil, Power, PowerOff, RefreshCw, Search, ShieldCheck, Sparkles, SlidersHorizontal, UserCheck, UserPlus, Users, X, FolderKanban } from 'lucide-react'
import { useAuthStore } from '../../../store/useAuthStore'
import { useUserCenterStore } from '../store/useUserCenterStore'
import { useAccessData, useDirectoryStats } from '../lib/useAccessModel'
import { displayName, faNum, fmtDateTime, relTime } from '../lib/format'
import { USER_TYPES, USER_TYPE_LABEL, type UcUser, type UserType } from '../types'
import { Avatar, Badge, EmptyState, Segmented, StatusBadge, TypeBadge } from '../components/ui'
import { StatusDialog } from '../components/StatusDialog'
import { KpiCard } from '../components/KpiCard'
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

  const kpis: { key: Quick; label: string; value: number; sub: string; icon: typeof Users; color: string }[] = [
    { key: 'all', label: 'همهٔ کاربران', value: counts.all, sub: 'در سامانه ثبت شده‌اند', icon: Users, color: '#1d4ed8' },
    { key: 'active', label: 'حساب فعال', value: counts.active, sub: `${faNum(counts.all ? Math.round((counts.active / counts.all) * 100) : 0)}٪ از کل`, icon: UserCheck, color: '#15803d' },
    { key: 'inactive', label: 'غیرفعال یا مسدود', value: counts.inactive, sub: 'ورود بسته است', icon: PowerOff, color: '#b91c1c' },
    { key: 'admin', label: 'مدیر سیستم', value: counts.admin, sub: 'دسترسی کامل', icon: ShieldCheck, color: '#b45309' },
    { key: 'noproject', label: 'بدون دسترسی پروژه', value: counts.noproject, sub: 'نیازمند تعیین پروژه', icon: FolderX, color: '#0369a1' },
    ...(authInfoAvailable ? [{ key: 'never' as Quick, label: 'هرگز وارد نشده', value: counts.never, sub: 'دعوت‌شده یا بی‌استفاده', icon: LogIn, color: '#4338ca' }] : []),
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
      {/* ------------------------------------------------------------------ hero */}
      <section className="uc-hero">
        <i className="uc-orb" style={{ width: 220, height: 220, insetInlineStart: -60, top: -90, background: '#7fb0ff' }} />
        <i className="uc-orb" style={{ width: 160, height: 160, insetInlineEnd: '28%', bottom: -80, background: '#4d7fff' }} />
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0" style={{ maxWidth: 520 }}>
            <p className="mb-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold" style={{ background: 'rgba(255,255,255,.2)' }}><Sparkles size={12} aria-hidden /> User 360° Management Center</p>
            <h1 className="m-0 text-[26px] font-extrabold leading-[1.5]">مرکز مدیریت کاربران</h1>
            <p className="uc-hero-sub m-0 mt-1 text-[13px] leading-7">از ساخت حساب تا نقش، پروژه، دسترسی و غیرفعال‌سازی، همه‌چیز دربارهٔ آدم‌های سامانه در یک نگاه.</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button className="uc-btn uc-btn-primary" onClick={onCreate}><UserPlus size={15} /> افزودن کاربر</button>
              <button className="uc-btn uc-btn-icon" onClick={() => load()} disabled={loading} title="بروزرسانی" aria-label="بروزرسانی"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
            </div>
          </div>
          <div className="relative hidden h-[150px] w-[300px] sm:block" aria-hidden>
            <span className="uc-bubble" style={{ insetInlineEnd: 6, top: 4 }}><ShieldCheck size={21} /></span>
            <span className="uc-bubble" style={{ insetInlineStart: 8, top: 30, animationDelay: '-1.8s' }}><KeyRound size={21} /></span>
            <span className="uc-bubble" style={{ insetInlineEnd: 70, bottom: 0, animationDelay: '-3.2s' }}><FolderKanban size={21} /></span>
            <div className="uc-stack absolute" style={{ insetInlineStart: 60, top: 50 }}>
              {users.slice(0, 5).map((u) => <Avatar key={u.id} user={u} size={52} />)}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ KPI strip = quick filters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k, i) => (
          <KpiCard key={k.key} index={i} icon={k.icon} color={k.color} label={k.label} value={k.value} sub={k.sub} pressed={state.quick === k.key} onClick={() => setState({ quick: state.quick === k.key && k.key !== 'all' ? 'all' : k.key, page: 0 })} />
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
                  {shown.map((u, i) => {
                    const st = stats.get(u.id)
                    return (
                      <tr key={u.id} style={{ '--i': i } as CSSProperties} onClick={() => onOpen(u.id)}>
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
              {shown.map((u, i) => {
                const st = stats.get(u.id)
                return (
                  <li key={u.id} style={{ '--i': i, cursor: 'pointer' } as CSSProperties} className="uc-list-item flex flex-col gap-2.5 p-4" onClick={() => onOpen(u.id)}>
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
