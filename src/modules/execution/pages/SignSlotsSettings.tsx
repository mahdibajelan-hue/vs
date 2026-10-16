import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { EpcGate } from '../components/epc/EpcBanner'
import { FORMS } from '../lib/formCatalog'
import { Chip, Section } from '../../finance/components/fn'
import type { SignParty } from '../epcTypes'

const PARTY_FA: Record<SignParty, string> = { contractor: 'پیمانکار', consultant: 'مشاور', supervision: 'نظارت', employer: 'کارفرما', other: 'سایر' }
const SUGGESTED: { slotKey: string; label: string; party: SignParty; sort: number }[] = [
  { slotKey: 'prep', label: 'تهیه‌کننده — مسئول دفتر فنی', party: 'contractor', sort: 1 },
  { slotKey: 'appr', label: 'تأییدکننده — سرپرست کارگاه', party: 'contractor', sort: 2 },
  { slotKey: 'rev', label: 'بررسی‌کننده — ناظر مربوطه', party: 'consultant', sort: 3 },
  { slotKey: 'sup', label: 'تأییدکننده — سرپرست دستگاه نظارت', party: 'consultant', sort: 4 },
]

/** Who signs each technical form: the slots (order, party, label) and the person assigned to each. A person signs with their own account; their sample signature is frozen into the form at that moment. */
export function SignSlotsSettings({ projectId }: { projectId: string }) { return <EpcGate><Inner projectId={projectId} /></EpcGate> }
function Inner({ projectId }: { projectId: string }) {
  const epc = useEpcStore(), ex = useExecutionStore()
  const can = ex.can(projectId, '*') || ex.can(projectId, 'configure')
  const [form, setForm] = useState('welding')
  const [add, setAdd] = useState({ label: '', party: 'contractor' as SignParty, sort: 0 })
  const users = useMemo(() => [...new Set(ex.roles.filter((r) => r.projectId === projectId && r.active).map((r) => r.userId))].map((id) => ({ id, name: ex.people.get(id) ?? id.slice(0, 8) })).sort((a, b) => a.name.localeCompare(b.name, 'fa')), [ex.roles, ex.people, projectId])
  const slots = epc.signSlots.filter((s) => s.projectId === projectId && s.formKey === form).sort((a, b) => a.sort - b.sort)
  const save = (s: (typeof slots)[number], p: Partial<(typeof slots)[number]>) => void epc.saveSlot({ projectId, formKey: form, slotKey: s.slotKey, label: p.label ?? s.label, party: p.party ?? s.party, userId: p.userId !== undefined ? p.userId : s.userId, sort: p.sort ?? s.sort, required: p.required ?? s.required, active: p.active ?? s.active })
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Section title="امضاکنندگان فرم‌های فنی" hint="برای هر نوع فرم، جایگاه‌های امضا (ترتیب، طرف، عنوان) و شخص امضاکننده را تعیین کنید. هر شخص با حساب خودش وارد می‌شود و دکمهٔ «امضا با حساب من» امضای نمونهٔ ثبت‌شده در پروفایلش را در همان جایگاه می‌گذارد؛ امضای دستی لازم نیست. جایگاه‌های اجباریِ پیمانکار قبل از ارسال به نظارت باید امضا شوند.">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
          <select value={form} onChange={(e) => setForm(e.target.value)} aria-label="نوع فرم"><option value="work">گزارش کارکرد روزانه</option>{FORMS.map((f) => <option key={f.key} value={f.key}>{f.title}</option>)}</select>
          {can && slots.length === 0 && <button className="im-btn im-btn-primary im-btn-sm" onClick={async () => { for (const s of SUGGESTED) await epc.saveSlot({ projectId, formKey: form, slotKey: s.slotKey, label: s.label, party: s.party, userId: null, sort: s.sort, required: s.party === 'contractor' }) }}>افزودن ۴ جایگاه پیشنهادی (تهیه‌کننده، تأییدکننده، بررسی‌کننده، سرپرست نظارت)</button>}
        </div>
        {slots.length === 0 ? <p className="im-helper">برای این فرم جایگاه امضایی تعریف نشده است؛ چاپ مثل قبل با جعبه‌های خالی است.</p> : (
          <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>ترتیب</th><th>عنوان جایگاه</th><th>طرف</th><th>امضاکننده</th><th>اجباری</th><th /></tr></thead><tbody>
            {slots.map((s) => <tr key={s.id} style={{ opacity: s.active ? 1 : 0.5 }}>
              <td className="num"><input type="number" min="1" disabled={!can} defaultValue={s.sort} style={{ width: 56 }} onBlur={(e) => { const n = Number(e.target.value); if (n && n !== s.sort) save(s, { sort: n }) }} aria-label="ترتیب" /></td>
              <td><input disabled={!can} defaultValue={s.label} dir="auto" style={{ minWidth: 240 }} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.label) save(s, { label: v }) }} aria-label="عنوان" /></td>
              <td>{can ? <select value={s.party} onChange={(e) => save(s, { party: e.target.value as SignParty })} aria-label="طرف">{Object.entries(PARTY_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select> : PARTY_FA[s.party]}</td>
              <td>{can ? <select value={s.userId ?? ''} onChange={(e) => save(s, { userId: e.target.value || null })} aria-label="امضاکننده"><option value="">— تعیین نشده —</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select> : (ex.people.get(s.userId ?? '') ?? '—')}</td>
              <td><input type="checkbox" disabled={!can} checked={s.required} onChange={(e) => save(s, { required: e.target.checked })} aria-label="اجباری" /></td>
              <td style={{ whiteSpace: 'nowrap' }}>{can && <><button className="im-btn im-btn-sm" onClick={() => save(s, { active: !s.active })}>{s.active ? 'غیرفعال' : 'فعال'}</button> <button className="im-btn im-btn-sm" aria-label="حذف جایگاه" onClick={() => { if (window.confirm('جایگاه حذف شود؟ (امضاهای ثبت‌شده در گزارش‌ها می‌مانند)')) void epc.removeSlot(s.id) }}><Trash2 size={12} /></button></>}</td></tr>)}
          </tbody></table></div>
        )}
        {can && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
          <input placeholder="عنوان جایگاه جدید" value={add.label} onChange={(e) => setAdd({ ...add, label: e.target.value })} dir="auto" aria-label="عنوان جایگاه جدید" style={{ minWidth: 240 }} />
          <select value={add.party} onChange={(e) => setAdd({ ...add, party: e.target.value as SignParty })} aria-label="طرف">{Object.entries(PARTY_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <button className="im-btn im-btn-sm" disabled={!add.label.trim()} onClick={async () => { const key = `s${Date.now().toString(36)}`; if (await epc.saveSlot({ projectId, formKey: form, slotKey: key, label: add.label.trim(), party: add.party, userId: null, sort: (slots.at(-1)?.sort ?? 0) + 1, required: add.party === 'contractor' })) setAdd({ label: '', party: add.party, sort: 0 }) }}>افزودن جایگاه</button>
        </div>}
        <p className="im-helper">هر امضاکننده باید در «پروفایل من» امضای نمونه ثبت کرده باشد و نقش فعالی در این پروژه داشته باشد. {users.length === 0 && <Chip tone="warn">کاربری با نقش فعال در این پروژه نیست</Chip>}</p>
      </Section>
    </div>
  )
}
