import { ArrowLeft, Zap } from 'lucide-react'
import type { AttentionItem } from '../lib/earlyWarning'
import { ESCALATION_LABEL_FA } from '../lib/earlyWarning'
import type { OverallHealth } from '../lib/health'
import type { StageReadiness } from '../lib/readiness'
import { HEALTH_DIMENSION_LABEL_FA, STAGE_LABEL_FA, type StageKey } from '../types'
import { STATUS_COLOR, STATUS_TEXT_COLOR, faNum, faText } from './ui'

/**
 * The page's thesis.
 *
 * Every project dashboard in the world opens with a row of big numbers. This one opens with a
 * SENTENCE, because the module exists to answer "what should the manager do now?" and a number
 * has never answered that. The numbers are still on the page — they just stop leading it.
 *
 * The sentence is assembled from the engines, never stored: overall health names the driving
 * dimension, readiness names the blocker, and the ranked attention list names the action. If the
 * cause is fixed the sentence changes on the next render, which is the only way a verdict this
 * prominent can be trusted.
 */
export function buildVerdict(
  overall: OverallHealth,
  currentReadiness: StageReadiness | null,
  currentStageKey: string,
  blockedGateCount: number,
  criticalDelayed: number,
  forecastVarianceDays: number | null,
): { headline: string; because: string } {
  const stage = STAGE_LABEL_FA[currentStageKey as StageKey] ?? currentStageKey
  const driver = overall.drivenBy ? HEALTH_DIMENSION_LABEL_FA[overall.drivenBy] : null

  if (overall.isOverridden) {
    return {
      headline: `وضعیت این پروژه به‌صورت دستی «${overall.status === 'green' ? 'سالم' : overall.status === 'yellow' ? 'در معرض ریسک' : overall.status === 'red' ? 'بحرانی' : 'مسدود'}» تعیین شده است`,
      because: overall.overrideReason || 'دلیلی ثبت نشده است.',
    }
  }

  if (blockedGateCount > 0) {
    return {
      headline: `پروژه پشت گیت مرحله «${stage}» متوقف است`,
      because: `${faNum(blockedGateCount)} گیت مسدود است. تا رفع موانع، پروژه به مرحله بعد منتقل نمی‌شود — درصد آمادگی این وضعیت را تغییر نمی‌دهد.`,
    }
  }

  if (criticalDelayed > 0) {
    return {
      headline: `${faNum(criticalDelayed)} Milestone بحرانی از برنامه عقب است`,
      because: driver
        ? `بُعد «${driver}» بدترین وضعیت را دارد و سلامت کلی پروژه را تعیین می‌کند.`
        : 'تأخیر در Milestoneهای بحرانی مستقیماً روی تاریخ اتمام پروژه اثر می‌گذارد.',
    }
  }

  if (forecastVarianceDays !== null && forecastVarianceDays > 30) {
    return {
      headline: `پیش‌بینی اتمام پروژه ${faNum(forecastVarianceDays)} روز فراتر از Baseline است`,
      because: driver ? `عامل اصلی: بُعد «${driver}».` : 'انحراف از برنامه پایه در حال انباشت است.',
    }
  }

  if (currentReadiness && currentReadiness.blockers.length > 0) {
    return {
      headline: `مرحله «${stage}» با ${faNum(currentReadiness.blockers.length)} مانع عبور روبه‌روست`,
      because: `آمادگی ${faNum(currentReadiness.percent)}٪ است، اما تا رفع کامل موانع گیت باز نمی‌شود.`,
    }
  }

  if (overall.status === 'green') {
    return {
      headline: `پروژه در مرحله «${stage}» در مسیر برنامه است`,
      because: driver
        ? `ضعیف‌ترین بُعد «${driver}» با امتیاز ${faNum(overall.score)} است و هنوز در محدوده سالم قرار دارد.`
        : 'هیچ بُعدی از محدوده سالم خارج نشده است.',
    }
  }

  return {
    headline: driver
      ? `سلامت پروژه را بُعد «${driver}» پایین کشیده است`
      : 'پروژه نیازمند بررسی مدیریتی است',
    because: `وضعیت کلی از بدترین بُعد گرفته می‌شود، نه از میانگین — امتیاز ${faNum(overall.score)} از ۱۰۰.`,
  }
}

export function VerdictTile({
  headline, because, top, onOpenStage, currentStageKey,
}: {
  headline: string
  because: string
  top: AttentionItem | null
  currentStageKey: string
  onOpenStage: (stageKey: string) => void
}) {
  return (
    <div className="flex h-full flex-col">
      <p className="plc-eyebrow mb-2.5" dir="ltr">The verdict</p>

      <h1 className="plc-verdict-text">{headline}</h1>
      <p className="mt-2.5 text-[12px] leading-relaxed text-secondary">{because}</p>

      {top && (
        <div
          className="flex flex-col gap-1.5 rounded-xl border px-3 py-2.5 sm:flex-row sm:items-center sm:gap-x-3"
          style={{
            marginTop: 18,
            borderColor: `${STATUS_COLOR.red}33`,
            background: `${STATUS_COLOR.red}0a`,
          }}
        >
          <span className="flex items-center gap-1.5 text-[10px] font-extrabold" style={{ color: STATUS_TEXT_COLOR.red }}>
            <Zap size={12} /> اقدام شماره یک
          </span>
          <span className="min-w-0 flex-1 text-[12px] font-medium leading-relaxed">{faText(top.recommendedAction)}</span>
          <span className="plc-eyebrow shrink-0">{ESCALATION_LABEL_FA[top.escalation]}</span>
        </div>
      )}

      <button
        onClick={() => onOpenStage(currentStageKey)}
        className="mt-2.5 flex items-center gap-1 self-start text-[11px] text-sky-400 transition-colors hover:text-sky-300"
      >
        رفتن به چک‌لیست و گیت مرحله جاری <ArrowLeft size={12} />
      </button>
    </div>
  )
}
