import { useEffect, useMemo, useState } from 'react'
import { Pencil, Repeat2, X } from 'lucide-react'
import { useMaterialStore } from '../../store/useMaterialStore'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import type { MaterialModel } from '../../lib/control/useMaterialModel'
import { itemProgress } from '../../lib/control/progress'
import { Chip, DataTable, fmtD } from '../../../finance/components/fn'
import { CHANGE_FIELD_LABEL_FA, CRITICALITY_LABEL_FA, DETAIL_STATUS_LABEL_FA, DISCREPANCY_KIND_LABEL_FA, INSPECTION_STATUS_LABEL_FA, TXN_KIND_LABEL_FA, type AuditRow, type ItemStage } from '../../types'
import { DemoBadge, LinkedRecords, ProgressBar, RaiseButton, bn, fa, pct, qtyText } from './common'
import { StageChain } from './StageChain'
import { StageModal } from './StageModal'
import { ChangeRequestModal } from './ChangeRequestModal'
import { MaterialForm } from './MaterialForm'

type Tab = 'id' | 'supply' | 'ledger' | 'changes' | 'links' | 'history'
const TABS: [Tab, string][] = [['id', 'شناسنامه'], ['supply', 'تأمین و مراحل'], ['ledger', 'ورود و مصرف'], ['changes', 'تغییرات'], ['links', 'ریسک و مسئله'], ['history', 'سابقه']]

