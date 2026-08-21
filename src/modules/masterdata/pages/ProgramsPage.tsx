import { useState } from 'react'
import { FolderTree, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useMasterDataStore } from '../store/useMasterDataStore'
import { PORTFOLIO_PROGRAM_STATUSES, PORTFOLIO_PROGRAM_STATUS_LABEL_FA, type PortfolioProgramStatus, type Program } from '../types'

const EMPTY_FORM = {
  code: '',
  name: '',
  description: '',
  portfolioId: '',
  programManagerId: '',
  sponsorId: '',
  status: 'active' as PortfolioProgramStatus,
  startDate: '',
  plannedFinish: '',
  strategicObjectives: '',
}

export function ProgramsPage() {
  const programs = useMasterDataStore((s) => s.programs)
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const users = useMasterDataStore((s) => s.users)
  const createProgram = useMasterDataStore((s) => s.createProgram)
  const updateProgram = useMasterDataStore((s) => s.updateProgram)
  const deleteProgram = useMasterDataStore((s) => s.deleteProgram)

  const [editing, setEditing] = useState<Program | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const portfolioName = (id: string | null) => portfolios.find((p) => p.id === id)?.name ?? '—'
  const userName = (id: string | null) => users.find((u) => u.id === id)?.fullName || users.find((u) => u.id === id)?.email || '—'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-extrabold">طرح‌ها (Program)</h2>
          <p className="text-xs text-secondary">گروه هماهنگ‌شده‌ای از پروژه‌های مرتبط، زیرمجموعه یک پورتفولیو</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2 text-xs font-medium text-white hover:bg-brand-400 transition-colors"
        >
          <Plus size={14} /> طرح جدید
        </button>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        {programs.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted">هنوز طرحی ثبت نشده است</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-soft)' }}>
            {programs.map((pg) => (
              <div key={pg.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400">
                  <FolderTree size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {pg.code && <span className="shrink-0 text-[10px] text-muted num">{pg.code}</span>}
                    <p className="text-sm font-medium truncate">{pg.name}</p>
                    <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-secondary">
                      {PORTFOLIO_PROGRAM_STATUS_LABEL_FA[pg.status]}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted truncate">
                    {portfolioName(pg.portfolioId)} {pg.programManagerId && `— مدیر طرح: ${userName(pg.programManagerId)}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => setEditing(pg)} className="rounded-lg p-1.5 text-muted hover:text-brand-400 transition-colors" title="ویرایش">
                    <Pencil size={13} />
                  </button>
                  {confirmDeleteId === pg.id ? (
                    <>
                      <button onClick={() => { deleteProgram(pg.id); setConfirmDeleteId(null) }} className="text-[11px] text-red-400 hover:underline px-1">
                        تایید
                      </button>
                      <button onClick={() => setConfirmDeleteId(null)} className="text-[11px] text-secondary hover:underline px-1">
                        انصراف
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(pg.id)} className="rounded-lg p-1.5 text-muted hover:text-red-400 transition-colors" title="حذف">
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
        <ProgramModal
          portfolios={portfolios}
          users={users}
          onClose={() => setShowNew(false)}
          onSubmit={async (data) => {
            await createProgram(data)
            setShowNew(false)
          }}
        />
      )}
      {editing && (
        <ProgramModal
          initial={editing}
          portfolios={portfolios}
          users={users}
          onClose={() => setEditing(null)}
          onSubmit={async (data) => {
            await updateProgram(editing.id, data)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function ProgramModal({
  initial,
  portfolios,
  users,
  onClose,
  onSubmit,
}: {
  initial?: Program
  portfolios: { id: string; name: string }[]
  users: { id: string; email: string; fullName: string }[]
  onClose: () => void
  onSubmit: (data: Partial<Program>) => Promise<void>
}) {
  const [form, setForm] = useState(
    initial
      ? {
          code: initial.code,
          name: initial.name,
          description: initial.description,
          portfolioId: initial.portfolioId ?? '',
          programManagerId: initial.programManagerId ?? '',
          sponsorId: initial.sponsorId ?? '',
          status: initial.status,
          startDate: initial.startDate ?? '',
          plannedFinish: initial.plannedFinish ?? '',
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
          <h3 className="text-sm font-extrabold">{initial ? 'ویرایش طرح' : 'طرح جدید'}</h3>
          <button onClick={onClose} className="text-muted hover:text-current">
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="col-span-1 block">
            <span className="mb-1 block text-xs text-secondary">کد</span>
            <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} className="input" dir="ltr" />
          </label>
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs text-secondary">نام طرح</span>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input" autoFocus />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">توضیحات</span>
          <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="input" rows={2} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">پورتفولیو</span>
          <select value={form.portfolioId} onChange={(e) => setForm((f) => ({ ...f, portfolioId: e.target.value }))} className="input">
            <option value="">—</option>
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">مدیر طرح</span>
            <select value={form.programManagerId} onChange={(e) => setForm((f) => ({ ...f, programManagerId: e.target.value }))} className="input">
              <option value="">—</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName || u.email}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">حامی (Sponsor)</span>
            <select value={form.sponsorId} onChange={(e) => setForm((f) => ({ ...f, sponsorId: e.target.value }))} className="input">
              <option value="">—</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName || u.email}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
            <span className="mb-1 block text-xs text-secondary">پایان برنامه‌ریزی‌شده</span>
            <input type="date" value={form.plannedFinish} onChange={(e) => setForm((f) => ({ ...f, plannedFinish: e.target.value }))} className="input num" />
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
