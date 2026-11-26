import { useMemo } from 'react'
import { useEpcStore } from '../store/useEpcStore'

/** the active signature slots of a form, in signing order */
export function useFormSlots(projectId: string, formKey: string) {
  const all = useEpcStore((s) => s.signSlots)
  return useMemo(() => all.filter((x) => x.projectId === projectId && x.formKey === formKey && x.active).sort((a, b) => a.sort - b.sort), [all, projectId, formKey])
}
