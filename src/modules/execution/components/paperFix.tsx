import type { ReactNode } from 'react'
import { byPath, fixPath, type ReportFix } from '../lib/reviewFixes'
import type { ReportLine } from '../types'
import { FixMark } from './ReviewSheet'

/**
 * The printed site-minute sheets mark the supervision's corrections the same way the screen does: the contractor's value
 * struck through and the final value in red. The sheet sets the report's corrections once at the top of its render and
 * wraps each cell with `mk` (render is synchronous, so the map belongs to the sheet being drawn).
 */
let current: Map<string, ReportFix> = new Map()
export function usePaperFixes(fixes: ReportFix[]) { current = byPath(fixes) }
const raw = (v: unknown) => (v == null || String(v).trim() === '' ? '—' : String(v))
export function mk(l: ReportLine | undefined, key: string, node: ReactNode, show: (v: unknown) => ReactNode = raw): ReactNode {
  if (!l || !current.size) return node
  const f = current.get(key === 'qty' ? fixPath.qty(l.id) : fixPath.cell(l.id, key))
  return f ? <FixMark fix={f} show={show}>{node}</FixMark> : node
}
export function mkData(key: string, node: ReactNode, show: (v: unknown) => ReactNode = raw): ReactNode {
  const f = current.get(fixPath.data(key))
  return f ? <FixMark fix={f} show={show}>{node}</FixMark> : node
}
