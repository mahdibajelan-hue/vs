import { useMemo, useState } from 'react'
import { FolderKanban, Plus, Search, X } from 'lucide-react'
import { useMasterDataStore } from '../store/useMasterDataStore'
import { PROJECT_LIFECYCLE_STATUSES, PROJECT_STATUS_LABEL_FA, PROJECT_STATUS_TONE, type MasterProject } from '../types'

const TONE_CLASS: Record<'neutral' | 'green' | 'amber' | 'red', string> = {
  neutral: 'border-white/15 bg-white/[0.04] text-muted',
  green: 'border-green-400/40 bg-green-500/10 text-green-300',
  amber: 'border-amber-400/40 bg-amber-500/10 text-amber-300',
  red: 'border-red-400/40 bg-red-500/10 text-red-300',
}

export function ProjectsPage({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const projects = useMasterDataStore((s) => s.projects)
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const users = useMasterDataStore((s) => s.users)
  const createProject = useMasterDataStore((s) => s.createProject)

  const [query, setQuery] = useState('')
  const [portfolioFilter, setPortfolioFilter] = useState('')
  const [programFilter, setProgramFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showNew, setShowNew] = useState(false)

  const portfolioName = (id: string | null) => portfolios.find((p) => p.id === id)?.name ?? '—'
  const programName = (id: string | null) => programs.find((p) => p.id === id)?.name ?? '—'
  const userName = (id: string | null) => users.find((u) => u.id === id)?.fullName || users.find((u) => u.id === id)?.email || '—'

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return projects.filter((p) => {
      if (portfolioFilter && p.portfolioId !== portfolioFilter) return false
      if (programFilter && p.programId !== programFilter) return false
      if (statusFilter && p.status !== statusFilter) return false
      if (!q) return true
      return (
        p.officialName.toLowerCase().includes(q) ||
        p.shortName.toLowerCase().includes(q) ||
        p.projectCode.toLowerCase().includes(q) ||
        p.projectIdCode.toLowerCase().includes(q)
      )
    })
  }, [projects, query, portfolioFilter, programFilter, statusFilter])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-extrabold">پروژه‌ها</h2>
          <p className="text-xs text-secondary">رجیستری مرکزی پروژه‌های راستا — هر پروژه یک شناسه یکتا و غیرقابل‌تغییر دارد</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2 text-xs font-medium text-white hover:bg-brand-400 transition-colors"
        >
          <Plus size={14} /> پروژه جدید
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجو در نام، کد یا شناسه پروژه..." className="input pr-9" />
        </div>
        <select value={portfolioFilter} onChange={(e) => setPortfolioFilter(e.target.value)} className="input w-auto">
          <option value="">همه پورتفولیوها</option>
          {portfolios.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select value={programFilter} onChange={(e) => setProgramFilter(e.target.value)} className="input w-auto">
          <option value="">همه طرح‌ها</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-auto">
          <option value="">همه وضعیت‌ها</option>
          {PROJECT_LIFECYCLE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PROJECT_STATUS_LABEL_FA[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted">{projects.length === 0 ? 'هنوز پروژه‌ای ثبت نشده است' : 'موردی یافت نشد'}</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-soft)' }}>
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => onOpenProject(p.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-right hover:bg-white/5 transition-colors"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400">
                  <FolderKanban size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="shrink-0 text-[10px] text-muted num" dir="ltr">
                      {p.projectIdCode}
                    </span>
                    <p className="text-sm font-medium truncate">{p.officialName}</p>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${TONE_CLASS[PROJECT_STATUS_TONE[p.status]]}`}>
                      {PROJECT_STATUS_LABEL_FA[p.status]}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted truncate">
                    {portfolioName(p.portfolioId)} / {programName(p.programId)}
                    {p.projectManagerId && ` — مدیر پروژه: ${userName(p.projectManagerId)}`}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {showNew && (
        <NewProjectModal
          portfolios={portfolios}
          onClose={() => setShowNew(false)}
          onCreate={async (data) => {
            const id = await createProject(data)
            setShowNew(false)
            if (id) onOpenProject(id)
          }}
        />
      )}
    </div>
  )
}

function NewProjectModal({
  portfolios,
  onClose,
  onCreate,
}: {
  portfolios: { id: string; name: string }[]
  onClose: () => void
  onCreate: (data: Partial<MasterProject>) => Promise<void>
}) {
  const [officialName, setOfficialName] = useState('')
  const [shortName, setShortName] = useState('')
  const [projectCode, setProjectCode] = useState('')
  const [portfolioId, setPortfolioId] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!officialName.trim()) return
    setSaving(true)
    await onCreate({ officialName, shortName, projectCode, portfolioId: portfolioId || undefined })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="glass-panel w-full max-w-md rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold">پروژه جدید</h3>
          <button onClick={onClose} className="text-muted hover:text-current">
            <X size={16} />
          </button>
        </div>
        <p className="text-[11px] text-muted leading-5">
          شناسهٔ پروژه (Project ID) به‌صورت خودکار و غیرقابل‌تغییر تولید می‌شود. بقیهٔ اطلاعات — قرارداد، برنامه زمان‌بندی، سازمان‌ها و مدیریت — را می‌توانید بعداً از صفحهٔ «شناسنامه پروژه» تکمیل کنید.
        </p>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">نام رسمی پروژه</span>
          <input value={officialName} onChange={(e) => setOfficialName(e.target.value)} className="input" autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">نام کوتاه (برای داشبورد)</span>
          <input value={shortName} onChange={(e) => setShortName(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">کد پروژه (اختیاری، تعریف‌شده توسط سازمان)</span>
          <input value={projectCode} onChange={(e) => setProjectCode(e.target.value)} className="input" dir="ltr" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">پورتفولیو</span>
          <select value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)} className="input">
            <option value="">—</option>
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
            انصراف
          </button>
          <button
            onClick={submit}
            disabled={!officialName.trim() || saving}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-400 disabled:opacity-40 transition-colors"
          >
            {saving ? 'در حال ایجاد...' : 'ایجاد پروژه'}
          </button>
        </div>
      </div>
    </div>
  )
}
