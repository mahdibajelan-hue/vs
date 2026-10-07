import { useMemo, useState } from 'react'
import { Ban, FolderKanban, Globe2, KeyRound, LayoutGrid, Lock, Plus, Search, Trash2, UserCheck, UserCog, type LucideIcon } from 'lucide-react'
import { useAccessStore } from '../../masterdata/store/useAccessStore'
import { SCOPE_LEVEL_LABEL_FA } from '../../masterdata/rbacTypes'
import { useUserCenterStore } from '../store/useUserCenterStore'
import { useAccessData, useUserAccess } from '../lib/useAccessModel'
import { useAccessActions } from '../lib/useAccessActions'
import { ALL_ACTIONS } from '../lib/access'
import { DEFAULT_ROLE, PRODUCT_ROLES, roleLabel } from '../lib/productRoles'
import { faNum, toggled } from '../lib/format'
import { PRODUCTS, PRODUCT_LABEL, type ProductKey, type UcUser } from '../types'
import { Badge, ConfirmDialog, Drawer, EmptyState, Popover, Segmented, useToast } from '../components/ui'
import type { ModuleKeyRef } from '../../masterdata/rbacTypes'

type Source = 'inherited' | 'direct' | 'restricted'
interface Entry {
  key: string
  group: string
  icon: LucideIcon
  title: string
  detail: string
  source: Source
  edit?: React.ReactNode
  remove?: { title: string; description: string; label: string; run: () => Promise<void> }
}
const SOURCE_BADGE: Record<Source, { tone: 'info' | 'direct' | 'bad'; label: string }> = { inherited: { tone: 'info', label: 'ارثی' }, direct: { tone: 'direct', label: 'اختصاصی' }, restricted: { tone: 'bad', label: 'محدودشده' } }

