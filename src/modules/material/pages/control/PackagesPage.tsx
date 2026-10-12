import { useMemo, useState } from 'react'
import { Boxes, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuthStore } from '../../../../store/useAuthStore'
import { useMasterDataStore } from '../../../masterdata/store/useMasterDataStore'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { useMaterialModel } from '../../lib/control/useMaterialModel'
import { itemProgress, rollup } from '../../lib/control/progress'
import { Chip, KpiCard, NumInput, Section, fmtD } from '../../../finance/components/fn'
import { FormModal } from '../../../finance/components/FormModal'
import { LinkedRecords, ProgressBar, RaiseButton, bn, fa, pct, qtyText } from '../../components/control/common'
import { StageChain } from '../../components/control/StageChain'
import { StageModal } from '../../components/control/StageModal'
import { CommodityIcon } from '../../components/control/CommodityIcon'
import { RemoveRecord } from '../../components/control/RemoveRecord'
import { orderAllowance, ALLOW_LABEL_FA, type Allowance } from '../../lib/control/allowance'
import { ModalPortal } from '../../../../components/common/ModalPortal'
import { PACKAGE_STATUS_LABEL_FA, type ItemStage, type MtlPackage, type PackageStatus } from '../../types'

/** Purchase packages: what is bought together, from whom, with the supply stages of every item and their progress. */
export function PackagesPage({ projectId }: { projectId: string }) {
  const m = useMaterialModel(projectId)
  const cs = useMaterialControlStore()
  const orgs = useMasterDataStore((s) => s.organizations)
  const [sel, setSel] = useState<string | null>(null)
  const [form, setForm] = useState<MtlPackage | 'new' | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState(false)
  const isAdmin = useAuthStore((st) => !!st.profile?.isAdmin)
  const [pick, setPick] = useState<{ stage: ItemStage; itemId: string } | null>(null)
  const canEdit = cs.can(projectId, 'edit_packages')
  const byId = useMemo(() => new Map(m.materials.map((x) => [x.id, x])), [m.materials])
  const orgName = (id: string | null) => orgs.find((o) => o.id === id)?.name ?? '—'
  const pkg = m.packages.find((p) => p.id === sel) ?? null
  const progOf = (id: string) => m.byPackage.find((r) => r.key === id)
  const items = pkg ? m.items.filter((i) => i.packageId === pkg.id) : []
  const itemRows = items.map((i) => ({ i, mat: byId.get(i.materialId), ip: itemProgress(i, m.stages, m.today, byId.get(i.materialId)?.fxRate ?? 1) }))
  const roll = rollup(itemRows.map((r) => r.ip))
  const pickItem = pick ? m.items.find((i) => i.id === pick.itemId) : undefined
  const pickDef = pick ? cs.stageDefs.find((d) => d.key === pick.stage.stageKey) : undefined

  if (pkg) {
    const pat = cs.patterns.find((p) => p.id === pkg.patternId)
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="im-btn im-btn-sm" onClick={() => setSel(null)}>→ همهٔ بسته‌ها</button>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{pkg.code} · {pkg.title}</h2><Chip tone={pkg.status === 'active' ? 'good' : 'neutral'}>{PACKAGE_STATUS_LABEL_FA[pkg.status]}</Chip>
          <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
            {isAdmin && <button className="im-btn im-btn-sm im-btn-danger" onClick={() => setRemoving(true)}><Trash2 size={13} /> حذف بسته</button>}
            {canEdit && <><button className="im-btn im-btn-sm" onClick={() => setForm(pkg)}><Pencil size={13} /> ویرایش بسته</button><button className="im-btn im-btn-primary im-btn-sm" onClick={() => setAdding(true)}><Plus size={13} /> افزودن اقلام</button></>}
            <RaiseButton projectId={projectId} sources={[{ type: 'package', id: pkg.id }]} defaults={{ target: 'risk', title: `ریسک تأمین بستهٔ ${pkg.code}`, description: `${pkg.title}\nتأمین‌کننده: ${orgName(pkg.supplierOrgId)}\nپیشرفت وزنی ${pct(roll.actual)} در برابر برنامه ${pct(roll.planned)}`, severity: 'medium', extra: { category: 'proc_supplier', package: pkg.code } }} />
          </span>
        </div>
        <div className="fn-kpis">
          <KpiCard i={0} label="ارزش بسته" value={bn(roll.value)} unit="میلیارد ریال" sub={`${fa(items.length)} قلم`} />
          <KpiCard i={1} label="پیشرفت وزنی" value={pct(roll.actual, 1)} sub={`برنامه ${pct(roll.planned)} · انحراف ${roll.deviation >= 0 ? '+' : ''}${fa(roll.deviation * 100, 1)}٪`} tone={roll.deviation < -0.1 ? 'bad' : roll.deviation < -0.02 ? 'warn' : 'good'} />
          <KpiCard i={2} label="تأمین‌کننده" value={orgName(pkg.supplierOrgId)} sub={`پیمانکار: ${orgName(pkg.contractorOrgId)}`} />
          <KpiCard i={3} label="الگوی وزنی" value={pat?.title ?? 'پیش‌فرض گروه کالا'} sub={pkg.plannedEnd ? `پایان برنامه‌ای ${fmtD(pkg.plannedEnd)}` : undefined} />
        </div>
        <Section title="اقلام و مراحل تأمین" hint="هر مرحله با مدرک ارسال و پس از تأیید نقش مجاز به پیشرفت اضافه می‌شود. روی مرحله بزنید." flush
          action={canEdit && <button className="im-btn im-btn-sm" onClick={async () => { const r = await cs.reapplyPattern(pkg.id); if (r) window.alert(`وزن ${fa(r.updated)} قلم به‌روز شد${r.skipped ? `؛ ${fa(r.skipped)} قلم که مرحلهٔ ارسال‌شده یا تأییدشده دارد دست نخورد` : ''}.`) }}>اعمال دوبارهٔ الگو</button>}>
          {itemRows.length === 0 ? <p className="im-helper" style={{ margin: 12 }}>هنوز قلمی در این بسته نیست.</p> : (
            <div style={{ display: 'grid', gap: 10, padding: 12 }}>
              {itemRows.map(({ i, mat, ip }) => (
                <div key={i.id} className="im-card" style={{ padding: 12, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ minWidth: 0, display: 'flex', gap: 9, alignItems: 'center' }}><CommodityIcon code={m.groupById.get(mat?.groupId ?? '')?.code} /><div style={{ minWidth: 0 }}><b>{mat?.description ?? '—'}</b> {i.exceptionReason && <span title={i.exceptionReason}><Chip tone="warn">استثنا</Chip></span>}<div className="im-helper" style={{ margin: 0 }}><span className="fn-code">{mat?.itemUid}</span> · ردیف {mat?.lineNo || '—'} · <span className="fn-code">{mat?.materialCode}</span> · {[mat?.facility, mat?.pipelineNo || mat?.tagNumber].filter(Boolean).join(' · ')}</div></div></div>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5 }}>
                      <span>مقدار {canEdit ? <NumInput value={i.qty} label="مقدار" onCommit={(n) => void cs.updatePackageItem(i.id, { qty: n })} className="fn-cell-input" /> : qtyText(i.qty, mat?.unit ?? '')} {mat?.unit}</span>
                      <span>قیمت {canEdit ? <NumInput value={i.unitPrice} label="قیمت واحد" onCommit={(n) => void cs.updatePackageItem(i.id, { unitPrice: n })} decimals={0} className="fn-cell-input" /> : fa(i.unitPrice)}</span>
                      <span>ارزش <b>{bn(ip.value, 2)}</b> م</span>
                      <span style={{ minWidth: 90 }}><ProgressBar actual={ip.actual} planned={ip.planned} /><small>{pct(ip.actual)} · برنامه {pct(ip.planned)}</small></span>
                      {canEdit && <button className="im-btn im-btn-sm" aria-label="حذف از بسته" onClick={() => { if (window.confirm('قلم از بسته خارج شود؟ مراحل آن هم پاک می‌شود.')) void cs.removePackageItem(i.id) }}><Trash2 size={13} /></button>}
                    </div>
                  </div>
                  <StageChain stages={m.stages.filter((s) => s.itemId === i.id)} defs={cs.stageDefs} today={m.today} onPick={(s) => setPick({ stage: s, itemId: i.id })} />
                </div>
              ))}
            </div>
          )}
        </Section>
        <Section title="ریسک و مسئلهٔ این بسته"><LinkedRecords projectId={projectId} sourceType="package" sourceIds={[pkg.id]} /></Section>
        {form && <PackageForm projectId={projectId} pkg={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={(id, isNew) => { setSel(id); if (isNew) setAdding(true) }} />}
        {adding && <AddItems model={m} pkgId={pkg.id} initialGroup={pkg.groupId} onClose={() => setAdding(false)} />}
        {removing && <RemoveRecord kind="package" id={pkg.id} label={`${pkg.code} · ${pkg.title}`} consequences={[`${fa(items.length)} قلم و مراحل تأمین آن‌ها حذف می‌شود`, 'درخواست خرید و سفارش‌های متصل می‌مانند ولی از بسته جدا می‌شوند', 'مدرک و تأییدهای مراحل از بین می‌رود؛ فقط در سابقهٔ تغییرات می‌ماند']} onClose={(done) => { setRemoving(false); if (done) setSel(null) }} />}
        {pick && pickItem && pickDef && <StageModal projectId={projectId} stage={pick.stage} def={pickDef} item={pickItem} material={byId.get(pickItem.materialId)} onClose={() => setPick(null)} />}
      </div>
    )
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="mt-filters no-print"><p className="im-helper" style={{ margin: 0 }}>بسته‌های خرید پیمانکار: چند قلم، با مقدار، قیمت، تأمین‌کننده و برنامهٔ مراحل. یک گروه کالا می‌تواند چند بسته و چند تأمین‌کننده داشته باشد.</p>{canEdit && <button className="im-btn im-btn-primary im-btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => setForm('new')}><Plus size={14} /> بستهٔ جدید</button>}</div>
      {m.packages.length === 0 ? <div className="im-card im-empty" style={{ padding: 28 }}>هنوز بستهٔ خریدی تعریف نشده است. با «بستهٔ جدید» شروع کنید و اقلام MTO را به آن اضافه کنید؛ مراحل تأمین و وزن‌ها خودکار ساخته می‌شود.</div> : (
        <div className="mt-three">
          {m.packages.map((p) => {
            const r = progOf(p.id)
            const n = m.items.filter((i) => i.packageId === p.id).length
            return (
              <button key={p.id} className="im-card" style={{ textAlign: 'start', padding: 14, display: 'grid', gap: 8, cursor: 'pointer' }} onClick={() => setSel(p.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}><b style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><CommodityIcon code={m.groupById.get(p.groupId ?? '')?.code} />{p.code}</b><Chip tone={p.status === 'active' ? 'good' : 'neutral'}>{PACKAGE_STATUS_LABEL_FA[p.status]}</Chip></div>
                <div style={{ fontWeight: 700 }}>{p.title}</div>
                <div className="im-helper" style={{ margin: 0 }}>{m.groupById.get(p.groupId ?? '')?.title ?? 'چند گروه'} · {orgName(p.supplierOrgId)} · {fa(n)} قلم</div>
                <ProgressBar actual={r?.actual ?? 0} planned={r?.planned ?? 0} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>واقعی {pct(r?.actual ?? 0)} · برنامه {pct(r?.planned ?? 0)}</span><span>{bn(r?.value ?? 0)} م</span></div>
              </button>
            )
          })}
        </div>
      )}
      {form && <PackageForm projectId={projectId} pkg={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={(id, isNew) => { setSel(id); if (isNew) setAdding(true) }} />}
    </div>
  )
}

function PackageForm({ projectId, pkg, onClose, onSaved }: { projectId: string; pkg: MtlPackage | null; onClose: () => void; onSaved: (id: string, isNew: boolean) => void }) {
  const cs = useMaterialControlStore()
  const orgs = useMasterDataStore((s) => s.organizations)
  const org = orgs.map((o) => ({ value: o.id, label: o.name }))
  return (
    <FormModal title={pkg ? `ویرایش ${pkg.code}` : 'بستهٔ خرید جدید'} onClose={onClose} submitLabel={pkg ? 'ذخیره' : 'ایجاد بسته'}
      fields={[
        { key: 'code', label: 'شمارهٔ بسته', kind: 'text', required: true }, { key: 'title', label: 'عنوان', kind: 'text', required: true },
        { key: 'groupId', label: 'گروه کالا (اختیاری)', kind: 'select', options: cs.groups.filter((g) => g.active).map((g) => ({ value: g.id, label: g.title })) },
        { key: 'patternId', label: 'الگوی وزن مراحل', kind: 'select', options: cs.patterns.filter((p) => p.active).map((p) => ({ value: p.id, label: p.title })), hint: 'اگر خالی باشد، الگوی گروه کالا هر قلم به‌کار می‌رود.' },
        { key: 'contractorOrgId', label: 'پیمانکار', kind: 'select', options: org }, { key: 'supplierOrgId', label: 'تأمین‌کننده / سازنده', kind: 'select', options: org },
        { key: 'status', label: 'وضعیت', kind: 'select', required: true, options: (Object.keys(PACKAGE_STATUS_LABEL_FA) as PackageStatus[]).map((s) => ({ value: s, label: PACKAGE_STATUS_LABEL_FA[s] })) },
        { key: 'plannedStart', label: 'شروع برنامه‌ای', kind: 'date' }, { key: 'plannedEnd', label: 'پایان برنامه‌ای', kind: 'date' }, { key: 'notes', label: 'یادداشت', kind: 'text', span: 2 },
      ]}
      initial={{ code: pkg?.code ?? `PK-${String(cs.packages.filter((p) => p.masterProjectId === projectId).length + 1).padStart(2, '0')}`, title: pkg?.title ?? '', groupId: pkg?.groupId ?? '', patternId: pkg?.patternId ?? '', contractorOrgId: pkg?.contractorOrgId ?? '', supplierOrgId: pkg?.supplierOrgId ?? '', status: pkg?.status ?? 'active', plannedStart: pkg?.plannedStart ?? null, plannedEnd: pkg?.plannedEnd ?? null, notes: pkg?.notes ?? '' }}
      onSubmit={async (v) => { const id = await cs.savePackage(projectId, { id: pkg?.id, code: String(v.code), title: String(v.title), groupId: (v.groupId as string) || null, patternId: (v.patternId as string) || null, contractorOrgId: (v.contractorOrgId as string) || null, supplierOrgId: (v.supplierOrgId as string) || null, status: v.status as PackageStatus, plannedStart: (v.plannedStart as string) || null, plannedEnd: (v.plannedEnd as string) || null, notes: String(v.notes ?? '') }); if (id) onSaved(id, !pkg) }} />
  )
}

function AddItems({ model, pkgId, initialGroup, onClose }: { model: ReturnType<typeof useMaterialModel>; pkgId: string; initialGroup: string | null; onClose: () => void }) {
  const cs = useMaterialControlStore()
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<string>(initialGroup ?? '')
  const [chosen, setChosen] = useState<Map<string, { qty: number; reason: string; exception: boolean }>>(new Map())
  const inPkg = new Set(model.items.filter((i) => i.packageId === pkgId).map((i) => i.materialId))
  const rows = useMemo(() => model.materials.filter((x) => !inPkg.has(x.id) && (!group || x.groupId === group) && (!q.trim() || [x.itemUid, x.lineNo, x.materialCode, x.description, x.facility, x.tagNumber, x.pipelineNo].join(' ').toLowerCase().includes(q.trim().toLowerCase())))
    .map((x) => ({ x, a: orderAllowance(model.positions.get(x.id)!, 'package') })), [model.materials, model.positions, model.items, group, q]) // eslint-disable-line react-hooks/exhaustive-deps
  const groupCount = (id: string) => model.materials.filter((x) => x.groupId === id && !inPkg.has(x.id) && orderAllowance(model.positions.get(x.id)!, 'package').state !== 'locked').length
  const toggle = (id: string, a: Allowance, exception = false) => setChosen((s) => { const n = new Map(s); if (n.has(id)) n.delete(id); else n.set(id, { qty: a.remaining, reason: a.state === 'shortage' ? a.reasonAuto : '', exception }); return n })
  const patch = (id: string, v: Partial<{ qty: number; reason: string }>) => setChosen((s) => { const n = new Map(s); const c = n.get(id); if (c) n.set(id, { ...c, ...v }); return n })
  const picked = rows.filter((r) => chosen.has(r.x.id))
  const needsReason = (r: (typeof rows)[number]) => { const c = chosen.get(r.x.id)!; return r.a.state === 'locked' || c.qty > r.a.remaining + 1e-9 }
  const bad = picked.some((r) => { const c = chosen.get(r.x.id)!; return !(c.qty > 0) || (needsReason(r) && !c.reason.trim()) })
  const stateChip = (a: Allowance) => <Chip tone={a.state === 'open' ? 'good' : a.state === 'shortage' ? 'warn' : 'neutral'}>{ALLOW_LABEL_FA[a.state]}</Chip>
  return (
    <ModalPortal>
      <div className="im-overlay">
        <div className="im-modal fn-form" style={{ maxWidth: 920 }} role="dialog" aria-modal="true" aria-label="افزودن اقلام">
          <div className="im-modal-head"><div><div className="im-modal-title">افزودن اقلام به بسته</div><p className="im-helper" style={{ margin: 0 }}>ابتدا گروه کالا را انتخاب کنید تا فقط اقلام همان گروه فهرست شود. مقدار پیش‌فرض، آنچه از نیاز هنوز در هیچ بسته یا سفارشی نیست. قلمی که قبلاً سفارش شده، قفل است؛ مگر کسری متریال داشته باشد یا برایش «استثنا» با ذکر علت ثبت شود.</p></div><button className="im-modal-close" onClick={onClose} aria-label="بستن">✕</button></div>
          <div className="mt-grp-chips" role="tablist" aria-label="گروه کالا">
            <button role="tab" aria-selected={!group} className={`mt-grp${!group ? ' on' : ''}`} onClick={() => setGroup('')}><Boxes size={15} /> همهٔ گروه‌ها</button>
            {cs.groups.filter((g) => g.active).map((g) => <button key={g.id} role="tab" aria-selected={group === g.id} className={`mt-grp${group === g.id ? ' on' : ''}`} onClick={() => setGroup(g.id)}><CommodityIcon code={g.code} size={15} tinted={false} />{g.title}<em>{fa(groupCount(g.id))}</em></button>)}
          </div>
          <input type="search" placeholder="جست‌وجوی کد یکتا، ردیف پیمان، کد، شرح، تگ، خط…" value={q} onChange={(e) => setQ(e.target.value)} style={{ margin: '8px 0' }} aria-label="جست‌وجو" />
          <div className="mt-pick-list">
            {rows.length === 0 ? <p className="im-helper" style={{ margin: 12 }}>قلمی برای افزودن در این گروه نیست.</p> : rows.map(({ x, a }) => {
              const c = chosen.get(x.id)
              const locked = a.state === 'locked'
              return (
                <div key={x.id} className={`mt-pick${c ? ' on' : ''}${locked && !c ? ' locked' : ''}`}>
                  <label className="mt-pick-main">
                    <input type="checkbox" checked={!!c} disabled={locked && !c} onChange={() => toggle(x.id, a)} style={{ width: 'auto' }} aria-label={`انتخاب ${x.description}`} />
                    <CommodityIcon code={model.groupById.get(x.groupId ?? '')?.code} size={15} />
                    <span style={{ minWidth: 0, flex: 1 }}><b>{x.description || x.materialCode}</b><small className="fn-code">{x.itemUid} · ردیف {x.lineNo || '—'} · {x.materialCode}{x.facility ? ` · ${x.facility}` : ''}</small></span>
                    {stateChip(a)}
                    <small className="mt-pick-left">{locked ? 'نیاز کاملاً سفارش شده' : `${qtyText(a.remaining, x.unit)} ${a.state === 'shortage' ? 'کسری' : 'باقی‌مانده'}`}</small>
                  </label>
                  {locked && !c && <button className="im-btn im-btn-sm" onClick={() => toggle(x.id, a, true)}>ثبت استثنا برای سفارش مجدد</button>}
                  {c && (
                    <div className="mt-pick-edit">
                      <label>مقدار ({x.unit})<input dir="ltr" inputMode="decimal" value={c.qty || ''} onChange={(e) => patch(x.id, { qty: Number(e.target.value) || 0 })} /></label>
                      {(locked || c.qty > a.remaining + 1e-9 || a.state === 'shortage') && <label style={{ flex: 1 }}>{a.state === 'shortage' && c.qty <= a.remaining + 1e-9 ? 'علت (خودکار)' : 'علت استثنا *'}<input value={c.reason} onChange={(e) => patch(x.id, { reason: e.target.value })} placeholder="مثلاً: ضایعات حین نصب، رد بازرسی ورودی، تغییر طراحی با مجوز…" aria-invalid={needsReason({ x, a }) && !c.reason.trim() ? true : undefined} /></label>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="fn-form-foot"><span className="im-helper" style={{ margin: 0, marginInlineEnd: 'auto' }}>{picked.length ? `${fa(picked.length)} قلم انتخاب شده` : 'قلمی انتخاب نشده'}</span><button className="im-btn im-btn-ghost" onClick={onClose}>انصراف</button><button className="im-btn im-btn-primary" disabled={!picked.length || bad} onClick={async () => { const ok = await cs.addPackageItems(pkgId, picked.map(({ x }) => { const c = chosen.get(x.id)!; return { materialId: x.id, qty: c.qty, unitPrice: x.unitPrice, currency: x.currency, plannedDelivery: x.needDate, exceptionReason: c.reason.trim() } })); if (ok) onClose() }}>افزودن {picked.length ? fa(picked.length) : ''} قلم</button></div>
        </div>
      </div>
    </ModalPortal>
  )
}
