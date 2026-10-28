/** The app-wide request batcher over supabase — see batchedQueryCore.ts for how coalescing works. */
import { supabase } from './supabaseClient'
import { createBatcher, createShared } from './batchedQueryCore'

type Row = Record<string, unknown>
export { sortBy, type BatchSpec } from './batchedQueryCore'

/** the app-wide batcher over supabase */
export const batchedRows = createBatcher(async (spec, keys, from, to) => {
  // the column is always part of the select so rows can be routed back to their key
  const select = spec.select === '*' || spec.select.split(',').map((x) => x.trim()).includes(spec.column) ? spec.select : `${spec.select}, ${spec.column}`
  let q = supabase.from(spec.table).select(select).in(spec.column, keys)
  for (const [k, v] of Object.entries(spec.eq)) q = q.eq(k, v)
  const { data, error } = await q.range(from, to)
  return { data: (data ?? null) as Row[] | null, error }
})


/** lookup tables shared by every project's loader within a 2-second window */
export const shared = createShared(2000)
