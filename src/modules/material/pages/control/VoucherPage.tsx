import { useMemo, useState } from 'react'
import { ArrowLeftRight, CheckCircle2, Circle, ClipboardSignature, Flame, PackageMinus, Plus, Printer, Recycle, Scale, Trash2, Undo2, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuthStore } from '../../../../store/useAuthStore'
import { ModalPortal } from '../../../../components/common/ModalPortal'
import { JalaliDateInput } from '../../../../components/common/JalaliDateInput'
import { useMasterDataStore } from '../../../masterdata/store/useMasterDataStore'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { useMaterialModel, type MaterialModel } from '../../lib/control/useMaterialModel'
import { useLookupOptions } from '../../lib/control/lookups'
import { Chip, DataTable, KpiCard, fmtD, type Col } from '../../../finance/components/fn'
import { StockConcepts } from '../../components/control/StockConcepts'
import { Term } from '../../components/control/Term'
import { CommodityIcon } from '../../components/control/CommodityIcon'
import { fa, qtyText } from '../../components/control/common'
import { REQUISITION_STATUS_LABEL_FA, SIGNER_ROLES, SIGNER_ROLE_LABEL_FA, TXN_KIND_LABEL_FA, VOUCHER_OPS, VOUCHER_OP_HINT_FA, VOUCHER_OP_LABEL_FA, VOUCHER_OP_TITLE_FA, type MtlTxn, type Requisition, type RequisitionSigner, type SignerRole, type VoucherOp } from '../../types'

const TONE = { awaiting_signatures: 'warn', issued: 'good', rejected: 'bad', cancelled: 'neutral' } as const
const OP_ICON: Record<VoucherOp, LucideIcon> = { issue: PackageMinus, consume: Flame, transfer: ArrowLeftRight, return: Undo2, scrap: Recycle, adjust: Scale }
const OP_TERM: Record<VoucherOp, string> = { issue: 'requisition', consume: 'issue_voucher', transfer: 'transfer', return: 'return', scrap: 'scrap', adjust: 'adjust' }
/** Operations that take goods out of (or shrink) the stock: the stock shown beside a line matters for them. */
const OUTFLOW = new Set<VoucherOp>(['issue', 'consume', 'transfer', 'scrap'])
const stamp = (iso: string | null) => (iso ? new Date(iso).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }) : '')
const CANDIDATE_ROLES: Record<Exclude<SignerRole, 'requester'>, string[]> = { site_supervisor: ['contractor', 'controller', 'manager'], supervision_supervisor: ['consultant', 'inspector', 'employer', 'manager'], storekeeper: ['storekeeper', 'controller', 'manager'] }

