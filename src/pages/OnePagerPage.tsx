import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Ruler, GitCommitVertical, Gauge, ListChecks, FileDown, Send, Settings2 } from 'lucide-react'
import type { Project } from '../types'
import { STATUS_COLOR, STATUS_LABEL_FA } from '../types'
import { computeAllProgress, computeProjectKpis, computeWeldsBySize } from '../lib/progress'
import { computeScheduleSCurve } from '../lib/schedule'
import { serializeColoredSvg } from '../lib/svg'
import { exportElementToPdf } from '../lib/export'
import { useCurrentRole } from '../store/useMembersStore'
import { isReadOnly } from '../lib/permissions'
import { SendReportModal } from '../components/Dashboard/SendReportModal'
import { ReportConfigModal } from '../components/Dashboard/ReportConfigModal'
import { ReportMilestonesMini } from '../components/Dashboard/ReportMilestonesMini'
import { ReportSCurveMini } from '../components/Dashboard/ReportSCurveMini'
import { ReportWeldsMini } from '../components/Dashboard/ReportWeldsMini'
import { ReportRiskHeatMini } from '../components/Dashboard/ReportRiskHeatMini'
import { Logo } from '../components/common/Logo'

export function OnePagerPage({ project }: { project: Project }) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const progressMap = useMemo(() => computeAllProgress(project), [project])
  const kpis = useMemo(() => computeProjectKpis(project), [project])
  const scheduleSCurve = useMemo(() => computeScheduleSCurve(project), [project])
  const weldsBySize = useMemo(() => computeWeldsBySize(project), [project])
  const role = useCurrentRole()
  const [showSend, setShowSend] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const sections = project.reportConfig.sections

  const coloredSvg = useMemo(() => {
    if (!project.svgRaw) return null
    const colorMap = new Map<string, string>()
    for (const line of project.lines) {
      const p = progressMap.get(line.id)
      const color = STATUS_COLOR[p?.status ?? line.status]
      for (const elementId of line.svgElementIds) colorMap.set(elementId, color)
    }
    return serializeColoredSvg(project.svgRaw, colorMap)
  }, [project, progressMap])

  const sortedLines = [...project.lines].sort((a, b) => {
    const pa = progressMap.get(a.id)?.percent ?? 0
    const pb = progressMap.get(b.id)?.percent ?? 0
    return pa - pb
  })

  return (
    <div className="p-4 h-full overflow-y-auto flex flex-col items-center gap-3">
      <div className="no-print flex w-full max-w-[1200px] items-center justify-between">
        <p className="text-sm text-secondary">پیش‌نمایش گزارش تک‌صفحه‌ای — مناسب چاپ A4 افقی</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfig(true)}
            className="flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-secondary hover:bg-white/5 transition-colors"
          >
            <Settings2 size={15} /> تنظیمات گزارش
          </button>
          {isReadOnly(role) && (
            <button
              onClick={() => setShowSend(true)}
              className="flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-secondary hover:bg-white/5 transition-colors"
            >
              <Send size={15} /> ارسال برای مدیران ستادی
            </button>
          )}
          <button
            onClick={() => sheetRef.current && exportElementToPdf(sheetRef.current, `${project.name}-executive-summary.pdf`)}
            className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-400 transition-colors"
          >
            <FileDown size={15} /> دانلود PDF
          </button>
        </div>
      </div>
      {showSend && <SendReportModal projectName={project.name} onClose={() => setShowSend(false)} />}
      {showConfig && <ReportConfigModal projectId={project.id} config={project.reportConfig} onClose={() => setShowConfig(false)} />}

      <div
        ref={sheetRef}
        className="onepager-sheet w-full max-w-[1200px] shrink-0 rounded-xl p-7 flex flex-col gap-4"
        style={{ background: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', fontFamily: 'var(--font-sans)' }}
      >
        <div
          className="flex items-center justify-between rounded-xl px-5 py-4 -mx-1"
          style={{ background: 'linear-gradient(135deg, #0c4a6e 0%, #0369a1 55%, #0ea5e9 100%)' }}
        >
          <div className="flex items-center gap-3.5">
            <Logo size={56} className="shrink-0" />
            <div>
              <h1 className="text-3xl font-black text-white tracking-tight">{project.name}</h1>
              <p className="mt-1 text-[12px] font-medium" style={{ color: '#e0f2fe' }}>
                کارفرما: {project.client || '—'} &nbsp;|&nbsp; موقعیت: {project.location || '—'} &nbsp;|&nbsp; واحد: {project.unit || '—'}
              </p>
            </div>
          </div>
          <div className="text-left text-[11px] shrink-0" style={{ color: '#e0f2fe' }}>
            <p className="text-sm font-bold text-white">گزارش پیشرفت مدیریتی</p>
            <p>تاریخ گزارش: {new Date().toLocaleDateString('fa-IR')}</p>
            <p className="opacity-80">Executive Progress Summary</p>
          </div>
        </div>

        {sections.kpis && (
          <div className="grid grid-cols-4 gap-2.5">
            <MiniKpi icon={Gauge} label="پیشرفت کلی" value={`${kpis.overallPercent}%`} color="#0ea5e9" />
            <MiniKpi icon={Ruler} label="متراژ کل (m)" value={`${kpis.totalLengthDone} / ${kpis.totalPlannedLength}`} color="#2ecc71" />
            <MiniKpi icon={GitCommitVertical} label="کل سرجوش‌ها" value={`${kpis.totalWeldsDone} / ${kpis.totalPlannedWelds}`} color="#f1c40f" />
            <MiniKpi icon={ListChecks} label="خطوط تکمیل شده" value={`${kpis.completedLines} / ${kpis.lineCount}`} color="#3498db" />
          </div>
        )}

        {sections.milestones && project.milestones.length > 0 && (
          <ReportSection title="مراحل کلی پروژه">
            <ReportMilestonesMini milestones={project.milestones} />
          </ReportSection>
        )}

        {(sections.map || sections.linesTable) && (
          <div className="grid gap-3" style={{ gridTemplateColumns: sections.map && sections.linesTable ? '1.5fr 1fr' : '1fr' }}>
            {sections.map && (
              <div className="rounded-lg p-2 flex flex-col min-h-[220px]" style={{ border: '1px solid #e2e8f0' }}>
                <div className="flex items-center justify-between px-1 pb-1">
                  <p className="text-[11px] font-bold" style={{ color: '#334155' }}>
                    نقشه ایزومتریک — وضعیت خطوط
                  </p>
                  {sections.legend && <PrintLegend />}
                </div>
                <div className="onepager-map flex-1 min-h-0" dangerouslySetInnerHTML={coloredSvg ? { __html: coloredSvg } : { __html: '' }} />
              </div>
            )}

            {sections.linesTable && (
              <div className="rounded-lg overflow-hidden flex flex-col min-h-0" style={{ border: '1px solid #e2e8f0' }}>
                <table className="w-full text-[10px]">
                  <thead>
                    <tr style={{ background: '#f1f5f9', color: '#334155' }}>
                      <th className="p-1.5 text-right font-semibold">خط</th>
                      <th className="p-1.5 text-right font-semibold">سایز</th>
                      <th className="p-1.5 text-right font-semibold">پیشرفت</th>
                      <th className="p-1.5 text-right font-semibold">وضعیت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLines.map((line) => {
                      const p = progressMap.get(line.id)
                      const status = p?.status ?? line.status
                      return (
                        <tr key={line.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td className="p-1.5 font-mono">{line.svgElementId}</td>
                          <td className="p-1.5">{line.size}</td>
                          <td className="p-1.5 num">{p?.percent ?? 0}%</td>
                          <td className="p-1.5">
                            <span className="inline-flex items-center gap-1">
                              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[status] }} />
                              {STATUS_LABEL_FA[status]}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {(sections.scheduleSCurve || sections.weldsChart) && (
          <div className="grid gap-3" style={{ gridTemplateColumns: sections.scheduleSCurve && sections.weldsChart ? '1fr 1fr' : '1fr' }}>
            {sections.scheduleSCurve && (
              <ReportSection title="S-Curve برنامه زمان‌بندی">
                <div className="h-36">
                  <ReportSCurveMini data={scheduleSCurve} />
                </div>
              </ReportSection>
            )}
            {sections.weldsChart && (
              <ReportSection title="سرجوش به تفکیک سایز">
                <div className="h-36">
                  <ReportWeldsMini data={weldsBySize} />
                </div>
              </ReportSection>
            )}
          </div>
        )}

        {sections.riskHeatmap && project.risks.length > 0 && (
          <ReportSection title="نقشه حرارتی ریسک‌ها">
            <ReportRiskHeatMini risks={project.risks} />
          </ReportSection>
        )}

        <p className="text-[9px] text-center" style={{ color: '#94a3b8' }}>
          تولید شده توسط سامانه پایش پیشرفت ایزومتریک لوله‌کشی — {new Date().toLocaleString('fa-IR')}
        </p>
      </div>
    </div>
  )
}

function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg p-3" style={{ border: '1px solid #e2e8f0' }}>
      <p className="mb-2 text-[11px] font-bold" style={{ color: '#334155' }}>
        {title}
      </p>
      {children}
    </div>
  )
}

function MiniKpi({ icon: Icon, label, value, color }: { icon: typeof Gauge; label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg p-2.5 flex items-center gap-2" style={{ border: '1px solid #e2e8f0' }}>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0" style={{ background: `${color}1a`, color }}>
        <Icon size={15} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px]" style={{ color: '#64748b' }}>
          {label}
        </p>
        <p className="text-sm font-extrabold num" style={{ color: '#0f172a' }}>
          {value}
        </p>
      </div>
    </div>
  )
}

function PrintLegend() {
  const items = STATUS_LABEL_FA
  return (
    <div className="flex items-center gap-2">
      {(Object.keys(items) as (keyof typeof items)[]).map((k) => (
        <span key={k} className="flex items-center gap-1 text-[9px]" style={{ color: '#475569' }}>
          <span className="inline-block h-1.5 w-3 rounded-full" style={{ background: STATUS_COLOR[k] }} />
          {items[k]}
        </span>
      ))}
    </div>
  )
}
