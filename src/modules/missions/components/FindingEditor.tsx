import { useState } from 'react'
import { JalaliDateInput } from '../platform'
import { Modal } from '../platform'
import { FINDING_KIND_LABEL, PRIORITY_LABEL, type Finding, type FindingKind, type Priority } from '../types'
import { Field } from './ui'

type Patch = Partial<Pick<Finding, 'title' | 'description' | 'severity' | 'ownerText' | 'dueDate' | 'details' | 'kind' | 'userConfirmed' | 'confidential'>>

const KINDS: FindingKind[] = ['issue', 'risk', 'action', 'commitment', 'decision', 'observation']

/** Edit (or create) one extracted item. The user stays the authority over what the system understood. */
export function FindingEditor({ finding, topics, onSave, onClose, onDelete }: { finding: Finding | null; topics: { key: string; title: string }[]; onSave: (patch: Patch & { topicKey?: string }) => void; onClose: () => void; onDelete?: () => void }) {
  const [kind, setKind] = useState<FindingKind>(finding?.kind ?? 'issue')
  const [title, setTitle] = useState(finding?.title ?? '')
  const [severity, setSeverity] = useState<Priority>(finding?.severity ?? 'medium')
  const [owner, setOwner] = useState(finding?.ownerText ?? '')
  const [due, setDue] = useState(finding?.dueDate ?? '')
  const [confidential, setConfidential] = useState(finding?.confidential ?? false)
  const [topicKey, setTopicKey] = useState(finding?.topicKey ?? topics[0]?.key ?? '')
  const [details, setDetails] = useState<Record<string, string>>(Object.fromEntries(Object.entries(finding?.details ?? {}).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, v ?? ''])))
  const setD = (k: string, v: string) => setDetails((d) => ({ ...d, [k]: v }))

  const detailFields: [string, string][] =
    kind === 'issue' ? [['cause', 'علت'], ['impact', 'اثر بر پروژه'], ['party', 'طرف درگیر'], ['newDate', 'تاریخ رفع'], ['needAction', 'اقدام لازم']]
    : kind === 'risk' ? [['impact', 'پیامد'], ['probability', 'احتمال (کم/متوسط/زیاد)'], ['mitigation', 'راهکار کنترل']]
    : []

  return (
    <Modal title={finding ? 'ویرایش مورد استخراج‌شده' : 'افزودن مورد'} subtitle="آنچه سیستم از گفته‌های شما فهمید را تصحیح کنید" onClose={onClose}  width="max-w-xl">
      <div className="ms-root flex flex-col gap-3.5" dir="rtl" style={{ background: 'transparent' }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="نوع">
            <select className="ms-select" value={kind} onChange={(e) => setKind(e.target.value as FindingKind)}>
              {KINDS.map((k) => <option key={k} value={k}>{FINDING_KIND_LABEL[k]}</option>)}
            </select>
          </Field>
          {(kind === 'issue' || kind === 'risk') && (
            <Field label="شدت">
              <select className="ms-select" value={severity} onChange={(e) => setSeverity(e.target.value as Priority)}>
                {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          )}
        </div>
        <Field label="عنوان">
          <textarea className="ms-textarea" style={{ minHeight: 64 }} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        {!finding && (
          <Field label="موضوع">
            <select className="ms-select" value={topicKey} onChange={(e) => setTopicKey(e.target.value)}>
              {topics.map((t) => <option key={t.key} value={t.key}>{t.title}</option>)}
            </select>
          </Field>
        )}
        {detailFields.map(([k, label]) => (
          <Field key={k} label={label}>
            <input className="ms-input" value={details[k] ?? ''} onChange={(e) => setD(k, e.target.value)} />
          </Field>
        ))}
        {(kind === 'action' || kind === 'commitment' || kind === 'decision') && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="مسئول"><input className="ms-input" value={owner} onChange={(e) => setOwner(e.target.value)} /></Field>
            <Field label="موعد"><JalaliDateInput value={due} onChange={setDue} /></Field>
          </div>
        )}
        {(kind === 'issue' || kind === 'risk') && (
          <Field label="مسئول پیگیری"><input className="ms-input" value={owner} onChange={(e) => setOwner(e.target.value)} /></Field>
        )}
        <label className="flex cursor-pointer items-start gap-2 rounded-lg p-2.5 text-[12px] leading-6" style={{ background: 'var(--ms-warn-bg, rgba(217,119,6,.08))' }}>
          <input type="checkbox" className="mt-1.5" checked={confidential} onChange={(e) => setConfidential(e.target.checked)} />
          <span>
            <b>محرمانه</b> — فقط برای مجری طرح و مدیریت ارشد نمایان باشد (مدیر همین پروژه آن را نمی‌بیند و در متن گزارش نمی‌آید).
            {finding?.confidential && !confidential && <span className="block font-bold" style={{ color: 'var(--ms-bad)' }}>برداشتن برچسب محرمانه در سابقه ثبت می‌شود.</span>}
          </span>
        </label>
        <div className="flex items-center justify-end gap-2 pt-1">
          {onDelete && <button className="ms-btn ms-btn-danger ml-auto" onClick={onDelete}>حذف</button>}
          <button className="ms-btn" onClick={onClose}>انصراف</button>
          <button className="ms-btn ms-btn-primary" disabled={title.trim().length < 3} onClick={() => onSave({ kind, title: title.trim(), severity, ownerText: owner.trim(), dueDate: due || null, details, userConfirmed: true, confidential, topicKey })}>
            ذخیره
          </button>
        </div>
      </div>
    </Modal>
  )
}
