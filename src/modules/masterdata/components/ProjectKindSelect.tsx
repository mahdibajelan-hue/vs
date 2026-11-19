import { PROJECT_KINDS, PROJECT_KIND_FA, parseProjectKind, type ProjectKind } from '../../../lib/projectProfile'

/**
 * نوع پروژه — picks the profile the execution module, quality control and the digital twin follow. A value written as
 * free text before is read leniently; one that cannot be read is shown so it is not lost until someone picks a type.
 */
export function ProjectKindSelect({ value, onChange, className = 'md-input' }: { value: string; onChange: (v: ProjectKind) => void; className?: string }) {
  const k = parseProjectKind(value)
  return (
      <select className={className} value={k ?? ''} onChange={(e) => e.target.value && onChange(e.target.value as ProjectKind)} aria-label="نوع پروژه">
        {!k && <option value="">{value ? `«${value}» — یک نوع انتخاب کنید` : 'انتخاب نشده (مانند خط لوله)'}</option>}
        {PROJECT_KINDS.map((v) => <option key={v} value={v}>{PROJECT_KIND_FA[v]}</option>)}
      </select>
  )
}
