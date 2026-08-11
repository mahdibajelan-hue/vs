import type { ReactNode } from 'react'

export interface ResponsiveTableColumn<T> {
  key: string
  label: string
  render: (row: T) => ReactNode
  /** Shown in the mobile card's header row without a label (use for the 1-2 fields that identify the row — title, code, primary score) instead of the label:value list below. */
  primary?: boolean
  className?: string
}

/**
 * Same data, same columns, two renderings: a normal `<table>` from `sm` up, a card list below
 * it — never both at once, never a horizontally-scrolling table on a phone. Column definitions
 * (label + a `render(row)` function) are shared between both renderings, so nothing about a
 * table's content or logic changes, only how it's laid out per device.
 */
export function ResponsiveTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyText,
}: {
  columns: ResponsiveTableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  emptyText?: string
}) {
  if (rows.length === 0) {
    return emptyText ? <p className="p-6 text-center text-xs text-muted">{emptyText}</p> : null
  }

  const primaryCols = columns.filter((c) => c.primary)
  const secondaryCols = columns.filter((c) => !c.primary)

  return (
    <>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03]">
            <tr className="text-xs text-secondary">
              {columns.map((c) => (
                <th key={c.key} className="p-2.5 text-right font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--border-soft)' }}>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={() => onRowClick?.(row)}
                className={onRowClick ? 'cursor-pointer hover:bg-white/[0.03] transition-colors' : ''}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`p-2.5 ${c.className ?? ''}`}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y sm:hidden" style={{ borderColor: 'var(--border-soft)' }}>
        {rows.map((row) => (
          <div
            key={rowKey(row)}
            onClick={() => onRowClick?.(row)}
            className={`p-3 ${onRowClick ? 'cursor-pointer active:bg-white/[0.03] transition-colors' : ''}`}
          >
            {primaryCols.length > 0 && (
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                {primaryCols.map((c) => (
                  <div key={c.key}>{c.render(row)}</div>
                ))}
              </div>
            )}
            {secondaryCols.length > 0 && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                {secondaryCols.map((c) => (
                  <div key={c.key} className="flex items-center gap-1 min-w-0">
                    <span className="shrink-0 text-muted">{c.label}:</span>
                    <span className="min-w-0 truncate">{c.render(row)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
