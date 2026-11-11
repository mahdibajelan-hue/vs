import { supabase } from './supabaseClient'
import { KEEP_HEADER } from './restFetchCore'

/**
 * `supabase.from` for a module store's own load: its reads are kept in the browser, so a repeat visit draws at once
 * while the network read runs behind it, and when the answer changed the store named by `tag` loads again
 * (lib/liveRefresh). Use it only in a store's fetchAll — a read elsewhere would not be refreshed.
 */
export function keepReads(tag: string): { from: typeof supabase.from } {
  const from = ((table: string) => {
    const qb = supabase.from(table)
    const select = qb.select.bind(qb) as (...a: unknown[]) => { setHeader(n: string, v: string): unknown }
    ;(qb as unknown as { select: unknown }).select = (...a: unknown[]) => select(...a).setHeader(KEEP_HEADER, tag)
    return qb
  }) as unknown as typeof supabase.from
  return { from }
}
