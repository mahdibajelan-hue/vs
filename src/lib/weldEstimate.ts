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

/** Welding days per weld — a fitting/valve weld takes much longer than a straight pipe butt weld (fit-up, positioning, access). */
const PIPE_WELD_DAY_RATE = 0.15
const FITTING_WELD_DAY_RATE = 0.4

/** Suggested welding-activity duration (days), weighting fitting/valve welds heavier than pipe butt welds. */
export function estimateWeldingDurationDays(totalWelds: number, fittingWeldCount: number): number {
  const pipeWelds = Math.max(0, totalWelds - fittingWeldCount)
  const days = pipeWelds * PIPE_WELD_DAY_RATE + fittingWeldCount * FITTING_WELD_DAY_RATE
  return Math.max(1, Math.ceil(days))
}
