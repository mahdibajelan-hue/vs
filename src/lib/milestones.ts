import type { Milestone } from '../types'
import { makeId } from './id'

export const MILESTONE_COLOR_PALETTE = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#06b6d4']

const DEFAULT_LABELS = ['اتمام طراحی', 'اتمام خرید کالا', 'اتمام جوشکاری', 'اتمام رادیوگرافی', 'راه‌اندازی و تحویل']

export function createDefaultMilestones(): Milestone[] {
  return DEFAULT_LABELS.map((label, i) => ({
    id: makeId('mile'),
    label,
    percentComplete: 0,
    color: MILESTONE_COLOR_PALETTE[i % MILESTONE_COLOR_PALETTE.length],
  }))
}