/** The access manager: every grant, inheritance and restriction of this user in one list, with one place to add more. */
export function AccessTab({ user }: { user: UcUser }) {
  const setMemberships = useUserCenterStore((s) => s.setMemberships)
  const removeMemberships = useUserCenterStore((s) => s.removeMemberships)
  const setOverrides = useUserCenterStore((s) => s.setOverrides)
  const clearOverrides = useUserCenterStore((s) => s.clearOverrides)
  const { roles, rolePermissions, modules, permissions, portfolios, programs, masterProjects, products } = useAccessData()
  const { userRoleIds, scopes, memberships, overrides, blockedModules } = useUserAccess(user.id)
  const projectRoles = useAccessStore((s) => s.projectRoles)
  const assignments = useAccessStore((s) => s.projectRoleAssignments).filter((a) => a.userId === user.id)
  const actions = useAccessActions(user.id)
  const notify = useToast()
  const [filter, setFilter] = useState<'all' | Source>('all')
  const [adding, setAdding] = useState(false)
  const [confirm, setConfirm] = useState<Entry['remove'] | null>(null)

  const moduleLabel = (k: string) => modules.find((m) => m.key === k)?.labelFa ?? k
  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = []
    for (const rid of userRoleIds) {
      const r = roles.find((x) => x.id === rid)
      if (r) out.push({ key: `role:${rid}`, group: 'نقش‌ها و محدوده‌ها', icon: UserCog, title: `نقش «${r.name}»`, detail: `${faNum(rolePermissions[rid]?.size ?? 0)} مجوز را به‌صورت ارثی می‌رساند`, source: 'inherited', remove: { title: 'برداشتن نقش', description: `نقش «${r.name}» از کاربر برداشته می‌شود و مجوزهای ارثی آن از بین می‌رود.`, label: 'برداشتن نقش', run: () => actions.setRoles(userRoleIds.filter((x) => x !== rid), `نقش «${r.name}» برداشته شد`) } })
    }
    for (const s of scopes) {
      const name = s.scopeLevel === 'all' ? 'همهٔ پروژه‌ها' : s.scopeLevel === 'portfolio' ? portfolios.find((p) => p.id === s.portfolioId)?.name : s.scopeLevel === 'program' ? programs.find((p) => p.id === s.programId)?.name : masterProjects.find((p) => p.id === s.projectId)?.shortName
      out.push({ key: `scope:${s.id}`, group: 'نقش‌ها و محدوده‌ها', icon: Globe2, title: s.scopeLevel === 'all' ? 'دسترسی به همهٔ پروژه‌ها' : `${SCOPE_LEVEL_LABEL_FA[s.scopeLevel]}: ${name ?? '—'}`, detail: 'پروژه‌های این محدوده به‌صورت ارثی در دسترس‌اند', source: 'inherited', remove: { title: 'حذف محدودهٔ دسترسی', description: 'دسترسی ارثی کاربر از این محدوده برداشته می‌شود.', label: 'حذف محدوده', run: () => actions.removeScope(s.id) } })
    }
    for (const m of memberships) {
      const p = products.find((x) => x.product === m.product && x.id === m.projectId)
      out.push({
        key: `member:${m.product}:${m.projectId}`, group: 'پروژه‌ها', icon: FolderKanban, title: p?.name ?? 'پروژهٔ نامشخص', detail: `${PRODUCT_LABEL[m.product]} · نقش «${roleLabel(m.product, m.role)}»`, source: 'direct',
        edit: (
          <Popover label="تغییر نقش" align="start" trigger={({ toggle }) => <button className="uc-btn uc-btn-sm" onClick={toggle}>تغییر نقش</button>}>
            {(close) => PRODUCT_ROLES[m.product].map((o) => (
              <button key={o.value} className="uc-pop-item" onClick={async () => { close(); const res = await setMemberships(user.id, m.product, [m.projectId], o.value); notify(res.ok ? `نقش «${o.label}» ثبت شد` : (res.error ?? 'ثبت نشد'), res.ok ? 'ok' : 'bad') }}>
                <span style={{ width: 14, color: 'var(--uc-accent)' }}>{m.role === o.value ? '✓' : ''}</span> {o.label}
              </button>
            ))}
          </Popover>
        ),
        remove: { title: 'حذف دسترسی پروژه', description: `دسترسی کاربر به «${p?.name ?? 'پروژه'}» در ${PRODUCT_LABEL[m.product]} حذف می‌شود.`, label: 'حذف دسترسی', run: async () => { const res = await removeMemberships(user.id, m.product, [m.projectId]); notify(res.ok ? 'دسترسی حذف شد' : (res.error ?? 'حذف نشد'), res.ok ? 'ok' : 'bad') } },
      })
    }
    for (const a of assignments) {
      const role = projectRoles.find((r) => r.id === a.projectRoleId)
      const proj = masterProjects.find((p) => p.id === a.projectId)
      out.push({ key: `prole:${a.id}`, group: 'پروژه‌ها', icon: KeyRound, title: `سمت «${role?.name ?? '—'}»`, detail: `در پروژه «${proj?.shortName || proj?.officialName || '—'}»`, source: 'direct', remove: { title: 'حذف سمت پروژه', description: `سمت «${role?.name ?? ''}» از کاربر در این پروژه برداشته می‌شود.`, label: 'حذف سمت', run: () => actions.removeProjectRole(a.id) } })
    }
    for (const o of overrides) {
      const perm = permissions.find((p) => p.id === o.permissionId)
      if (!perm) continue
      const label = `${ALL_ACTIONS.find((a) => a.action === perm.action)?.label ?? perm.action} — ${moduleLabel(perm.moduleKey)}`
      out.push({
        key: `perm:${o.permissionId}`, group: 'مجوزهای ماژول', icon: o.effect === 'deny' ? Ban : UserCheck, title: label, detail: o.effect === 'deny' ? 'برای این کاربر ممنوع شده (حتی اگر نقش‌ها بدهند)' : 'به‌صورت اختصاصی به این کاربر داده شده', source: o.effect === 'deny' ? 'restricted' : 'direct',
        edit: <button className="uc-btn uc-btn-sm" onClick={async () => { const res = await setOverrides(user.id, [o.permissionId], o.effect === 'deny' ? 'allow' : 'deny'); notify(res.ok ? 'مجوز تغییر کرد' : (res.error ?? 'ثبت نشد'), res.ok ? 'ok' : 'bad') }}>{o.effect === 'deny' ? 'تبدیل به اعطا' : 'تبدیل به ممنوع'}</button>,
        remove: { title: 'حذف مورد اختصاصی', description: `«${label}» به حالت نقش‌های کاربر برمی‌گردد.`, label: 'حذف', run: async () => { const res = await clearOverrides(user.id, [o.permissionId]); notify(res.ok ? 'مورد اختصاصی حذف شد' : (res.error ?? 'حذف نشد'), res.ok ? 'ok' : 'bad') } },
      })
    }
    for (const k of blockedModules) {
      out.push({ key: `mod:${k}`, group: 'محدودیت‌ها', icon: Lock, title: `ماژول «${moduleLabel(k)}» بسته است`, detail: 'کاربر نمی‌تواند وارد این ماژول شود', source: 'restricted', edit: <button className="uc-btn uc-btn-sm" onClick={() => actions.setModule(k as ModuleKeyRef, true)}>باز کردن دسترسی</button> })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRoleIds, scopes, memberships, overrides, blockedModules, assignments.length, roles, rolePermissions, permissions, products, projectRoles, masterProjects, portfolios, programs, modules])

  const counts = { inherited: entries.filter((e) => e.source === 'inherited').length, direct: entries.filter((e) => e.source === 'direct').length, restricted: entries.filter((e) => e.source === 'restricted').length }
  const shown = entries.filter((e) => filter === 'all' || e.source === filter)
  const groups = [...new Set(shown.map((e) => e.group))]

  return (
    <section className="uc-card">
      <header className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h3 className="uc-section-title">مدیریت دسترسی‌ها</h3>
          <p className="uc-eyebrow mt-0.5 leading-6">همهٔ دسترسی‌های این کاربر — ارثی، اختصاصی و محدودشده — در یک فهرست. افزودن، ویرایش و حذف از همین‌جا.</p>
        </div>
        <button className="uc-btn uc-btn-primary" onClick={() => setAdding(true)}><Plus size={15} /> افزودن دسترسی</button>
      </header>
      <div className="flex flex-wrap items-center gap-3 px-4 pb-3">
        <Segmented<'all' | Source>
          label="نوع دسترسی"
          value={filter}
          onChange={setFilter}
          options={[{ value: 'all', label: `همه (${faNum(entries.length)})` }, { value: 'inherited', label: `ارثی (${faNum(counts.inherited)})` }, { value: 'direct', label: `اختصاصی (${faNum(counts.direct)})` }, { value: 'restricted', label: `محدودشده (${faNum(counts.restricted)})` }]}
        />
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={<KeyRound size={20} />} title={entries.length === 0 ? 'این کاربر هنوز هیچ دسترسی ندارد' : 'موردی با این فیلتر نیست'} text={entries.length === 0 ? 'با «افزودن دسترسی» پروژه، مجوز یا نقش تعیین کنید.' : undefined} action={entries.length === 0 ? <button className="uc-btn uc-btn-primary uc-btn-sm" onClick={() => setAdding(true)}><Plus size={14} /> افزودن دسترسی</button> : undefined} />
      ) : (
        groups.map((g) => (
          <div key={g}>
            <p className="uc-eyebrow border-y px-5 py-2 font-semibold" style={{ borderColor: 'var(--uc-line)', background: 'var(--uc-surface-2)' }}>{g}</p>
            <ul className="m-0 list-none p-0">
              {shown.filter((e) => e.group === g).map((e) => {
                const Icon = e.icon
                const b = SOURCE_BADGE[e.source]
                return (
                  <li key={e.key} className="flex flex-wrap items-center gap-3 border-b px-5 py-3 last:border-b-0" style={{ borderColor: 'var(--uc-line)' }}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, var(--uc-${e.source === 'inherited' ? 'inherit' : e.source === 'direct' ? 'direct' : 'bad'}) 13%, transparent)`, color: `var(--uc-${e.source === 'inherited' ? 'inherit' : e.source === 'direct' ? 'direct' : 'bad'})` }}><Icon size={16} /></span>
                    <div className="min-w-0 flex-1" style={{ minWidth: 180 }}>
                      <p className="truncate text-[13px] font-bold">{e.title}</p>
                      <p className="uc-eyebrow truncate leading-6">{e.detail}</p>
                    </div>
                    <Badge tone={b.tone}>{b.label}</Badge>
                    <div className="flex items-center gap-1.5">
                      {e.edit}
                      {e.remove && <button className="uc-btn uc-btn-ghost uc-btn-icon" aria-label={`حذف: ${e.title}`} title="حذف" onClick={() => setConfirm(e.remove!)}><Trash2 size={15} /></button>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ))
      )}

      {adding && <AddAccessDrawer user={user} onClose={() => setAdding(false)} />}
      {confirm && <ConfirmDialog tone="danger" title={confirm.title} description={confirm.description} confirmLabel={confirm.label} onConfirm={async () => { await confirm.run(); setConfirm(null) }} onClose={() => setConfirm(null)} />}
    </section>
  )
}

// ------------------------------------------------------------------------------------------------ add drawer

function AddAccessDrawer({ user, onClose }: { user: UcUser; onClose: () => void }) {
  const [kind, setKind] = useState<'project' | 'permission' | 'role'>('project')
  return (
    <Drawer title="افزودن دسترسی" subtitle={user.fullName || user.email} onClose={onClose}>
      <Segmented<'project' | 'permission' | 'role'>
        label="نوع دسترسی"
        value={kind}
        onChange={setKind}
        options={[{ value: 'project', label: <span className="inline-flex items-center gap-1.5"><FolderKanban size={13} /> پروژه</span> }, { value: 'permission', label: <span className="inline-flex items-center gap-1.5"><LayoutGrid size={13} /> مجوز ماژول</span> }, { value: 'role', label: <span className="inline-flex items-center gap-1.5"><UserCog size={13} /> نقش</span> }]}
      />
      <div className="mt-4">
        {kind === 'project' ? <AddProject user={user} onDone={onClose} /> : kind === 'permission' ? <AddPermission user={user} onDone={onClose} /> : <AddRole user={user} onDone={onClose} />}
      </div>
    </Drawer>
  )
}

function AddProject({ user, onDone }: { user: UcUser; onDone: () => void }) {
  const setMemberships = useUserCenterStore((s) => s.setMemberships)
  const { rows } = useUserAccess(user.id)
  const notify = useToast()
  const [product, setProduct] = useState<ProductKey>('pipepulse')
  const [role, setRole] = useState(DEFAULT_ROLE.pipepulse)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const candidates = rows.filter((r) => r.cells[product].sourceId && !r.cells[product].membership && (!q.trim() || r.label.toLowerCase().includes(q.trim().toLowerCase())))
  const toggle = (id: string) => setPicked((s) => toggled(s, id))
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <label><span className="uc-label">محصول</span>
          <select className="uc-select" value={product} onChange={(e) => { const p = e.target.value as ProductKey; setProduct(p); setRole(DEFAULT_ROLE[p]); setPicked(new Set()) }}>{PRODUCTS.map((p) => <option key={p} value={p}>{PRODUCT_LABEL[p]}</option>)}</select></label>
        <label><span className="uc-label">نقش در پروژه</span>
          <select className="uc-select" value={role} onChange={(e) => setRole(e.target.value)}>{PRODUCT_ROLES[product].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      </div>
      <div>
        <div className="relative mb-2">
          <Search size={14} className="pointer-events-none absolute top-1/2 -translate-y-1/2" style={{ insetInlineStart: 11, color: 'var(--uc-muted)' }} />
          <input className="uc-input" style={{ paddingInlineStart: 32 }} placeholder="جستجوی پروژه…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="uc-card-flat max-h-[46vh] overflow-y-auto">
          {candidates.length === 0 ? <p className="uc-eyebrow p-4 text-center leading-7">پروژهٔ دیگری برای افزودن نیست.</p> : candidates.map((r) => (
            <label key={r.key} className="flex cursor-pointer items-center gap-3 border-b px-3 py-2.5 last:border-b-0" style={{ borderColor: 'var(--uc-line)' }}>
              <input type="checkbox" checked={picked.has(r.cells[product].sourceId!)} onChange={() => toggle(r.cells[product].sourceId!)} />
              <span className="min-w-0"><span className="block truncate text-[12.5px] font-semibold">{r.label}</span>{r.code && <span className="uc-eyebrow" dir="ltr">{r.code}</span>}</span>
            </label>
          ))}
        </div>
        {candidates.length > 0 && <button className="uc-btn uc-btn-ghost uc-btn-sm mt-2" onClick={() => setPicked(new Set(candidates.map((r) => r.cells[product].sourceId!)))}>انتخاب همهٔ نتایج</button>}
      </div>
      <button className="uc-btn uc-btn-primary" disabled={busy || picked.size === 0} onClick={async () => { setBusy(true); const res = await setMemberships(user.id, product, [...picked], role); setBusy(false); notify(res.ok ? `دسترسی ${faNum(picked.size)} پروژه ثبت شد` : (res.error ?? 'ثبت نشد'), res.ok ? 'ok' : 'bad'); if (res.ok) onDone() }}>
        {busy ? 'در حال ثبت…' : picked.size ? `افزودن ${faNum(picked.size)} پروژه` : 'پروژه‌ای انتخاب کنید'}
      </button>
    </div>
  )
}

function AddPermission({ user, onDone }: { user: UcUser; onDone: () => void }) {
  const setOverrides = useUserCenterStore((s) => s.setOverrides)
  const { modules, permissions } = useAccessData()
  const notify = useToast()
  const active = modules.filter((m) => m.isActive)
  const [moduleKey, setModuleKey] = useState<string>(active[0]?.key ?? '')
  const [effect, setEffect] = useState<'allow' | 'deny'>('allow')
  const [acts, setActs] = useState<Set<string>>(new Set(['view']))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const ids = [...acts].map((a) => permissions.find((p) => p.moduleKey === moduleKey && p.action === a)?.id).filter((x): x is string => !!x)
  const toggle = (a: string) => setActs((s) => toggled(s, a))
  return (
    <div className="flex flex-col gap-4">
      <label><span className="uc-label">ماژول</span>
        <select className="uc-select" value={moduleKey} onChange={(e) => setModuleKey(e.target.value)}>{active.map((m) => <option key={m.key} value={m.key}>{m.labelFa}</option>)}</select></label>
      <div>
        <span className="uc-label">نوع تغییر</span>
        <Segmented<'allow' | 'deny'> label="اعطا یا ممنوع" value={effect} onChange={setEffect} options={[{ value: 'allow', label: 'اعطای اختصاصی' }, { value: 'deny', label: 'ممنوع برای این کاربر' }]} />
        <p className="uc-hint">{effect === 'allow' ? 'مجوز علاوه بر نقش‌های کاربر به او داده می‌شود.' : 'مجوز حتی اگر نقش‌های کاربر بدهند، از او گرفته می‌شود.'}</p>
      </div>
      <div>
        <span className="uc-label">عملیات</span>
        <div className="flex flex-wrap gap-2">
          {ALL_ACTIONS.map((a) => (
            <button key={a.action} type="button" aria-pressed={acts.has(a.action)} className="uc-btn uc-btn-sm" onClick={() => toggle(a.action)} style={acts.has(a.action) ? { borderColor: 'var(--uc-accent)', background: 'var(--uc-accent-soft)' } : undefined}>{a.label}</button>
          ))}
        </div>
      </div>
      <label><span className="uc-label">یادداشت (اختیاری)</span><input className="uc-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="دلیل این تغییر" /></label>
      <button className="uc-btn uc-btn-primary" disabled={busy || ids.length === 0} onClick={async () => { setBusy(true); const res = await setOverrides(user.id, ids, effect, note.trim()); setBusy(false); notify(res.ok ? `${faNum(ids.length)} مجوز ثبت شد` : (res.error ?? 'ثبت نشد'), res.ok ? 'ok' : 'bad'); if (res.ok) onDone() }}>
        {busy ? 'در حال ثبت…' : effect === 'allow' ? 'اعطای مجوزها' : 'ممنوع کردن مجوزها'}
      </button>
    </div>
  )
}

function AddRole({ user, onDone }: { user: UcUser; onDone: () => void }) {
  const { roles, rolePermissions } = useAccessData()
  const { userRoleIds } = useUserAccess(user.id)
  const actions = useAccessActions(user.id)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const free = roles.filter((r) => !userRoleIds.includes(r.id))
  return (
    <div className="flex flex-col gap-4">
      {free.length === 0 ? <p className="uc-eyebrow leading-7">همهٔ نقش‌های موجود به این کاربر داده شده است.</p> : (
        <div className="uc-card-flat max-h-[52vh] overflow-y-auto">
          {free.map((r) => (
            <label key={r.id} className="flex cursor-pointer items-start gap-3 border-b px-3 py-3 last:border-b-0" style={{ borderColor: 'var(--uc-line)' }}>
              <input type="checkbox" style={{ marginTop: 5 }} checked={picked.has(r.id)} onChange={() => setPicked((s) => toggled(s, r.id))} />
              <span className="min-w-0"><span className="block text-[12.5px] font-semibold">{r.name} <Badge>{faNum(rolePermissions[r.id]?.size ?? 0)} مجوز</Badge></span>{r.description && <span className="uc-eyebrow block leading-6">{r.description}</span>}</span>
            </label>
          ))}
        </div>
      )}
      <button className="uc-btn uc-btn-primary" disabled={busy || picked.size === 0} onClick={async () => { setBusy(true); await actions.setRoles([...userRoleIds, ...picked], `${faNum(picked.size)} نقش افزوده شد`); setBusy(false); onDone() }}>{busy ? 'در حال ثبت…' : picked.size ? `افزودن ${faNum(picked.size)} نقش` : 'نقشی انتخاب کنید'}</button>
    </div>
  )
}
