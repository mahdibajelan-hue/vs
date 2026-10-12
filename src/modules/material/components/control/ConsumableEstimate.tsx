import { useMemo } from 'react'
import { Download } from 'lucide-react'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { useMaterialModel } from '../../lib/control/useMaterialModel'
import { NEED_STATUS_LABEL_FA, WELD_BASIS_LABEL_FA, weldNeeds, type MaterialNeed, type WeldSet } from '../../lib/control/weldPlan'
import { writeXlsx } from '../../lib/control/xlsx'
import { Chip, DataTable, NumInput, Section, type Col } from '../../../finance/components/fn'
import { CommodityIcon } from './CommodityIcon'
import { Term } from './Term'
import { fa, qtyText } from './common'

const TONE = { ok: 'good', inbound: 'warn', short: 'bad', no_order: 'bad' } as const

/**
 * Estimated need of consumables: the basis tables (per joint / per metre) multiplied by the work quantities entered HERE — total welded joints and pipe length of each kind of joint.
 * When the execution module exists, the welded / radiographed / insulated counts can come from it instead of being typed.
 */
export function ConsumableEstimate({ projectId }: { projectId: string }) {
  const m = useMaterialModel(projectId)
  const cs = useMaterialControlStore()
  const canEdit = cs.can(projectId, 'edit_items')
  const sets = useMemo(() => cs.weldSets.filter((s) => s.masterProjectId === projectId), [cs.weldSets, projectId])
  const lines = useMemo(() => { const ids = new Set(sets.map((s) => s.id)); return cs.weldLines.filter((l) => ids.has(l.setId)) }, [cs.weldLines, sets])
  const byId = useMemo(() => new Map(m.materials.map((x) => [x.id, x])), [m.materials])
  const needs = useMemo(() => weldNeeds(sets, lines, m.positions), [sets, lines, m.positions])
  const usesMeter = (s: WeldSet) => lines.some((l) => l.setId === s.id && l.basis === 'meter')
  const usesJoint = (s: WeldSet) => lines.some((l) => l.setId === s.id && (l.basis ?? 'joint') === 'joint')
  const setCols: Col<WeldSet>[] = [
    { key: 't', label: 'جدول مبنا', render: (s) => <><span className="strong">{s.title}</span><span className="sub">{[s.jointSize, s.thickness, s.process].filter(Boolean).join(' · ') || '—'}</span></> },
    { key: 'j', label: 'تعداد کل سرجوش', num: true, render: (s) => (!usesJoint(s) ? <span style={{ opacity: .35 }}>—</span> : canEdit ? <NumInput value={s.jointCount} label={`تعداد سرجوش ${s.title}`} decimals={0} onCommit={(n) => void cs.saveWeldSet(projectId, { ...s, jointCount: n })} /> : fa(s.jointCount)) },
    { key: 'l', label: 'طول لوله و اتصالات (متر)', num: true, render: (s) => (!usesMeter(s) ? <span style={{ opacity: .35 }}>—</span> : canEdit ? <NumInput value={s.pipeLengthM} label={`طول ${s.title}`} decimals={2} onCommit={(n) => void cs.saveWeldSet(projectId, { ...s, pipeLengthM: n })} /> : fa(s.pipeLengthM, 2)) },
    { key: 'n', label: 'اقلام', num: true, render: (s) => fa(lines.filter((l) => l.setId === s.id).length) },
  ]
  const needCols: Col<MaterialNeed>[] = [
    { key: 'm', label: 'کالا', render: (n) => { const x = byId.get(n.materialId); return <><span className="strong mt-name"><CommodityIcon code={m.groupById.get(x?.groupId ?? '')?.code} />{x?.description ?? '—'}</span><span className="sub fn-code">{x?.itemUid} · ردیف {x?.lineNo || '—'}</span></> }, sort: (n) => byId.get(n.materialId)?.description ?? '' },
    { key: 'n', label: 'نیاز کل', num: true, render: (n) => <span title={n.parts.map((p) => `${p.title}: ${fa(p.units, 2)} ${p.basis === 'meter' ? 'متر' : 'سرجوش'} × ${fa(p.perUnit, 3)} = ${fa(p.qty, 2)}`).join('\n')}><b>{qtyText(n.need, byId.get(n.materialId)?.unit ?? '', 1)}</b></span>, sort: (n) => n.need },
    { key: 'o', label: 'سفارش‌شده', num: true, render: (n) => fa(n.ordered, 1) }, { key: 'r', label: 'تحویل‌شده', num: true, render: (n) => fa(n.received, 1) },
    { key: 'c', label: 'مصرف‌شده', num: true, render: (n) => fa(n.issued, 1) }, { key: 'h', label: 'موجودی انبار', num: true, render: (n) => fa(n.onHand, 1) },
    { key: 'g', label: 'کسری سفارش', num: true, render: (n) => (n.orderGap > 0 ? <b style={{ color: 'var(--im-coral)' }}>{fa(n.orderGap, 1)}</b> : <span style={{ opacity: .35 }}>—</span>), sort: (n) => n.orderGap },
    { key: 's', label: 'وضعیت', render: (n) => <Chip tone={TONE[n.status]}>{NEED_STATUS_LABEL_FA[n.status]}</Chip> },
  ]
  const exportRows = () => writeXlsx(needs.map((n) => { const x = byId.get(n.materialId); return { 'کد یکتا': x?.itemUid ?? '', 'کالا': x?.description ?? '', 'واحد': x?.unit ?? '', 'نیاز کل': n.need, 'سفارش': n.ordered, 'تحویل': n.received, 'مصرف': n.issued, 'موجودی': n.onHand, 'کسری سفارش': n.orderGap, 'وضعیت': NEED_STATUS_LABEL_FA[n.status] } }), 'برآورد-اقلام-مصرفی.xlsx', 'برآورد')
  return (
    <Section title="برآورد اقلام مصرفی" hint="نیاز = مبنای مصرف هر جدول × حجم کار همین‌جا. حجم کار را بعداً می‌توان از ماژول اجرا (سرجوش جوشکاری، رادیوگرافی و عایق‌شده) گرفت."
      action={<button className="im-btn im-btn-sm no-print" onClick={() => void exportRows()} disabled={!needs.length}><Download size={13} /> اکسل</button>} flush>
      {sets.length === 0 ? <p className="im-helper" style={{ margin: 16 }}>هنوز جدول مبنایی تعریف نشده است. ابتدا در «مصرف ← <Term k="weld_table">جداول مبنای محاسبه اقلام مصرفی</Term>» مبنا را (به‌ازای هر سرجوش یا هر متر) تعریف کنید؛ سپس حجم کار را اینجا وارد کنید.</p> : <>
        <p className="im-helper" style={{ margin: '4px 16px 10px' }}>برای هر جدول، «تعداد کل سرجوش» و برای اقلام بر پایهٔ طول ({WELD_BASIS_LABEL_FA.meter}) «طول لوله و اتصالات» را وارد کنید؛ مصرف و کسری هر کالا خودکار حساب می‌شود.</p>
        <DataTable cols={setCols} rows={sets} rowKey={(s) => s.id} />
        {needs.length > 0 && <div style={{ marginTop: 10 }}><DataTable cols={needCols} rows={needs} rowKey={(n) => n.materialId} /></div>}
      </>}
    </Section>
  )
}
