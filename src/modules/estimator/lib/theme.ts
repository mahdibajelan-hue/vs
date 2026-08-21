import type { CSSProperties } from 'react'

/* "نوار هشدار خط لوله" identity — steel-blue + safety-yellow, shared across every estimator page. */
export const INK = '#16232E'
export const STEEL = '#1B4B66'
export const STEEL_DARK = '#0F2F41'
export const SAFETY = '#F2B705'
export const TEAL = '#2A8C82'
export const BURNT = '#B44711'
export const PAPER = '#F3F5F7'
export const LINE = '#D8DEE4'
export const MUTED_FG = '#475569'

export const SECTION_COLOR: Record<string, string> = {
  onshore: STEEL,
  offshore: '#2E6C8E',
  compressor: TEAL,
  launcher: '#3E9C90',
  receiver: SAFETY,
  tieIn: '#C98A00',
  blockValve: BURNT,
  telecom: '#6B4FA0',
}

export const TOOLTIP_STYLE: CSSProperties = {
  background: STEEL_DARK,
  border: 'none',
  borderRadius: 8,
  color: '#fff',
  fontSize: 12,
  padding: '8px 12px',
  boxShadow: '0 8px 24px -8px rgba(15,47,65,0.45)',
}
export const TOOLTIP_ITEM_STYLE: CSSProperties = { color: SAFETY, fontWeight: 600 }
export const TOOLTIP_LABEL_STYLE: CSSProperties = { color: '#fff', marginBottom: 2 }

export const fmtUSD = (n: number) => '$' + Math.round(n).toLocaleString('en-US')
export const fmtUSDm = (n: number) => (n / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'M'
export const fmtEUR = (n: number) => '€' + Math.round(n).toLocaleString('en-US')
export const fmtEURm = (n: number) => (n / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'M'
export const fmtRial = (n: number) => Math.round(n).toLocaleString('en-US') + ' ریال'
export const fmtRialBn = (n: number) => (n / 1_000_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' میلیارد ریال'
export const fmtPct = (n: number) => (n * 100).toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%'
export const toFa = (s: number | string) => String(s).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])

export const EST_FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');`
