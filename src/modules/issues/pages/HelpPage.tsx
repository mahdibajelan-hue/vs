import { useMemo, useState } from 'react'
import { CircleHelp, Search } from 'lucide-react'
import { HELP, type HelpKey } from '../lib/help'
import { normalizeFa } from '../lib/imText'

const ORDER: HelpKey[] = ['hub', 'issues', 'newIssue', 'drawer', 'closing', 'tasks', 'extensions', 'tracking', 'calendar', 'mywork', 'decisions', 'knowledge', 'kpi', 'insights', 'tower', 'notifications', 'projects', 'settings', 'lateReport', 'rollup', 'field', 'assistant']

/** Full guide: every section's help in one searchable page. */
export function HelpPage() {
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const n = normalizeFa(q)
    return ORDER.filter((k) => !n || n.split(' ').every((w) => normalizeFa([HELP[k].title, HELP[k].purpose, ...(HELP[k].steps ?? []), ...(HELP[k].how ?? []), ...(HELP[k].tips ?? [])].join(' ')).includes(w)))
  }, [q])
  return (
    <div className="im-page">
      <div className="im-topbar">
        <div><div className="im-page-title"><CircleHelp size={22} style={{ color: 'var(--im-muted-2)' }} />راهنمای کامل</div><div className="im-page-sub">آموزش هر بخش؛ در هر صفحه هم دکمهٔ «راهنما» همین متن را باز می‌کند</div></div>
        <div style={{ position: 'relative', width: 'min(340px, 100%)' }}><Search size={14} style={{ position: 'absolute', insetInlineStart: 11, top: 12, color: 'var(--im-muted)' }} /><input style={{ paddingInlineStart: 32 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در راهنما…" aria-label="جستجو" /></div>
      </div>
      <div className="im-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
        {list.map((k, i) => {
          const t = HELP[k]
          return (
            <article key={k} className="im-card" style={{ animation: 'im-rise 300ms var(--im-ease) both', animationDelay: `${i * 30}ms` }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 900 }}>{t.title}</h2>
              <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.9, fontWeight: 600 }}>{t.purpose}</p>
              {t.steps && <><h4 style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--im-muted-2)' }}>روش کار</h4><ol style={{ margin: '4px 0 0', paddingInlineStart: 20, fontSize: 12.5, lineHeight: 1.9, color: 'var(--im-muted-2)', listStyle: 'decimal' }}>{t.steps.map((s) => <li key={s}>{s}</li>)}</ol></>}
              {t.how && <><h4 style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--im-muted-2)' }}>چطور حساب می‌شود</h4><ul style={{ margin: '4px 0 0', paddingInlineStart: 20, fontSize: 12.5, lineHeight: 1.9, color: 'var(--im-muted-2)', listStyle: 'disc' }}>{t.how.map((s) => <li key={s}>{s}</li>)}</ul></>}
              {t.tips && <div className="im-notice info" style={{ marginTop: 10, fontSize: 12 }}>{t.tips.join(' ')}</div>}
            </article>
          )
        })}
        {list.length === 0 && <div className="im-empty">موردی یافت نشد</div>}
      </div>
    </div>
  )
}
