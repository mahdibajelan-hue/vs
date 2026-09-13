import { useState } from 'react'
import { Calculator, GitBranch, Plus, Radio, Trash2, Waves, Wind, Workflow } from 'lucide-react'
import { useEstimatorStore } from '../store/useEstimatorStore'
import type { EstProjectDraft } from '../types'
import { BORDER, INK, MUTED_FG, SAFETY, SURFACE, SURFACE_2 } from '../lib/theme'
import { CountField, TextField, Toggle } from '../components/ui'

const EMPTY_DRAFT: EstProjectDraft = {
  name: '',
  hasOnshore: true,
  hasOffshore: false,
  hasCompressorStation: false,
  tieInCount: 0,
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
    <div className="h-full overflow-y-auto est-font">
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold" style={{ color: INK }}>پروژه‌های برآورد هزینه</p>
            <p className="text-[11px] mt-0.5" style={{ color: MUTED_FG }}>ابتدا پروژه را با مشخصات کلی آن تعریف کنید، سپس مشخصات هر بخش را وارد نمایید</p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-transform hover:scale-[1.02]"
            style={{ background: SAFETY, color: '#1A1400' }}
          >
            <Plus size={14} /> تعریف پروژه جدید
          </button>
        </div>

        {showForm && (
          <div className="est-card rounded-2xl p-5 space-y-1" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
            <h3 className="text-sm font-bold mb-2" style={{ color: INK }}>۱. تعریف پروژه</h3>
            <TextField label="نام پروژه" value={draft.name} onChange={set('name')} placeholder="مثلاً خط لوله انتقال گاز فارس ۳" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
              <Toggle label="بخش دریایی دارد؟" value={draft.hasOffshore} onChange={set('hasOffshore')} hint="آفشور / خط لوله زیردریایی" />
              <Toggle label="بخش خشکی دارد؟" value={draft.hasOnshore} onChange={set('hasOnshore')} hint="آنشور / خط لوله زمینی" />
            </div>
            <Toggle label="ایستگاه تقویت فشار دارد؟" value={draft.hasCompressorStation} onChange={set('hasCompressorStation')} hint="کمپرسور گازی یا الکتریکی" />
            <Toggle label="مخابرات و اسکادا دارد؟" value={draft.hasTelecomScada} onChange={set('hasTelecomScada')} />
            <CountField label="تعداد ایستگاه انشعاب" value={draft.tieInCount} onChange={set('tieInCount')} />
            <p className="text-[10px]" style={{ color: MUTED_FG }}>
              تعداد ایستگاه‌های فرستنده/گیرنده توپک و شیر بین‌راهی در مرحله بعد (مشخصات پروژه) به‌صورت دستی یا خودکار تعیین می‌شود.
            </p>

            {error && <p className="text-xs pt-1" style={{ color: '#e66767' }}>{error}</p>}
            <div className="flex justify-end gap-2 pt-3">
              <button onClick={() => setShowForm(false)} className="rounded-lg px-4 py-2 text-sm" style={{ color: MUTED_FG }}>
                انصراف
              </button>
              <button
                onClick={submit}
                disabled={busy}
                className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 transition-transform hover:scale-[1.02]"
                style={{ background: SAFETY, color: '#1A1400' }}
              >
                {busy ? 'در حال ایجاد...' : 'ایجاد پروژه و ادامه'}
              </button>
            </div>
          </div>
        )}

        {projects.length === 0 && !showForm && (
          <div className="est-card rounded-2xl p-10 text-center" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
            <Calculator size={30} className="mx-auto mb-3" style={{ color: MUTED_FG }} />
            <p className="text-sm" style={{ color: MUTED_FG }}>هنوز پروژه‌ای برای برآورد هزینه تعریف نشده است</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {projects.map((p) => (
            <div key={p.id} className="est-card group relative rounded-2xl p-4 text-right" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
              <button onClick={() => selectProject(p.id)} className="block w-full text-right">
                <p className="text-sm font-bold truncate mb-2" style={{ color: INK }}>{p.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.hasOnshore && <Badge icon={<GitBranch size={11} />} label="خشکی" />}
                  {p.hasOffshore && <Badge icon={<Waves size={11} />} label="دریایی" />}
                  {p.hasCompressorStation && <Badge icon={<Wind size={11} />} label="تقویت فشار" />}
                  {p.hasTelecomScada && <Badge icon={<Radio size={11} />} label="مخابرات/اسکادا" />}
                  {p.tieInCount > 0 && <Badge icon={<Workflow size={11} />} label={`${p.tieInCount} ایستگاه انشعاب`} />}
                </div>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(`پروژه «${p.name}» و همه تاریخچه محاسبات آن حذف شود؟`)) deleteProject(p.id)
                }}
                className="absolute left-3 top-3 rounded-md p-1.5 opacity-0 transition-opacity group-hover:opacity-100"
                style={{ color: MUTED_FG }}
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
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: SURFACE_2, color: MUTED_FG }}>
      {icon} {label}
    </span>
  )
}
