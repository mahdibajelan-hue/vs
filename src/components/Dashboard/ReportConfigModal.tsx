import { Modal } from '../common/Modal'
import type { ReportConfig, ReportSections, ReportTemplate } from '../../types'
import { REPORT_SECTION_LABEL_FA } from '../../types'
import { templateConfig } from '../../lib/reportConfig'
import { useStore } from '../../store/useStore'

const TEMPLATES: { id: ReportTemplate; label: string; desc: string }[] = [
  { id: 'standard', label: 'استاندارد', desc: 'خلاصه مدیریتی فشرده — نقشه، KPIها و جدول خطوط' },
  { id: 'detailed', label: 'جامع', desc: 'شامل تمام بخش‌ها — برنامه زمان‌بندی، مایلستون‌ها و ریسک‌ها' },
]

const SECTION_KEYS = Object.keys(REPORT_SECTION_LABEL_FA) as (keyof ReportSections)[]

export function ReportConfigModal({ projectId, config, onClose }: { projectId: string; config: ReportConfig; onClose: () => void }) {
  const setReportConfig = useStore((s) => s.setReportConfig)

  const applyTemplate = (template: ReportTemplate) => {
    setReportConfig(projectId, templateConfig(template))
  }

  const toggleSection = (key: keyof ReportSections) => {
    setReportConfig(projectId, { ...config, sections: { ...config.sections, [key]: !config.sections[key] } })
  }

  return (
    <Modal title="تنظیمات گزارش مدیریتی" subtitle="قالب گزارش و آیتم‌هایی که در خروجی نمایش داده می‌شوند را انتخاب کنید" onClose={onClose} width="max-w-lg">
      <p className="mb-2 text-xs font-bold text-secondary">قالب گزارش</p>
      <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => applyTemplate(t.id)}
            className={`rounded-xl border p-3 text-right transition-colors ${
              config.template === t.id ? 'border-brand-400 bg-brand-500/10' : 'border-white/10 hover:bg-white/5'
            }`}
          >
            <p className="text-sm font-bold">{t.label}</p>
            <p className="mt-0.5 text-[11px] text-muted leading-5">{t.desc}</p>
          </button>
        ))}
      </div>

      <p className="mb-2 text-xs font-bold text-secondary">آیتم‌های گزارش</p>
      <div className="space-y-1.5">
        {SECTION_KEYS.map((key) => (
          <label
            key={key}
            className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3.5 py-2.5 cursor-pointer hover:bg-white/[0.06] transition-colors"
          >
            <span className="text-sm">{REPORT_SECTION_LABEL_FA[key]}</span>
            <input
              type="checkbox"
              checked={config.sections[key]}
              onChange={() => toggleSection(key)}
              className="h-4 w-4 accent-brand-500"
            />
          </label>
        ))}
      </div>

      <div className="flex justify-end pt-4">
        <button onClick={onClose} className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-400 transition-colors">
          تمام شد
        </button>
      </div>
    </Modal>
  )
}
