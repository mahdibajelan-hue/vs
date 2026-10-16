import { useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { FORMS } from '../lib/formCatalog'
import { SUGGESTED_ROLES, type SignRole } from '../lib/signRoles'
import { Section } from '../../finance/components/fn'
import type { SignParty } from '../epcTypes'

const PARTY_FA: Record<SignParty, string> = { contractor: 'پیمانکار', consultant: 'مشاور', supervision: 'نظارت', employer: 'کارفرما', other: 'سایر' }
export const useSignRoles = (projectId: string): SignRole[] => {
  const raw = useExecutionStore((s) => (s.settingsByProject.get(projectId) as unknown as { signRoles?: SignRole[] } | undefined)?.signRoles)
  return useMemo(() => [...(raw ?? [])].sort((a, b) => a.sort - b.sort), [raw])
}

/** Signing roles of the project: who (person from the project structure) signs which forms, in which order. Each person signs with their own account. */
export function SigningRoles({ projectId, can, people }: { projectId: string; can: boolean; people: { id: string; name: string }[] }) {
  const ex = useExecutionStore(), epc = useEpcStore()
  const roles = useSignRoles(projectId)
  const persist = async (next: SignRole[]) => { if (await ex.saveSettings(projectId, { signRoles: next } as never)) await epc.applySignRoles(projectId, next) }
  const patch = (key: string, p: Partial<SignRole>) => void persist(roles.map((r) => (r.key === key ? { ...r, ...p } : r)))
  const techForms = FORMS.map((f) => f.key)
  return (
    <Section title="نقش‌های امضا" hint="سمت‌های امضاکننده (مثلاً مسئول دفتر فنی، سرپرست کارگاه، ناظر مربوطه، سرپرست دستگاه نظارت) را یک‌بار تعریف کنید: چه کسی، به چه ترتیبی و کدام فرم‌ها را امضا می‌کند. هر فرد با حساب خودش وارد می‌شود و امضای نمونهٔ پروفایلش در جای مناسب فرم می‌نشیند. نقش‌های اجباریِ سمت پیمانکار قبل از ارسال فرم به نظارت باید امضا شوند.">
      {can && roles.length === 0 && <button className="im-btn im-btn-primary im-btn-sm" onClick={() => void persist(SUGGESTED_ROLES.map((r) => ({ ...r, userId: null, forms: [] })))}>افزودن ۴ نقش امضای پیشنهادی (فرم‌ها را بعداً انتخاب می‌کنید)</button>}
      {roles.length === 0 ? <p className="im-helper">نقش امضایی تعریف نشده است؛ چاپ مثل قبل با جعبه‌های خالی است.</p> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {roles.map((r) => (
            <div key={r.key} className="im-card" style={{ padding: 10, display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="number" min="1" disabled={!can} defaultValue={r.sort} style={{ width: 56 }} aria-label="ترتیب" title="ترتیب امضا" onBlur={(e) => { const n = Number(e.target.value); if (n && n !== r.sort) patch(r.key, { sort: n }) }} />
                <input disabled={!can} defaultValue={r.label} dir="auto" style={{ minWidth: 240 }} aria-label="عنوان نقش امضا" onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== r.label) patch(r.key, { label: v }) }} />
                {can ? <select value={r.party} onChange={(e) => patch(r.key, { party: e.target.value as SignParty })} aria-label="طرف">{Object.entries(PARTY_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select> : PARTY_FA[r.party]}
                {can ? <select value={r.userId ?? ''} onChange={(e) => patch(r.key, { userId: e.target.value || null })} aria-label="امضاکننده"><option value="">— امضاکننده تعیین نشده —</option>{people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select> : <b>{people.find((u) => u.id === r.userId)?.name ?? '—'}</b>}
                <label className="im-helper"><input type="checkbox" disabled={!can} checked={r.required} onChange={(e) => patch(r.key, { required: e.target.checked })} /> اجباری</label>
                {can && <button className="im-btn im-btn-sm" aria-label="حذف نقش امضا" onClick={() => { if (window.confirm('این نقش امضا از همهٔ فرم‌ها برداشته شود؟ (امضاهای ثبت‌شده در گزارش‌ها می‌مانند)')) void persist(roles.filter((x) => x.key !== r.key)) }}><Trash2 size={12} /></button>}
              </div>
              <details><summary className="im-helper">فرم‌هایی که این نقش امضا می‌کند: {r.forms.length ? `${r.forms.length} فرم` : 'هیچ'}</summary>
                {can && <div style={{ display: 'flex', gap: 6, margin: '6px 0' }}><button className="im-btn im-btn-sm" onClick={() => patch(r.key, { forms: techForms })}>همهٔ فرم‌های فنی</button><button className="im-btn im-btn-sm" onClick={() => patch(r.key, { forms: [] })}>هیچ</button></div>}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{[{ key: 'work', title: 'گزارش کارکرد روزانه' }, ...FORMS].map((f) => <label key={f.key} className="im-helper" style={{ display: 'inline-flex', gap: 4 }}><input type="checkbox" disabled={!can} checked={r.forms.includes(f.key)} onChange={(e) => patch(r.key, { forms: e.target.checked ? [...r.forms, f.key] : r.forms.filter((x) => x !== f.key) })} />{f.title}</label>)}</div>
              </details>
            </div>
          ))}
          {can && <button className="im-btn im-btn-sm" style={{ justifySelf: 'start' }} onClick={() => void persist([...roles, { key: `r${Date.now().toString(36)}`, label: 'نقش امضای جدید', party: 'contractor', userId: null, sort: (roles.at(-1)?.sort ?? 0) + 1, required: false, forms: [] }])}>افزودن نقش امضا</button>}
        </div>
      )}
    </Section>
  )
}
