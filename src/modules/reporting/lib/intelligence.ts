import { computeProjectKpis, computeSCurve } from '../../../lib/progress'
import { computeExposureKpi, computeManagementAttentionRisks, computeTopRisks } from '../../risk/lib/riskAnalytics'
import { isActionOverdue, riskLevel, todayIso as riskTodayIso } from '../../risk/lib/riskScore'
import { computeIssueMetrics } from '../../issues/lib/issueAnalytics'
import { isIssueOverdue } from '../../issues/lib/issueRing'
import type { SemanticTone } from '../types'
import type { ProjectIntelligenceBundle } from './dataAdapter'

export interface ChangeItem {
  id: string
  label: string
  sourceModule: 'risk' | 'issue' | 'pipepulse'
  previous: string
  current: string
  tone: SemanticTone
}

/**
 * "What Changed": current bundle vs the previous one (the most recent prior snapshot's live
 * recompute, or an earlier live fetch) — only surfaces metrics that actually moved.
 */
export function computeWhatChanged(current: ProjectIntelligenceBundle, previous: ProjectIntelligenceBundle | null): ChangeItem[] {
  if (!previous) return []
  const items: ChangeItem[] = []

  if (current.pipepulse && previous.pipepulse) {
    const curKpi = computeProjectKpis(current.pipepulse.project)
    const prevKpi = computeProjectKpis(previous.pipepulse.project)
    if (curKpi.overallPercent !== prevKpi.overallPercent) {
      const delta = curKpi.overallPercent - prevKpi.overallPercent
      items.push({
        id: 'pp-progress',
        label: 'پیشرفت کلی پروژه',
        sourceModule: 'pipepulse',
        previous: `${prevKpi.overallPercent}%`,
        current: `${curKpi.overallPercent}%`,
        tone: delta >= 0 ? 'good' : 'attention',
      })
    }
  }

  if (current.risk && previous.risk) {
    const curExp = computeExposureKpi(current.risk.risks, current.risk.assessments)
    const prevExp = computeExposureKpi(previous.risk.risks, previous.risk.assessments)
    if (curExp.current !== prevExp.current) {
      items.push({
        id: 'risk-exposure',
        label: 'مجموع اکسپوژر ریسک',
        sourceModule: 'risk',
        previous: String(prevExp.current),
        current: String(curExp.current),
        tone: curExp.current <= prevExp.current ? 'good' : 'critical',
      })
    }
  }

  if (current.issues && previous.issues) {
    const curM = computeIssueMetrics(current.issues.issues)
    const prevM = computeIssueMetrics(previous.issues.issues)
    if (curM.closedCount !== prevM.closedCount || curM.total !== prevM.total) {
      items.push({
        id: 'issue-open',
        label: 'مسائل باز',
        sourceModule: 'issue',
        previous: String(prevM.total - prevM.closedCount),
        current: String(curM.total - curM.closedCount),
        tone: curM.total - curM.closedCount <= prevM.total - prevM.closedCount ? 'good' : 'attention',
      })
    }
  }

  return items
}

export interface EarlyWarning {
  id: string
  warning: string
  severity: SemanticTone
  source: string
  date: string
  explanation: string
  recommendedAction: string
}

/**
 * Rule-based Early Warning engine — a fixed, transparent set of thresholds (not the full list
 * in the spec, which needs data this schema doesn't carry yet, e.g. milestone due-dates and a
 * stored forecast-finish history; see the closing scoping summary for what's deferred).
 */
