/**
 * PostgREST returns at most 1000 rows per request (project setting). A month of a large site
 * (60 people × 31 days ≈ 1900 attendance rows) is more than that, so read it page by page.
 * `page(from, to)` must return the same query with a stable order and `.range(from, to)` applied.
 */
export const PAGE = 1000

export async function fetchPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>): Promise<{ data: T[]; error: { message: string; code?: string } | null }> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) return { data: out, error }
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return { data: out, error: null }
  }
}