/** Everything about one item in one place: identity, supply position and stages, receipts and use, changes with their decisions, linked risks and issues, and the audit trail. */
export function ItemDrawer({ model, materialId, onClose }: { model: MaterialModel; materialId: string; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('id')
  const [edit, setEdit] = useState(false)
  const [change, setChange] = useState(false)
  const [pick, setPick] = useState<{ stage: ItemStage; itemId: string } | null>(null)
  const [audit, setAudit] = useState<AuditRow[] | null>(null)
  const cs = useMaterialControlStore()
  const ms = useMaterialStore()
  const m = model.materials.find((x) => x.id === materialId)
  const p = m ? model.positions.get(m.id) : undefined
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !edit && !change && !pick) onClose() }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [onClose, edit, change, pick])
  useEffect(() => { if (tab === 'history' && m && audit == null) void cs.loadAudit(m.masterProjectId, 200).then((rows) => setAudit(rows.filter((r) => r.rowId === m.id))) }, [tab, m]) // eslint-disable-line react-hooks/exhaustive-deps
  const items = useMemo(() => model.items.filter((i) => i.materialId === materialId), [model.items, materialId])
  const txns = useMemo(() => model.data.txns.filter((t) => t.materialId === materialId), [model.data.txns, materialId])
  const lines = useMemo(() => model.data.warehouseLines.filter((l) => l.materialId === materialId), [model.data.warehouseLines, materialId])
  const changes = cs.changes.filter((c) => c.materialId === materialId)
  const discs = model.discrepancies.filter((d) => d.materialId === materialId)
  if (!m || !p) return null
  const group = m.groupId ? model.groupById.get(m.groupId) : undefined
  const projectId = m.masterProjectId
  const pr = model.priorityById.get(m.id)
  const kv = (k: string, v: React.ReactNode) => <div key={k}><span>{k}</span><b>{v || '—'}</b></div>
  const pickItem = pick ? items.find((i) => i.id === pick.itemId) : undefined
  const pickDef = pick ? cs.stageDefs.find((d) => d.key === pick.stage.stageKey) : undefined
  return (
    <>
      <div className="mt-drawer-bg" onClick={onClose} />
      <aside className="mt-drawer" role="dialog" aria-modal="true" aria-label={m.description}>
        <header>
          <div style={{ minWidth: 0 }}>
            <h2>{m.description || m.materialCode} {m.isDemo && <DemoBadge />}</h2>
            <p className="im-helper" style={{ margin: 0 }}><span className="fn-code">{m.itemUid}</span> · {m.lineNo ? `ردیف پیمان ${m.lineNo} · ` : ''}<span className="fn-code">{m.materialCode}</span> · {group?.title ?? 'بدون گروه'} · {[m.facility, m.pipelineNo || m.tagNumber].filter(Boolean).join(' · ') || 'محل مصرف نامشخص'}</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {cs.can(projectId, 'edit_items') && <button className="im-btn im-btn-sm" onClick={() => setEdit(true)}><Pencil size={13} /> ویرایش</button>}
            <button className="im-btn im-btn-sm" onClick={onClose} aria-label="بستن"><X size={14} /></button>
          </div>
        </header>
        <div className="im-seg" role="tablist" style={{ margin: '10px 18px 0', overflowX: 'auto' }}>{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
        <div className="body">
          {tab === 'id' && (
            <>
              <div className="mt-kv">
                {kv('گروه کالا', group?.title)}{kv('واحد', m.unit)}{kv('مشخصات فنی', m.spec)}{kv('سایز / کلاس', [m.size, m.rating].filter(Boolean).join(' / '))}
                {kv('MTO پیمان', qtyText(p.contractQty, m.unit))}{kv('MTO طراحی تفصیلی', p.detailQty == null ? 'ثبت نشده' : qtyText(p.detailQty, m.unit))}
                {kv('اختلاف طراحی و پیمان', p.diffQty == null ? '—' : <span style={{ color: p.diffQty ? 'var(--im-amber)' : undefined }}>{p.diffQty > 0 ? '+' : ''}{qtyText(p.diffQty, m.unit)}</span>)}{kv('وضعیت طراحی', DETAIL_STATUS_LABEL_FA[m.detailStatus])}
                {kv('ایستگاه', m.facility)}{kv('بخش اجرایی', m.area)}{kv('جبهه کاری', m.front)}{kv('شماره خط', m.pipelineNo)}{kv('ایزومتریک', m.isometricNo)}{kv('نقشه P&ID', [m.pidNumber, m.pidRevision].filter(Boolean).join(' Rev. '))}{kv('تگ', m.tagNumber)}{kv('محل مصرف', m.usageLocation)}
                {kv('تاریخ نیاز', fmtD(m.needDate))}{kv('بحرانی‌بودن', CRITICALITY_LABEL_FA[m.criticality])}{kv('زمان تأمین', m.leadTimeDays ? `${fa(m.leadTimeDays)} روز` : '—')}
                {kv('قیمت واحد', `${fa(m.unitPrice)} ${m.currency}`)}{kv('ضریب به ریال', m.fxRate !== 1 ? fa(m.fxRate, 4) : '—')}{kv('ارزش کل (میلیارد ریال)', bn(p.baseValue))}{kv('مبنای قیمت', [m.priceBasis, m.priceDate && fmtD(m.priceDate)].filter(Boolean).join(' · '))}
              </div>
              {discs.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{discs.filter((d) => d.status !== 'cleared').map((d) => <Chip key={d.id} tone={d.status === 'open' ? 'warn' : 'neutral'}>{DISCREPANCY_KIND_LABEL_FA[d.kind]}</Chip>)}</div>}
              {pr && <div className="im-card" style={{ padding: '10px 14px' }}><b>اولویت: {fa(pr.score)}</b><div className="im-helper" style={{ margin: '2px 0 0' }}>{pr.reasons.join(' · ') || 'بدون عامل فوریت'}</div></div>}
            </>
          )}
          {tab === 'supply' && (
            <>
              <div className="mt-kv">
                {kv('نیاز (طراحی/پیمان)', qtyText(p.requiredQty, m.unit))}{kv('سفارش‌شده', qtyText(p.ordered, m.unit))}{kv('در حال ساخت', qtyText(p.inManufacturing, m.unit))}{kv('آمادهٔ حمل', qtyText(p.readyToShip, m.unit))}
                {kv('حمل‌شده', qtyText(p.shipped, m.unit))}{kv('رسیده به کارگاه', qtyText(p.received, m.unit))}{kv('پذیرفته‌شده', qtyText(p.accepted, m.unit))}{kv('قرنطینه / بازرسی', qtyText(p.quarantine, m.unit))}
                {kv('مردودی', qtyText(p.rejected, m.unit))}{kv('تخصیص‌یافته', qtyText(p.allocated, m.unit))}{kv('مصرف خالص', qtyText(p.netConsumed, m.unit))}{kv('موجودی قابل‌مصرف', qtyText(p.onHand, m.unit))}
                {kv('رزرو‌شده', qtyText(p.reserved, m.unit))}{kv('در راه (سفارش‌شده، نرسیده)', qtyText(p.inbound, m.unit))}{kv('مانده نیاز کارگاه', qtyText(p.siteGap, m.unit))}{kv('پوشش‌داده‌نشده', <span style={{ color: p.uncoveredGap ? 'var(--im-coral)' : undefined }}>{qtyText(p.uncoveredGap, m.unit)}</span>)}
              </div>
              <p className="im-helper" style={{ margin: 0 }}>کالای سفارش‌شده ولی نرسیده موجودی فیزیکی نیست؛ در «در راه» می‌آید.</p>
              {items.length === 0 ? <div className="im-card im-empty">این قلم هنوز در بستهٔ خرید نیامده است.</div> : items.map((it) => {
                const pkg = model.packages.find((x) => x.id === it.packageId)
                const mine = model.stages.filter((s) => s.itemId === it.id)
                const ip = itemProgress(it, model.stages, model.today, m.fxRate)
                return (
                  <div key={it.id} className="im-card" style={{ padding: 12, display: 'grid', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><b>{pkg?.code} · {pkg?.title}</b><span className="im-helper" style={{ margin: 0 }}>{qtyText(it.qty, m.unit)} × {fa(it.unitPrice)} = {bn(ip.value)} میلیارد ریال · پیشرفت {pct(ip.actual)} (برنامه {pct(ip.planned)})</span></div>
                    <ProgressBar actual={ip.actual} planned={ip.planned} />
                    <StageChain stages={mine} defs={cs.stageDefs} today={model.today} onPick={(s) => setPick({ stage: s, itemId: it.id })} />
                  </div>
                )
              })}
            </>
          )}
          {tab === 'ledger' && (
            <>
              <DataTable rows={lines} rowKey={(l) => l.id} empty="هنوز رسیدی ثبت نشده است." cols={[{ key: 'q', label: 'رسید به کارگاه', num: true, render: (l) => qtyText(l.quantityReceived, m.unit) }, { key: 'c', label: 'وضعیت کالا', render: (l) => (l.condition === 'ok' ? 'سالم' : l.condition === 'damaged' ? 'آسیب‌دیده' : 'کسری') }, { key: 'i', label: 'بازرسی ورودی', render: (l) => <Chip tone={l.inspectionStatus === 'accepted' ? 'good' : l.inspectionStatus === 'rejected' ? 'bad' : 'warn'}>{INSPECTION_STATUS_LABEL_FA[l.inspectionStatus]}</Chip> }]} />
              <DataTable rows={txns} rowKey={(t) => t.id} empty="تراکنش مصرف یا انتقالی ثبت نشده است." cols={[
                { key: 'd', label: 'تاریخ', render: (t) => fmtD(t.txnDate) }, { key: 'k', label: 'نوع', render: (t) => TXN_KIND_LABEL_FA[t.kind] }, { key: 'q', label: 'مقدار', num: true, render: (t) => qtyText(t.qty * (t.kind === 'adjust' && t.adjustSign === -1 ? -1 : 1), m.unit) },
                { key: 'w', label: 'محل / عملیات', render: (t) => [t.facility, t.front, t.workOp].filter(Boolean).join(' · ') || '—' }, { key: 's', label: 'وضعیت', render: (t) => <Chip tone={t.status === 'posted' ? 'good' : t.status === 'pending' ? 'warn' : 'neutral'}>{t.status === 'posted' ? 'ثبت‌شده' : t.status === 'pending' ? 'در انتظار تأیید' : 'باطل'}</Chip> }]} />
            </>
          )}
          {tab === 'changes' && (
            <>
              {cs.can(projectId, 'edit_items') && <div><button className="im-btn im-btn-primary im-btn-sm" onClick={() => setChange(true)}><Repeat2 size={13} /> درخواست تغییر مقدار، قیمت یا مشخصات</button></div>}
              <DataTable rows={changes} rowKey={(c) => c.id} empty="تغییری ثبت نشده است." cols={[
                { key: 'd', label: 'تاریخ', render: (c) => fmtD(c.requestedAt) }, { key: 'f', label: 'مورد', render: (c) => CHANGE_FIELD_LABEL_FA[c.field] }, { key: 'v', label: 'از ← به', render: (c) => <span className="mt-num">{c.oldValue || '—'} ← {c.newValue || '—'}</span> },
                { key: 'r', label: 'علت', render: (c) => c.reason }, { key: 's', label: 'تصمیم', render: (c) => <><Chip tone={c.status === 'approved' ? 'good' : c.status === 'rejected' ? 'bad' : 'warn'}>{c.status === 'approved' ? 'تأیید شد' : c.status === 'rejected' ? 'رد شد' : 'در انتظار'}</Chip>{c.decidedBy && <span className="sub">{cs.people.get(c.decidedBy) ?? ''} · {fmtD(c.decidedAt)}</span>}</> }]} />
            </>
          )}
          {tab === 'links' && (
            <>
              <LinkedRecords projectId={projectId} sourceType="material" sourceIds={[m.id]} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <RaiseButton projectId={projectId} sources={[{ type: 'material', id: m.id }]} defaults={{ target: 'risk', title: `ریسک تأمین: ${m.description}`, description: `${m.description} (${m.materialCode}) — ${[m.facility, m.pipelineNo].filter(Boolean).join(' · ')}\nمانده نیاز: ${qtyText(p.siteGap, m.unit)}${m.needDate ? ` · تاریخ نیاز ${m.needDate}` : ''}`, severity: m.criticality === 'A' ? 'high' : 'medium', extra: { category: (m.leadTimeDays ?? 0) >= 90 ? 'proc_longlead' : 'procurement', station: m.facility, front: m.front } }} />
                <RaiseButton projectId={projectId} sources={[{ type: 'material', id: m.id }]} defaults={{ target: 'issue', title: `مسئلهٔ تأمین: ${m.description}`, description: `${m.description} (${m.materialCode})\nکسری پوشش‌داده‌نشده: ${qtyText(p.uncoveredGap, m.unit)}${m.needDate ? ` · تاریخ نیاز ${m.needDate}` : ''}`, severity: pr?.stopRisk ? 'critical' : 'high', extra: { station: m.facility } }} />
              </div>
              <p className="im-helper" style={{ margin: 0 }}>ریسک و مسئله در ماژول‌های خودشان نگهداری می‌شوند و چند قلم می‌توانند به یک رکورد مشترک وصل شوند.</p>
            </>
          )}
          {tab === 'history' && (
            audit == null ? <div className="im-skeleton" style={{ height: 120 }} /> : (
              <DataTable rows={audit} rowKey={(a) => String(a.id)} empty="سابقه‌ای نیست." cols={[
                { key: 't', label: 'زمان', render: (a) => fmtD(a.at) }, { key: 'a', label: 'اقدام', render: (a) => (a.action === 'INSERT' ? 'ثبت' : a.action === 'UPDATE' ? 'ویرایش' : 'حذف') }, { key: 'u', label: 'کاربر', render: (a) => (a.actor ? cs.people.get(a.actor) ?? 'کاربر' : '—') },
                { key: 'c', label: 'تغییر', render: (a) => { const o = a.oldRow ?? {}, n = a.newRow ?? {}; const keys = Object.keys(n).filter((k) => JSON.stringify(o[k]) !== JSON.stringify(n[k]) && !['updated_at', 'updated_by'].includes(k)); return keys.length ? keys.slice(0, 4).map((k) => `${k}: ${String(o[k] ?? '—')} ← ${String(n[k] ?? '—')}`).join(' · ') : '—' } }]} />
            )
          )}
        </div>
      </aside>
      {edit && <MaterialForm projectId={projectId} material={m} onClose={() => setEdit(false)} />}
      {change && <ChangeRequestModal material={m} onClose={() => setChange(false)} />}
      {pick && pickItem && pickDef && <StageModal projectId={projectId} stage={pick.stage} def={pickDef} item={pickItem} material={m} onClose={() => setPick(null)} />}
      {void ms}
    </>
  )
}
