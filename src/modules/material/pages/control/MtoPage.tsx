import { useMemo, useState } from 'react'
import { Check, FileUp, X } from 'lucide-react'
import { useMaterialStore } from '../../store/useMaterialStore'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { useMaterialModel } from '../../lib/control/useMaterialModel'
import { Chip, DataTable, KpiCard, Section, fmtD, type Col } from '../../../finance/components/fn'
import { FormModal } from '../../../finance/components/FormModal'
import { bn, fa } from '../../components/control/common'
import { ItemDrawer } from '../../components/control/ItemDrawer'
import { MtoImport } from '../../components/control/MtoImport'
import { CHANGE_FIELD_LABEL_FA, DETAIL_STATUS_LABEL_FA, type Material, type MtlChange } from '../../types'

type Flt = 'all' | 'diff' | 'outside' | 'nodesign' | 'unlinked'
const FLT: [Flt, string][] = [['all', 'همه'], ['diff', 'اختلاف مقدار'], ['outside', 'خارج از پیمان'], ['nodesign', 'بدون طراحی تفصیلی'], ['unlinked', 'محل مصرف ناقص']]
/** What is still missing to tie an item to where it is used: station, a line / isometric / tag, a drawing. */
export const missingLinks = (x: Material): string[] => [!x.facility && 'ایستگاه', !(x.pipelineNo || x.isometricNo || x.tagNumber) && 'خط/ایزو/تگ', !x.pidNumber && 'نقشه'].filter(Boolean) as string[]

