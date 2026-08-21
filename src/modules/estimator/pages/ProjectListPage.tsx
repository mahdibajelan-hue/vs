import { useState } from 'react'
import { Anchor, Calculator, GitBranch, Plus, Radio, Trash2, Waves, Wind } from 'lucide-react'
import { useEstimatorStore } from '../store/useEstimatorStore'
import type { EstProjectDraft } from '../types'
import { STEEL, STEEL_DARK } from '../lib/theme'
import { CountField, TextField, Toggle } from '../components/ui'

const EMPTY_DRAFT: EstProjectDraft = {
  name: '',
  hasOnshore: true,
  hasOffshore: false,
  hasCompressorStation: false,
  launcherCount: 0,
  receiverCount: 0,
  tieInCount: 0,
  blockValveCount: 0,
  hasTelecomScada: true,
}

export function ProjectListPage() {
  const projects = useEstimatorStore((s) => s.projects)
  const createProject = useEstimatorStore((s) => s.createProject)
  const selectProject = useEstimatorStore((s) => s.selectProject)
  const deleteProject = useEstimatorStore((s) => s.deleteProject)
  const [showForm, setShowForm] = useState(false)
  const [draft, setDraft] = useState<EstProjectDraft>({ ...EMPTY_DRAFT })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = <K extends keyof EstProjectDraft>(k: K) => (v: EstProjectDraft[K]) => setDraft((d) => ({ ...d, [k]: v }))

  async function submit() {
    if (!draft.name.trim()) {
      setError('نام پروژه را وارد کنید')
      return
    }
    if (!draft.hasOnshore && !draft.hasOffshore) {
      setError('حداقل یکی از بخش خشکی یا دریایی باید انتخاب شود')
      return
    }
    setBusy(true)
    setError('')
    const id = await createProject({ ...draft, name: draft.name.trim() })
    setBusy(false)
    if (id) {
      setShowForm(false)
      setDraft({ ...EMPTY_DRAFT })
    } else {
      setError('خطا در ایجاد پروژه')
    }
  }

  return (
    <div className="h-full overflow-y-auto est-font" style={{ background: '#F3F5F7' }}>
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold" style={{ color: STEEL_DARK }}>پروژه‌های برآورد هزینه</p>
            <p className="text-[11px] text-slate-500 mt-0.5">ابتدا پروژه را با مشخصات کلی آن تعریف کنید، سپس مشخصات هر بخش را وارد نمایید</p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium text-white transition-transform hover:scale-[1.02]"
            style={{ background: STEEL }}
          >
            <Plus size={14} /> تعریف پروژه جدید
          </button>
        </div>

        {showForm && (
          <div className="est-card bg-white rounded-2xl border border-slate-200 p-5 space-y-1">
            <h3 className="text-sm font-bold mb-2" style={{ color: STEEL_DARK }}>۱. تعریف پروژه</h3>
            <TextField label="نام پروژه" value={draft.name} onChange={set('name')} placeholder="مثلاً خط لوله انتقال گاز فارس ۳" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
              <Toggle label="بخش دریایی دارد؟" value={draft.hasOffshore} onChange={set('hasOffshore')} hint="آفشور / خط لوله زیردریایی" />
              <Toggle label="بخش خشکی دارد؟" value={draft.hasOnshore} onChange={set('hasOnshore')} hint="آنشور / خط لوله زمینی" />
            </div>
            <Toggle label="ایستگاه تقویت فشار دارد؟" value={draft.hasCompressorStation} onChange={set('hasCompressorStation')} hint="کمپرسور گازی یا الکتریکی" />
            <Toggle label="مخابرات و اسکادا دارد؟" value={draft.hasTelecomScada} onChange={set('hasTelecomScada')} />

            <div className="grid grid-cols-2 gap-x-3 pt-1">
              <CountField label="تعداد ایستگاه لانچر" value={draft.launcherCount} onChange={set('launcherCount')} />
              <CountField label="تعداد ایستگاه رسیور" value={draft.receiverCount} onChange={set('receiverCount')} />
              <CountField label="تعداد ایستگاه انشعاب" value={draft.tieInCount} onChange={set('tieInCount')} />
              <CountField label="تعداد ایستگاه شیر بین‌راهی" value={draft.blockValveCount} onChange={set('blockValveCount')} />
            </div>

            {error && <p className="text-xs text-red-500 pt-1">{error}</p>}
            <div className="flex justify-end gap-2 pt-3">
              <button onClick={() => setShowForm(false)} className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:bg-slate-100">
                انصراف
              </button>
              <button
                onClick={submit}
                disabled={busy}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition-transform hover:scale-[1.02]"
                style={{ background: STEEL_DARK }}
              >
                {busy ? 'در حال ایجاد...' : 'ایجاد پروژه و ادامه'}
              </button>
            </div>
          </div>
        )}

        {projects.length === 0 && !showForm && (
          <div className="est-card bg-white rounded-2xl border border-slate-200 p-10 text-center">
            <Calculator size={30} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm text-slate-500">هنوز پروژه‌ای برای برآورد هزینه تعریف نشده است</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {projects.map((p) => (
            <div key={p.id} className="est-card group relative bg-white rounded-2xl border border-slate-200 p-4 text-right">
              <button onClick={() => selectProject(p.id)} className="block w-full text-right">
                <p className="text-sm font-bold truncate mb-2" style={{ color: STEEL_DARK }}>{p.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.hasOnshore && <Badge icon={<GitBranch size={11} />} label="خشکی" />}
                  {p.hasOffshore && <Badge icon={<Waves size={11} />} label="دریایی" />}
                  {p.hasCompressorStation && <Badge icon={<Wind size={11} />} label="تقویت فشار" />}
                  {p.hasTelecomScada && <Badge icon={<Radio size={11} />} label="مخابرات/اسکادا" />}
                  {p.launcherCount + p.receiverCount + p.tieInCount + p.blockValveCount > 0 && (
                    <Badge icon={<Anchor size={11} />} label={`${p.launcherCount + p.receiverCount + p.tieInCount + p.blockValveCount} ایستگاه جانبی`} />
                  )}
                </div>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(`پروژه «${p.name}» و همه تاریخچه محاسبات آن حذف شود؟`)) deleteProject(p.id)
                }}
                className="absolute left-3 top-3 rounded-md p-1.5 text-slate-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                title="حذف پروژه"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Badge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
      {icon} {label}
    </span>
  )
}
