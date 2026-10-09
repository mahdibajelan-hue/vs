import { useMemo } from 'react'
import { useIssuesStore } from '../store/useIssuesStore'
import { IM_CATEGORY_FA } from '../lib/imModel'
import { corporateRollup, heatmap, sharedCauses } from '../lib/imPortfolio'
import { todayIso } from '../lib/issueRing'
import { IssueCode, SeverityChip } from '../components/ui'

/** Cross-project view: where issues concentrate (heatmap), causes that recur in several projects, and corporate/parent issues with their children. */
export function PortfolioInsightsPage({ onSelectIssue }: { onSelectIssue: (id: string) => void }) {
  const issues = useIssuesStore((s) => s.issues)
  const projects = useIssuesStore((s) => s.projects)
  const today = todayIso()
  const hm = useMemo(() => heatmap(issues, today), [issues, today])
  const causes = useMemo(() => sharedCauses(issues), [issues])
  const corp = useMemo(() => corporateRollup(issues, today), [issues, today])
  const cats = useMemo(() => [...new Set(hm.cells.map((c) => c.category))], [hm])
  const projs = projects.filter((p) => hm.cells.some((c) => c.projectId === p.id))
  const name = (id: string) => projects.find((p) => p.id === id)?.name ?? '—'

  return (
    <div>
      <div className="im-topbar"><div><div className="im-page-title">هم‌افزایی پورتفولیو</div><div className="im-page-sub">تمرکز مسائل، علل مشترک و مسائل مادر در سطح شرکت</div></div></div>

      <div className="im-card" style={{ marginBottom: 14 }}>
        <div className="im-section-title">نقشهٔ حرارتی: پروژه × دسته <span className="im-helper">عدد = مسائل فعال؛ حاشیهٔ قرمز = دارای تأخیر</span></div>
        {projs.length === 0 ? <div className="im-helper">مسئلهٔ فعالی وجود ندارد.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <div className="im-heat" style={{ gridTemplateColumns: `180px repeat(${cats.length}, minmax(86px, 1fr))`, display: 'grid', minWidth: 180 + cats.length * 90 }}>
              <div />
              {cats.map((c) => <div key={c} className="im-helper" style={{ textAlign: 'center', fontSize: 11 }}>{c === 'none' ? 'بدون دسته' : IM_CATEGORY_FA[c] ?? c}</div>)}
              {projs.map((p) => (
                <div key={p.id} style={{ display: 'contents' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, alignSelf: 'center' }}>{p.name}</div>
                  {cats.map((c) => {
                    const cell = hm.cells.find((x) => x.projectId === p.id && x.category === c)
                    const a = cell ? 0.12 + 0.6 * (cell.active / hm.max) : 0
                    return (
                      <div key={c} className="im-heat-cell" title={cell ? `${cell.active} فعال · ${cell.overdue} تأخیردار · ${cell.critical} بحرانی` : ''}
                        style={{ background: cell ? `rgba(245,178,72,${a})` : undefined, boxShadow: cell?.overdue ? 'inset 0 0 0 2px rgba(232,93,78,.75)' : undefined, color: cell ? 'var(--im-text)' : 'var(--im-muted)' }}>
                        {cell ? cell.active : '·'}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="im-card" style={{ marginBottom: 14 }}>
        <div className="im-section-title">علل مشترک بین پروژه‌ها <span className="im-helper">گروه‌بندی بر اساس شباهت متن علت ریشه‌ای؛ نامزد «درس‌آموخته»</span></div>
        {causes.length === 0 ? <div className="im-helper">علت ریشه‌ای مشترکی بین حداقل دو پروژه یافت نشد (علت ریشه‌ای باید در تب «تحلیل علت» ثبت شده باشد).</div> : causes.map((c) => (
          <div key={c.label} className="im-task" style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{c.label}</div>
            <div className="im-helper">{c.projectIds.length} پروژه ({c.projectIds.map(name).join('، ')}) · {c.issueIds.length} مسئله · {c.closedCount} بسته‌شده</div>
            <div className="im-actions">{c.issueIds.slice(0, 6).map((id) => { const i = issues.find((x) => x.id === id); return i ? <button key={id} className="im-chip" onClick={() => onSelectIssue(id)}>{i.code}</button> : null })}</div>
          </div>
        ))}
      </div>

      <div className="im-card">
        <div className="im-section-title">مسائل مادر (سطح شرکت)</div>
        {corp.length === 0 ? <div className="im-helper">هنوز مسئلهٔ مادری تعریف نشده. در «نمای کلی» هر مسئله می‌توانید آن را به یک مسئلهٔ مادر پیوند دهید.</div> : corp.map((c) => (
          <div key={c.parent.id} className="im-task" style={{ marginBottom: 8 }}>
            <button style={{ textAlign: 'right' }} onClick={() => onSelectIssue(c.parent.id)}><IssueCode issue={c.parent} /> <b>{c.parent.title}</b></button>
            <div className="im-issue-meta"><span className="im-chip">{c.children.length} مسئلهٔ فرزند در {c.projects} پروژه</span><span className="im-chip">{c.active} فعال</span><span className="im-chip" style={{ color: c.overdue ? 'var(--im-coral)' : undefined }}>{c.overdue} تأخیردار</span>{c.worstSeverity > 0 && <SeverityChip level={(['low', 'low', 'medium', 'high', 'critical'] as const)[c.worstSeverity]} />}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