export function computeEarlyWarnings(bundle: ProjectIntelligenceBundle, today = new Date().toISOString().slice(0, 10)): EarlyWarning[] {
  const warnings: EarlyWarning[] = []

  if (bundle.pipepulse) {
    const curve = computeSCurve(bundle.pipepulse.project)
    const last = curve[curve.length - 1]
    if (last && last.plannedPercent - last.actualPercent >= 10) {
      warnings.push({
        id: 'wp-progress-gap',
        warning: 'پیشرفت واقعی به‌طور محسوس از برنامه عقب است',
        severity: last.plannedPercent - last.actualPercent >= 20 ? 'critical' : 'attention',
        source: 'PipePulse',
        date: today,
        explanation: `پیشرفت واقعی ${last.actualPercent}% در برابر برنامه ${last.plannedPercent}% — فاصله ${Math.round(last.plannedPercent - last.actualPercent)} درصد.`,
        recommendedAction: 'بررسی علل تاخیر در خطوط دارای کمترین پیشرفت و تسریع منابع اجرایی.',
      })
    }
  }

  if (bundle.risk) {
    const attention = computeManagementAttentionRisks(bundle.risk.risks, bundle.risk.assessments, bundle.risk.actions, riskTodayIso())
    const critical = attention.filter((a) => riskLevel(a.score) === 'critical')
    if (critical.length > 0) {
      warnings.push({
        id: 'wr-critical-risks',
        warning: `${critical.length} ریسک بحرانی نیازمند اقدام فوری`,
        severity: 'critical',
        source: 'مدیریت ریسک',
        date: today,
        explanation: critical.map((c) => c.risk.title).slice(0, 3).join('، '),
        recommendedAction: 'بازنگری فوری استراتژی پاسخ و تخصیص مالک اقدام برای هر ریسک بحرانی.',
      })
    }
    const overdueActions = bundle.risk.actions.filter((a) => isActionOverdue(a, riskTodayIso()))
    if (overdueActions.length > 0) {
      warnings.push({
        id: 'wr-overdue-actions',
        warning: `${overdueActions.length} اقدام کنترل ریسک عقب‌افتاده`,
        severity: overdueActions.length >= 3 ? 'critical' : 'attention',
        source: 'مدیریت ریسک',
        date: today,
        explanation: 'اقدامات پاسخ به ریسک از مهلت تعیین‌شده گذشته‌اند.',
        recommendedAction: 'پیگیری مالکان اقدام و به‌روزرسانی مهلت یا وضعیت.',
      })
    }
  }

  if (bundle.issues) {
    const metrics = computeIssueMetrics(bundle.issues.issues)
    if (metrics.trendClosedPct <= -25 && metrics.closedCount > 0) {
      warnings.push({
        id: 'wi-closure-drop',
        warning: 'نرخ بستن مسائل روند نزولی دارد',
        severity: 'attention',
        source: 'مدیریت مسائل',
        date: today,
        explanation: `نرخ بستن مسائل نسبت به هفته قبل ${metrics.trendClosedPct}% کاهش داشته است.`,
        recommendedAction: 'بررسی موانع پیگیری مسائل و تخصیص منابع بیشتر برای بستن مسائل باز.',
      })
    }
    const criticalOverdue = bundle.issues.issues.filter((i) => i.priority === 'critical' && isIssueOverdue(i))
    if (criticalOverdue.length > 0) {
      warnings.push({
        id: 'wi-critical-overdue',
        warning: `${criticalOverdue.length} مسئله بحرانی از مهلت گذشته`,
        severity: 'critical',
        source: 'مدیریت مسائل',
        date: today,
        explanation: criticalOverdue.map((i) => i.title).slice(0, 3).join('، '),
        recommendedAction: 'پیگیری فوری مسائل بحرانی معوق با مسئول پیگیری.',
      })
    }
  }

  return warnings
}

export interface AttentionItem {
  id: string
  title: string
  category: 'risk' | 'issue' | 'pipepulse'
  severity: SemanticTone
  reason: string
}

