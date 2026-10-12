import { useMemo } from 'react'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import type { LookupKind, MtlLookup } from '../../types'

/** Options for a form select: the project's active entries, plus the record's current value when it is no longer listed (so editing an old record never blanks it). */
export function lookupOptions(list: MtlLookup[], projectId: string, kind: LookupKind, current?: string | null): { value: string; label: string }[] {
  const rows = list.filter((l) => l.masterProjectId === projectId && l.kind === kind && l.active).sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, 'fa'))
  const out = rows.map((l) => ({ value: l.label, label: l.label }))
  if (current && !out.some((o) => o.value === current)) out.push({ value: current, label: `${current} (در فهرست نیست)` })
  return out
}

export function useLookupOptions(projectId: string, kind: LookupKind, current?: string | null) {
  const list = useMaterialControlStore((s) => s.lookups)
  return useMemo(() => lookupOptions(list, projectId, kind, current), [list, projectId, kind, current])
}

/** Values found in a set of rows that the project's list does not have yet. */
export function missingValues(list: MtlLookup[], projectId: string, kind: LookupKind, values: (string | undefined | null)[]): string[] {
  const have = new Set(list.filter((l) => l.masterProjectId === projectId && l.kind === kind && l.active).map((l) => l.label))
  return [...new Set(values.map((v) => (v ?? '').trim()).filter((v) => v && !have.has(v)))]
}
