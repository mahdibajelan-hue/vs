import { useMemo, useState } from 'react'
import { Building2, FolderTree, Globe2, Layers, Minus, Plus, Search, Trash2, UserCheck } from 'lucide-react'
import { useAccessStore } from '../../masterdata/store/useAccessStore'
import { SCOPE_LEVEL_LABEL_FA } from '../../masterdata/rbacTypes'
import { useUserCenterStore } from '../store/useUserCenterStore'
import { useAccessData, useUserAccess } from '../lib/useAccessModel'
import { useAccessActions } from '../lib/useAccessActions'
import { rowHasAccess, type ProjectRow } from '../lib/access'
import { DEFAULT_ROLE, PRODUCT_ROLES, roleLabel } from '../lib/productRoles'
import { faNum, toggled } from '../lib/format'
import { PRODUCTS, PRODUCT_LABEL, type ProductKey, type UcUser } from '../types'
import { Badge, ConfirmDialog, EmptyState, Popover, Section, Segmented, Switch, useToast } from '../components/ui'

type Filter = 'all' | 'has' | 'none'

export function ProjectsTab({ user }: { user: UcUser }) {
  const setMemberships = useUserCenterStore((s) => s.setMemberships)
  const removeMemberships = useUserCenterStore((s) => s.removeMemberships)
  const { rows, scopes, accessibleProjects } = useUserAccess(user.id)
  const { portfolios, programs, masterProjects } = useAccessData()
  const projectRoles = useAccessStore((s) => s.projectRoles)
  const assignments = useAccessStore((s) => s.projectRoleAssignments)
  const actions = useAccessActions(user.id)
  const notify = useToast()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [bulk, setBulk] = useState<{ product: ProductKey; role: string }>({ product: 'pipepulse', role: DEFAULT_ROLE.pipepulse })
  const [confirm, setConfirm] = useState<null | { title: string; description: string; run: () => Promise<void> }>(null)

  const allScope = scopes.find((s) => s.scopeLevel === 'all')
  const otherScopes = scopes.filter((s) => s.scopeLevel !== 'all')
  const nameOfScope = (s: (typeof scopes)[number]) =>
    s.scopeLevel === 'portfolio' ? portfolios.find((p) => p.id === s.portfolioId)?.name : s.scopeLevel === 'program' ? programs.find((p) => p.id === s.programId)?.name : masterProjects.find((p) => p.id === s.projectId)?.shortName || masterProjects.find((p) => p.id === s.projectId)?.officialName

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (filter === 'has' && !rowHasAccess(r)) return false
      if (filter === 'none' && rowHasAccess(r)) return false
      return !q || r.label.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)
    })
  }, [rows, filter, query])
  const mapped = visible.filter((r) => r.masterId)
  const unmapped = visible.filter((r) => !r.masterId)

  const toggleRow = (key: string) => setPicked((s) => toggled(s, key))
  const pickedRows = rows.filter((r) => picked.has(r.key))
  const allVisiblePicked = visible.length > 0 && visible.every((r) => picked.has(r.key))

  const sourceIds = (list: ProjectRow[], product: ProductKey) => list.map((r) => r.cells[product].sourceId).filter((x): x is string => !!x)
  const applyBulk = async () => {
    const ids = sourceIds(pickedRows, bulk.product)
    if (!ids.length) return notify('برای این محصول، پروژه‌های انتخاب‌شده نگاشت تأییدشده ندارند', 'warn')
    const res = await setMemberships(user.id, bulk.product, ids, bulk.role)
    notify(res.ok ? `دسترسی ${faNum(ids.length)} پروژه در ${PRODUCT_LABEL[bulk.product]} با نقش «${roleLabel(bulk.product, bulk.role)}» ثبت شد` : (res.error ?? 'ثبت نشد'), res.ok ? 'ok' : 'bad')
    if (res.ok) setPicked(new Set())
  }
  const removeBulk = () =>
    setConfirm({
      title: 'حذف دسترسی از پروژه‌های انتخاب‌شده',
      description: `دسترسی مستقیم ${user.fullName || user.email} به ${faNum(pickedRows.length)} پروژهٔ انتخاب‌شده در هر سه محصول حذف می‌شود. دسترسی‌های ارثی از محدوده تغییری نمی‌کند.`,
      run: async () => {
        for (const p of PRODUCTS) await removeMemberships(user.id, p, sourceIds(pickedRows, p))
        setPicked(new Set())
        notify('دسترسی پروژه‌های انتخاب‌شده حذف شد')
      },
    })

  const Cell = ({ row, product }: { row: ProjectRow; product: ProductKey }) => {
    const cell = row.cells[product]
    if (!cell.sourceId) return <span title="این پروژه در این محصول نگاشت تأییدشده ندارد" style={{ color: 'var(--uc-line-2)' }}><Minus size={14} /></span>
    const m = cell.membership
    return (
      <Popover
        label={`دسترسی ${PRODUCT_LABEL[product]}`}
        align="start"
        trigger={({ toggle, open }) =>
          m ? (
            <button className="uc-chip" style={{ paddingInlineEnd: 10, cursor: 'pointer', borderColor: open ? 'var(--uc-accent)' : undefined }} onClick={toggle} aria-label={`نقش ${roleLabel(product, m.role)}، برای تغییر کلیک کنید`}>
              <span style={{ color: 'var(--uc-direct)' }}>●</span> {roleLabel(product, m.role)}
            </button>
          ) : row.inheritedBy.length ? (
            <button className="uc-badge is-info" style={{ cursor: 'pointer', fontFamily: 'inherit' }} onClick={toggle} title={`ارثی از محدودهٔ دسترسی`}>ارثی</button>
          ) : (
            <button className="uc-btn uc-btn-ghost uc-btn-icon uc-add-cell" style={{ minWidth: 28, minHeight: 28 }} onClick={toggle} aria-label={`افزودن دسترسی ${PRODUCT_LABEL[product]} به ${row.label}`}><Plus size={14} /></button>
          )
        }
      >
        {(close) => (
          <>
            <p className="uc-eyebrow px-2.5 pb-1.5 pt-1">{m ? 'تغییر نقش' : 'افزودن با نقش'}</p>
            {PRODUCT_ROLES[product].map((o) => (
              <button key={o.value} className="uc-pop-item" onClick={async () => { close(); const res = await setMemberships(user.id, product, [cell.sourceId!], o.value); notify(res.ok ? `نقش «${o.label}» ثبت شد` : (res.error ?? 'ثبت نشد'), res.ok ? 'ok' : 'bad') }}>
                <span style={{ width: 14, color: 'var(--uc-accent)' }}>{m?.role === o.value ? '✓' : ''}</span> {o.label}
              </button>
            ))}
            {m && (
              <>
                <hr className="uc-hair my-1" />
                <button className="uc-pop-item is-danger" onClick={() => { close(); setConfirm({ title: 'حذف دسترسی پروژه', description: `دسترسی «${user.fullName || user.email}» به «${row.label}» در ${PRODUCT_LABEL[product]} حذف می‌شود.`, run: async () => { const res = await removeMemberships(user.id, product, [cell.sourceId!]); notify(res.ok ? 'دسترسی حذف شد' : (res.error ?? 'حذف نشد'), res.ok ? 'ok' : 'bad') } }) }}>
                  <Trash2 size={14} /> حذف دسترسی
                </button>
              </>
            )}
          </>
        )}
      </Popover>
    )
  }

  const RoleCell = ({ row }: { row: ProjectRow }) => {
    if (!row.masterId) return <span style={{ color: 'var(--uc-line-2)' }}><Minus size={14} /></span>
    const mine = assignments.filter((a) => a.userId === user.id && a.projectId === row.masterId)
    const free = projectRoles.filter((r) => !mine.some((a) => a.projectRoleId === r.id))
    return (
      <div className="flex flex-wrap items-center justify-center gap-1">
        {mine.map((a) => (
          <span key={a.id} className="uc-chip" style={{ paddingInlineStart: 8 }}>{projectRoles.find((r) => r.id === a.projectRoleId)?.name ?? '—'}<button aria-label="حذف سمت" onClick={() => actions.removeProjectRole(a.id)}>×</button></span>
        ))}
        {free.length > 0 && (
          <Popover label="افزودن سمت پروژه" align="start" trigger={({ toggle }) => <button className="uc-btn uc-btn-ghost uc-btn-icon uc-add-cell" style={{ minWidth: 26, minHeight: 26 }} onClick={toggle} aria-label={`افزودن سمت پروژه برای ${row.label}`}><Plus size={13} /></button>}>
            {(close) => <div className="max-h-64 overflow-y-auto">{free.map((r) => <button key={r.id} className="uc-pop-item" onClick={() => { close(); actions.assignProjectRole(row.masterId!, r.id) }}><UserCheck size={14} /> {r.name}</button>)}</div>}
          </Popover>
        )}
      </div>
    )
  }

  const RowView = (r: ProjectRow) => {
    const has = rowHasAccess(r)
    return (
      <tr key={r.key} className={has ? '' : 'is-dim'}>
        <td style={{ width: 34, paddingInlineEnd: 0 }}><input type="checkbox" checked={picked.has(r.key)} onChange={() => toggleRow(r.key)} aria-label={`انتخاب ${r.label}`} /></td>
        <td>
          <span className="block max-w-[260px] truncate text-[13px] font-bold">{r.label}</span>
          <span className="uc-eyebrow flex items-center gap-1.5">{r.code && <span dir="ltr">{r.code}</span>}{r.inheritedBy.length > 0 && <Badge tone="info">ارثی از محدوده</Badge>}</span>
        </td>
        {PRODUCTS.map((p) => <td key={p}><Cell row={r} product={p} /></td>)}
        <td><RoleCell row={r} /></td>
      </tr>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ------------------------------------------------------------------ scope */}
      <Section title="محدودهٔ دسترسی" hint="دسترسی به‌صورت یک‌جا برای همهٔ پروژه‌ها یا یک پورتفولیو، طرح یا پروژه — بقیهٔ پروژه‌ها ارثی از این محدوده می‌گیرند.">
        <div className="flex max-w-[560px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: 'var(--uc-accent-soft)', color: 'var(--uc-accent)' }}><Globe2 size={17} /></span>
            <div>
              <p className="text-[13px] font-bold">{user.isAdmin ? 'دسترسی به همهٔ پروژه‌ها (مدیر سیستم)' : 'دسترسی به همهٔ پروژه‌ها'}</p>
              <p className="uc-eyebrow">{user.isAdmin ? 'مدیر سیستم همهٔ پروژه‌ها را می‌بیند.' : allScope ? 'فعال — کاربر هر پروژهٔ موجود و آینده را می‌بیند.' : 'غیرفعال — فقط پروژه‌های انتخاب‌شده'}</p>
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
              <button aria-label="حذف محدوده" onClick={() => setConfirm({ title: 'حذف محدودهٔ دسترسی', description: `دسترسی ارثی کاربر از «${nameOfScope(s) ?? ''}» برداشته می‌شود.`, run: () => actions.removeScope(s.id) })}>×</button>
            </span>
          ))}
          <ScopeAdder onAdd={actions.addScope} />
        </div>
      </Section>

      {/* ------------------------------------------------------------------ matrix */}
      <section className="uc-card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h3 className="uc-section-title">ماتریس دسترسی پروژه‌ها</h3>
            <p className="uc-eyebrow mt-0.5">{faNum(accessibleProjects)} از {faNum(rows.length)} پروژه در دسترس است. روی هر خانه کلیک کنید تا نقش را تعیین یا دسترسی را حذف کنید.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute top-1/2 -translate-y-1/2" style={{ insetInlineStart: 11, color: 'var(--uc-muted)' }} />
              <input className="uc-input" style={{ paddingInlineStart: 32, minHeight: 34, width: 180 }} placeholder="جستجوی پروژه…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="جستجوی پروژه" />
            </div>
            <Segmented<Filter> label="نمایش" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'همه' }, { value: 'has', label: 'دارای دسترسی' }, { value: 'none', label: 'بدون دسترسی' }]} />
          </div>
        </header>

        {picked.size > 0 && (
          <div className="uc-rise flex flex-wrap items-center gap-2 border-y px-4 py-2.5" style={{ borderColor: 'var(--uc-line)', background: 'var(--uc-accent-soft)' }}>
            <b className="text-[12.5px]">{faNum(picked.size)} پروژه انتخاب شد</b>
            <span className="uc-eyebrow">افزودن دسترسی به</span>
            <select className="uc-select" style={{ width: 'auto', minHeight: 32 }} value={bulk.product} onChange={(e) => { const p = e.target.value as ProductKey; setBulk({ product: p, role: DEFAULT_ROLE[p] }) }} aria-label="محصول">
              {PRODUCTS.map((p) => <option key={p} value={p}>{PRODUCT_LABEL[p]}</option>)}
            </select>
            <select className="uc-select" style={{ width: 'auto', minHeight: 32 }} value={bulk.role} onChange={(e) => setBulk({ ...bulk, role: e.target.value })} aria-label="نقش">
              {PRODUCT_ROLES[bulk.product].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button className="uc-btn uc-btn-primary uc-btn-sm" onClick={applyBulk}>افزودن</button>
            <button className="uc-btn uc-btn-danger uc-btn-sm" onClick={removeBulk}><Trash2 size={13} /> حذف دسترسی</button>
            <button className="uc-btn uc-btn-ghost uc-btn-sm" onClick={() => setPicked(new Set())}>لغو انتخاب</button>
          </div>
        )}

        {visible.length === 0 ? (
          <EmptyState icon={<Layers size={20} />} title="پروژه‌ای پیدا نشد" text="عبارت جستجو یا فیلتر را تغییر دهید." />
        ) : (
          <div className="overflow-x-auto">
            <table className="uc-matrix" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ width: 34 }}><input type="checkbox" checked={allVisiblePicked} onChange={() => setPicked(allVisiblePicked ? new Set() : new Set(visible.map((r) => r.key)))} aria-label="انتخاب همه" /></th>
                  <th>پروژه</th>
                  {PRODUCTS.map((p) => <th key={p}>{PRODUCT_LABEL[p]}</th>)}
                  <th>سمت در پروژه</th>
                </tr>
              </thead>
              <tbody>
                {mapped.map(RowView)}
                {unmapped.length > 0 && (
                  <>
                    <tr><td colSpan={6} style={{ background: 'var(--uc-surface-2)', textAlign: 'right', padding: '8px 16px' }}><span className="uc-eyebrow">پروژه‌های بدون نگاشت به داده‌های پایه ({faNum(unmapped.length)})</span></td></tr>
                    {unmapped.map(RowView)}
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}
        <footer className="uc-legend border-t px-4 py-3" style={{ borderColor: 'var(--uc-line)' }}>
          <span><span className="uc-chip" style={{ padding: '1px 8px' }}><span style={{ color: 'var(--uc-direct)' }}>●</span> نقش</span> دسترسی مستقیم با نقش مشخص</span>
          <span><Badge tone="info">ارثی</Badge> از محدودهٔ دسترسی (همه / پورتفولیو / طرح / پروژه)</span>
          <span><Plus size={13} /> بدون دسترسی — برای افزودن کلیک کنید</span>
        </footer>
      </section>

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
