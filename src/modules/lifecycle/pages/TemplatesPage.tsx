import { useState } from 'react'
import { Check, Database, Layers, Loader2, Sparkles, Trash2 } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useLifecycleStore } from '../store/useLifecycleStore'
import { Card, EmptyState, faNum } from '../components/ui'
import { DEFAULT_TEMPLATE_STAGES } from '../lib/templates'
import { seedLifecycleDemoData, wipeLifecycleDemoData } from '../lib/lifecycleDemoSeed'
import { STAGE_LABEL_FA, type StageKey } from '../types'

/**
 * Template administration: create the built-in lifecycle templates, and attach one to a project.
 *
 * Attaching copies the template's stages, gates and checklists onto the project — from that
 * moment the project owns its own governance record, so editing the template later never
 * rewrites history on a project already running against it.
 */
export function TemplatesPage() {
  const templates = useLifecycleStore((s) => s.templates)
  const seedTemplates = useLifecycleStore((s) => s.seedTemplates)
  const instantiateTemplate = useLifecycleStore((s) => s.instantiateTemplate)
  const allLifecycles = useLifecycleStore((s) => s.allLifecycles)
  const saving = useLifecycleStore((s) => s.saving)
  const projects = useMasterDataStore((s) => s.projects)

  const fetchPortfolioWide = useLifecycleStore((s) => s.fetchPortfolioWide)

  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [done, setDone] = useState(false)
  const [seedBusy, setSeedBusy] = useState(false)
  const [seedMessage, setSeedMessage] = useState('')

  const unassigned = projects.filter((p) => !allLifecycles.some((l) => l.projectId === p.id))

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <Card title="قالب‌های چرخه عمر">
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          هر قالب مجموعه‌ای از مراحل، گیت‌ها و چک‌لیست‌هاست. با تخصیص قالب به یک پروژه، این موارد
          در پروژه <b className="text-secondary">کپی</b> می‌شوند؛ بنابراین ویرایش بعدی قالب،
          سابقه حاکمیتی پروژه‌های در حال اجرا را تغییر نمی‌دهد.
        </p>

        {templates.length === 0 ? (
          <div className="rounded-lg border p-4 text-center" style={{ borderColor: 'var(--border-soft)' }}>
            <Sparkles size={22} className="mx-auto mb-2 text-muted" />
            <p className="mb-1 text-xs font-bold">هنوز قالبی ایجاد نشده است</p>
            <p className="mb-3 text-[10px] text-muted">
              سه قالب پیش‌فرض (خط لوله EPC، ایستگاه تقویت فشار، ساختمانی) با {faNum(DEFAULT_TEMPLATE_STAGES.length)} مرحله
              و چک‌لیست کامل پیش‌پروژه ساخته می‌شوند.
            </p>
            <button
              onClick={seedTemplates}
              disabled={saving}
              className="rounded-lg bg-sky-500 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              {saving ? 'در حال ایجاد...' : 'ایجاد قالب‌های پیش‌فرض'}
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {templates.map((t) => (
              <li key={t.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--border-soft)' }}>
                <div className="flex items-center gap-2">
                  <Layers size={14} className="text-muted" />
                  <span className="text-sm font-bold">{t.name}</span>
                  {t.isDefault && <span className="rounded bg-sky-500/15 px-1.5 py-px text-[9px] text-sky-400">پیش‌فرض</span>}
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-muted">{t.description}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {templates.length > 0 && (
        <Card title="تخصیص قالب به پروژه">
          {projects.length === 0 ? (
            <EmptyState message="پروژه‌ای در داده پایه ثبت نشده است" />
          ) : (
            <>
              <div className="mb-3 grid gap-2 sm:grid-cols-2">
                <label className="text-[10px] text-muted">
                  پروژه
                  <select
                    value={selectedProject}
                    onChange={(e) => { setSelectedProject(e.target.value); setDone(false) }}
                    className="mt-1 w-full rounded-lg border bg-black/20 px-2 py-2 text-xs outline-none"
                    style={{ borderColor: 'var(--border-soft)' }}
                  >
                    <option value="">— انتخاب کنید —</option>
                    {unassigned.length > 0 && (
                      <optgroup label="بدون چرخه عمر">
                        {unassigned.map((p) => <option key={p.id} value={p.id}>{p.officialName}</option>)}
                      </optgroup>
                    )}
                    <optgroup label="همه پروژه‌ها">
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.officialName}</option>)}
                    </optgroup>
                  </select>
                </label>
                <label className="text-[10px] text-muted">
                  قالب
                  <select
                    value={selectedTemplate}
                    onChange={(e) => { setSelectedTemplate(e.target.value); setDone(false) }}
                    className="mt-1 w-full rounded-lg border bg-black/20 px-2 py-2 text-xs outline-none"
                    style={{ borderColor: 'var(--border-soft)' }}
                  >
                    <option value="">— انتخاب کنید —</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
              </div>

              {selectedProject && allLifecycles.some((l) => l.projectId === selectedProject) && (
                <p className="mb-2 text-[10px]" style={{ color: '#fab219' }}>
                  این پروژه از قبل چرخه عمر دارد — تخصیص مجدد، بندهای چک‌لیست را دوباره اضافه می‌کند.
                </p>
              )}

              <button
                disabled={!selectedProject || !selectedTemplate || saving}
                onClick={async () => {
                  await instantiateTemplate(selectedProject, selectedTemplate)
                  setDone(true)
                }}
                className="flex items-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-xs font-medium text-white disabled:opacity-40"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : done ? <Check size={13} /> : null}
                {saving ? 'در حال تخصیص...' : done ? 'تخصیص انجام شد' : 'تخصیص قالب به پروژه'}
              </button>
            </>
          )}
        </Card>
      )}

      <Card title="داده نمونه چرخه عمر">
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          چرخه عمر را روی پروژه‌های موجودِ داده پایه ایجاد می‌کند — سلسله‌مراتب سبد/طرح/پروژه را
          دوباره نمی‌سازد. پروژه‌ها در مراحل مختلف (پیش‌پروژه تا اختتام) و وضعیت‌های متفاوت
          (در مسیر، در معرض ریسک، تأخیرکرده، مسدود) توزیع می‌شوند تا همه حالت‌های داشبورد قابل آزمایش باشد.
        </p>
        {seedMessage && <p className="mb-2 text-[10px] text-muted">{seedMessage}</p>}
        <div className="flex flex-wrap gap-2">
          <button
            disabled={seedBusy}
            onClick={async () => {
              setSeedBusy(true)
              try {
                const c = await seedLifecycleDemoData(setSeedMessage)
                setSeedMessage(
                  `انجام شد: ${faNum(c.projects)} پروژه، ${faNum(c.milestones)} Milestone، ` +
                  `${faNum(c.checklistItems)} بند چک‌لیست، ${faNum(c.actions)} اقدام`,
                )
                await fetchPortfolioWide()
              } catch (e) {
                setSeedMessage(e instanceof Error ? e.message : 'خطا در ایجاد داده نمونه')
              }
              setSeedBusy(false)
            }}
            className="flex items-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {seedBusy ? <Loader2 size={13} className="animate-spin" /> : <Database size={13} />}
            ایجاد داده نمونه
          </button>
          <button
            disabled={seedBusy}
            onClick={async () => {
              if (!confirm('همه داده‌های چرخه عمر (مراحل، گیت‌ها، چک‌لیست‌ها، Milestoneها و اقدامات چرخه عمر) حذف شوند؟ سلسله‌مراتب سبد/طرح/پروژه دست‌نخورده می‌ماند.')) return
              setSeedBusy(true)
              await wipeLifecycleDemoData(setSeedMessage)
              setSeedMessage('داده‌های چرخه عمر پاک شد')
              await fetchPortfolioWide()
              setSeedBusy(false)
            }}
            className="flex items-center gap-1.5 rounded-lg border px-4 py-2 text-xs disabled:opacity-50"
            style={{ borderColor: 'var(--border-soft)' }}
          >
            <Trash2 size={13} /> پاک‌سازی داده چرخه عمر
          </button>
        </div>
      </Card>

      <Card title="مراحل قالب پیش‌فرض">
        <ol className="space-y-1">
          {DEFAULT_TEMPLATE_STAGES.map((s, i) => (
            <li key={s.stageKey} className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[11px]"
              style={{ borderColor: 'var(--border-soft)' }}>
              <span className="flex items-center gap-2">
                <span className="text-[9px] text-muted">{faNum(String(i + 1).padStart(2, '0'))}</span>
                {STAGE_LABEL_FA[s.stageKey as StageKey]}
              </span>
              <span className="flex items-center gap-2 text-[10px] text-muted">
                {s.gateName && <span className="rounded bg-sky-500/10 px-1.5 py-px text-sky-400">{s.gateName}</span>}
                <span>{faNum(s.checklist.length)} بند</span>
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}
