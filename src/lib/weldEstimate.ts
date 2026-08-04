export const DEFAULT_STOCK_LENGTH_M = 12

/**
 * Rough weld-count estimate for a pipe run: butt welds between standard pipe
 * stock lengths, plus ~2 welds per fitting/valve placed on the line.
 */
export function estimateWeldCount(lengthMeters: number, fittingCount: number, stockLength = DEFAULT_STOCK_LENGTH_M): number {
  const buttWeldsFromStock = lengthMeters > 0 ? Math.max(0, Math.ceil(lengthMeters / stockLength) - 1) : 0
  const weldsFromFittings = fittingCount * 2
  return buttWeldsFromStock + weldsFromFittings
}
