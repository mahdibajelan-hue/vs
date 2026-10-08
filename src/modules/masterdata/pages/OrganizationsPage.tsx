import { useMemo, useState } from 'react'
import { Building2, Plus } from 'lucide-react'
import { useMasterDataStore } from '../store/useMasterDataStore'
import { ORG_TYPE_LABEL_FA, ORG_TYPES, type Organization, type OrgType } from '../types'
import { ORG_COLOR } from '../lib/colors'
import { DeleteButton, Empty, Field, PageHead, SearchBox, Sheet, faNum, initials } from '../components/md'

const BLANK = { name: '', shortName: '', orgType: 'contractor' as OrgType, description: '', contactName: '', contactEmail: '', contactPhone: '' }

/** Phase 1 of the set-up: the companies and organizations every project will refer to. */
export function OrganizationsPage() {
  const organizations = useMasterDataStore((s) => s.organizations)
  const parties = useMasterDataStore((s) => s.parties)
  const create = useMasterDataStore((s) => s.createOrganization)
  const update = useMasterDataStore((s) => s.updateOrganization)
  const remove = useMasterDataStore((s) => s.deleteOrganization)
  const [q, setQ] = useState('')
  const [type, setType] = useState<OrgType | 'all'>('all')
  const [sheet, setSheet] = useState<Organization | 'new' | null>(null)

  const counts = useMemo(() => {
    const c = new Map<string, number>()
    for (const p of parties) c.set(p.organizationId, (c.get(p.organizationId) ?? 0) + 1)
    return c
  }, [parties])
  const shown = organizations.filter((o) => (type === 'all' || o.orgType === type) && (!q.trim() || `${o.name} ${o.shortName} ${o.contactName}`.toLowerCase().includes(q.trim().toLowerCase())))

  return (
    <div className="mx-auto max-w-[1040px]">
      <PageHead title="شرکت‌ها و سازمان‌ها" hint="کارفرما، مشاور، پیمانکار و هر سازمانی که در پروژه‌ها نقش دارد را یک‌بار تعریف کنید؛ بعداً در «ارکان پروژه» به پروژه‌ها وصل می‌شوند." actions={<button className="md-btn md-btn-primary" onClick={() => setSheet('new')}><Plus size={15} /> سازمان جدید</button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="جستجوی نام یا رابط" />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="نوع سازمان">
          <button className="md-chip" aria-pressed={type === 'all'} onClick={() => setType('all')}>همه {faNum(organizations.length)}</button>
          {ORG_TYPES.map((t) => { const n = organizations.filter((o) => o.orgType === t).length; return n ? <button key={t} className="md-chip" style={{ '--c': ORG_COLOR[t] } as React.CSSProperties} aria-pressed={type === t} onClick={() => setType(t)}><i aria-hidden />{ORG_TYPE_LABEL_FA[t]} {faNum(n)}</button> : null })}
        </div>
      </div>
      <div className="md-panel overflow-hidden">
        {shown.length === 0 ? (
          <Empty icon={<Building2 size={20} />} title={organizations.length ? 'سازمانی با این فیلتر نیست' : 'هنوز سازمانی ثبت نشده'} text={organizations.length ? undefined : 'با «سازمان جدید» شروع کنید: ابتدا کارفرما، پیمانکار و مشاورهای پروژه.'} />
        ) : shown.map((o, i) => (
          <button key={o.id} className="md-row md-in" style={{ '--i': i } as React.CSSProperties} onClick={() => setSheet(o)}>
            <span className="md-avatar" style={{ '--c': ORG_COLOR[o.orgType] } as React.CSSProperties} aria-hidden>{initials(o.shortName || o.name)}</span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2"><b className="truncate text-[13.5px]">{o.name}</b><span className="md-badge" style={{ '--c': ORG_COLOR[o.orgType] } as React.CSSProperties}>{ORG_TYPE_LABEL_FA[o.orgType]}</span>{!o.isActive && <span className="md-badge">غیرفعال</span>}</span>
              <span className="md-eyebrow block truncate">{[o.contactName, o.contactPhone, o.contactEmail].filter(Boolean).join('  |  ') || 'بدون اطلاعات تماس'}</span>
            </span>
            <span className="md-eyebrow md-num shrink-0">{counts.get(o.id) ? `${faNum(counts.get(o.id)!)} نقش در پروژه‌ها` : 'بدون پروژه'}</span>
          </button>
        ))}
      </div>
      {sheet && <OrgSheet initial={sheet === 'new' ? undefined : sheet} onClose={() => setSheet(null)} onSave={async (d) => { if (sheet === 'new') await create(d); else await update(sheet.id, d); setSheet(null) }} onDelete={sheet === 'new' ? undefined : async () => { await remove(sheet.id); setSheet(null) }} />}
    </div>
  )
}

function OrgSheet({ initial, onClose, onSave, onDelete }: { initial?: Organization; onClose: () => void; onSave: (d: Partial<Organization>) => Promise<void>; onDelete?: () => void }) {
  const [f, setF] = useState(initial ? { name: initial.name, shortName: initial.shortName, orgType: initial.orgType, description: initial.description, contactName: initial.contactName, contactEmail: initial.contactEmail, contactPhone: initial.contactPhone } : BLANK)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  return (
    <Sheet title={initial ? 'ویرایش سازمان' : 'سازمان جدید'} onClose={onClose} footer={<>{onDelete && <span className="me-auto"><DeleteButton onConfirm={onDelete} label="حذف سازمان" /></span>}<button className="md-btn" onClick={onClose}>انصراف</button><button className="md-btn md-btn-primary" disabled={!f.name.trim() || busy} onClick={async () => { setBusy(true); await onSave(f); setBusy(false) }}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button></>}>
      <div className="grid gap-4">
        <Field label="نام سازمان"><input className="md-input" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="نام کوتاه"><input className="md-input" value={f.shortName} onChange={(e) => set('shortName', e.target.value)} /></Field>
          <Field label="نوع سازمان"><select className="md-input" value={f.orgType} onChange={(e) => set('orgType', e.target.value as OrgType)}>{ORG_TYPES.map((t) => <option key={t} value={t}>{ORG_TYPE_LABEL_FA[t]}</option>)}</select></Field>
        </div>
        <Field label="توضیحات"><textarea className="md-input" value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="نام رابط"><input className="md-input" value={f.contactName} onChange={(e) => set('contactName', e.target.value)} /></Field>
          <Field label="تلفن"><input className="md-input md-num" dir="ltr" value={f.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} /></Field>
        </div>
        <Field label="ایمیل"><input className="md-input" dir="ltr" value={f.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} /></Field>
      </div>
    </Sheet>
  )
}
