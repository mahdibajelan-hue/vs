import type { CSSProperties } from 'react'
import { ChevronLeft } from 'lucide-react'
import type { HierarchyPath } from '../lib/useHierarchyPath'

/**
 * Shared "current management level" indicator (spec §9) — پورتفولیو > طرح > پروژه — reused
 * as-is across Risk, Issue Management and PipePulse so the same visual language communicates
 * hierarchy position everywhere, regardless of each module's own styling. Neutral/inherits
 * text color (via `style`, since some modules use scoped CSS vars instead of Tailwind classes)
 * so it drops into any module's header without clashing.
 */
export function LevelBreadcrumb({ path, className, style }: { path: HierarchyPath | null; className?: string; style?: CSSProperties }) {
  if (!path) return null
  const segments = [
    path.portfolioName && { label: path.portfolioName, kind: 'پورتفولیو' },
    path.programName && { label: path.programName, kind: 'طرح' },
    { label: path.projectName, kind: 'پروژه' },
  ].filter((s): s is { label: string; kind: string } => !!s)

  return (
    <div className={`flex flex-wrap items-center gap-1.5 text-[11px] ${className ?? ''}`} style={style}>
      {segments.map((s, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronLeft size={11} className="opacity-50" />}
          <span className="rounded-full bg-white/5 px-2 py-0.5">
            <span className="opacity-60">{s.kind}:</span> <span className="font-medium opacity-90">{s.label}</span>
          </span>
        </span>
      ))}
    </div>
  )
}
