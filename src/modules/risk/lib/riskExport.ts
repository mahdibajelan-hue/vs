import type { RmProjectDetail } from '../store/useRiskStore'
import type { RmProjectMember } from '../store/useRiskMembersStore'
import {
  RM_CATEGORY_LABEL_FA,
  RM_PROJECT_PHASE_LABEL_FA,
  RM_RESPONSE_STRATEGY_LABEL_FA,
  RM_RISK_STATUS_LABEL_FA,
  RM_RISK_TYPE_LABEL_FA,
  RM_TREND_LABEL_FA,
  RM_ACTION_STATUS_LABEL_FA,
  type RmRiskAction,
} from '../types'
import { currentState, isActionOverdue, latestAssessment, riskLevel, RISK_LEVEL_LABEL_FA, todayIso } from './riskScore'

function memberName(members: RmProjectMember[], userId: string | null): string {
  if (!userId) return '-'
  const m = members.find((x) => x.userId === userId)
  return m?.fullName || m?.email || '-'
}

function daysOverdue(action: RmRiskAction, today = todayIso()): number {
  if (!action.dueDate || !isActionOverdue(action, today)) return 0
  return Math.round((Date.parse(today) - Date.parse(action.dueDate)) / 86400000)
}

export async function exportRiskProjectToExcel(project: RmProjectDetail, members: RmProjectMember[], filename: string) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const today = todayIso()
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)

  // 1. Full Risk Register
  const registerRows = [...project.risks]
    .sort((a, b) => b.initialScore - a.initialScore)
    .map((risk) => {
      const riskAssessments = project.assessments.filter((a) => a.riskId === risk.id)
      const state = currentState(risk, riskAssessments)
      const trend = latestAssessment(riskAssessments)?.trend ?? null
      return {
        'کد': risk.code,
        'عنوان ریسک': risk.title,
        'دسته': RM_CATEGORY_LABEL_FA[risk.category],
        'نوع': RM_RISK_TYPE_LABEL_FA[risk.riskType],
        'فاز پروژه': risk.projectPhase ? RM_PROJECT_PHASE_LABEL_FA[risk.projectPhase] : '-',
        'احتمال اولیه': risk.initialProbability,
        'شدت اولیه': risk.initialImpact,
        'امتیاز اولیه': risk.initialScore,
        'احتمال فعلی': state.probability,
        'شدت فعلی': state.impact,
        'امتیاز فعلی': state.score,
        'سطح فعلی': RISK_LEVEL_LABEL_FA[riskLevel(state.score)],
        'روند': trend ? RM_TREND_LABEL_FA[trend] : '-',
        'راهبرد پاسخ': RM_RESPONSE_STRATEGY_LABEL_FA[risk.responseStrategy],
        'مالک ریسک': memberName(members, risk.ownerId),
        'وضعیت': RM_RISK_STATUS_LABEL_FA[risk.status],
        'تاریخ شناسایی': risk.identifiedDate,
        'زمان تا وقوع (روز)': risk.timeToImpactDays ?? '-',
      }
    })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(registerRows), 'ثبت ریسک')

  // 2. Risk Actions Tracker
  const actionRows = [...project.actions]
    .sort((a, b) => ((a.dueDate ?? '9999') < (b.dueDate ?? '9999') ? -1 : 1))
    .map((action) => {
      const risk = project.risks.find((r) => r.id === action.riskId)
      return {
        'ریسک': risk ? `${risk.code} — ${risk.title}` : '-',
        'اقدام': action.description,
        'مالک': memberName(members, action.ownerId),
        'تاریخ سررسید': action.dueDate ?? '-',
        'وضعیت': RM_ACTION_STATUS_LABEL_FA[action.status],
        'درصد پیشرفت': action.completionPercentage,
        'تاخیر (روز)': daysOverdue(action, today) || '-',
      }
    })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(actionRows), 'پیگیری اقدامات')

  // 3. Weekly Risk Report
  const newRisks = project.risks.filter((r) => r.createdAt.slice(0, 10) >= weekAgo)
  const closedRisks = project.risks.filter((r) => r.status === 'closed' && r.updatedAt.slice(0, 10) >= weekAgo)
  const escalatedRisks = project.risks.filter((r) => r.status === 'escalated')
  const overdueActions = project.actions.filter((a) => isActionOverdue(a, today))
  const reviewedThisWeek = project.assessments.filter((a) => a.createdAt.slice(0, 10) >= weekAgo)

  const weeklyRows: Record<string, string | number>[] = []
  const pushSection = (label: string) => weeklyRows.push({ 'دسته': label, 'کد ریسک': '', 'عنوان / شرح': '', 'جزئیات': '' })

  pushSection('ریسک‌های جدید (۷ روز اخیر)')
  for (const r of newRisks) weeklyRows.push({ 'دسته': '', 'کد ریسک': r.code, 'عنوان / شرح': r.title, 'جزئیات': `امتیاز اولیه: ${r.initialScore}` })

  pushSection('ریسک‌های بسته‌شده (۷ روز اخیر)')
  for (const r of closedRisks) weeklyRows.push({ 'دسته': '', 'کد ریسک': r.code, 'عنوان / شرح': r.title, 'جزئیات': '' })

  pushSection('ریسک‌های تشدیدشده')
  for (const r of escalatedRisks) weeklyRows.push({ 'دسته': '', 'کد ریسک': r.code, 'عنوان / شرح': r.title, 'جزئیات': '' })

  pushSection('اقدامات عقب‌افتاده')
  for (const a of overdueActions) {
    const risk = project.risks.find((r) => r.id === a.riskId)
    weeklyRows.push({ 'دسته': '', 'کد ریسک': risk?.code ?? '-', 'عنوان / شرح': a.description, 'جزئیات': `${daysOverdue(a, today)} روز تاخیر` })
  }

  pushSection('بازبینی‌های انجام‌شده (۷ روز اخیر)')
  for (const a of reviewedThisWeek) {
    const risk = project.risks.find((r) => r.id === a.riskId)
    weeklyRows.push({
      'دسته': '',
      'کد ریسک': risk?.code ?? '-',
      'عنوان / شرح': risk?.title ?? '-',
      'جزئیات': `امتیاز جدید: ${a.currentScore} (${RM_TREND_LABEL_FA[a.trend]})`,
    })
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(weeklyRows), 'گزارش هفتگی')

  XLSX.writeFile(wb, filename)
}
