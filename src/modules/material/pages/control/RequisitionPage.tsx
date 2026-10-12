import { useMemo, useState } from 'react'
import { CheckCircle2, Circle, ClipboardSignature, Plus, Printer, Trash2, XCircle } from 'lucide-react'
import { useAuthStore } from '../../../../store/useAuthStore'
import { ModalPortal } from '../../../../components/common/ModalPortal'
import { JalaliDateInput } from '../../../../components/common/JalaliDateInput'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { useMaterialModel, type MaterialModel } from '../../lib/control/useMaterialModel'
import { Chip, DataTable, KpiCard, fmtD, type Col } from '../../../finance/components/fn'
import { useLookupOptions } from '../../lib/control/lookups'
import { fa, qtyText } from '../../components/control/common'
import { StockConcepts } from '../../components/control/StockConcepts'
import { CommodityIcon } from '../../components/control/CommodityIcon'
import { REQUISITION_STATUS_LABEL_FA, SIGNER_ROLES, SIGNER_ROLE_LABEL_FA, type Requisition, type RequisitionSigner, type SignerRole } from '../../types'

const TONE = { awaiting_signatures: 'warn', issued: 'good', rejected: 'bad', cancelled: 'neutral' } as const
const stamp = (iso: string | null) => (iso ? new Date(iso).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }) : '')

/** Who may be asked to sign which slot: roles in the project, with the broadest fallback so a small team can still fill every slot. */
const CANDIDATE_ROLES: Record<Exclude<SignerRole, 'requester'>, string[]> = { site_supervisor: ['contractor', 'controller', 'manager'], supervision_supervisor: ['consultant', 'inspector', 'employer', 'manager'], storekeeper: ['storekeeper', 'controller', 'manager'] }

