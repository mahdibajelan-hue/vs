import type { ImIssue } from '../types'
import { similarity } from './imText'

export interface ImLesson { id: string; sourceIssueId: string | null; projectId: string | null; title: string; context: string; rootCause: string; solution: string; prevention: string; category: string | null; tags: string[]; status: 'draft' | 'published' | 'archived'; createdBy: string | null; createdAt: string }

/** Lessons relevant to a new/open issue: lexical similarity over title+context+root cause, boosted by same category. Explainable; shown, never applied automatically. */
export function relevantLessons(q: { title: string; description?: string; category?: string | null }, lessons: ImLesson[], limit = 3, threshold = 0.22): { lesson: ImLesson; score: number }[] {
  const text = q.title + ' ' + (q.description ?? '')
  return lessons
    .filter((l) => l.status === 'published')
    .map((l) => {
      const base = Math.max(similarity(text, l.title), similarity(text, l.title + ' ' + l.context + ' ' + l.rootCause) * 0.9)
      return { lesson: l, score: base + (q.category && l.category === q.category ? 0.05 : 0) }
    })
    .filter((x) => x.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/** Draft lesson pre-filled from a closed issue (the author edits it before anything is published). */
export function lessonDraftFromIssue(i: ImIssue): Omit<ImLesson, 'id' | 'createdBy' | 'createdAt'> {
  return {
    sourceIssueId: i.id, projectId: i.projectId, title: i.title, context: i.description.slice(0, 600), rootCause: i.rootCauseSummary ?? '',
    solution: i.resolutionSummary ?? '', prevention: '', category: i.category ?? null, tags: i.tags ?? [], status: 'draft',
  }
}

export function lessonReady(l: Pick<ImLesson, 'title' | 'rootCause' | 'solution'>): string[] {
  const m: string[] = []
  if (l.title.trim().length < 4) m.push('عنوان')
  if (!l.rootCause.trim()) m.push('علت ریشه‌ای')
  if (!l.solution.trim()) m.push('راه‌حل')
  return m
}
