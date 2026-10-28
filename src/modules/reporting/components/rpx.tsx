import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useAnalyticsStore } from '../store/useAnalyticsStore'
import type { ProjectFacts } from '../lib/analyticsCore'
import type { Block, Tone } from '../lib/composerCore'
import './rpx.css'

export const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d, minimumFractionDigits: d })

/** a small «؟» that explains a figure, an icon or a link; opens on click, closes on outside click or Escape */
export function Help({ children, label = 'راهنما' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc) }
  }, [open])
  return (
    <span className="rpx-help no-print" ref={ref}>
      <button type="button" className="rpx-help-btn" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen((x) => !x)}>؟</button>
      {open && <span id={id} role="note" className="rpx-help-pop">{children}</span>}
    </span>
  )
}

export function Panel({ title, sub, help, actions, children, className = '' }: { title: ReactNode; sub?: ReactNode; help?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rpx-panel ${className}`}>
      <header><div className="rpx-grow"><h3>{title}{help && <Help>{help}</Help>}</h3>{sub && <p>{sub}</p>}</div>{actions}</header>
      {children}
    </section>
  )
}

export const Tag = ({ tone = 'none', children }: { tone?: Tone | 'acc' | 'violet'; children: ReactNode }) => <span className={`rpx-tag t-${tone}`}>{children}</span>

export const CONF_FA = { high: 'اطمینان بالا', medium: 'اطمینان متوسط', low: 'اطمینان پایین' } as const
export const confTone = (c: 'high' | 'medium' | 'low'): Tone => (c === 'high' ? 'good' : c === 'medium' ? 'warn' : 'bad')

/** loads the facts of every project the user can read, shows progress, then renders with them */
export function FactsGate({ children }: { children: (facts: ProjectFacts[]) => ReactNode }) {
  const { facts, progress, loading, loadedAt, failed, load } = useAnalyticsStore()
  useEffect(() => { void load() }, [load])
  const list = [...facts.values()]
  if (!loadedAt) {
    const pct = progress.total ? (progress.done / progress.total) * 100 : 5
    return (
      <div className="rpx-panel" role="status" aria-live="polite">
        <p className="rpx-muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={13} className="animate-spin" /> خواندن دادهٔ پروژه‌ها از ماژول‌ها — {fa(progress.done)} از {fa(progress.total || 0)}</p>
        <div className="rpx-progress" style={{ marginTop: 8 }}><i style={{ width: `${pct}%` }} /></div>
      </div>
    )
  }
  return (
    <>
      {failed.length > 0 && <p className="rpx-caveats">داده‌های {fa(failed.length)} پروژه خوانده نشد و در تحلیل نیست: {failed.slice(0, 5).join('، ')}</p>}
      {children(list)}
      {loading && <p className="rpx-muted">در حال به‌روزرسانی…</p>}
    </>
  )
}

/** when the facts were read, and a refresh — validity of what is on screen */
export function Freshness() {
  const { loadedAt, loading, load } = useAnalyticsStore()
  if (!loadedAt) return null
  const min = Math.max(0, Math.round((Date.now() - loadedAt) / 60000))
  return (
    <span className="rpx-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      خوانده‌شده {min ? `${fa(min)} دقیقه پیش` : 'همین حالا'}
      <button type="button" className="rpx-btn" onClick={() => void load(true)} disabled={loading} aria-label="به‌روزرسانی داده‌ها"><RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> به‌روزرسانی</button>
    </span>
  )
}

export type Scope = { level: 'all' | 'portfolio' | 'program' | 'project'; id: string | null }
export function inScope(f: ProjectFacts, s: Scope) {
  if (s.level === 'project') return f.id === s.id
  if (s.level === 'program') return f.program?.id === s.id
  if (s.level === 'portfolio') return f.portfolio?.id === s.id
  return true
}

/** portfolio → program → project, one control set shared by the analysis pages */
export function ScopeBar({ scope, onChange, allowAll = true }: { scope: Scope; onChange: (s: Scope) => void; allowAll?: boolean }) {
  const { portfolios, programs, projects } = useMasterDataStore()
  const [pf, setPf] = useState<string>(scope.level === 'portfolio' ? scope.id ?? '' : '')
  const [pg, setPg] = useState<string>(scope.level === 'program' ? scope.id ?? '' : '')
  const progs = programs.filter((p) => !pf || p.portfolioId === pf)
  const projs = projects.filter((p) => (pg ? p.programId === pg : pf ? p.portfolioId === pf : true))
  return (
    <div className="rpx-bar" role="group" aria-label="محدودهٔ تحلیل">
      <select className="rpx-select" aria-label="پورتفولیو" value={pf} onChange={(e) => { setPf(e.target.value); setPg(''); onChange(e.target.value ? { level: 'portfolio', id: e.target.value } : { level: 'all', id: null }) }}>
        <option value="">{allowAll ? 'همهٔ پورتفولیوها' : 'پورتفولیو'}</option>
        {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <select className="rpx-select" aria-label="طرح" value={pg} onChange={(e) => { setPg(e.target.value); onChange(e.target.value ? { level: 'program', id: e.target.value } : pf ? { level: 'portfolio', id: pf } : { level: 'all', id: null }) }}>
        <option value="">همهٔ طرح‌ها</option>
        {progs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <select className="rpx-select" aria-label="پروژه" value={scope.level === 'project' ? scope.id ?? '' : ''} onChange={(e) => onChange(e.target.value ? { level: 'project', id: e.target.value } : pg ? { level: 'program', id: pg } : pf ? { level: 'portfolio', id: pf } : { level: 'all', id: null })} style={{ maxWidth: '18rem' }}>
        <option value="">همهٔ پروژه‌های این محدوده</option>
        {projs.map((p) => <option key={p.id} value={p.id}>{p.officialName}</option>)}
      </select>
    </div>
  )
}

export function KpiBand({ items }: { items: { label: string; value: string; tone: Tone; sub?: string }[] }) {
  return (
    <dl className="rpx-kpis">
      {items.map((k) => <div key={k.label} className={`rpx-kpi t-${k.tone}`}><dt>{k.label}</dt><dd>{k.value}</dd>{k.sub && <small>{k.sub}</small>}</div>)}
    </dl>
  )
}

/** one composer block: figures, a table or a list — shared by the composer, the home page and the print view */
export function BlockView({ b }: { b: Block }) {
  if (b.kind === 'kpis') return <KpiBand items={b.items} />
  if (b.kind === 'table') return (
    <div>
      <div className="rpx-table-wrap"><table className="rpx-table"><thead><tr>{b.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{b.rows.map((r, i) => <tr key={i} className={b.tones?.[i] ? `tone-${b.tones[i]}` : ''}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody></table></div>
      {b.note && <p className="rpx-note" style={{ marginTop: 6 }}>{b.note}</p>}
    </div>
  )
  return (
    <div className="rpx-items">
      {b.items.map((it, i) => (
        <div key={i} className={`rpx-item t-${it.tone ?? 'none'}`} style={{ borderInlineStartColor: `var(--c)` }}>
          <div className="rpx-item-head"><b>{it.text}</b>{it.tag && <Tag tone={it.tone ?? 'none'}>{it.tag}</Tag>}</div>
          {it.sub && <p>{it.sub}</p>}
        </div>
      ))}
      {b.note && <p className="rpx-note">{b.note}</p>}
    </div>
  )
}