/** «حواله انبار»: one voucher for every warehouse operation — issue, consumption, transfer, return, scrap, stock adjustment. The fields follow the operation; four signatures in order (requester, site supervisor, supervision supervisor, storekeeper); the storekeeper's signature posts it to the ledger. A second view shows the ledger of everything posted. */
export function VoucherPage({ projectId }: { projectId: string }) {
  const m = useMaterialModel(projectId)
  const cs = useMaterialControlStore()
  const uid = useAuthStore((s) => s.profile?.id)
  const isAdmin = useAuthStore((s) => !!s.profile?.isAdmin)
  const [view, setView] = useState<'vouchers' | 'ledger'>('vouchers')
  const [form, setForm] = useState<VoucherOp | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [opFilter, setOpFilter] = useState<VoucherOp | ''>('')
  const reqs = useMemo(() => cs.requisitions.filter((r) => r.masterProjectId === projectId && (!opFilter || r.operation === opFilter)), [cs.requisitions, projectId, opFilter])
  const all = cs.requisitions.filter((r) => r.masterProjectId === projectId)
  const signersOf = (id: string) => cs.reqSigners.filter((s) => s.requisitionId === id).sort((a, b) => a.sort - b.sort)
  const myTurn = (r: Requisition) => { if (r.status !== 'awaiting_signatures') return false; const next = signersOf(r.id).find((s) => s.decision !== 'approved'); return !!next && next.userId === uid && next.decision === 'pending' }
  const mine = all.filter(myTurn)
  const isMember = isAdmin || cs.myRoles(projectId).length > 0
  const monthStart = new Date().toISOString().slice(0, 8) + '01'
  const cols: Col<Requisition>[] = [
    { key: 'n', label: 'حواله', render: (r) => <><span className="strong">{r.number}</span><span className="sub">{fmtD(r.requestDate)}</span></>, sort: (r) => r.number },
    { key: 'o', label: 'نوع عملیات', render: (r) => <span className="mt-name"><span className="mt-opi">{(() => { const I = OP_ICON[r.operation]; return <I size={14} /> })()}</span>{VOUCHER_OP_LABEL_FA[r.operation]}</span> },
    { key: 'p', label: 'محل / مسیر', render: (r) => <>{r.operation === 'transfer' ? `${r.fromLoc} ← ${r.toLoc}` : r.operation === 'return' ? `به ${r.toLoc}` : r.facility || r.fromLoc || '—'}<span className="sub">{[r.front, r.workOp, r.purpose || r.reason].filter(Boolean).join(' · ')}</span></> },
    { key: 'i', label: 'اقلام', num: true, render: (r) => fa(cs.reqLines.filter((l) => l.requisitionId === r.id).length) },
    { key: 'q', label: 'درخواست‌کننده', render: (r) => (r.requesterId ? cs.people.get(r.requesterId) ?? 'کاربر' : '—') },
    { key: 's', label: 'امضاها', render: (r) => <SignDots signers={signersOf(r.id)} /> },
    { key: 't', label: 'وضعیت', render: (r) => <Chip tone={TONE[r.status]}>{myTurn(r) ? 'نوبت امضای شما' : REQUISITION_STATUS_LABEL_FA[r.status]}</Chip> },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <StockConcepts />
      <div className="fn-kpis">
        <KpiCard i={0} label="نوبت امضای شما" value={fa(mine.length)} tone={mine.length ? 'warn' : 'neutral'} sub="حواله‌هایی که منتظر امضای شماست" />
        <KpiCard i={1} label="در انتظار امضا" value={fa(all.filter((r) => r.status === 'awaiting_signatures').length)} tone="warn" />
        <KpiCard i={2} label="اجراشده این ماه" value={fa(all.filter((r) => r.status === 'issued' && (r.issuedAt ?? '') >= monthStart).length)} tone="good" />
        <KpiCard i={3} label="ردشده" value={fa(all.filter((r) => r.status === 'rejected').length)} tone={all.some((r) => r.status === 'rejected') ? 'bad' : 'neutral'} />
      </div>
      <div className="mt-filters no-print">
        <div className="mt-pills"><button className={`mt-pill${view === 'vouchers' ? ' on' : ''}`} onClick={() => setView('vouchers')}>حواله‌ها</button><button className={`mt-pill${view === 'ledger' ? ' on' : ''}`} onClick={() => setView('ledger')}>دفتر حرکت‌های انبار</button></div>
        {view === 'vouchers' && isMember && <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>{VOUCHER_OPS.map((o) => { const I = OP_ICON[o]; return <button key={o} className={`im-btn im-btn-sm${o === 'issue' ? ' im-btn-primary' : ''}`} onClick={() => setForm(o)}><I size={13} /> {VOUCHER_OP_LABEL_FA[o]}</button> })}</span>}
      </div>
      {view === 'ledger' ? <Ledger model={m} projectId={projectId} /> : (
        <>
          <div className="mt-pills no-print"><button className={`mt-pill${!opFilter ? ' on' : ''}`} onClick={() => setOpFilter('')}>همهٔ عملیات‌ها<em>{fa(all.length)}</em></button>{VOUCHER_OPS.filter((o) => all.some((r) => r.operation === o)).map((o) => <button key={o} className={`mt-pill${opFilter === o ? ' on' : ''}`} onClick={() => setOpFilter(o)}>{VOUCHER_OP_LABEL_FA[o]}<em>{fa(all.filter((r) => r.operation === o).length)}</em></button>)}</div>
          <DataTable cols={cols} rows={reqs} rowKey={(r) => r.id} onRow={(r) => setOpen(r.id)} empty="هنوز حواله‌ای ثبت نشده است. از دکمه‌های بالا نوع عملیات را انتخاب کنید." />
        </>
      )}
      {form && <VoucherForm projectId={projectId} model={m} initialOp={form} onClose={(id) => { setForm(null); if (id) setOpen(id) }} />}
      {open && <VoucherSheet id={open} model={m} onClose={() => setOpen(null)} />}
    </div>
  )
}

