import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDownAZ, ArrowUpAZ, Info } from 'lucide-react'
import type { Tone } from '../lib/financeKpis'
import { formatJalali } from '../../../lib/jalali'
import { Spark } from './charts'

/** Rial amount in billions with a fixed number of decimals — for tables whose header states «میلیارد ریال». */
export const fmtBn = (n: number, d = 1): string => (n / 1e9).toLocaleString('fa-IR', { maximumFractionDigits: d, minimumFractionDigits: n !== 0 && Math.abs(n) < 1e10 ? d : 0 })
/** Big number split into a value and a unit, so KPI cards can set the unit small. */
export function splitMoney(n: number): { v: string; u: string } {
  const a = Math.abs(n), s = n < 0 ? '-' : ''
  if (a >= 1e12) return { v: s + (a / 1e12).toLocaleString('fa-IR', { maximumFractionDigits: 1 }), u: 'هزار میلیارد ریال' }
  if (a >= 1e9) return { v: s + (a / 1e9).toLocaleString('fa-IR', { maximumFractionDigits: 1 }), u: 'میلیارد ریال' }
  if (a >= 1e6) return { v: s + (a / 1e6).toLocaleString('fa-IR', { maximumFractionDigits: 1 }), u: 'میلیون ریال' }
  return { v: s + a.toLocaleString('fa-IR'), u: 'ریال' }
}
export const fmtPct = (n: number | null, d = 1): string => (n == null ? '—' : `${n.toLocaleString('fa-IR', { maximumFractionDigits: d })}٪`)

const FA = '۰۱۲۳۴۵۶۷۸۹', AR = '٠١٢٣٤٥٦٧٨٩'
/** Digits to Persian for display (dates and codes that come out of helpers with Latin digits). */
export const faDigits = (s: string): string => s.replace(/[0-9]/g, (d) => FA[+d])
/** Parses what a person typed: Persian/Arabic digits, thousands separators and the Persian decimal mark. */
export const parseNum = (s: string): number => { const t = s.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR.indexOf(d))).replace(/[٬,\s]/g, '').replace('٫', '.'); const n = Number(t); return Number.isFinite(n) ? n : 0 }
export const fmtD = (iso: string | null | undefined): string => (iso ? faDigits(formatJalali(iso) || '') || '—' : '—')

/** Text input for numbers that shows Persian digits and accepts any digit style; commits on blur. */
export function NumInput({ value, onCommit, label, className = 'fn-cell-input', decimals = 2 }: { value: number; onCommit: (n: number) => void; label: string; className?: string; decimals?: number }) {
  const shown = value ? value.toLocaleString('fa-IR', { maximumFractionDigits: decimals, useGrouping: false }) : ''
  return <input key={shown} className={className} inputMode="decimal" dir="ltr" defaultValue={shown} aria-label={label} onBlur={(e) => { const n = parseNum(e.target.value); if (n !== value) onCommit(n); else e.target.value = shown }} />
}

export function KpiCard({ label, value, unit, sub, tone = 'neutral', hint, onClick, i = 0, spark, sparkColor }: { label: ReactNode; value: ReactNode; unit?: string; sub?: ReactNode; tone?: Tone; hint?: string; onClick?: () => void; i?: number; spark?: number[]; sparkColor?: string }) {
  const body = (
    <>
      <span className="l">{label}{hint && <span className="fn-hint" title={hint} aria-label={hint}><Info size={12} /></span>}</span>
      <span className="v">{value}{unit && <span className="u"> {unit}</span>}</span>
      {sub != null && <span className="s">{sub}</span>}
      {spark && spark.length > 1 && <Spark data={spark} color={sparkColor} />}
    </>
  )
  const cls = `fn-kpi t-${tone}${spark && spark.length > 1 ? ' has-spark' : ''}`
  const st = { ['--i' as string]: i }
  return onClick ? <button type="button" className={`${cls} click`} style={st} onClick={onClick}>{body}</button> : <div className={cls} style={st}>{body}</div>
}

export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`fn-chip t-${tone}`}><i />{children}</span>
}

/** Stacked bar: segments are shares of `max` (e.g. the budget). A marker can show a reference value. */
export function StackBar({ segs, max, marker, height = 12 }: { segs: { v: number; c: string; label: string }[]; max: number; marker?: number; height?: number }) {
  const m = Math.max(max, segs.reduce((n, s) => n + s.v, 0), 1)
  return (
    <div className="fn-stack" style={{ height }} role="img" aria-label={segs.map((s) => `${s.label}: ${Math.round((s.v / m) * 100)}٪`).join('، ')}>
      {segs.map((s) => <i key={s.label} style={{ width: `${Math.max(0, (s.v / m) * 100)}%`, background: s.c }} title={s.label} />)}
      {marker != null && marker > 0 && <b style={{ insetInlineStart: `${Math.min(100, (marker / m) * 100)}%` }} />}
    </div>
  )
}

export function Section({ title, hint, action, children, flush }: { title: ReactNode; hint?: ReactNode; action?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className="fn-sec">
      <header><div><h2>{title}</h2>{hint && <p>{hint}</p>}</div>{action && <div className="no-print">{action}</div>}</header>
      <div className={flush ? '' : 'fn-sec-body'}>{children}</div>
    </section>
  )
}

export interface Col<T> { key: string; label: ReactNode; render: (r: T) => ReactNode; num?: boolean; sort?: (r: T) => number | string; foot?: ReactNode; w?: number; hint?: string }
/** One table for the whole module: sticky header, sortable columns, tabular numbers, optional totals row and clickable rows. */
export function DataTable<T>({ cols, rows, rowKey, onRow, empty = 'موردی نیست.', foot }: { cols: Col<T>[]; rows: T[]; rowKey: (r: T) => string; onRow?: (r: T) => void; empty?: ReactNode; foot?: boolean }) {
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 } | null>(null)
  const sorted = useMemo(() => {
    const c = cols.find((x) => x.key === sort?.k)
    if (!c?.sort || !sort) return rows
    return [...rows].sort((a, b) => { const x = c.sort!(a), y = c.sort!(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'fa')) * sort.dir })
  }, [rows, cols, sort])
  return (
    <div className="fn-tbl-wrap">
      <table className="fn-tbl">
        <thead><tr>{cols.map((c) => {
          const on = sort?.k === c.key
          return <th key={c.key} className={`${c.num ? 'num' : ''} ${c.sort ? 'sortable' : ''}`} style={c.w ? { width: c.w } : undefined} aria-sort={on ? (sort!.dir === 1 ? 'ascending' : 'descending') : undefined} title={c.hint}
            onClick={c.sort ? () => setSort(on ? (sort!.dir === 1 ? { k: c.key, dir: -1 } : null) : { k: c.key, dir: 1 }) : undefined}>{c.label}{on && (sort!.dir === 1 ? <ArrowDownAZ size={12} /> : <ArrowUpAZ size={12} />)}</th>
        })}</tr></thead>
        <tbody>
          {sorted.length === 0 ? <tr><td colSpan={cols.length} className="fn-empty">{empty}</td></tr> : sorted.map((r) => (
            <tr key={rowKey(r)} className={onRow ? 'click' : ''} onClick={onRow ? () => onRow(r) : undefined}>{cols.map((c) => <td key={c.key} className={c.num ? 'num' : ''}>{c.render(r)}</td>)}</tr>
          ))}
        </tbody>
        {foot && sorted.length > 0 && <tfoot><tr>{cols.map((c) => <td key={c.key} className={c.num ? 'num' : ''}>{c.foot ?? ''}</td>)}</tr></tfoot>}
      </table>
    </div>
  )
}
