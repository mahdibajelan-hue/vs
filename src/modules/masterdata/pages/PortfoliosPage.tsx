import { useState } from 'react'
import { Briefcase, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useMasterDataStore } from '../store/useMasterDataStore'
import { PORTFOLIO_PROGRAM_STATUSES, PORTFOLIO_PROGRAM_STATUS_LABEL_FA, type Portfolio, type PortfolioProgramStatus } from '../types'

const EMPTY_FORM = {
  code: '',
  name: '',
  description: '',
  organizationId: '',
  ownerId: '',
  status: 'active' as PortfolioProgramStatus,
  startDate: '',
  endDate: '',
  strategicObjectives: '',
}

export function PortfoliosPage() {
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const organizations = useMasterDataStore((s) => s.organizations)
  const users = useMasterDataStore((s) => s.users)
  const createPortfolio = useMasterDataStore((s) => s.createPortfolio)
  const updatePortfolio = useMasterDataStore((s) => s.updatePortfolio)
  const deletePortfolio = useMasterDataStore((s) => s.deletePortfolio)

  const [editing, setEditing] = useState<Portfolio | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const orgName = (id: string | null) => organizations.find((o) => o.id === id)?.name ?? '—'
  const userName = (id: string | null) => users.find((u) => u.id === id)?.fullName || users.find((u) => u.id === id)?.email || '—'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-extrabold">پورتفولیوها</h2>
          <p className="text-xs text-secondary">گروه‌بندی پروژه‌ها بر اساس اهداف راهبردی یا سازمانی</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2 text-xs font-medium text-white hover:bg-brand-400 transition-colors"
        >
          <Plus size={14} /> پورتفولیوی جدید
        </button>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        {portfolios.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted">هنوز پورتفولیویی ثبت نشده است</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-soft)' }}>
            {portfolios.map((pf) => (
              <div key={pf.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400">
                  <Briefcase size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {pf.code && <span className="shrink-0 text-[10px] text-muted num">{pf.code}</span>}
                    <p className="text-sm font-medium truncate">{pf.name}</p>
                    <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-secondary">
                      {PORTFOLIO_PROGRAM_STATUS_LABEL_FA[pf.status]}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted truncate">
                    {orgName(pf.organizationId)} {pf.ownerId && `— مالک: ${userName(pf.ownerId)}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => setEditing(pf)} className="rounded-lg p-1.5 text-muted hover:text-brand-400 transition-colors" title="ویرایش">
                    <Pencil size={13} />
                  </button>
                  {confirmDeleteId === pf.id ? (
                    <>
                      <button onClick={() => { deletePortfolio(pf.id); setConfirmDeleteId(null) }} className="text-[11px] text-red-400 hover:underline px-1">
                        تایید
                      </button>
                      <button onClick={() => setConfirmDeleteId(null)} className="text-[11px] text-secondary hover:underline px-1">
                        انصراف
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(pf.id)} className="rounded-lg p-1.5 text-muted hover:text-red-400 transition-colors" title="حذف">
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
        <PortfolioModal
          organizations={organizations}
          users={users}
          onClose={() => setShowNew(false)}
          onSubmit={async (data) => {
            await createPortfolio(data)
            setShowNew(false)
          }}
        />
      )}
      {editing && (
        <PortfolioModal
          initial={editing}
          organizations={organizations}
          users={users}
          onClose={() => setEditing(null)}
          onSubmit={async (data) => {
            await updatePortfolio(editing.id, data)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function PortfolioModal({
  initial,
  organizations,
  users,
  onClose,
  onSubmit,
}: {
  initial?: Portfolio
  organizations: { id: string; name: string }[]
  users: { id: string; email: string; fullName: string }[]
  onClose: () => void
  onSubmit: (data: Partial<Portfolio>) => Promise<void>
}) {
  const [form, setForm] = useState(
    initial
      ? {
          code: initial.code,
          name: initial.name,
          description: initial.description,
          organizationId: initial.organizationId ?? '',
          ownerId: initial.ownerId ?? '',
          status: initial.status,
          startDate: initial.startDate ?? '',
          endDate: initial.endDate ?? '',
          strategicObjectives: initial.strategicObjectives,
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
      <div className="glass-panel w-full max-w-lg rounded-2xl p-5 space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold">{initial ? 'ویرایش پورتفولیو' : 'پورتفولیوی جدید'}</h3>
          <button onClick={onClose} className="text-muted hover:text-current">
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="col-span-1 block">
            <span className="mb-1 block text-xs text-secondary">کد</span>
            <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} className="input" dir="ltr" />
          </label>
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs text-secondary">نام پورتفولیو</span>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input" autoFocus />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">توضیحات</span>
          <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="input" rows={2} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">سازمان</span>
            <select value={form.organizationId} onChange={(e) => setForm((f) => ({ ...f, organizationId: e.target.value }))} className="input">
              <option value="">—</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">مالک پورتفولیو</span>
            <select value={form.ownerId} onChange={(e) => setForm((f) => ({ ...f, ownerId: e.target.value }))} className="input">
              <option value="">—</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName || u.email}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">وضعیت</span>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PortfolioProgramStatus }))} className="input">
              {PORTFOLIO_PROGRAM_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PORTFOLIO_PROGRAM_STATUS_LABEL_FA[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">تاریخ شروع</span>
            <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className="input num" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">تاریخ پایان</span>
            <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className="input num" />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">اهداف راهبردی</span>
          <textarea
            value={form.strategicObjectives}
            onChange={(e) => setForm((f) => ({ ...f, strategicObjectives: e.target.value }))}
            className="input"
            rows={2}
          />
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
