import type { CSSProperties } from 'react'
import { Flame, PartyPopper, Rocket } from 'lucide-react'
import { daysBetween, todayIso } from '../../lib/schedule'
import { formatJalali } from '../../lib/jalali'
import type { ProjectScheduleSummary } from '../../lib/schedule'

export function CountdownWidget({ summary }: { summary: ProjectScheduleSummary }) {
  const { plannedProjectEnd, forecastEnd, totalDelayDays } = summary

  if (!plannedProjectEnd) {
    return (
      <div className="glass-panel rounded-2xl p-5 flex flex-col items-center justify-center text-center gap-1.5">
        <Rocket size={22} className="text-muted" />
        <p className="text-sm font-bold">روزشمار پایان پروژه</p>
        <p className="text-xs text-muted">با تنظیم برنامه فعالیت‌های خطوط، روزشمار پایان پروژه فعال می‌شود</p>
      </div>
    )
  }

  const daysLeft = daysBetween(todayIso(), plannedProjectEnd)
  const isOverdue = daysLeft < 0
  const isDone = daysLeft <= 0 && totalDelayDays === 0
  const isUrgent = !isOverdue && daysLeft <= 30

  const colors = isOverdue
    ? { c1: '#ef4444', c2: '#f97316', c3: '#facc15', text: '#f87171', glow: 'rgba(239,68,68,0.55)' }
    : isUrgent
      ? { c1: '#f59e0b', c2: '#f97316', c3: '#facc15', text: '#fbbf24', glow: 'rgba(245,158,11,0.5)' }
      : { c1: '#8b5cf6', c2: '#38bdf8', c3: '#06b6d4', text: '#a78bfa', glow: 'rgba(139,92,246,0.5)' }

  return (
    <div
      className="countdown-ring glass-panel rounded-2xl p-5 flex flex-col items-center justify-center text-center gap-1 relative overflow-hidden"
      style={
        {
          '--countdown-c1': colors.c1,
          '--countdown-c2': colors.c2,
          '--countdown-c3': colors.c3,
          boxShadow: `0 0 40px ${colors.glow}, 0 8px 32px rgba(2,6,23,0.28)`,
        } as CSSProperties
      }
    >
      <div
        className="countdown-glow-badge absolute -top-8 -left-8 h-24 w-24 rounded-full blur-3xl"
        style={{ background: colors.c1 }}
      />
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-secondary z-10">
        {isOverdue ? <Flame size={13} style={{ color: colors.text }} /> : <PartyPopper size={13} style={{ color: colors.text }} />}
        روزشمار پایان برنامه‌ای پروژه
      </div>
      <p className="num z-10 text-6xl font-black leading-tight" style={{ color: colors.text, textShadow: `0 0 24px ${colors.glow}` }}>
        {isDone ? '🎉' : Math.abs(daysLeft)}
      </p>
      <p className="z-10 text-xs font-medium text-secondary">
        {isDone ? 'پروژه به پایان رسیده' : isOverdue ? 'روز از موعد برنامه گذشته' : 'روز تا پایان برنامه‌ای'}
      </p>
      <p className="z-10 mt-1 text-[11px] text-muted">موعد برنامه: {formatJalali(plannedProjectEnd)}</p>
      {totalDelayDays > 0 && forecastEnd && (
        <p className="z-10 text-[11px] font-medium" style={{ color: '#f87171' }}>
          پیش‌بینی واقعی: {formatJalali(forecastEnd)} ({totalDelayDays} روز تاخیر)
        </p>
      )}
    </div>
  )
}
