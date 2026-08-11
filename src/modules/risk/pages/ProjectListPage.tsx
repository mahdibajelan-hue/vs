import { useState } from 'react'
import { Plus, ShieldAlert, Building2, User, Calendar } from 'lucide-react'
import { useRiskStore } from '../store/useRiskStore'
import { RM_PROJECT_STATUS_LABEL_FA, RM_ROLE_DESCRIPTION_FA, RM_ROLE_LABEL_FA, type RmUserRole } from '../types'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { formatJalali } from '../../../lib/jalali'

const STATUS_COLOR: Record<string, string> = { active: '#2ecc71', on_hold: '#f1c40f', closed: '#94a3b8' }

export function ProjectListPage() {
  const projects = useRiskStore((s) => s.projects)
  const selectProject = useRiskStore((s) => s.selectProject)
  const createProject = useRiskStore((s) => s.createProject)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [role, setRole] = useState<RmUserRole>('project_manager')
  const [startDate, setStartDate] = useState('')
  const [finishDate, setFinishDate] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!name.trim()) {
      setError('نام پروژه را وارد کنید')
      return
    }
    setBusy(true)
    try {
      await createProject({ name: name.trim(), client: client.trim(), role, startDate: startDate || null, finishDate: finishDate || null })
      setShowForm(false)
      setName('')
      setClient('')
      setStartDate('')
      setFinishDate('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ایجاد پروژه')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold">پروژه‌های مدیریت ریسک</p>
            <p className="text-[11px] text-muted">یک پروژه را برای مشاهده ثبت ریسک انتخاب کنید، یا پروژه جدیدی بسازید</p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3.5 py-2 text-xs font-medium text-white hover:bg-red-400 transition-colors"
          >
            <Plus size={14} /> پروژه جدید
          </button>
        </div>

        {showForm && (
          <div className="glass-panel rounded-2xl p-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs text-secondary">نام پروژه</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="مثلاً واحد تقویت فشار گاز" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-secondary">کارفرما</span>
                <input value={client} onChange={(e) => setClient(e.target.value)} className="input" placeholder="نام کارفرما" />
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs text-secondary">تاریخ شروع</span>
                <JalaliDateInput value={startDate} onChange={setStartDate} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-secondary">تاریخ پایان برنامه‌ای</span>
                <JalaliDateInput value={finishDate} onChange={setFinishDate} />
              </label>
            </div>
            <div>
              <span className="mb-1.5 block text-xs text-secondary">نقش شما در این پروژه</span>
              <div className="grid grid-cols-2 gap-1.5">
                {(['project_manager', 'risk_manager', 'risk_owner', 'team_member', 'management'] as RmUserRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`rounded-xl border p-2 text-right transition-colors ${
                      role === r ? 'border-red-400/50 bg-red-500/10' : 'border-white/10 bg-white/[0.02] hover:bg-white/5'
                    }`}
                  >
                    <p className="text-xs font-medium">{RM_ROLE_LABEL_FA[r]}</p>
                    <p className="text-[10px] text-muted leading-4">{RM_ROLE_DESCRIPTION_FA[r]}</p>
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
                انصراف
              </button>
              <button
                onClick={submit}
                disabled={busy}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-400 disabled:opacity-50 transition-colors"
              >
                {busy ? 'در حال ایجاد...' : 'ایجاد پروژه'}
              </button>
            </div>
          </div>
        )}

        {projects.length === 0 && !showForm && (
          <div className="glass-panel rounded-2xl p-10 text-center">
            <ShieldAlert size={32} className="mx-auto mb-3 text-muted" />
            <p className="text-sm text-secondary">هنوز پروژه‌ای در مدیریت ریسک تعریف نشده است</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => selectProject(p.id)}
              className="glass-panel rounded-2xl p-4 text-right hover:border-red-400/30 transition-colors"
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-bold truncate">{p.name}</p>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px]"
                  style={{ background: `${STATUS_COLOR[p.status]}22`, color: STATUS_COLOR[p.status] }}
                >
                  {RM_PROJECT_STATUS_LABEL_FA[p.status]}
                </span>
              </div>
              <div className="space-y-1 text-[11px] text-muted">
                {p.client && (
                  <p className="flex items-center gap-1.5">
                    <Building2 size={11} /> {p.client}
                  </p>
                )}
                {(p.startDate || p.finishDate) && (
                  <p className="flex items-center gap-1.5 num">
                    <Calendar size={11} />
                    {p.startDate ? formatJalali(p.startDate) : '—'} تا {p.finishDate ? formatJalali(p.finishDate) : '—'}
                  </p>
                )}
                <p className="flex items-center gap-1.5">
                  <User size={11} /> {p.projectManagerId ? 'مدیر پروژه تعیین‌شده' : 'بدون مدیر پروژه'}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