/** Warehouse issue requisitions: the technical office asks for goods for a place of use, the stock on hand is shown beside every line, and four signatures in order (requester, site supervisor, supervision supervisor, storekeeper) release them from the store. */
export function RequisitionPage({ projectId }: { projectId: string }) {
  const m = useMaterialModel(projectId)
  const cs = useMaterialControlStore()
  const uid = useAuthStore((s) => s.profile?.id)
  const isAdmin = useAuthStore((s) => !!s.profile?.isAdmin)
  const [form, setForm] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const reqs = useMemo(() => cs.requisitions.filter((r) => r.masterProjectId === projectId), [cs.requisitions, projectId])
  const signersOf = (id: string) => cs.reqSigners.filter((s) => s.requisitionId === id).sort((a, b) => a.sort - b.sort)
  const myTurn = (r: Requisition) => { if (r.status !== 'awaiting_signatures') return false; const sg = signersOf(r.id); const next = sg.find((s) => s.decision !== 'approved'); return !!next && next.userId === uid && next.decision === 'pending' }
  const mine = reqs.filter(myTurn)
  const isMember = isAdmin || cs.myRoles(projectId).length > 0
  const monthStart = new Date().toISOString().slice(0, 8) + '01'
  const cols: Col<Requisition>[] = [
    { key: 'n', label: 'مجوز', render: (r) => <><span className="strong">{r.number}</span><span className="sub">{fmtD(r.requestDate)}</span></>, sort: (r) => r.number },
    { key: 'p', label: 'محل مصرف', render: (r) => <>{r.facility || '—'}<span className="sub">{[r.front, r.purpose].filter(Boolean).join(' · ')}</span></> },
    { key: 'i', label: 'اقلام', num: true, render: (r) => fa(cs.reqLines.filter((l) => l.requisitionId === r.id).length) },
    { key: 'q', label: 'درخواست‌کننده', render: (r) => (r.requesterId ? cs.people.get(r.requesterId) ?? 'کاربر' : '—') },
    { key: 's', label: 'امضاها', render: (r) => <SignDots signers={signersOf(r.id)} /> },
    { key: 't', label: 'وضعیت', render: (r) => <Chip tone={TONE[r.status]}>{myTurn(r) ? 'نوبت امضای شما' : REQUISITION_STATUS_LABEL_FA[r.status]}</Chip> },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="نوبت امضای شما" value={fa(mine.length)} tone={mine.length ? 'warn' : 'neutral'} sub="درخواست‌هایی که منتظر امضای شماست" />
        <KpiCard i={1} label="در انتظار امضا" value={fa(reqs.filter((r) => r.status === 'awaiting_signatures').length)} tone="warn" />
        <KpiCard i={2} label="خروج‌شده این ماه" value={fa(reqs.filter((r) => r.status === 'issued' && (r.issuedAt ?? '') >= monthStart).length)} tone="good" />
        <KpiCard i={3} label="ردشده" value={fa(reqs.filter((r) => r.status === 'rejected').length)} tone={reqs.some((r) => r.status === 'rejected') ? 'bad' : 'neutral'} />
      </div>
      <StockConcepts />
      <div className="mt-filters no-print">
        <p className="im-helper" style={{ margin: 0 }}>دفتر فنی کالای موردنیاز محل مصرف را درخواست می‌کند؛ موجودی انبار کنار هر قلم دیده می‌شود. سرپرست کارگاه، سرپرست نظارت و انباردار به‌ترتیب امضا می‌کنند؛ با امضای انباردار کالا از انبار خارج و در حساب مصرف ثبت می‌شود.</p>
        {isMember && <button className="im-btn im-btn-primary im-btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => setForm(true)}><Plus size={14} /> درخواست جدید</button>}
      </div>
      <DataTable cols={cols} rows={reqs} rowKey={(r) => r.id} onRow={(r) => setOpen(r.id)} empty="هنوز درخواست خروجی ثبت نشده است. با «درخواست جدید» شروع کنید." />
      {form && <RequisitionForm projectId={projectId} model={m} onClose={(id) => { setForm(false); if (id) setOpen(id) }} />}
      {open && <RequisitionSheet id={open} model={m} onClose={() => setOpen(null)} />}
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

function RequisitionForm({ projectId, model: m, onClose }: { projectId: string; model: MaterialModel; onClose: (id?: string) => void }) {
  const cs = useMaterialControlStore()
  const [facility, setFacility] = useState('')
  const [front, setFront] = useState('')
  const [purpose, setPurpose] = useState('')
  const [needed, setNeeded] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<{ materialId: string; qty: number }[]>([])
  const [group, setGroup] = useState('')
  const [pick, setPick] = useState('')
  const [signers, setSigners] = useState<Record<string, string>>({ site_supervisor: '', supervision_supervisor: '', storekeeper: '' })
  const [busy, setBusy] = useState(false)
  const members = useMemo(() => cs.roles.filter((r) => r.projectId === projectId && r.active), [cs.roles, projectId])
  const candidates = (role: Exclude<SignerRole, 'requester'>) => { const ids = new Set(members.filter((r) => CANDIDATE_ROLES[role].includes(r.role)).map((r) => r.userId)); const all = ids.size ? [...ids] : [...new Set(members.map((r) => r.userId))]; return all.map((id) => ({ id, name: cs.people.get(id) ?? 'کاربر' })) }
  const facOpts = useLookupOptions(projectId, 'facility'), frontOpts = useLookupOptions(projectId, 'front')
  const options = m.materials.filter((x) => (!group || x.groupId === group) && !lines.some((l) => l.materialId === x.id))
  const byId = useMemo(() => new Map(m.materials.map((x) => [x.id, x])), [m.materials])
  const stock = (id: string) => m.positions.get(id)?.onHand ?? 0
  const valid = lines.length > 0 && lines.every((l) => l.qty > 0) && Object.values(signers).every(Boolean) && !!facility.trim()
  const add = () => { if (pick) { setLines((x) => [...x, { materialId: pick, qty: 1 }]); setPick('') } }
  return (
    <ModalPortal>
      <div className="im-overlay">
        <div className="im-modal fn-form" style={{ maxWidth: 920 }} role="dialog" aria-modal="true" aria-label="درخواست خروج کالا">
          <div className="im-modal-head"><div><div className="im-modal-title">درخواست خروج کالا از انبار</div><p className="im-helper" style={{ margin: 0 }}>محل مصرف و اقلام را وارد کنید؛ موجودی انبار کنار هر قلم نمایش داده می‌شود. پس از ثبت، امضای شما درج می‌شود و نوبت به امضاکنندگان بعدی می‌رسد.</p></div><button className="im-modal-close" onClick={() => onClose()} aria-label="بستن">✕</button></div>
          <div className="fn-form-grid">
            <div className="im-field"><label htmlFor="rq-fac">محل مصرف (ایستگاه / تأسیسات) *</label><select id="rq-fac" value={facility} onChange={(e) => setFacility(e.target.value)}><option value="">انتخاب کنید…</option>{facOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
            <div className="im-field"><label htmlFor="rq-front">جبهه کاری / بخش</label><select id="rq-front" value={front} onChange={(e) => setFront(e.target.value)}><option value="">—</option>{frontOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
            <div className="im-field" style={{ gridColumn: '1 / -1' }}><label htmlFor="rq-purpose">هدف مصرف</label><input id="rq-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="مثلاً: نصب فلنج‌ها و گسکت‌های خط ورودی ایستگاه" /></div>
            <div className="im-field"><label>نیاز تا تاریخ</label><JalaliDateInput value={needed} onChange={setNeeded} /></div>
            <div className="im-field"><label htmlFor="rq-notes">توضیح</label><input id="rq-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          </div>
          <div className="mt-grp-chips" role="tablist" aria-label="گروه کالا">
            <button role="tab" aria-selected={!group} className={`mt-grp${!group ? ' on' : ''}`} onClick={() => setGroup('')}>همهٔ گروه‌ها</button>
            {cs.groups.filter((g) => g.active).map((g) => <button key={g.id} role="tab" aria-selected={group === g.id} className={`mt-grp${group === g.id ? ' on' : ''}`} onClick={() => setGroup(g.id)}><CommodityIcon code={g.code} size={15} tinted={false} />{g.title}</button>)}
          </div>
          <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
            <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="قلم" style={{ flex: 1 }}><option value="">قلم موردنیاز را انتخاب کنید…</option>{options.map((x) => <option key={x.id} value={x.id}>{x.itemUid} · {x.description || x.materialCode} — موجودی {qtyText(stock(x.id), x.unit, 1)}</option>)}</select>
            <button className="im-btn im-btn-sm" disabled={!pick} onClick={add}><Plus size={14} /> افزودن به فهرست</button>
          </div>
          <div className="fn-tbl-wrap" style={{ maxHeight: 260 }}>
            <table className="fn-tbl"><thead><tr><th>قلم</th><th className="num">موجودی انبار</th><th className="num">مقدار درخواستی</th><th /></tr></thead>
              <tbody>{lines.length === 0 ? <tr><td colSpan={4} className="fn-empty">هنوز قلمی اضافه نشده است.</td></tr> : lines.map((l, i) => { const x = byId.get(l.materialId)!; const s = stock(l.materialId); return (
                <tr key={l.materialId}>
                  <td><span className="strong" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><CommodityIcon code={m.groupById.get(x.groupId ?? '')?.code} />{x.description || x.materialCode}</span><span className="sub fn-code">{x.itemUid} · ردیف {x.lineNo || '—'}</span></td>
                  <td className="num"><b style={{ color: s <= 0 ? 'var(--im-coral)' : l.qty > s ? 'var(--im-amber)' : undefined }}>{qtyText(s, x.unit, 1)}</b></td>
                  <td className="num"><input dir="ltr" inputMode="decimal" className="fn-cell-input" value={l.qty || ''} onChange={(e) => setLines((a) => a.map((y, j) => (j === i ? { ...y, qty: Number(e.target.value) || 0 } : y)))} aria-label={`مقدار ${x.description}`} /> {x.unit}{l.qty > s && <span className="sub" style={{ color: 'var(--im-amber)' }}>بیش از موجودی — خروج جزئی</span>}</td>
                  <td><button className="im-btn im-btn-sm" aria-label="حذف از فهرست" onClick={() => setLines((a) => a.filter((_, j) => j !== i))}><Trash2 size={13} /></button></td>
                </tr>) })}</tbody></table>
          </div>
          <h4 className="mt-sig-title"><ClipboardSignature size={15} /> امضاکنندگان مجوز خروج</h4>
          <div className="mt-sig-grid">
            <div className="mt-sig-box on"><small>{SIGNER_ROLE_LABEL_FA.requester}</small><b>شما</b><em>با ثبت درخواست امضا می‌شود</em></div>
            {(['site_supervisor', 'supervision_supervisor', 'storekeeper'] as const).map((role) => (
              <div key={role} className="mt-sig-box"><small>{SIGNER_ROLE_LABEL_FA[role]} *</small>
                <select value={signers[role]} onChange={(e) => setSigners((s) => ({ ...s, [role]: e.target.value }))} aria-label={SIGNER_ROLE_LABEL_FA[role]}><option value="">انتخاب کنید…</option>{candidates(role).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              </div>
            ))}
          </div>
          {members.length === 0 && <p className="im-helper" style={{ color: 'var(--im-amber)' }}>برای این پروژه هنوز نقشی (پیمانکار، مشاور، انباردار…) ثبت نشده است. از «تنظیمات ← نقش‌ها و دسترسی» افراد را به پروژه اضافه کنید.</p>}
          <div className="fn-form-foot"><button className="im-btn im-btn-ghost" onClick={() => onClose()}>انصراف</button>
            <button className="im-btn im-btn-primary" disabled={!valid || busy} onClick={async () => { setBusy(true); const id = await cs.reqCreate({ projectId, facility: facility.trim(), front: front.trim(), purpose: purpose.trim(), neededBy: needed || null, notes: notes.trim(), lines, signers: signers as { site_supervisor: string; supervision_supervisor: string; storekeeper: string } }); setBusy(false); if (id) onClose(id) }}>{busy ? 'در حال ثبت…' : 'ثبت و امضا'}</button></div>
        </div>
      </div>
    </ModalPortal>
  )
}

function RequisitionSheet({ id, model: m, onClose }: { id: string; model: MaterialModel; onClose: () => void }) {
  const cs = useMaterialControlStore()
  const uid = useAuthStore((s) => s.profile?.id)
  const isAdmin = useAuthStore((s) => !!s.profile?.isAdmin)
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
  const qtyFor = (l: (typeof lines)[number]) => issue[l.id] ?? Math.min(l.qtyRequested, m.positions.get(l.materialId)?.onHand ?? 0)
  const run = async (decision: 'approve' | 'reject') => {
    setBusy(true)
    const res = await cs.reqSign(id, decision, note, isStore && decision === 'approve' ? lines.map((l) => ({ lineId: l.id, qty: qtyFor(l) })) : undefined)
    setBusy(false)
    if (res) onClose()
  }
  const print = () => { document.body.classList.add('mt-printing'); const off = () => { document.body.classList.remove('mt-printing'); window.removeEventListener('afterprint', off) }; window.addEventListener('afterprint', off); window.print() }
  return (
    <ModalPortal>
      <div className="im-overlay">
        <div className="im-modal fn-form" style={{ maxWidth: 940 }} role="dialog" aria-modal="true" aria-label={`مجوز ${r.number}`}>
          <div className="im-modal-head"><div><div className="im-modal-title">مجوز خروج کالا {r.number}</div><p className="im-helper" style={{ margin: 0 }}>{REQUISITION_STATUS_LABEL_FA[r.status]}{r.status === 'rejected' && r.rejectReason ? ` — ${r.rejectReason}` : ''}</p></div><button className="im-modal-close" onClick={onClose} aria-label="بستن">✕</button></div>
          <div className="mt-sheet mt-printable mt-req-sheet">
            <div className="mt-sheet-head"><div><h2 style={{ margin: 0, fontSize: 16 }}>مجوز خروج کالا از انبار — {r.number}</h2><p className="im-helper" style={{ margin: '2px 0 0' }}>تاریخ درخواست {fmtD(r.requestDate)}{r.neededBy ? ` · نیاز تا ${fmtD(r.neededBy)}` : ''}</p></div><Chip tone={TONE[r.status]}>{REQUISITION_STATUS_LABEL_FA[r.status]}</Chip></div>
            <div className="mt-stats" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              <div className="mt-stat"><small>محل مصرف</small><b>{r.facility || '—'}</b></div><div className="mt-stat"><small>جبهه کاری / بخش</small><b>{r.front || '—'}</b></div><div className="mt-stat"><small>هدف مصرف</small><b>{r.purpose || '—'}</b></div>
            </div>
            <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}>
              <table className="fn-tbl"><thead><tr><th>#</th><th>قلم</th><th className="num">درخواستی</th><th className="num">موجودی انبار</th><th className="num">{r.status === 'issued' ? 'خارج‌شده' : 'مقدار خروج'}</th></tr></thead>
                <tbody>{lines.map((l, i) => { const x = byId.get(l.materialId); const live = m.positions.get(l.materialId)?.onHand ?? 0; return (
                  <tr key={l.id}><td>{fa(i + 1)}</td><td><span className="strong">{x?.description || x?.materialCode}</span><span className="sub fn-code">{x?.itemUid} · ردیف {x?.lineNo || '—'}</span></td><td className="num">{qtyText(l.qtyRequested, x?.unit ?? '')}</td><td className="num">{qtyText(r.status === 'awaiting_signatures' ? live : l.stockAtRequest, x?.unit ?? '', 1)}</td>
                    <td className="num">{r.status === 'issued' ? <b>{qtyText(l.qtyIssued, x?.unit ?? '')}</b> : isStore ? <input dir="ltr" inputMode="decimal" className="fn-cell-input" value={qtyFor(l)} onChange={(e) => setIssue((s) => ({ ...s, [l.id]: Math.max(0, Number(e.target.value) || 0) }))} aria-label={`مقدار خروج ${x?.description}`} /> : <span style={{ opacity: .4 }}>—</span>}</td></tr>) })}</tbody></table>
            </div>
            <div className="mt-sign-row">
              {SIGNER_ROLES.map((role) => { const s = signers.find((x) => x.role === role); return <SigBox key={role} role={role} s={s} name={who(s?.userId ?? null)} /> })}
            </div>
          </div>
          {mineNow && (
            <div className="mt-sign-act no-print">
              <div className="im-field" style={{ margin: 0, flex: 1 }}><label htmlFor="rq-note">{isStore ? 'توضیح (اختیاری)' : 'توضیح (برای رد لازم است)'}</label><input id="rq-note" value={note} onChange={(e) => setNote(e.target.value)} /></div>
              <button className="im-btn im-btn-primary" disabled={busy} onClick={() => void run('approve')}>{isStore ? 'امضا و خروج کالا از انبار' : 'امضا و تأیید'}</button>
              <button className="im-btn im-btn-danger" disabled={busy || !note.trim()} onClick={() => void run('reject')}>رد درخواست</button>
            </div>
          )}
          {isStore && <p className="im-helper no-print" style={{ margin: '6px 0 0' }}>مقدار خروج هر قلم را می‌توان کمتر از درخواست و حداکثر برابر موجودی انبار تعیین کرد؛ با امضا، «حواله مصرف» همین مقدارها در دفتر انبار ثبت می‌شود.</p>}
          {!mineNow && r.status === 'awaiting_signatures' && next && <p className="im-helper no-print" style={{ margin: '8px 0 0' }}>در انتظار امضای {SIGNER_ROLE_LABEL_FA[next.role]}: {who(next.userId)}</p>}
          <div className="fn-form-foot no-print">
            {r.status === 'awaiting_signatures' && (isAdmin || r.requesterId === uid) && <button className="im-btn im-btn-danger" onClick={async () => { const why = window.prompt('علت لغو درخواست را بنویسید'); if (why?.trim()) { if (await cs.reqCancel(id, why.trim())) onClose() } }}>لغو درخواست</button>}
            <button className="im-btn" style={{ marginInlineStart: 'auto' }} onClick={print}><Printer size={14} /> چاپ مجوز</button>
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
