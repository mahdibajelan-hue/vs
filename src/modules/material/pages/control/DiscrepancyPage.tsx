import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { useMaterialModel } from '../../lib/control/useMaterialModel'
import { writeXlsx } from '../../lib/control/xlsx'
import { Chip, DataTable, KpiCard, Section, fmtD, type Col } from '../../../finance/components/fn'
import { FormModal } from '../../../finance/components/FormModal'
import { LinkedRecords, RaiseButton, fa } from '../../components/control/common'
import { ItemDrawer } from '../../components/control/ItemDrawer'
import { DISCREPANCY_KIND_LABEL_FA, DISCREPANCY_STATUS_LABEL_FA, type DiscrepancyKind, type DiscrepancyStatus, type MtlDiscrepancy } from '../../types'

const TONE: Record<DiscrepancyStatus, 'bad' | 'warn' | 'good' | 'neutral'> = { open: 'bad', in_review: 'warn', escalated: 'warn', resolved: 'good', accepted: 'good', cleared: 'neutral' }
const KIND_ORDER: DiscrepancyKind[] = ['not_in_contract', 'qty_diff', 'no_order', 'under_ordered', 'delay_risk', 'unallocated', 'spec_mismatch', 'unit_mismatch', 'code_mismatch', 'location_mismatch', 'manual']

