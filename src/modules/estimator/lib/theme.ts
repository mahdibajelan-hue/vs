import type { CSSProperties } from 'react'

/* Dark, engineering-report identity for the estimator — chosen and validated with the dataviz
 * skill's palette method rather than reusing the light "hazard stripe" look. Categorical series
 * colors are the skill's own reference 8-hue order (re-checked against these exact dark
 * surfaces): keeping that order is what keeps every adjacent pair colorblind-distinguishable —
 * re-sorting or hand-picking a 9th hue voids the guarantee. */

export const BG = '#0A121C'
export const SURFACE = '#0E1826'
export const SURFACE_2 = '#122032'
export const BORDER = '#1E2C3D'
export const BORDER_SOFT = 'rgba(255,255,255,0.08)'
export const INK = '#F3F6FA'
export const INK_SOFT = '#B7C4D4'
export const MUTED_FG = '#7C8DA3'
export const GRID = '#1E2C3D'
export const SAFETY = '#F2B705'

/** Reference categorical order — validated (all checks PASS) against `SURFACE` above via the
 * dataviz skill's validator. Order carries the CVD-safety guarantee; the first 8 are the skill's
 * own reference order (do not reorder them). The 9th (coating) was appended and re-validated
 * against the full set rather than picked by eye. */
export const CATEGORICAL = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#189818', '#9085e9', '#e66767', '#5b8fd6']

export const SECTION_COLOR: Record<string, string> = {
  onshore: CATEGORICAL[0],
  offshore: CATEGORICAL[1],
  compressor: CATEGORICAL[2],
  launcher: CATEGORICAL[3],
  receiver: CATEGORICAL[4],
  tieIn: CATEGORICAL[5],
  blockValve: CATEGORICAL[6],
  telecom: CATEGORICAL[7],
  coating: CATEGORICAL[8],
}

/** Reserved status/risk-band colors — never reused as a chart series, per the dataviz skill's
 * status-palette rule. Distinct from every categorical slot above at this surface. */
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
}

export const TOOLTIP_STYLE: CSSProperties = {
  background: SURFACE_2,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  color: INK,
  fontSize: 12,
  padding: '8px 12px',
  boxShadow: '0 8px 24px -8px rgba(0,0,0,0.5)',
}
export const TOOLTIP_ITEM_STYLE: CSSProperties = { color: SAFETY, fontWeight: 600 }
export const TOOLTIP_LABEL_STYLE: CSSProperties = { color: INK, marginBottom: 2 }

export const fmtUSD = (n: number) => '$' + Math.round(n).toLocaleString('en-US')
export const fmtUSDm = (n: number) => (n / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'M'
export const fmtEUR = (n: number) => '€' + Math.round(n).toLocaleString('en-US')
export const fmtEURm = (n: number) => (n / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'M'
export const fmtRial = (n: number) => Math.round(n).toLocaleString('en-US') + ' ریال'
export const fmtRialBn = (n: number) => (n / 1_000_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' میلیارد ریال'
export const fmtPct = (n: number) => (n * 100).toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%'
export const toFa = (s: number | string) => String(s).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])

export const EST_FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');`