function SignDots({ signers }: { signers: RequisitionSigner[] }) {
  const cs = useMaterialControlStore()
  return (
    <span className="mt-sdots" aria-label="وضعیت امضاها">
      {signers.map((s) => <span key={s.id} className={`mt-sdot ${s.decision}`} title={`${SIGNER_ROLE_LABEL_FA[s.role]}: ${s.userId ? cs.people.get(s.userId) ?? 'کاربر' : '—'} — ${s.decision === 'approved' ? 'امضا شد' : s.decision === 'rejected' ? 'رد کرد' : 'در انتظار'}`}>{s.decision === 'approved' ? <CheckCircle2 size={15} /> : s.decision === 'rejected' ? <XCircle size={15} /> : <Circle size={15} />}</span>)}
    </span>
  )
}

/** Everything posted to the stock ledger, with the approval of scrap and adjustments that were entered the old way and still wait. */
function Ledger({ model: m, projectId }: { model: MaterialModel; projectId: string }) {
  const cs = useMaterialControlStore()
  const byId = useMemo(() => new Map(m.materials.map((x) => [x.id, x])), [m.materials])
  const [decide, setDecide] = useState<MtlTxn | null>(null)
  const canApprove = cs.can(projectId, 'approve_txn')
  const cols: Col<MtlTxn>[] = [
    { key: 'd', label: 'تاریخ', render: (t) => fmtD(t.txnDate), sort: (t) => t.txnDate },
    { key: 'k', label: 'نوع', render: (t) => TXN_KIND_LABEL_FA[t.kind] },
    { key: 'm', label: 'قلم', render: (t) => <><span className="strong">{byId.get(t.materialId)?.description ?? '—'}</span><span className="sub fn-code">{byId.get(t.materialId)?.itemUid}</span></> },
    { key: 'q', label: 'مقدار', num: true, render: (t) => `${t.kind === 'adjust' && t.adjustSign === -1 ? '−' : ''}${fa(t.qty, 2)} ${byId.get(t.materialId)?.unit ?? ''}` },
    { key: 'w', label: 'مبدأ / مقصد / جبهه', render: (t) => [t.fromLoc && `از ${t.fromLoc}`, t.toLoc && `به ${t.toLoc}`, t.facility, t.front, t.workOp].filter(Boolean).join(' · ') || '—' },
    { key: 'r', label: 'سند', render: (t) => t.docRef || '—' },
    { key: 's', label: 'وضعیت', render: (t) => (t.status === 'pending' && canApprove ? <button className="im-btn im-btn-primary im-btn-sm" onClick={() => setDecide(t)}>تصمیم</button> : <Chip tone={t.status === 'posted' ? 'good' : t.status === 'pending' ? 'warn' : 'neutral'}>{t.status === 'posted' ? 'ثبت‌شده' : t.status === 'pending' ? 'در انتظار تأیید' : 'ابطال'}</Chip>) },
  ]
  return (
    <>
      <DataTable cols={cols} rows={m.data.txns} rowKey={(t) => t.id} empty="حرکتی در دفتر ثبت نشده است." />
      {decide && (
        <ModalPortal><div className="im-overlay"><div className="im-modal" style={{ maxWidth: 460 }} role="dialog" aria-modal="true" aria-label="تصمیم دربارهٔ تراکنش">
          <div className="im-modal-head"><div className="im-modal-title">{TXN_KIND_LABEL_FA[decide.kind]} در انتظار تأیید</div><button className="im-modal-close" onClick={() => setDecide(null)} aria-label="بستن">✕</button></div>
          <p className="im-helper">{byId.get(decide.materialId)?.description} — {fa(decide.qty, 2)} {byId.get(decide.materialId)?.unit}{decide.notes ? ` · ${decide.notes}` : ''}</p>
          <div className="fn-form-foot"><button className="im-btn im-btn-ghost" onClick={() => setDecide(null)}>انصراف</button><button className="im-btn im-btn-danger" onClick={async () => { const why = window.prompt('علت رد'); if (why?.trim() && await cs.decideTxn(decide.id, false, why.trim())) setDecide(null) }}>رد</button><button className="im-btn im-btn-primary" onClick={async () => { if (await cs.decideTxn(decide.id, true, '')) setDecide(null) }}>تأیید</button></div>
        </div></div></ModalPortal>
      )}
    </>
  )
}