/** Where the contract MTO, the detail design and the real supply disagree. The list is found from the data; deciding what to do about each item is for people. */
export function DiscrepancyPage({ projectId }: { projectId: string }) {
  const m = useMaterialModel(projectId)
  const cs = useMaterialControlStore()
  const [kind, setKind] = useState<DiscrepancyKind | ''>('')
  const [showClosed, setShowClosed] = useState(false)
  const [decide, setDecide] = useState<MtlDiscrepancy | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const synced = useRef('')
  const byId = useMemo(() => new Map(m.materials.map((x) => [x.id, x])), [m.materials])
  const canSync = cs.can(projectId, 'sync') || cs.can(projectId, 'edit_items')
  const canDecide = cs.can(projectId, 'decide_discrepancy')

  // bring the stored list in line with what the data shows (new findings appear, vanished ones are marked cleared)
  const sig = useMemo(() => m.detected.map((d) => d.fingerprint).sort().join('|') + '#' + m.discrepancies.filter((d) => d.source === 'auto' && (d.status === 'open' || d.status === 'in_review')).map((d) => d.fingerprint).sort().join('|'), [m.detected, m.discrepancies])
  const payload = useMemo(() => m.detected.map((d) => ({ fingerprint: d.fingerprint, kind: d.kind, material_id: d.materialId, diff_qty: d.diffQty, probable_cause: d.probableCause, usage_location: d.usageLocation, impact: d.impact, due_date: d.dueDate })), [m.detected])
  const sync = async () => { setBusy(true); await cs.syncDiscrepancies(projectId, payload); setBusy(false) }
  useEffect(() => {
    if (!canSync || !cs.loaded || synced.current === sig) return
    const stored = new Set(m.discrepancies.map((d) => d.fingerprint))
    const fresh = m.detected.some((d) => !stored.has(d.fingerprint))
    const stale = m.discrepancies.some((d) => d.source === 'auto' && (d.status === 'open' || d.status === 'in_review') && !m.detected.some((x) => x.fingerprint === d.fingerprint))
    synced.current = sig
    if (fresh || stale) void sync()
  }, [sig, canSync, cs.loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  const live = m.discrepancies.filter((d) => showClosed || d.status !== 'cleared')
  const counts = useMemo(() => { const c = new Map<DiscrepancyKind, number>(); for (const d of m.discrepancies) if (d.status === 'open' || d.status === 'in_review') c.set(d.kind, (c.get(d.kind) ?? 0) + 1); return c }, [m.discrepancies])
  const rows = live.filter((d) => !kind || d.kind === kind).sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
  const openN = m.discrepancies.filter((d) => d.status === 'open' || d.status === 'in_review').length
  const overdue = m.discrepancies.filter((d) => (d.status === 'open' || d.status === 'in_review') && d.dueDate && d.dueDate < m.today).length
  const unassigned = m.discrepancies.filter((d) => (d.status === 'open' || d.status === 'in_review') && !d.responsible).length

  const cols: Col<MtlDiscrepancy>[] = [
    { key: 'k', label: 'نوع', render: (d) => <b>{DISCREPANCY_KIND_LABEL_FA[d.kind]}</b>, sort: (d) => KIND_ORDER.indexOf(d.kind) },
    { key: 'm', label: 'قلم و محل مصرف', render: (d) => { const x = d.materialId ? byId.get(d.materialId) : undefined; return <><span className="strong">{x?.description ?? '—'}</span><span className="sub">{x?.materialCode} · {d.usageLocation || '—'}</span></> } },
    { key: 'q', label: 'مقدار اختلاف', num: true, render: (d) => (d.diffQty == null ? '—' : `${d.diffQty > 0 ? '' : ''}${fa(d.diffQty, 2)} ${(d.materialId && byId.get(d.materialId)?.unit) || ''}`) },
    { key: 'c', label: 'علت احتمالی', render: (d) => <span style={{ fontSize: 12 }}>{d.probableCause || '—'}</span> },
    { key: 'i', label: 'اثر بر اجرا', render: (d) => <span style={{ fontSize: 12 }}>{d.impact || '—'}</span> },
    { key: 'r', label: 'مسئول و مهلت', render: (d) => <>{d.responsible ? cs.people.get(d.responsible) ?? 'کاربر' : <span style={{ opacity: .5 }}>تعیین‌نشده</span>}<span className="sub" style={{ color: d.dueDate && d.dueDate < m.today && (d.status === 'open' || d.status === 'in_review') ? 'var(--im-coral)' : undefined }}>{fmtD(d.dueDate)}</span></> },
    { key: 's', label: 'وضعیت', render: (d) => <><Chip tone={TONE[d.status]}>{DISCREPANCY_STATUS_LABEL_FA[d.status]}</Chip>{d.resolution && <span className="sub">{d.resolution}</span>}</> },
    { key: 'a', label: '', render: (d) => <span className="fn-row-actions no-print" style={{ opacity: 1 }}>{d.status !== 'cleared' && (canDecide || cs.can(projectId, 'edit_items')) && <button className="im-btn im-btn-sm" onClick={(e) => { e.stopPropagation(); setDecide(d) }}>تعیین تکلیف</button>}</span> },
  ]
  const toXlsx = () => writeXlsx(rows.map((d) => { const x = d.materialId ? byId.get(d.materialId) : undefined; return { 'نوع': DISCREPANCY_KIND_LABEL_FA[d.kind], 'کد': x?.materialCode ?? '', 'قلم': x?.description ?? '', 'محل مصرف': d.usageLocation, 'مقدار اختلاف': d.diffQty ?? '', 'علت احتمالی': d.probableCause, 'اثر': d.impact, 'مسئول': d.responsible ? cs.people.get(d.responsible) ?? '' : '', 'مهلت': d.dueDate ?? '', 'وضعیت': DISCREPANCY_STATUS_LABEL_FA[d.status], 'نتیجه': d.resolution } }), 'مغایرت-متریال.xlsx', 'مغایرت‌ها')

  const raised = (s: { sources: { id: string }[] }) => m.linksByMaterial.get(s.sources[0]?.id ?? '')?.length
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="مغایرت‌های باز" value={fa(openN)} tone={openN ? 'warn' : 'good'} />
        <KpiCard i={1} label="مهلت‌گذشته" value={fa(overdue)} tone={overdue ? 'bad' : 'good'} />
        <KpiCard i={2} label="بدون مسئول" value={fa(unassigned)} tone={unassigned ? 'warn' : 'good'} />
        <KpiCard i={3} label="خارج از MTO پیمان" value={fa(counts.get('not_in_contract') ?? 0)} hint="فقط علامت می‌خورد؛ تصمیم با کارفرما و مشاور است" tone={counts.get('not_in_contract') ? 'warn' : 'good'} />
      </div>
      <div className="mt-filters no-print">
        <div className="mt-pills"><button className={`mt-pill${kind === '' ? ' on' : ''}`} onClick={() => setKind('')}>همه<em>{fa(openN)}</em></button>{KIND_ORDER.filter((k) => counts.get(k)).map((k) => <button key={k} className={`mt-pill${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>{DISCREPANCY_KIND_LABEL_FA[k]}<em>{fa(counts.get(k) ?? 0)}</em></button>)}</div>
        <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12 }}><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} style={{ width: 'auto' }} /> نمایش خودکار برطرف‌شده‌ها</label>
          {canSync && <button className="im-btn im-btn-sm" disabled={busy} onClick={() => void sync()}><RefreshCw size={13} /> همگام‌سازی</button>}
          <button className="im-btn im-btn-sm" onClick={() => void toXlsx()}><Download size={13} /> اکسل</button>
        </span>
      </div>
      <DataTable cols={cols} rows={rows} rowKey={(d) => d.id} onRow={(d) => d.materialId && setOpen(d.materialId)} empty={m.materials.length ? 'مغایرتی شناسایی نشده است.' : 'ابتدا اقلام MTO را وارد کنید.'} />

      <Section title="پیشنهاد ثبت ریسک و مسئله" hint="اقلام با علت یکسان در یک پیشنهاد جمع شده‌اند تا برای هر قلم رکورد جدا ساخته نشود. ریسک: ممکن است رخ دهد؛ مسئله: رخ داده است." flush>
        {m.suggestions.length === 0 ? <p className="im-helper" style={{ margin: 12 }}>پیشنهادی نیست.</p> : (
          <div style={{ display: 'grid', gap: 8, padding: 12 }}>
            {m.suggestions.map((s) => (
              <div key={s.key} className="mt-link-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <Chip tone={s.target === 'issue' ? 'bad' : 'warn'}>{s.target === 'issue' ? 'مسئله' : 'ریسک'}</Chip>
                <div style={{ flex: 1, minWidth: 220 }}><b>{s.title}</b><div><small>{fa(s.sources.length)} قلم{raised(s) ? ' · قبلاً ثبت شده' : ''}</small></div></div>
                {raised(s) ? <LinkedRecords projectId={projectId} sourceType="material" sourceIds={[s.sources[0].id]} /> : <RaiseButton projectId={projectId} sources={s.sources.map((x) => ({ type: 'material' as const, id: x.id }))} defaults={s} />}
              </div>
            ))}
          </div>
        )}
      </Section>

      {decide && (
        <FormModal title={`${DISCREPANCY_KIND_LABEL_FA[decide.kind]} · تعیین تکلیف`} subtitle={decide.probableCause}
          fields={[
            { key: 'status', label: 'وضعیت', kind: 'select', required: true, options: (['open', 'in_review', 'escalated', 'resolved', 'accepted'] as DiscrepancyStatus[]).filter((s) => canDecide || s === 'open' || s === 'in_review').map((s) => ({ value: s, label: DISCREPANCY_STATUS_LABEL_FA[s] })) },
            { key: 'responsible', label: 'مسئول پیگیری', kind: 'select', options: [...cs.people].map(([id, n]) => ({ value: id, label: n })) },
            { key: 'due', label: 'مهلت اقدام', kind: 'date' },
            { key: 'impact', label: 'اثر بر اجرای پروژه', kind: 'text', span: 2 },
            { key: 'resolution', label: 'نتیجه / تصمیم (برای برطرف‌شده و پذیرفته‌شده لازم است)', kind: 'area', span: 2 },
          ]}
          initial={{ status: decide.status === 'cleared' ? 'open' : decide.status, responsible: decide.responsible ?? '', due: decide.dueDate, impact: decide.impact, resolution: decide.resolution }} submitLabel="ثبت تصمیم" onClose={() => setDecide(null)}
          extra={decide.kind === 'not_in_contract' ? <p className="im-helper">قلم خارج از MTO پیمان است؛ مسئولیت قراردادی، لزوم خرید اضافی و نحوهٔ تأمین را کارفرما و مشاور تعیین می‌کنند و سامانه تصمیمی نمی‌گیرد.</p> : undefined}
          onSubmit={async (v) => { await cs.decideDiscrepancy(decide.id, { status: String(v.status), resolution: String(v.resolution ?? ''), responsible: (v.responsible as string) || null, due: (v.due as string) || null, impact: String(v.impact ?? '') }) }} />
      )}
      {open && <ItemDrawer model={m} materialId={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
