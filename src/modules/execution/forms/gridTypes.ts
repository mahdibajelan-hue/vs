/** Frozen grid template of one approved Excel sheet (produced by scripts/xlsx-to-grid.py). Geometry and fixed texts are never edited at runtime. */
export type Edge = [string, string] | null
export interface GridStyle { f: [string | null, number | null, boolean, boolean, boolean, string | null]; a: [string | null, string | null, boolean, number, number]; b: [Edge, Edge, Edge, Edge]; bg: string | null; nf: string | null }
export interface GridCell { r: number; c: number; s: number; rs?: number; cs?: number; v?: string | null; formula?: string }
export interface GridLogo { kind: 'pic' | 'shape' | 'error'; media: string | null; from?: [number, number]; to?: [number, number] | null; text: string | null }
export interface GridTemplate {
  formKey: string; sheet: string; area: string; source: { file: string; sha256: string }
  print: { orientation: 'portrait' | 'landscape'; paperSize: number | null; scale: number | null; fitToPage: boolean; margins: { left: number; right: number; top: number; bottom: number }; center: boolean }
  rtl: boolean; cols: { w: number; hidden: boolean }[]; rows: { h: number; hidden: boolean }[]
  styles: GridStyle[]; cells: GridCell[]; logos: GridLogo[]
  stats: { cells: number; merged: number; texts: number; hiddenCols: number }
  /** set when a form owner changed only the look (sizes, alignment, fonts) of a registered version; texts, merges and bindings are never touched */
  adjusted?: { fromVersion: number | null; ops: string[] }
}
/** Where a value goes in the template. Anything not bound stays exactly as the approved sheet has it. */
export interface CellBinding { cell: string; source: string; mode: 'replace' | 'append'; note?: string }
export const addr = (r: number, c: number): string => { let n = c + 1, s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return `${s}${r + 1}` }
