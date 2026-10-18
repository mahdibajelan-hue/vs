import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { GUIDE, HELP } from '../lib/help'

/** The general guide: purpose, working flow, baseline / current / forecast, progress, critical path, limits and access — searchable, plus the glossary of every «؟» term. */
export function SchHelp() {
  const [q, setQ] = useState('')
  const n = q.trim().toLowerCase()
  const guide = useMemo(() => GUIDE.filter((g) => !n || `${g.title} ${g.body.join(' ')}`.toLowerCase().includes(n)), [n])
  const terms = useMemo(() => Object.entries(HELP).filter(([, e]) => !n || `${e.title} ${e.what} ${e.result ?? ''} ${e.warn ?? ''}`.toLowerCase().includes(n)), [n])
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 900 }}>
      <label className="im-card" style={{ padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center' }}><Search size={15} aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو در راهنما…" aria-label="جست‌وجو در راهنما" style={{ flex: 1, border: 0, background: 'transparent', outline: 'none' }} /></label>
      {guide.map((g) => (
        <section key={g.id} className="im-card" style={{ padding: '12px 16px' }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 14 }}>{g.title}</h3>
          <ul style={{ margin: 0, paddingInlineStart: 18, display: 'grid', gap: 4, listStyle: 'disc', fontSize: 13, lineHeight: 1.9 }}>{g.body.map((b) => <li key={b}>{b}</li>)}</ul>
        </section>
      ))}
      <section className="im-card" style={{ padding: '12px 16px' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 14 }}>واژه‌نامه و توضیح گزینه‌ها</h3>
        {terms.length === 0 ? <p className="im-helper">موردی پیدا نشد.</p> : (
          <dl style={{ margin: 0, display: 'grid', gap: 8, fontSize: 13, lineHeight: 1.9 }}>
            {terms.map(([k, e]) => <div key={k}><dt style={{ fontWeight: 700 }}>{e.title}</dt><dd style={{ margin: 0, opacity: 0.9 }}>{e.what}{e.result ? ` ${e.result}` : ''}{e.warn ? ` ⚠ ${e.warn}` : ''}</dd></div>)}
          </dl>
        )}
      </section>
    </div>
  )
}