/** Cross-module ranking: top 3-5 items across risk/issue/pipepulse, ranked by severity. */
export function computeManagementAttention(bundle: ProjectIntelligenceBundle, limit = 5): AttentionItem[] {
  const items: (AttentionItem & { score: number })[] = []

  if (bundle.risk) {
    const top = computeTopRisks(bundle.risk.risks, bundle.risk.assessments, bundle.risk.actions, 5)
    for (const t of top) {
      if (t.level === 'critical' || t.level === 'high') {
        items.push({
          id: `risk-${t.risk.id}`,
          title: t.risk.title,
          category: 'risk',
          severity: t.level === 'critical' ? 'critical' : 'attention',
          reason: `امتیاز ریسک ${t.score} (${t.level === 'critical' ? 'بحرانی' : 'زیاد'})`,
          score: t.score,
        })
      }
    }
  }

  if (bundle.issues) {
    const criticalOpen = bundle.issues.issues.filter((i) => (i.priority === 'critical' || i.priority === 'high') && i.status !== 'approved' && i.status !== 'rejected')
    for (const i of criticalOpen.slice(0, 5)) {
      items.push({
        id: `issue-${i.id}`,
        title: i.title,
        category: 'issue',
        severity: isIssueOverdue(i) ? 'critical' : 'attention',
        reason: isIssueOverdue(i) ? 'از مهلت پیگیری گذشته' : `اولویت ${i.priority === 'critical' ? 'بحرانی' : 'بالا'}`,
        score: i.priority === 'critical' ? 20 : 15,
      })
    }
  }

  if (bundle.pipepulse) {
    const kpis = computeProjectKpis(bundle.pipepulse.project)
    if (kpis.overallPercent < 100 && kpis.notStartedLines > kpis.lineCount / 2 && kpis.lineCount > 0) {
      items.push({
        id: 'pp-slow-start',
        title: 'بیش از نیمی از خطوط هنوز شروع نشده‌اند',
        category: 'pipepulse',
        severity: 'attention',
        reason: `${kpis.notStartedLines} از ${kpis.lineCount} خط بدون فعالیت ثبت‌شده`,
        score: 12,
      })
    }
  }

  return items.sort((a, b) => b.score - a.score).slice(0, limit).map(({ score: _score, ...rest }) => rest)
}

export interface InsightStatement {
  id: string
  text: string
  tone: SemanticTone
  sourceLabel: string
}

/**
 * Template-generated narrative — NOT an LLM call. Every sentence is composed directly from an
 * already-computed number so it stays traceable to its source (spec: "never allow unsupported
 * AI-generated claims"); this is the seam a future real AI summary would plug into.
 */
export function computeExecutiveInsight(bundle: ProjectIntelligenceBundle): InsightStatement[] {
  const statements: InsightStatement[] = []

  if (bundle.pipepulse) {
    const kpis = computeProjectKpis(bundle.pipepulse.project)
    statements.push({
      id: 'insight-progress',
      text: `پیشرفت کلی پروژه ${kpis.overallPercent}% است؛ از ${kpis.lineCount} خط، ${kpis.completedLines} خط تکمیل و ${kpis.inProgressLines} خط در حال اجراست.`,
      tone: kpis.overallPercent >= 70 ? 'good' : kpis.overallPercent >= 40 ? 'attention' : 'critical',
      sourceLabel: 'پیشرفت پروژه (PipePulse)',
    })
  }

  if (bundle.risk) {
    const exposure = computeExposureKpi(bundle.risk.risks, bundle.risk.assessments)
    const openCount = bundle.risk.risks.filter((r) => r.status !== 'closed').length
    statements.push({
      id: 'insight-risk',
      text:
        exposure.improvementPercent >= 0
          ? `اکسپوژر کلی ریسک از ${exposure.initial} به ${exposure.current} کاهش یافته (${exposure.improvementPercent}% بهبود) در میان ${openCount} ریسک باز.`
          : `اکسپوژر کلی ریسک از ${exposure.initial} به ${exposure.current} افزایش یافته در میان ${openCount} ریسک باز.`,
      tone: exposure.improvementPercent >= 0 ? 'good' : 'critical',
      sourceLabel: 'مدیریت ریسک',
    })
  }

  if (bundle.issues) {
    const metrics = computeIssueMetrics(bundle.issues.issues)
    statements.push({
      id: 'insight-issues',
      text: `${metrics.total - metrics.closedCount} مسئله باز از مجموع ${metrics.total} مسئله؛ نرخ پیگیری به‌موقع ${metrics.onTimeRate}%.`,
      tone: metrics.onTimeRate >= 70 ? 'good' : metrics.onTimeRate >= 40 ? 'attention' : 'critical',
      sourceLabel: 'مدیریت مسائل',
    })
  }

  if (statements.length === 0) {
    statements.push({
      id: 'insight-empty',
      text: 'این پروژه هنوز به هیچ ماژول منبع داده متصل (نگاشت) نشده است.',
      tone: 'neutral',
      sourceLabel: 'نگاشت پروژه‌ها',
    })
  }

  return statements
}