function VoucherForm({ projectId, model: m, initialOp, onClose }: { projectId: string; model: MaterialModel; initialOp: VoucherOp; onClose: (id?: string) => void }) {
  const cs = useMaterialControlStore()
  const orgs = useMasterDataStore((s) => s.organizations)
  const [op, setOp] = useState<VoucherOp>(initialOp)
  const [facility, setFacility] = useState('')
  const [front, setFront] = useState('')
  const [fromLoc, setFromLoc] = useState('')
  const [toLoc, setToLoc] = useState('')
  const [purpose, setPurpose] = useState('')
  const [needed, setNeeded] = useState('')
  const [notes, setNotes] = useState('')
  const [workOp, setWorkOp] = useState('')
  const [actQty, setActQty] = useState(0)
  const [actUnit, setActUnit] = useState('')
  const [contractor, setContractor] = useState('')
  const [sign, setSign] = useState<1 | -1>(-1)
  const [reason, setReason] = useState('')
  const [lines, setLines] = useState<{ materialId: string; qty: number }[]>([])
  const [group, setGroup] = useState('')
  const [pick, setPick] = useState('')
  const [signers, setSigners] = useState<Record<string, string>>({ site_supervisor: '', supervision_supervisor: '', storekeeper: '' })
  const [busy, setBusy] = useState(false)
  const facOpts = useLookupOptions(projectId, 'facility'), frontOpts = useLookupOptions(projectId, 'front'), whOpts = useLookupOptions(projectId, 'warehouse')
  const members = useMemo(() => cs.roles.filter((r) => r.projectId === projectId && r.active), [cs.roles, projectId])
  const candidates = (role: Exclude<SignerRole, 'requester'>) => { const ids = new Set(members.filter((r) => CANDIDATE_ROLES[role].includes(r.role)).map((r) => r.userId)); const all = ids.size ? [...ids] : [...new Set(members.map((r) => r.userId))]; return all.map((id) => ({ id, name: cs.people.get(id) ?? 'کاربر' })) }
  const options = m.materials.filter((x) => (!group || x.groupId === group) && !lines.some((l) => l.materialId === x.id))
  const byId = useMemo(() => new Map(m.materials.map((x) => [x.id, x])), [m.materials])
  const stock = (id: string) => m.positions.get(id)?.onHand ?? 0
  const pastOps = useMemo(() => [...new Set(m.data.txns.map((t) => t.workOp).filter(Boolean))].sort(), [m.data.txns])
  const needsFacility = op === 'issue' || op === 'consume'
  const placesOk = op === 'transfer' ? !!fromLoc && !!toLoc && fromLoc !== toLoc : op === 'return' ? !!toLoc : true
  const valid = lines.length > 0 && lines.every((l) => l.qty > 0) && Object.values(signers).every(Boolean) && (!needsFacility || !!facility) && placesOk && (op !== 'consume' || !!workOp.trim()) && ((op !== 'scrap' && op !== 'adjust') || !!reason.trim())
  const field = (id: string, label: string, el: React.ReactNode, span2 = false) => <div className="im-field" style={span2 ? { gridColumn: '1 / -1' } : undefined}><label htmlFor={id}>{label}</label>{el}</div>
  const sel = (id: string, v: string, set: (x: string) => void, opts: { value: string; label: string }[], empty = '—') => <select id={id} value={v} onChange={(e) => set(e.target.value)}><option value="">{empty}</option>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
  return (
    <ModalPortal>
      <div className="im-overlay">
        <div className="im-modal fn-form" style={{ maxWidth: 960 }} role="dialog" aria-modal="true" aria-label="حواله انبار">
          <div className="im-modal-head"><div><div className="im-modal-title">حواله انبار</div><p className="im-helper" style={{ margin: 0 }}>نوع عملیات را انتخاب کنید؛ فیلم‌های فرم بر اساس آن تغییر می‌کند. با ثبت، امضای شما درج می‌شود و نوبت به امضاکنندگان بعدی می‌رسد.</p></div><button className="im-modal-close" onClick={() => onClose()} aria-label="بستن">✕</button></div>
          <div className="mt-ops" role="tablist" aria-label="نوع عملیات">
            {VOUCHER_OPS.map((o) => { const I = OP_ICON[o]; return <button key={o} role="tab" aria-selected={op === o} className={`mt-op${op === o ? ' on' : ''}`} onClick={() => setOp(o)}><I size={17} /><b><Term k={OP_TERM[o]}>{VOUCHER_OP_LABEL_FA[o]}</Term></b></button> })}
          </div>
          <p className="mt-op-hint">{VOUCHER_OP_HINT_FA[op]}</p>
          <div className="fn-form-grid">
            {(op === 'issue' || op === 'consume') && field('vf-fac', 'محل مصرف (ایستگاه / تأسیسات) *', sel('vf-fac', facility, setFacility, facOpts, 'انتخاب کنید…'))}
            {(op === 'issue' || op === 'consume' || op === 'return') && field('vf-front', 'جبهه کاری / بخش', sel('vf-front', front, setFront, frontOpts))}
            {op === 'issue' && field('vf-from', 'از انبار', sel('vf-from', fromLoc, setFromLoc, whOpts))}
            {op === 'transfer' && <>{field('vf-from', 'از انبار / محل *', sel('vf-from', fromLoc, setFromLoc, whOpts, 'انتخاب کنید…'))}{field('vf-to', 'به انبار / محل *', sel('vf-to', toLoc, setToLoc, whOpts, 'انتخاب کنید…'))}</>}
            {op === 'return' && <>{field('vf-fac', 'برگشت از (ایستگاه / تأسیسات)', sel('vf-fac', facility, setFacility, facOpts))}{field('vf-to', 'به انبار *', sel('vf-to', toLoc, setToLoc, whOpts, 'انتخاب کنید…'))}</>}
            {(op === 'scrap' || op === 'adjust') && field('vf-from', 'انبار / محل', sel('vf-from', fromLoc, setFromLoc, whOpts))}
            {op === 'consume' && <>
              {field('vf-work', 'نوع عملیات *', <><input id="vf-work" list="vf-work-l" value={workOp} onChange={(e) => setWorkOp(e.target.value)} placeholder="مثلاً جوشکاری سرجوش ۳۰ اینچ" /><datalist id="vf-work-l">{pastOps.map((x) => <option key={x} value={x} />)}</datalist></>)}
              {field('vf-ct', 'پیمانکار', sel('vf-ct', contractor, setContractor, orgs.map((o) => ({ value: o.id, label: o.name }))))}
              {field('vf-aq', 'حجم کار انجام‌شده', <input id="vf-aq" dir="ltr" inputMode="decimal" value={actQty || ''} onChange={(e) => setActQty(Number(e.target.value.replace(/[٫]/g, '.')) || 0)} placeholder="مثلاً تعداد سرجوش یا طول" />)}
              {field('vf-au', 'واحد حجم کار', <input id="vf-au" value={actUnit} onChange={(e) => setActUnit(e.target.value)} placeholder="سرجوش، متر…" />)}
            </>}
            {op === 'adjust' && field('vf-sign', 'جهت تعدیل *', <select id="vf-sign" value={String(sign)} onChange={(e) => setSign(Number(e.target.value) === 1 ? 1 : -1)}><option value="-1">کاهش موجودی (دفتر بیشتر از شمارش)</option><option value="1">افزایش موجودی (شمارش بیشتر از دفتر)</option></select>)}
            {(op === 'scrap' || op === 'adjust') && field('vf-reason', op === 'scrap' ? 'علت ضایعات *' : 'علت تعدیل / شمارهٔ برگ شمارش *', <input id="vf-reason" value={reason} onChange={(e) => setReason(e.target.value)} />, true)}
            {(op === 'issue' || op === 'consume') && field('vf-purpose', 'هدف مصرف', <input id="vf-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="مثلاً نصب فلنج‌های خط ورودی" />)}
            {(op === 'issue' || op === 'consume') && field('vf-need', 'نیاز تا تاریخ', <JalaliDateInput value={needed} onChange={setNeeded} />)}
            {field('vf-notes', 'توضیح', <input id="vf-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />, op === 'transfer' || op === 'return')}
          </div>
          <div className="mt-grp-chips" role="tablist" aria-label="گروه کالا">
            <button role="tab" aria-selected={!group} className={`mt-grp${!group ? ' on' : ''}`} onClick={() => setGroup('')}>همهٔ گروه‌ها</button>
            {cs.groups.filter((g) => g.active).map((g) => <button key={g.id} role="tab" aria-selected={group === g.id} className={`mt-grp${group === g.id ? ' on' : ''}`} onClick={() => setGroup(g.id)}><CommodityIcon code={g.code} size={15} tinted={false} />{g.title}</button>)}
          </div>
          <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
            <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="قلم" style={{ flex: 1 }}><option value="">قلم را انتخاب کنید…</option>{options.map((x) => <option key={x.id} value={x.id}>{x.itemUid} · {x.description || x.materialCode} — موجودی {qtyText(stock(x.id), x.unit, 1)}</option>)}</select>
            <button className="im-btn im-btn-sm" disabled={!pick} onClick={() => { setLines((x) => [...x, { materialId: pick, qty: 1 }]); setPick('') }}><Plus size={14} /> افزودن به فهرست</button>
          </div>
          <div className="fn-tbl-wrap" style={{ maxHeight: 250 }}>
            <table className="fn-tbl"><thead><tr><th>قلم</th><th className="num">موجودی انبار</th><th className="num">مقدار</th><th /></tr></thead>
              <tbody>{lines.length === 0 ? <tr><td colSpan={4} className="fn-empty">هنوز قلمی اضافه نشده است.</td></tr> : lines.map((l, i) => { const x = byId.get(l.materialId)!; const s = stock(l.materialId); const out = OUTFLOW.has(op) || (op === 'adjust' && sign === -1); return (
                <tr key={l.materialId}>
                  <td><span className="strong mt-name"><CommodityIcon code={m.groupById.get(x.groupId ?? '')?.code} />{x.description || x.materialCode}</span><span className="sub fn-code">{x.itemUid} · ردیف {x.lineNo || '—'}</span></td>
                  <td className="num"><b style={{ color: out && s <= 0 ? 'var(--im-coral)' : undefined }}>{qtyText(s, x.unit, 1)}</b></td>
                  <td className="num"><input dir="ltr" inputMode="decimal" className="fn-cell-input" value={l.qty || ''} onChange={(e) => setLines((a) => a.map((y, j) => (j === i ? { ...y, qty: Number(e.target.value.replace(/[٫]/g, '.')) || 0 } : y)))} aria-label={`مقدار ${x.description}`} /> {x.unit}{out && l.qty > s && <span className="sub" style={{ color: 'var(--im-amber)' }}>بیش از موجودی — اجرای جزئی</span>}</td>
                  <td><button className="im-btn im-btn-sm" aria-label="حذف از فهرست" onClick={() => setLines((a) => a.filter((_, j) => j !== i))}><Trash2 size={13} /></button></td>
                </tr>) })}</tbody></table>
          </div>
          <h4 className="mt-sig-title"><ClipboardSignature size={15} /> امضاکنندگان حواله</h4>
          <div className="mt-sig-grid">
            <div className="mt-sig-box on"><small>{SIGNER_ROLE_LABEL_FA.requester}</small><b>شما</b><em>با ثبت حواله امضا می‌شود</em></div>
            {(['site_supervisor', 'supervision_supervisor', 'storekeeper'] as const).map((role) => (
              <div key={role} className="mt-sig-box"><small>{SIGNER_ROLE_LABEL_FA[role]} *</small>
                <select value={signers[role]} onChange={(e) => setSigners((s) => ({ ...s, [role]: e.target.value }))} aria-label={SIGNER_ROLE_LABEL_FA[role]}><option value="">انتخاب کنید…</option>{candidates(role).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              </div>
            ))}
          </div>
          {members.length === 0 && <p className="im-helper" style={{ color: 'var(--im-amber)' }}>برای این پروژه هنوز نقشی (پیمانکار، مشاور، انباردار…) ثبت نشده است. از «تنظیمات ← نقش‌ها و دسترسی» افراد را به پروژه اضافه کنید.</p>}
          <div className="fn-form-foot"><button className="im-btn im-btn-ghost" onClick={() => onClose()}>انصراف</button>
            <button className="im-btn im-btn-primary" disabled={!valid || busy} onClick={async () => { setBusy(true); const id = await cs.reqCreate({ projectId, operation: op, facility: facility.trim(), front: front.trim(), purpose: purpose.trim(), neededBy: needed || null, notes: notes.trim(), fromLoc, toLoc, workOp: workOp.trim(), activityQty: actQty || null, activityUnit: actUnit.trim(), contractorId: contractor || null, adjustSign: op === 'adjust' ? sign : 1, reason: reason.trim(), lines, signers: signers as { site_supervisor: string; supervision_supervisor: string; storekeeper: string } }); setBusy(false); if (id) onClose(id) }}>{busy ? 'در حال ثبت…' : 'ثبت و امضا'}</button></div>
        </div>
      </div>
    </ModalPortal>
  )
}

/** The voucher as a document: the screen view is also the print layout kept by the storekeeper (A4, title by operation, fields by operation, lines, four signatures, archive footer). */
function VoucherSheet({ id, model: m, onClose }: { id: string; model: MaterialModel; onClose: () => void }) {
  const cs = useMaterialControlStore()
  const uid = useAuthStore((s) => s.profile?.id)
  const isAdmin = useAuthStore((s) => !!s.profile?.isAdmin)
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === m.projectId))
  const orgs = useMasterDataStore((s) => s.organizations)
  const r = cs.requisitions.find((x) => x.id === id)
  const lines = cs.reqLines.filter((l) => l.requisitionId === id)
  const signers = cs.reqSigners.filter((s) => s.requisitionId === id).sort((a, b) => a.sort - b.sort)
  const next = signers.find((s) => s.decision !== 'approved')
  const mineNow = r?.status === 'awaiting_signatures' && !!next && next.userId === uid && next.decision === 'pending' ? next : null
  const [issue, setIssue] = useState<Record<string, number>>({})
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  if (!r) return null
  const byId = new Map(m.materials.map((x) => [x.id, x]))
  const who = (u: string | null) => (u ? cs.people.get(u) ?? 'کاربر' : '—')
  const isStore = mineNow?.role === 'storekeeper'
  const outflow = OUTFLOW.has(r.operation) || (r.operation === 'adjust' && r.adjustSign === -1)
  const qtyFor = (l: (typeof lines)[number]) => issue[l.id] ?? (outflow ? Math.min(l.qtyRequested, m.positions.get(l.materialId)?.onHand ?? 0) : l.qtyRequested)
  const run = async (decision: 'approve' | 'reject') => {
    setBusy(true)
    const res = await cs.reqSign(id, decision, note, isStore && decision === 'approve' ? lines.map((l) => ({ lineId: l.id, qty: qtyFor(l) })) : undefined)
    setBusy(false)
    if (res) onClose()
  }
  const print = () => { document.body.classList.add('mt-printing'); const off = () => { document.body.classList.remove('mt-printing'); window.removeEventListener('afterprint', off) }; window.addEventListener('afterprint', off); window.print() }
  const info: [string, string][] = ([
    ['نوع عملیات', VOUCHER_OP_LABEL_FA[r.operation]],
    ...(r.operation === 'transfer' ? [['از انبار / محل', r.fromLoc], ['به انبار / محل', r.toLoc]] : r.operation === 'return' ? [['برگشت از', r.facility], ['به انبار', r.toLoc]] : [['محل مصرف', r.facility], ['از انبار', r.fromLoc]]),
    ['جبهه کاری / بخش', r.front],
    ...(r.operation === 'consume' ? [['نوع عملیات کار', r.workOp], ['حجم کار', r.activityQty ? `${fa(r.activityQty, 1)} ${r.activityUnit}` : ''], ['پیمانکار', orgs.find((o) => o.id === r.contractorOrgId)?.name ?? '']] : []),
    ...(r.operation === 'adjust' ? [['جهت تعدیل', r.adjustSign === 1 ? 'افزایش موجودی' : 'کاهش موجودی']] : []),
    ...(r.operation === 'scrap' || r.operation === 'adjust' ? [['علت', r.reason]] : [['هدف مصرف', r.purpose]]),
    ...(r.neededBy ? [['نیاز تا تاریخ', fmtD(r.neededBy)]] : []),
  ] as [string, string][]).filter(([, v]) => v)
  return (
    <ModalPortal>
      <div className="im-overlay">
        <div className="im-modal fn-form" style={{ maxWidth: 980 }} role="dialog" aria-modal="true" aria-label={`حواله ${r.number}`}>
          <div className="im-modal-head"><div><div className="im-modal-title">حواله انبار {r.number}</div><p className="im-helper" style={{ margin: 0 }}>{REQUISITION_STATUS_LABEL_FA[r.status]}{r.status === 'rejected' && r.rejectReason ? ` — ${r.rejectReason}` : ''}</p></div><button className="im-modal-close" onClick={onClose} aria-label="بستن">✕</button></div>
          <div className="mt-doc mt-printable">
            <header className="mt-doc-head">
              <div><small>{project?.officialName ?? ''}</small><h2>{VOUCHER_OP_TITLE_FA[r.operation]}</h2></div>
              <dl><div><dt>شمارهٔ حواله</dt><dd className="fn-code">{r.number}</dd></div><div><dt>تاریخ</dt><dd>{fmtD(r.requestDate)}</dd></div><div><dt>وضعیت</dt><dd>{REQUISITION_STATUS_LABEL_FA[r.status]}</dd></div></dl>
            </header>
            <div className="mt-doc-info">{info.map(([k, v]) => <div key={k}><small>{k}</small><b>{v}</b></div>)}</div>
            <table className="mt-doc-tbl">
              <thead><tr><th>ردیف</th><th>کد یکتا</th><th>شرح کالا</th><th>مشخصات</th><th>واحد</th><th>موجودی هنگام ثبت</th><th>مقدار درخواستی</th><th>{r.status === 'issued' ? 'مقدار اجراشده' : 'مقدار اجرا'}</th></tr></thead>
              <tbody>{lines.map((l, i) => { const x = byId.get(l.materialId); return (
                <tr key={l.id}><td>{fa(i + 1)}</td><td className="fn-code">{x?.itemUid}</td><td><b>{x?.description || x?.materialCode}</b><small>ردیف پیمان {x?.lineNo || '—'} · {x?.materialCode}</small></td><td>{[x?.spec, x?.size].filter(Boolean).join(' · ') || '—'}</td><td>{x?.unit}</td>
                  <td>{fa(r.status === 'awaiting_signatures' ? m.positions.get(l.materialId)?.onHand ?? 0 : l.stockAtRequest, 1)}</td><td>{fa(l.qtyRequested, 2)}</td>
                  <td>{r.status === 'issued' ? <b>{fa(l.qtyIssued, 2)}</b> : isStore ? <input dir="ltr" inputMode="decimal" className="fn-cell-input no-print" value={qtyFor(l)} onChange={(e) => setIssue((s) => ({ ...s, [l.id]: Math.max(0, Number(e.target.value.replace(/[٫]/g, '.')) || 0) }))} aria-label={`مقدار اجرا ${x?.description}`} /> : '—'}</td></tr>) })}</tbody>
            </table>
            {r.notes && <p className="mt-doc-note"><b>توضیح:</b> {r.notes}</p>}
            <div className="mt-sign-row">{SIGNER_ROLES.map((role) => { const s = signers.find((x) => x.role === role); return <SigBox key={role} role={role} s={s} name={who(s?.userId ?? null)} /> })}</div>
            <footer className="mt-doc-foot"><span>نسخهٔ انباردار — برای بایگانی</span><span className="fn-code">{r.number}</span><span>چاپ: {new Date().toLocaleDateString('fa-IR')}</span></footer>
          </div>
          {mineNow && (
            <div className="mt-sign-act no-print">
              <div className="im-field" style={{ margin: 0, flex: 1 }}><label htmlFor="rq-note">{isStore ? 'توضیح (اختیاری)' : 'توضیح (برای رد لازم است)'}</label><input id="rq-note" value={note} onChange={(e) => setNote(e.target.value)} /></div>
              <button className="im-btn im-btn-primary" disabled={busy} onClick={() => void run('approve')}>{isStore ? 'امضا و اجرای حواله' : 'امضا و تأیید'}</button>
              <button className="im-btn im-btn-danger" disabled={busy || !note.trim()} onClick={() => void run('reject')}>رد حواله</button>
            </div>
          )}
          {isStore && <p className="im-helper no-print" style={{ margin: '6px 0 0' }}>مقدار اجرای هر قلم را می‌توان کمتر از درخواست تعیین کرد{outflow ? ' (حداکثر برابر موجودی انبار)' : ''}؛ با امضا، حرکت همین مقدارها در دفتر انبار ثبت می‌شود.</p>}
          {!mineNow && r.status === 'awaiting_signatures' && next && <p className="im-helper no-print" style={{ margin: '8px 0 0' }}>در انتظار امضای {SIGNER_ROLE_LABEL_FA[next.role]}: {who(next.userId)}</p>}
          <div className="fn-form-foot no-print">
            {r.status === 'awaiting_signatures' && (isAdmin || r.requesterId === uid) && <button className="im-btn im-btn-danger" onClick={async () => { const why = window.prompt('علت لغو حواله را بنویسید'); if (why?.trim()) { if (await cs.reqCancel(id, why.trim())) onClose() } }}>لغو حواله</button>}
            <button className="im-btn" style={{ marginInlineStart: 'auto' }} onClick={print}><Printer size={14} /> چاپ حواله</button>
            <button className="im-btn im-btn-ghost" onClick={onClose}>بستن</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

function SigBox({ role, s, name }: { role: SignerRole; s?: RequisitionSigner; name: string }) {
  const state = s?.decision ?? 'pending'
  return (
    <div className={`mt-sig-box ${state}`}>
      <small>{SIGNER_ROLE_LABEL_FA[role]}</small>
      <div className="mt-sig-mark">{state === 'approved' ? (s?.signatureImage ? <img src={s.signatureImage} alt={`امضای ${name}`} /> : <span className="mt-sig-e">{name}</span>) : state === 'rejected' ? <span className="mt-sig-x">رد شد</span> : <span className="mt-sig-p">در انتظار امضا</span>}</div>
      <b>{name}</b>
      <em>{s?.signedAt ? stamp(s.signedAt) : '—'}</em>
      {s?.note && <i>{s.note}</i>}
    </div>
  )
}
