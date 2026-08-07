import type { Project } from '../types'
import { STATUS_COLOR, STATUS_LABEL_FA, APPROVAL_LABEL_FA, ACTIVITY_LABEL_FA } from '../types'
import { computeAllProgress } from './progress'
import { serializeColoredSvg } from './svg'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function exportElementToPdf(el: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])
  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg-panel-solid') || '#ffffff',
    useCORS: true,
  })
  const imgData = canvas.toDataURL('image/png')
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height)
  const w = canvas.width * ratio
  const h = canvas.height * ratio
  const x = (pageWidth - w) / 2
  const y = (pageHeight - h) / 2
  pdf.addImage(imgData, 'PNG', x, y, w, h)
  pdf.save(filename)
}

export function exportColoredSvg(project: Project, filename: string) {
  if (!project.svgRaw) return
  const progressMap = computeAllProgress(project)
  const colorMap = new Map<string, string>()
  for (const line of project.lines) {
    const p = progressMap.get(line.id)
    const color = STATUS_COLOR[p?.status ?? line.status]
    for (const elementId of line.svgElementIds) colorMap.set(elementId, color)
  }
  const svg = serializeColoredSvg(project.svgRaw, colorMap)
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), filename)
}

export async function exportProjectToExcel(project: Project, filename: string) {
  const XLSX = await import('xlsx')
  const progressMap = computeAllProgress(project)
  const wb = XLSX.utils.book_new()

  const summaryRows = project.lines.map((line) => {
    const p = progressMap.get(line.id)!
    return {
      'شناسه خط': line.svgElementId,
      'سایز': line.size,
      'اسپک': line.spec,
      'سرویس': line.service,
      'پیمانکار': line.contractor,
      'متراژ برنامه (m)': line.plannedLength,
      'متراژ اجرا شده (m)': p.lengthDone,
      'تعداد سرجوش برنامه': line.totalWelds,
      'تعداد سرجوش اجرا شده': p.weldsDone,
      'درصد پیشرفت': p.percent,
      'وضعیت': STATUS_LABEL_FA[p.status],
      'آخرین فعالیت': p.lastActivity ?? '-',
    }
  })
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows)
  XLSX.utils.book_append_sheet(wb, summarySheet, 'خلاصه خطوط')

  const logRows = [...project.logs]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((log) => {
      const line = project.lines.find((l) => l.id === log.lineId)
      return {
        'تاریخ': log.date,
        'شناسه خط': line?.svgElementId ?? '-',
        'متراژ (m)': log.lengthDone,
        'تعداد سرجوش': log.weldCount,
        'فعالیت': ACTIVITY_LABEL_FA[log.activity],
        'پیمانکار': log.contractor,
        'توضیحات': log.notes,
        'علت تاخیر': log.delayReason,
        'وضعیت تایید': APPROVAL_LABEL_FA[log.approvalStatus],
      }
    })
  const logSheet = XLSX.utils.json_to_sheet(logRows)
  XLSX.utils.book_append_sheet(wb, logSheet, 'گزارش روزانه')

  XLSX.writeFile(wb, filename)
}
