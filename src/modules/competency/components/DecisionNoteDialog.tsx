import { useState } from 'react'
import { EyeOff, Loader2, X } from 'lucide-react'
import { DECISION_LABEL_FA, MIN_REASON_CHARS, noteRequired, noteValid, type DecisionKind } from '../lib/decisionNotes'

/** Asks the lead for the confidential interview-summary reason that goes with a decision. Only a site admin can read it afterwards. */
export function DecisionNoteDialog({ decision, candidateName, onCancel, onConfirm }: { decision: DecisionKind; candidateName: string; onCancel: () => void; onConfirm: (note: string) => Promise<void> }) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const required = noteRequired(decision)
  const ok = noteValid(decision, note)
  const submit = async () => {
    if (!ok || saving) return
    setSaving(true)
    await onConfirm(note.trim())
    setSaving(false)
  }
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4" onClick={onCancel}>
      <div className="flex min-h-full items-start justify-center py-6 sm:items-center">
        <div className="glass-panel w-full max-w-lg rounded-2xl p-5" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="جمع‌بندی محرمانهٔ مصاحبه">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold">{DECISION_LABEL_FA[decision]} — {candidateName}</p>
            <button onClick={onCancel} aria-label="بستن" className="text-muted hover:text-primary"><X size={16} /></button>
          </div>
          <p className="mb-3 flex items-start gap-1.5 rounded-xl border border-amber-400/25 bg-amber-500/10 p-2.5 text-[11px] leading-6 text-amber-100">
            <EyeOff size={14} className="mt-1 shrink-0" aria-hidden />
            <span>جمع‌بندی مصاحبه و دلیل این تصمیم <b>محرمانه</b> است و فقط ادمین سامانه آن را می‌بیند؛ به متقاضی، داوران و گزارش‌ها نمایش داده نمی‌شود.</span>
          </p>
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted">
              {required ? `دلیل و جمع‌بندی مصاحبه (الزامی، حداقل ${MIN_REASON_CHARS.toLocaleString('fa-IR')} نویسه)` : 'جمع‌بندی مصاحبه (اختیاری)'}
            </span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5} autoFocus className="input w-full resize-none" placeholder="مثلاً نقاط قوت و ضعف مشاهده‌شده در مصاحبه و دلیل این تصمیم…" />
          </label>
          {required && !ok && note.length > 0 && <p className="mt-1 text-[10.5px] text-amber-300">متن کوتاه است.</p>}
          <div className="mt-4 flex justify-end gap-2 border-t border-white/10 pt-3">
            <button onClick={onCancel} className="rounded-xl border border-white/10 px-3.5 py-2 text-xs text-secondary hover:bg-white/5">انصراف</button>
            <button onClick={submit} disabled={!ok || saving} className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-40">
              {saving && <Loader2 size={13} className="animate-spin" />} ثبت و ادامه
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
