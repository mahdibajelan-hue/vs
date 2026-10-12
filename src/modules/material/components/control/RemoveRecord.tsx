import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { ModalPortal } from '../../../../components/common/ModalPortal'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'

const KIND_FA = { package: 'بستهٔ خرید', request: 'درخواست خرید (MR)', po: 'سفارش خرید (PO)' } as const

/** Audited removal of a package, purchase request or purchase order: shows what goes with it and asks for a reason, which is written to the activity log. */
export function RemoveRecord({ kind, id, label, consequences, onClose }: { kind: 'package' | 'request' | 'po'; id: string; label: string; consequences: string[]; onClose: (done: boolean) => void }) {
  const remove = useMaterialControlStore((s) => s.adminRemove)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <ModalPortal>
      <div className="im-overlay">
        <div className="im-modal" style={{ maxWidth: 520 }} role="dialog" aria-modal="true" aria-label={`حذف ${KIND_FA[kind]}`}>
          <div className="im-modal-head"><div><div className="im-modal-title">حذف {KIND_FA[kind]}</div><p className="im-helper" style={{ margin: 0 }}>{label}</p></div><button className="im-modal-close" onClick={() => onClose(false)} aria-label="بستن">✕</button></div>
          <div className="mt-warn"><AlertTriangle size={16} /><div><b>این کار برگشت‌پذیر نیست.</b><ul>{consequences.map((c) => <li key={c}>{c}</li>)}</ul></div></div>
          <div className="im-field" style={{ marginTop: 12 }}><label htmlFor="rm-reason">علت حذف *</label><input id="rm-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: ثبت تکراری، اشتباه در انتخاب پروژه…" /></div>
          <div className="fn-form-foot"><button className="im-btn im-btn-ghost" onClick={() => onClose(false)}>انصراف</button><button className="im-btn im-btn-danger" disabled={busy || !reason.trim()} onClick={async () => { setBusy(true); const ok = await remove(kind, id, reason.trim()); setBusy(false); if (ok) onClose(true) }}>{busy ? 'در حال حذف…' : 'حذف و ثبت در سابقه'}</button></div>
        </div>
      </div>
    </ModalPortal>
  )
}
