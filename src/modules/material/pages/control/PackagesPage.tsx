import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useMasterDataStore } from '../../../masterdata/store/useMasterDataStore'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { useMaterialModel } from '../../lib/control/useMaterialModel'
import { itemProgress, rollup } from '../../lib/control/progress'
import { Chip, KpiCard, NumInput, Section, fmtD } from '../../../finance/components/fn'
import { FormModal } from '../../../finance/components/FormModal'
import { LinkedRecords, ProgressBar, RaiseButton, bn, fa, pct, qtyText } from '../../components/control/common'
import { StageChain } from '../../components/control/StageChain'
import { StageModal } from '../../components/control/StageModal'
import { PACKAGE_STATUS_LABEL_FA, type ItemStage, type Material, type MtlPackage, type PackageStatus } from '../../types'

/** Purchase packages: what is bought together, from whom, with the supply stages of every item and their progress. */
export function PackagesPage({ projectId }: { projectId: string }) {
  const m = useMaterialModel(projectId)
  const cs = useMaterialControlStore()
  const orgs = useMasterDataStore((s) => s.organizations)
  const [sel, setSel] = useState<string | null>(null)
  const [form, setForm] = useState<MtlPackage | 'new' | null>(null)
  const [adding, setAdding] = useState(false)
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
                    <div style={{ minWidth: 0 }}><b>{mat?.description ?? '—'}</b><div className="im-helper" style={{ margin: 0 }}><span className="fn-code">{mat?.materialCode}</span> · {[mat?.facility, mat?.pipelineNo || mat?.tagNumber].filter(Boolean).join(' · ')}</div></div>
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
        {form && <PackageForm projectId={projectId} pkg={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={(id) => setSel(id)} />}
        {adding && <AddItems model={m} pkgId={pkg.id} onClose={() => setAdding(false)} />}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{p.code}</b><Chip tone={p.status === 'active' ? 'good' : 'neutral'}>{PACKAGE_STATUS_LABEL_FA[p.status]}</Chip></div>
                <div style={{ fontWeight: 700 }}>{p.title}</div>
                <div className="im-helper" style={{ margin: 0 }}>{m.groupById.get(p.groupId ?? '')?.title ?? 'چند گروه'} · {orgName(p.supplierOrgId)} · {fa(n)} قلم</div>
                <ProgressBar actual={r?.actual ?? 0} planned={r?.planned ?? 0} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>واقعی {pct(r?.actual ?? 0)} · برنامه {pct(r?.planned ?? 0)}</span><span>{bn(r?.value ?? 0)} م</span></div>
              </button>
            )
          })}
        </div>
      )}
      {form && <PackageForm projectId={projectId} pkg={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={(id) => setSel(id)} />}
    </div>
  )
}

function PackageForm({ projectId, pkg, onClose, onSaved }: { projectId: string; pkg: MtlPackage | null; onClose: () => void; onSaved: (id: string) => void }) {
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
      onSubmit={async (v) => { const id = await cs.savePackage(projectId, { id: pkg?.id, code: String(v.code), title: String(v.title), groupId: (v.groupId as string) || null, patternId: (v.patternId as string) || null, contractorOrgId: (v.contractorOrgId as string) || null, supplierOrgId: (v.supplierOrgId as string) || null, status: v.status as PackageStatus, plannedStart: (v.plannedStart as string) || null, plannedEnd: (v.plannedEnd as string) || null, notes: String(v.notes ?? '') }); if (id) onSaved(id) }} />
  )
}

function AddItems({ model, pkgId, onClose }: { model: ReturnType<typeof useMaterialModel>; pkgId: string; onClose: () => void }) {
  const cs = useMaterialControlStore()
  const [q, setQ] = useState('')
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const inPkg = new Set(model.items.filter((i) => i.packageId === pkgId).map((i) => i.materialId))
  const packaged = useMemo(() => { const s = new Map<string, number>(); for (const i of model.items) s.set(i.materialId, (s.get(i.materialId) ?? 0) + i.qty); return s }, [model.items])
  const list = model.materials.filter((x) => !inPkg.has(x.id) && (!q.trim() || [x.materialCode, x.description, x.facility, x.tagNumber].join(' ').toLowerCase().includes(q.trim().toLowerCase())))
  const left = (x: Material) => Math.max(0, (model.positions.get(x.id)?.requiredQty ?? 0) - (packaged.get(x.id) ?? 0))
  const toggle = (id: string) => setChosen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  return (
    <div className="im-overlay">
      <div className="im-modal fn-form" style={{ maxWidth: 760 }} role="dialog" aria-modal="true" aria-label="افزودن اقلام">
        <div className="im-modal-head"><div><div className="im-modal-title">افزودن اقلام به بسته</div><p className="im-helper" style={{ margin: 0 }}>مقدار پیش‌فرض، آنچه از نیاز هنوز در هیچ بسته‌ای نیست؛ قیمت پیش‌فرض قیمت مبنای قلم است. بعد از افزودن در خود بسته قابل ویرایش است.</p></div><button className="im-modal-close" onClick={onClose} aria-label="بستن">✕</button></div>
        <input type="search" placeholder="جست‌وجو…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} aria-label="جست‌وجو" />
        <div style={{ maxHeight: 360, overflowY: 'auto', display: 'grid', gap: 4 }}>
          {list.length === 0 ? <p className="im-helper">قلمی برای افزودن نیست.</p> : list.map((x) => (
            <label key={x.id} className="mt-link-row" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={chosen.has(x.id)} onChange={() => toggle(x.id)} style={{ width: 'auto' }} />
              <div style={{ flex: 1, minWidth: 0 }}><b>{x.description || x.materialCode}</b><div><small className="fn-code">{x.materialCode}</small> <small>{x.facility}</small></div></div>
              <small>{qtyText(left(x), x.unit)} باقی‌مانده از نیاز</small>
            </label>
          ))}
        </div>
        <div className="fn-form-foot"><button className="im-btn im-btn-ghost" onClick={onClose}>انصراف</button><button className="im-btn im-btn-primary" disabled={!chosen.size} onClick={async () => { const ok = await cs.addPackageItems(pkgId, model.materials.filter((x) => chosen.has(x.id)).map((x) => ({ materialId: x.id, qty: left(x) || (model.positions.get(x.id)?.requiredQty ?? 0), unitPrice: x.unitPrice, currency: x.currency, plannedDelivery: x.needDate }))); if (ok) onClose() }}>افزودن {chosen.size ? fa(chosen.size) : ''} قلم</button></div>
      </div>
    </div>
  )
}
