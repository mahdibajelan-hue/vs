import { useMemo, useState } from 'react'
import { Building2, FolderTree, Globe2, Layers, Plus, Search, Trash2, UserCheck, Users } from 'lucide-react'
import { useAccessStore } from '../../masterdata/store/useAccessStore'
import { SCOPE_LEVEL_LABEL_FA } from '../../masterdata/rbacTypes'
import { useUserCenterStore } from '../store/useUserCenterStore'
import { useAccessData, useUserAccess } from '../lib/useAccessModel'
import { useAccessActions } from '../lib/useAccessActions'
import { DEFAULT_PROJECT_ROLE, isMember, rowHasAccess, type ProjectRow } from '../lib/access'
import { PRODUCT_ROLES, roleLabel } from '../lib/productRoles'
import { TEAM_POSITION_LABEL } from '../../masterdata/types'
import { faNum, toggled } from '../lib/format'
import { PRODUCTS, PRODUCT_LABEL, type ProductKey, type UcUser } from '../types'
import { Badge, ConfirmDialog, EmptyState, Popover, Section, Segmented, Switch, useToast } from '../components/ui'

type Filter = 'all' | 'has' | 'none'

export function ProjectsTab({ user }: { user: UcUser }) {
  const setMemberships = useUserCenterStore((s) => s.setMemberships)
  const removeMemberships = useUserCenterStore((s) => s.removeMemberships)
  const joinProjects = useUserCenterStore((s) => s.joinProjects)
  const leaveProjects = useUserCenterStore((s) => s.leaveProjects)
  const { rows, scopes, accessibleProjects, blockedModules } = useUserAccess(user.id)
  const { portfolios, programs, masterProjects, team, modules } = useAccessData()
  const projectRoles = useAccessStore((s) => s.projectRoles)
  const assignments = useAccessStore((s) => s.projectRoleAssignments)
  const actions = useAccessActions(user.id)
  const notify = useToast()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const defaultRoleId = projectRoles.find((r) => r.name === DEFAULT_PROJECT_ROLE[user.userType])?.id ?? projectRoles[0]?.id ?? ''
  const [bulkRole, setBulkRole] = useState('')
  const roleId = bulkRole || defaultRoleId
  const [busy, setBusy] = useState(false)
  const [showLegacy, setShowLegacy] = useState(false)
  const [confirm, setConfirm] = useState<null | { title: string; description: string; run: () => Promise<void> }>(null)

  const allScope = scopes.find((s) => s.scopeLevel === 'all')
  const otherScopes = scopes.filter((s) => s.scopeLevel !== 'all')
  const nameOfScope = (s: (typeof scopes)[number]) =>
    s.scopeLevel === 'portfolio' ? portfolios.find((p) => p.id === s.portfolioId)?.name : s.scopeLevel === 'program' ? programs.find((p) => p.id === s.programId)?.name : masterProjects.find((p) => p.id === s.projectId)?.shortName || masterProjects.find((p) => p.id === s.projectId)?.officialName

  const projectRows = rows.filter((r) => r.masterId)
  const legacyRows = rows.filter((r) => !r.masterId)
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return projectRows.filter((r) => {
      if (filter === 'has' && !rowHasAccess(r)) return false
      if (filter === 'none' && rowHasAccess(r)) return false
      return !q || [r.label, r.fullName, r.code].some((v) => v.toLowerCase().includes(q))
    })
  }, [projectRows, filter, query])
  const members = projectRows.filter(isMember).length
  // the modules this person may open: what joining a project gives them
  const openModules = user.isAdmin ? null : modules.filter((m) => m.isActive && !blockedModules.has(m.key)).length

  const toggleRow = (key: string) => setPicked((s) => toggled(s, key))
  const pickedIds = projectRows.filter((r) => picked.has(r.key)).map((r) => r.masterId!)
  const allVisiblePicked = visible.length > 0 && visible.every((r) => picked.has(r.key))
  const roleName = (id: string) => projectRoles.find((r) => r.id === id)?.name ?? '—'

  const join = async (ids: string[], rid: string) => {
    if (!rid) return notify('ابتدا در داده‌های پایه سمت‌های پروژه را تعریف کنید', 'warn')
    setBusy(true)
    const res = await joinProjects(user, ids, rid)
    setBusy(false)
    if (!res.ok) return notify(res.error ?? 'ثبت نشد', 'bad')
    notify(res.warning ?? `${user.fullName || user.email} با سمت «${roleName(rid)}» به ${faNum(ids.length)} پروژه افزوده شد`, res.warning ? 'warn' : 'ok')
    setPicked(new Set())
  }
  const leave = (ids: string[], label: string) =>
    setConfirm({
      title: 'حذف از پروژه',
      description: `${user.fullName || user.email} از ${label} خارج می‌شود: سمت‌های پروژه، جایگاه در «ساختار و تیم» داده‌های پایه و عضویت در PipePulse / ریسک / مسائلِ همان پروژه حذف می‌شود. دسترسی‌ای که از «محدودهٔ دسترسی» (همه / پورتفولیو / طرح) می‌آید تغییری نمی‌کند.`,
      run: async () => {
        const res = await leaveProjects(user, ids)
        notify(res.ok ? 'کاربر از پروژه خارج شد' : (res.error ?? 'انجام نشد'), res.ok ? 'ok' : 'bad')
        setPicked(new Set())
      },
    })

  const Cell = ({ row, product }: { row: ProjectRow; product: ProductKey }) => {
    const cell = row.cells[product]
    if (!cell.sourceId) return null
    const m = cell.membership
    return (
      <Popover
        label={`دسترسی ${PRODUCT_LABEL[product]}`}
        align="start"
        trigger={({ toggle }) => (
          <button className="uc-chip" style={{ cursor: 'pointer', opacity: m ? 1 : 0.65 }} onClick={toggle} title={m ? 'نقش در این محصول — برای تغییر کلیک کنید' : 'بدون عضویت در این محصول'}>
            <span style={{ color: m ? 'var(--uc-direct)' : 'var(--uc-line-2)' }}>●</span> {PRODUCT_LABEL[product]}{m ? `: ${roleLabel(product, m.role)}` : ''}
          </button>
        )}
      >
        {(close) => (
          <>
            <p className="uc-eyebrow px-2.5 pb-1.5 pt-1">نقش در {PRODUCT_LABEL[product]}</p>
            {PRODUCT_ROLES[product].map((o) => (
              <button key={o.value} className="uc-pop-item" onClick={async () => { close(); const res = await setMemberships(user.id, product, [cell.sourceId!], o.value); notify(res.ok ? `نقش «${o.label}» ثبت شد` : (res.error ?? 'ثبت نشد'), res.ok ? 'ok' : 'bad') }}>
                <span style={{ width: 14, color: 'var(--uc-accent)' }}>{m?.role === o.value ? '✓' : ''}</span> {o.label}
              </button>
            ))}
            {m && (<><hr className="uc-hair my-1" /><button className="uc-pop-item is-danger" onClick={async () => { close(); const res = await removeMemberships(user.id, product, [cell.sourceId!]); notify(res.ok ? 'عضویت حذف شد' : (res.error ?? 'حذف نشد'), res.ok ? 'ok' : 'bad') }}><Trash2 size={14} /> حذف عضویت</button></>)}
          </>
        )}
      </Popover>
    )
  }

  const RolePicker = ({ onPick, label, icon }: { onPick: (id: string) => void; label: string; icon: React.ReactNode }) => (
    <Popover label={label} align="start" trigger={({ toggle }) => <button className="uc-btn uc-btn-sm" onClick={toggle} disabled={busy}>{icon} {label}</button>}>
      {(close) => <div className="max-h-72 overflow-y-auto"><p className="uc-eyebrow px-2.5 pb-1.5 pt-1">سمت در پروژه</p>{projectRoles.map((r) => <button key={r.id} className="uc-pop-item" onClick={() => { close(); onPick(r.id) }}><UserCheck size={14} /> {r.name}{r.id === defaultRoleId ? <span className="uc-eyebrow"> — پیشنهادی</span> : null}</button>)}</div>}
    </Popover>
  )

  const RowView = (r: ProjectRow) => {
    const member = isMember(r)
    const has = rowHasAccess(r)
    const mine = assignments.filter((a) => a.userId === user.id && a.projectId === r.masterId)
    const place = team.find((t) => t.userId === user.id && t.projectId === r.masterId)
    const legacy = PRODUCTS.filter((p) => r.cells[p].sourceId && (member || r.cells[p].membership))
    return (
      <li key={r.key} className={`uc-prow${has ? '' : ' is-dim'}`}>
        <input type="checkbox" checked={picked.has(r.key)} onChange={() => toggleRow(r.key)} aria-label={`انتخاب ${r.label}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <b className="truncate text-[13px]" title={r.fullName}>{r.label}</b>
            {r.code && <span className="uc-eyebrow" dir="ltr">{r.code}</span>}
            {member ? <Badge tone="ok">عضو پروژه</Badge> : r.inheritedBy.length ? <Badge tone="info">از محدودهٔ دسترسی</Badge> : has ? <Badge tone="info">از عضویت محصول</Badge> : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {mine.map((a) => (
              <span key={a.id} className="uc-chip" style={{ paddingInlineStart: 8 }}><UserCheck size={12} /> {roleName(a.projectRoleId)}<button aria-label={`حذف سمت ${roleName(a.projectRoleId)}`} onClick={() => actions.removeProjectRole(a.id)}>×</button></span>
            ))}
            {place && <span className="uc-chip" title="جایگاه در «ساختار و تیم» داده‌های پایه"><Users size={12} /> تیم پروژه: {place.positionTitle || TEAM_POSITION_LABEL[place.positionKey] || place.positionKey}</span>}
            {member && !place && <span className="uc-eyebrow">در «ساختار و تیم» داده‌های پایه ثبت نشده</span>}
            {legacy.map((p) => <Cell key={p} row={r} product={p} />)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {member ? (
            <>
              <RolePicker label="سمت دیگر" icon={<Plus size={13} />} onPick={(id) => join([r.masterId!], id)} />
              {!place && <button className="uc-btn uc-btn-sm" disabled={busy} onClick={() => join([r.masterId!], mine[0]?.projectRoleId ?? roleId)}><Users size={13} /> افزودن به تیم</button>}
              <button className="uc-btn uc-btn-ghost uc-btn-icon uc-btn-sm" aria-label={`حذف از ${r.label}`} onClick={() => leave([r.masterId!], `«${r.label}»`)}><Trash2 size={14} /></button>
            </>
          ) : (
            <RolePicker label="افزودن به پروژه" icon={<Plus size={13} />} onPick={(id) => join([r.masterId!], id)} />
          )}
        </div>
      </li>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ------------------------------------------------------------------ the user's projects */}
      <section className="uc-card overflow-hidden">
        <header className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="min-w-0" style={{ maxWidth: 620 }}>
            <h3 className="uc-section-title">پروژه‌های کاربر</h3>
            <p className="uc-eyebrow mt-0.5 leading-6">
              کاربر را با یک سمت به پروژه اضافه کنید؛ همان پروژه در همهٔ ماژول‌هایی که برایش باز است{openModules != null ? ` (${faNum(openModules)} ماژول)` : ''} نمایش داده می‌شود و نام او در «ساختار و تیم» همان پروژه در داده‌های پایه ثبت می‌شود. انتخاب ماژول لازم نیست.
            </p>
            <p className="mt-1 text-[12px]"><b>{faNum(members)}</b> پروژهٔ عضو · <b>{faNum(accessibleProjects)}</b> پروژه در دسترس از {faNum(projectRows.length)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute top-1/2 -translate-y-1/2" style={{ insetInlineStart: 11, color: 'var(--uc-muted)' }} />
              <input className="uc-input" style={{ paddingInlineStart: 32, minHeight: 34, width: 180 }} placeholder="جستجوی پروژه…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="جستجوی پروژه" />
            </div>
            <Segmented<Filter> label="نمایش" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'همه' }, { value: 'has', label: 'در دسترس' }, { value: 'none', label: 'بدون دسترسی' }]} />
          </div>
        </header>

        {picked.size > 0 && (
          <div className="uc-rise flex flex-wrap items-center gap-2 border-y px-4 py-2.5" style={{ borderColor: 'var(--uc-line)', background: 'var(--uc-accent-soft)' }}>
            <b className="text-[12.5px]">{faNum(picked.size)} پروژه انتخاب شد</b>
            <span className="uc-eyebrow">افزودن با سمت</span>
            <select className="uc-select" style={{ width: 'auto', minHeight: 32 }} value={roleId} onChange={(e) => setBulkRole(e.target.value)} aria-label="سمت در پروژه">
              {projectRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <button className="uc-btn uc-btn-primary uc-btn-sm" disabled={busy} onClick={() => join(pickedIds, roleId)}><Plus size={13} /> {busy ? 'در حال ثبت…' : 'افزودن به پروژه‌ها'}</button>
            <button className="uc-btn uc-btn-danger uc-btn-sm" disabled={busy} onClick={() => leave(pickedIds, `${faNum(pickedIds.length)} پروژهٔ انتخاب‌شده`)}><Trash2 size={13} /> حذف از پروژه‌ها</button>
            <button className="uc-btn uc-btn-ghost uc-btn-sm" onClick={() => setPicked(new Set())}>لغو انتخاب</button>
          </div>
        )}

        {visible.length === 0 ? (
          <EmptyState icon={<Layers size={20} />} title="پروژه‌ای پیدا نشد" text="عبارت جستجو یا فیلتر را تغییر دهید." />
        ) : (
          <>
            <div className="flex items-center gap-2 border-b px-4 py-2" style={{ borderColor: 'var(--uc-line)' }}>
              <input type="checkbox" checked={allVisiblePicked} onChange={() => setPicked(allVisiblePicked ? new Set() : new Set(visible.map((r) => r.key)))} aria-label="انتخاب همه" />
              <span className="uc-eyebrow">انتخاب همهٔ پروژه‌های فهرست</span>
            </div>
            <ul className="uc-plist">{visible.map(RowView)}</ul>
          </>
        )}
        <footer className="uc-legend border-t px-4 py-3" style={{ borderColor: 'var(--uc-line)' }}>
          <span><Badge tone="ok">عضو پروژه</Badge> سمت در پروژه یا جایگاه در تیم دارد</span>
          <span><Badge tone="info">از محدودهٔ دسترسی</Badge> از «همه / پورتفولیو / طرح» پایین</span>
          <span><span className="uc-chip" style={{ padding: '1px 8px' }}>● PipePulse</span> نقش جداگانهٔ محصولات قدیمی؛ هنگام افزودن خودکار ثبت می‌شود</span>
        </footer>
      </section>

      {/* ------------------------------------------------------------------ scope */}
      <Section title="محدودهٔ دسترسی گسترده" hint="برای مدیران و ناظرانی که باید همهٔ پروژه‌ها یا همهٔ پروژه‌های یک پورتفولیو یا طرح را ببینند (بدون عضویت تک‌به‌تک). پروژه‌های آینده‌ی همان محدوده هم خودکار دیده می‌شوند.">
        <div className="flex max-w-[560px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: 'var(--uc-accent-soft)', color: 'var(--uc-accent)' }}><Globe2 size={17} /></span>
            <div>
              <p className="text-[13px] font-bold">{user.isAdmin ? 'دسترسی به همهٔ پروژه‌ها (مدیر سیستم)' : 'دسترسی به همهٔ پروژه‌ها'}</p>
              <p className="uc-eyebrow">{user.isAdmin ? 'مدیر سیستم همهٔ پروژه‌ها را می‌بیند.' : allScope ? 'فعال — کاربر هر پروژهٔ موجود و آینده را می‌بیند.' : 'غیرفعال — فقط پروژه‌هایی که عضو آن‌هاست'}</p>
            </div>
          </div>
          <Switch checked={user.isAdmin || !!allScope} disabled={user.isAdmin} label="دسترسی به همهٔ پروژه‌ها" onChange={(on) => {
            if (on) setConfirm({ title: 'دسترسی به همهٔ پروژه‌ها', description: 'کاربر همهٔ پروژه‌های موجود و پروژه‌هایی که بعداً ساخته می‌شود را خواهد دید. ادامه می‌دهید؟', run: () => actions.addScope({ scopeLevel: 'all' }) })
            else if (allScope) actions.removeScope(allScope.id)
          }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {otherScopes.map((s) => (
            <span key={s.id} className="uc-chip" style={{ paddingInlineStart: 10 }}>
              {s.scopeLevel === 'portfolio' ? <Layers size={12} /> : s.scopeLevel === 'program' ? <FolderTree size={12} /> : <Building2 size={12} />}
              <span className="uc-eyebrow">{SCOPE_LEVEL_LABEL_FA[s.scopeLevel]}:</span> {nameOfScope(s) ?? '—'}
              <button aria-label="حذف محدوده" onClick={() => setConfirm({ title: 'حذف محدودهٔ دسترسی', description: `دسترسی کاربر از «${nameOfScope(s) ?? ''}» برداشته می‌شود.`, run: () => actions.removeScope(s.id) })}>×</button>
            </span>
          ))}
          <ScopeAdder onAdd={actions.addScope} />
        </div>
      </Section>

      {legacyRows.length > 0 && (
        <section className="uc-card overflow-hidden">
          <button className="flex w-full items-center justify-between gap-3 p-4 text-right" onClick={() => setShowLegacy((v) => !v)} aria-expanded={showLegacy}>
            <span><span className="uc-section-title">پروژه‌های محصولات قدیمی بدون پروژهٔ متناظر ({faNum(legacyRows.length)})</span><span className="uc-eyebrow mt-0.5 block">پروژه‌هایی از PipePulse، ریسک یا مسائل که هنوز به پروژه‌ای در داده‌های پایه نگاشت نشده‌اند؛ پس از نگاشت در «داده‌های پایه ← نگاشت پروژه‌ها» به فهرست بالا می‌آیند.</span></span>
            <span className="uc-eyebrow">{showLegacy ? 'بستن' : 'نمایش'}</span>
          </button>
          {showLegacy && <ul className="uc-plist">{legacyRows.map((r) => (
            <li key={r.key} className="uc-prow"><div className="min-w-0 flex-1"><b className="text-[13px]">{r.label}</b><div className="mt-1.5 flex flex-wrap gap-1.5">{PRODUCTS.map((p) => <Cell key={p} row={r} product={p} />)}</div></div></li>
          ))}</ul>}
        </section>
      )}

      {confirm && (
        <ConfirmDialog
          tone={confirm.title.startsWith('حذف') ? 'danger' : 'warn'}
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.title.startsWith('حذف') ? 'حذف' : 'تأیید'}
          onConfirm={async () => { await confirm.run(); setConfirm(null) }}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  )
}

function ScopeAdder({ onAdd }: { onAdd: (scope: { scopeLevel: 'portfolio' | 'program' | 'project'; portfolioId?: string | null; programId?: string | null; projectId?: string | null }) => Promise<void> }) {
  const { portfolios, programs, masterProjects } = useAccessData()
  const [level, setLevel] = useState<'portfolio' | 'program' | 'project'>('portfolio')
  const [target, setTarget] = useState('')
  const options = level === 'portfolio' ? portfolios.map((p) => ({ id: p.id, name: p.name })) : level === 'program' ? programs.map((p) => ({ id: p.id, name: p.name })) : masterProjects.map((p) => ({ id: p.id, name: p.shortName || p.officialName }))
  return (
    <Popover label="افزودن محدوده" align="start" trigger={({ toggle }) => <button className="uc-btn uc-btn-sm" onClick={toggle}><Plus size={13} /> محدوده جدید</button>}>
      {(close) => (
        <div className="flex flex-col gap-2 p-2" style={{ width: 250 }}>
          <select className="uc-select" value={level} onChange={(e) => { setLevel(e.target.value as typeof level); setTarget('') }} aria-label="سطح محدوده">
            <option value="portfolio">یک پورتفولیو</option><option value="program">یک طرح</option><option value="project">یک پروژه</option>
          </select>
          <select className="uc-select" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="مورد">
            <option value="">انتخاب…</option>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button className="uc-btn uc-btn-primary uc-btn-sm" disabled={!target} onClick={async () => { await onAdd({ scopeLevel: level, portfolioId: level === 'portfolio' ? target : null, programId: level === 'program' ? target : null, projectId: level === 'project' ? target : null }); close() }}>افزودن</button>
        </div>
      )}
    </Popover>
  )
}
