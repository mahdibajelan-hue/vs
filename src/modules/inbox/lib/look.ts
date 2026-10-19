import { Briefcase, CalendarClock, GitPullRequestArrow, Landmark, HardHat, ListChecks, Package, ShieldAlert, type LucideIcon } from 'lucide-react'
import type { InboxGroup, InboxSource } from '../types'

/** Each module keeps one colour and one icon everywhere in the inbox (list, charts, banner). */
export const SOURCE_COLOR: Record<InboxSource, string> = { execution: '#f97316', material: '#a78bfa', issues: '#38bdf8', risk: '#fb7185', change: '#34d399', missions: '#fbbf24', finance: '#2dd4bf', scheduling: '#0ea5a4' }
export const SOURCE_ICON: Record<InboxSource, LucideIcon> = { execution: HardHat, material: Package, issues: ListChecks, risk: ShieldAlert, change: GitPullRequestArrow, missions: Briefcase, finance: Landmark, scheduling: CalendarClock }
export const GROUP_COLOR: Record<InboxGroup, string> = { decide: '#a78bfa', do: '#38bdf8', fix: '#f59e0b' }
export const BUCKET_COLOR = { overdue: '#fb7185', today: '#f59e0b', soon: '#fbbf24', week: '#38bdf8', later: '#64748b', none: '#94a3b8' } as const
