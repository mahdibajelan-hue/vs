import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { useMaterialControlStore } from '../../material/store/useMaterialControlStore'
import { Chip, Section } from '../../finance/components/fn'

/** The project's work fronts: defined here once, then offered in every daily report and technical form (the same list the material module uses). Nothing is built in. A rename updates the material module's records only — reports already saved here keep the old name; a front that is no longer used is switched off, not deleted, so old reports keep their value. */
export function FrontsEditor({ projectId, can }: { projectId: string; can: boolean }) {
  const lookups = useMaterialControlStore((s) => s.lookups), add = useMaterialControlStore((s) => s.addLookups), setActive = useMaterialControlStore((s) => s.setLookupActive), rename = useMaterialControlStore((s) => s.renameLookup)
  const [text, setText] = useState(''), [busy, setBusy] = useState(false)
  const rows = lookups.filter((l) => l.masterProjectId === projectId && l.kind === 'front').sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, 'fa'))
  const submit = async () => {
    const names = text.split(/[،,\n]/).map((x) => x.trim()).filter(Boolean)
    if (!names.length) return
    setBusy(true); if (await add(projectId, 'front', names)) setText(''); setBusy(false)
  }
  return (
    <Section title="تعریف جبهه‌های کاری" hint="جبهه‌ها را همین‌جا تعریف کنید؛ در گزارش روزانه و همهٔ فرم‌های فنی همین فهرست پیشنهاد می‌شود. فهرست با ماژول تأمین مشترک است.">
      {can && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void submit() }} placeholder="نام جبهه (چند جبهه را با ویرگول جدا کنید)" aria-label="نام جبهه جدید" style={{ minWidth: 260 }} />
        <button className="im-btn im-btn-primary im-btn-sm" disabled={busy || !text.trim()} onClick={() => void submit()}><Plus size={13} /> افزودن</button>
      </div>}
      {rows.length === 0 ? <p className="im-helper" style={{ margin: 0 }}>هنوز جبهه‌ای تعریف نشده است.{can ? ' از بالا اضافه کنید.' : ''}</p> : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {rows.map((f) => <span key={f.id} className="im-chip" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', opacity: f.active ? 1 : 0.55 }}>
            <b dir="auto">{f.label}</b>{!f.active && <Chip tone="neutral">غیرفعال</Chip>}
            {can && <>
              <button className="im-btn im-btn-sm" aria-label={`تغییر نام ${f.label}`} onClick={async () => { const n = window.prompt('نام جدید جبهه (در سوابق ماژول تأمین اعمال می‌شود؛ گزارش‌های اجرای قبلی همان نام قبلی را نگه می‌دارند و جبهه‌های موردانتظار باید دوباره علامت بخورند):', f.label); if (n && n.trim() && n.trim() !== f.label) await rename(projectId, 'front', f.label, n.trim()) }}><Pencil size={12} /></button>
              <button className="im-btn im-btn-sm" onClick={() => void setActive(f.id, !f.active)}>{f.active ? 'غیرفعال' : 'فعال'}</button>
            </>}
          </span>)}
        </div>
      )}
    </Section>
  )
}