/** MTO control at the end of detail design: contract MTO next to the detail-design MTO, and the quantity/price changes with who asked and who decided. */
export function MtoPage({ projectId, sub }: { projectId: string; sub: string }) {
  const m = useMaterialModel(projectId)
  const cs = useMaterialControlStore()
  const updateMaterial = useMaterialStore((s) => s.updateMaterial)
  const [flt, setFlt] = useState<Flt>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [imp, setImp] = useState<'contract' | 'detail' | null>(null)
  const [decide, setDecide] = useState<{ c: MtlChange; approve: boolean } | null>(null)
  const byId = useMemo(() => new Map(m.materials.map((x) => [x.id, x])), [m.materials])

  const stat = useMemo(() => {
    let withDesign = 0, outside = 0, diff = 0, unlinked = 0, delta = 0, final = 0
    for (const x of m.materials) {
      const p = m.positions.get(x.id)!
      if (p.detailQty != null) withDesign++
      if (!(x.contractQty && x.contractQty > 0) && p.detailQty) outside++
      if (p.diffQty) { diff++; delta += p.diffQty * x.unitPrice * (x.fxRate || 1) }
      if (x.detailStatus === 'final') final++
      if (missingLinks(x).length) unlinked++
    }
    return { withDesign, outside, diff, unlinked, delta, final }
  }, [m.materials, m.positions])
  const rows = useMemo(() => m.materials.filter((x) => {
    const p = m.positions.get(x.id)!
    return flt === 'all' || (flt === 'diff' && !!p.diffQty) || (flt === 'outside' && !(x.contractQty && x.contractQty > 0) && !!p.detailQty) || (flt === 'nodesign' && p.detailQty == null) || (flt === 'unlinked' && missingLinks(x).length > 0)
  }), [m.materials, m.positions, flt])
  const canEdit = cs.can(projectId, 'edit_items')

  const cols: Col<Material>[] = [
    { key: 'n', label: 'قلم', render: (x) => <><span className="strong">{x.description || x.materialCode}</span><span className="sub fn-code">{x.materialCode}{x.facility ? ` · ${x.facility}` : ''}</span></>, sort: (x) => x.description },
    { key: 'c', label: 'MTO پیمان', num: true, render: (x) => <>{fa(m.positions.get(x.id)!.contractQty, 2)}<span className="sub">{x.unit}</span></> },
    { key: 'd', label: 'MTO طراحی', num: true, render: (x) => { const p = m.positions.get(x.id)!; return p.detailQty == null ? <span style={{ opacity: .4 }}>—</span> : fa(p.detailQty, 2) } },
    { key: 'f', label: 'اختلاف', num: true, render: (x) => { const p = m.positions.get(x.id)!; if (p.diffQty == null) return '—'; const pc = p.contractQty ? (p.diffQty / p.contractQty) * 100 : null; return <span style={{ color: p.diffQty > 0 ? 'var(--im-coral)' : p.diffQty < 0 ? 'var(--im-amber)' : undefined }}>{p.diffQty > 0 ? '+' : ''}{fa(p.diffQty, 2)}{pc != null && Math.abs(pc) >= 0.5 ? <span className="sub">{fa(pc)}٪</span> : null}</span> }, sort: (x) => m.positions.get(x.id)!.diffQty ?? 0 },
    { key: 'v', label: 'اثر ارزشی (میلیارد)', num: true, render: (x) => { const p = m.positions.get(x.id)!; return p.diffQty ? bn(p.diffQty * x.unitPrice * (x.fxRate || 1), 2) : '—' } },
    { key: 'l', label: 'اتصال به محل مصرف', render: (x) => { const mis = missingLinks(x); return mis.length ? <Chip tone="warn">{mis.join('، ')} ناقص</Chip> : <Chip tone="good">کامل</Chip> } },
    { key: 's', label: 'وضعیت طراحی', render: (x) => <Chip tone={x.detailStatus === 'final' ? 'good' : x.detailStatus === 'none' ? 'neutral' : 'warn'}>{DETAIL_STATUS_LABEL_FA[x.detailStatus]}</Chip> },
    ...(canEdit ? [{ key: 'a', label: '', render: (x: Material) => x.detailQty != null && x.detailStatus !== 'final' ? <button className="im-btn im-btn-sm" disabled={missingLinks(x).length > 0} title={missingLinks(x).length ? 'اول محل مصرف را کامل کنید' : 'نهایی‌کردن مقدار طراحی'} onClick={(e) => { e.stopPropagation(); void updateMaterial(x.id, { detailStatus: 'final' }) }}><Check size={13} /> نهایی</button> : null } as Col<Material>] : []),
  ]
  const pending = cs.changes.filter((c) => c.masterProjectId === projectId && c.status === 'requested')
  const decided = cs.changes.filter((c) => c.masterProjectId === projectId && c.status !== 'requested')
  const canDecide = cs.can(projectId, 'approve_change') || cs.can(projectId, 'review_change')
  const changeCols: Col<MtlChange>[] = [
    { key: 'd', label: 'تاریخ', render: (c) => fmtD(c.requestedAt), sort: (c) => c.requestedAt },
    { key: 'm', label: 'قلم', render: (c) => { const x = byId.get(c.materialId); return <><span className="strong">{x?.description ?? '—'}</span><span className="sub fn-code">{x?.materialCode}</span></> } },
    { key: 'f', label: 'مورد', render: (c) => CHANGE_FIELD_LABEL_FA[c.field] },
    { key: 'v', label: 'از ← به', render: (c) => <span className="mt-num">{c.oldValue || '—'} ← <b>{c.newValue || '—'}</b></span> },
    { key: 'r', label: 'علت / سند', render: (c) => <>{c.reason}{c.docRef && <span className="sub">{c.docRef}</span>}</> },
    { key: 'u', label: 'درخواست‌کننده', render: (c) => (c.requestedBy ? cs.people.get(c.requestedBy) ?? 'کاربر' : '—') },
    { key: 's', label: 'تصمیم', render: (c) => c.status === 'requested' ? (canDecide ? <span style={{ display: 'inline-flex', gap: 4 }}><button className="im-btn im-btn-primary im-btn-sm" onClick={() => setDecide({ c, approve: true })}><Check size={13} /> تأیید</button><button className="im-btn im-btn-sm" onClick={() => setDecide({ c, approve: false })}><X size={13} /> رد</button></span> : <Chip tone="warn">در انتظار</Chip>) : <><Chip tone={c.status === 'approved' ? 'good' : 'bad'}>{c.status === 'approved' ? 'تأیید شد' : 'رد شد'}</Chip><span className="sub">{c.decidedBy ? cs.people.get(c.decidedBy) ?? '' : ''} · {fmtD(c.decidedAt)}{c.decisionNote ? ` · ${c.decisionNote}` : ''}</span></> },
  ]

  if (sub === 'changes') {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="fn-kpis"><KpiCard i={0} label="در انتظار تصمیم" value={fa(pending.length)} tone={pending.length ? 'warn' : 'good'} /><KpiCard i={1} label="تأییدشده" value={fa(decided.filter((c) => c.status === 'approved').length)} tone="good" /><KpiCard i={2} label="ردشده" value={fa(decided.filter((c) => c.status === 'rejected').length)} /></div>
        <Section title="تغییرات مقدار، قیمت و مشخصات" hint="هر تغییر با علت، تاریخ، درخواست‌کننده و تصمیم‌گیرنده نگه داشته می‌شود؛ مقدار فقط با تأیید اعمال می‌شود. درخواست جدید از پروندهٔ هر قلم ثبت می‌شود." flush>
          <DataTable cols={changeCols} rows={[...pending, ...decided]} rowKey={(c) => c.id} empty="تغییری ثبت نشده است." />
        </Section>
        {decide && <FormModal title={decide.approve ? 'تأیید تغییر' : 'رد تغییر'} subtitle={`${CHANGE_FIELD_LABEL_FA[decide.c.field]}: ${decide.c.oldValue || '—'} ← ${decide.c.newValue || '—'}`} fields={[{ key: 'note', label: decide.approve ? 'توضیح (اختیاری)' : 'علت رد', kind: 'area', required: !decide.approve, span: 2 }]} initial={{ note: '' }} submitLabel={decide.approve ? 'تأیید و اعمال' : 'رد درخواست'} onClose={() => setDecide(null)} onSubmit={async (v) => { await cs.decideChange(decide.c.id, decide.approve, String(v.note ?? '')) }} />}
      </div>
    )
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
        <KpiCard i={0} label="دارای مقدار طراحی" value={`${fa(stat.withDesign)} از ${fa(m.materials.length)}`} sub={`${fa(stat.final)} نهایی`} />
        <KpiCard i={1} label="خارج از MTO پیمان" value={fa(stat.outside)} tone={stat.outside ? 'warn' : 'good'} hint="تصمیم دربارهٔ مسئولیت و نحوهٔ تأمین با کارفرما و مشاور است." />
        <KpiCard i={2} label="اختلاف مقدار" value={fa(stat.diff)} tone={stat.diff ? 'warn' : 'good'} sub={stat.diff ? `اثر ارزشی ${bn(stat.delta, 1)} میلیارد` : undefined} />
        <KpiCard i={3} label="محل مصرف ناقص" value={fa(stat.unlinked)} tone={stat.unlinked ? 'warn' : 'good'} hint="قلمی بدون ایستگاه، خط/ایزو/تگ یا نقشه را نمی‌توان نهایی کرد." />
        <KpiCard i={4} label="تغییر در انتظار تأیید" value={fa(pending.length)} tone={pending.length ? 'warn' : 'good'} />
      </div>
      <div className="mt-filters no-print">
        <div className="mt-pills">{FLT.map(([k, l]) => <button key={k} className={`mt-pill${flt === k ? ' on' : ''}`} onClick={() => setFlt(k)}>{l}</button>)}</div>
        {canEdit && <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 6 }}><button className="im-btn im-btn-sm" onClick={() => setImp('contract')}><FileUp size={14} /> ورود MTO پیمان</button><button className="im-btn im-btn-primary im-btn-sm" onClick={() => setImp('detail')}><FileUp size={14} /> ورود MTO طراحی تفصیلی</button></span>}
      </div>
      <DataTable cols={cols} rows={rows} rowKey={(x) => x.id} onRow={(x) => setOpen(x.id)} empty="قلمی با این فیلتر نیست." />
      <p className="im-helper" style={{ margin: 0 }}>مقدار نیاز پروژه همان مقدار طراحی تفصیلی است و مقدار مبنای ارزش و پیشرفت، مقدار پیمان. قلم خارج از پیمان فقط علامت می‌خورد؛ هیچ تصمیم قراردادی خودکار گرفته نمی‌شود.</p>
      {open && <ItemDrawer model={m} materialId={open} onClose={() => setOpen(null)} />}
      {imp && <MtoImport projectId={projectId} mode={imp} onClose={() => setImp(null)} />}
    </div>
  )
}
