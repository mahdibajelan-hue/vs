import { useState } from 'react'
import { Building2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useMasterDataStore } from '../store/useMasterDataStore'
import { ORG_TYPE_LABEL_FA, ORG_TYPES, type Organization, type OrgType } from '../types'

const EMPTY_FORM = { name: '', shortName: '', orgType: 'other' as OrgType, description: '', contactName: '', contactEmail: '', contactPhone: '' }

export function OrganizationsPage() {
  const organizations = useMasterDataStore((s) => s.organizations)
  const createOrganization = useMasterDataStore((s) => s.createOrganization)
  const updateOrganization = useMasterDataStore((s) => s.updateOrganization)
  const deleteOrganization = useMasterDataStore((s) => s.deleteOrganization)

  const [editing, setEditing] = useState<Organization | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-extrabold">سازمان‌ها</h2>
          <p className="text-xs text-secondary">کارفرما، مشاور، پیمانکار، شریک و واحدهای داخلی — به‌عنوان داده پایه قابل استفاده در همه پروژه‌ها</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2 text-xs font-medium text-white hover:bg-brand-400 transition-colors"
        >
          <Plus size={14} /> سازمان جدید
        </button>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        {organizations.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted">هنوز سازمانی ثبت نشده است</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-soft)' }}>
            {organizations.map((org) => (
              <div key={org.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400">
                  <Building2 size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{org.name}</p>
                    <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-secondary">
                      {ORG_TYPE_LABEL_FA[org.orgType]}
                    </span>
                    {!org.isActive && <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted">غیرفعال</span>}
                  </div>
                  {org.contactEmail && <p className="text-[11px] text-muted truncate">{org.contactEmail}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => setEditing(org)} className="rounded-lg p-1.5 text-muted hover:text-brand-400 transition-colors" title="ویرایش">
                    <Pencil size={13} />
                  </button>
                  {confirmDeleteId === org.id ? (
                    <>
                      <button onClick={() => { deleteOrganization(org.id); setConfirmDeleteId(null) }} className="text-[11px] text-red-400 hover:underline px-1">
                        تایید
                      </button>
                      <button onClick={() => setConfirmDeleteId(null)} className="text-[11px] text-secondary hover:underline px-1">
                        انصراف
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(org.id)} className="rounded-lg p-1.5 text-muted hover:text-red-400 transition-colors" title="حذف">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNew && (
        <OrganizationModal
          onClose={() => setShowNew(false)}
          onSubmit={async (data) => {
            await createOrganization(data)
            setShowNew(false)
          }}
        />
      )}
      {editing && (
        <OrganizationModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (data) => {
            await updateOrganization(editing.id, data)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function OrganizationModal({
  initial,
  onClose,
  onSubmit,
}: {
  initial?: Organization
  onClose: () => void
  onSubmit: (data: Partial<Organization>) => Promise<void>
}) {
  const [form, setForm] = useState(
    initial
      ? {
          name: initial.name,
          shortName: initial.shortName,
          orgType: initial.orgType,
          description: initial.description,
          contactName: initial.contactName,
          contactEmail: initial.contactEmail,
          contactPhone: initial.contactPhone,
        }
      : EMPTY_FORM,
  )
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    await onSubmit(form)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="glass-panel w-full max-w-md rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold">{initial ? 'ویرایش سازمان' : 'سازمان جدید'}</h3>
          <button onClick={onClose} className="text-muted hover:text-current">
            <X size={16} />
          </button>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs text-secondary">نام سازمان</span>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input" autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">نام کوتاه</span>
          <input value={form.shortName} onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))} className="input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">نوع سازمان</span>
          <select value={form.orgType} onChange={(e) => setForm((f) => ({ ...f, orgType: e.target.value as OrgType }))} className="input">
            {ORG_TYPES.map((t) => (
              <option key={t} value={t}>
                {ORG_TYPE_LABEL_FA[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">توضیحات</span>
          <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="input" rows={2} />
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">نام رابط</span>
            <input value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">تلفن</span>
            <input value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} className="input" dir="ltr" />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">ایمیل</span>
          <input value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} className="input" dir="ltr" />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
            انصراف
          </button>
          <button
            onClick={submit}
            disabled={!form.name.trim() || saving}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-400 disabled:opacity-40 transition-colors"
          >
            {saving ? 'در حال ذخیره...' : 'ذخیره'}
          </button>
        </div>
      </div>
    </div>
  )
}
