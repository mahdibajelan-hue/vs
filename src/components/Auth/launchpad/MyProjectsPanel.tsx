import { ArrowLeft, FolderKanban } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useMasterDataStore } from '../../../modules/masterdata/store/useMasterDataStore'
import { PROJECT_STATUS_LABEL_FA, PROJECT_STATUS_TONE } from '../../../modules/masterdata/types'
import { orderProjects, recentProjects, timeElapsed } from '../radar/projectNav'

const TONE: Record<'neutral' | 'green' | 'amber' | 'red', string> = { neutral: '#94a3b8', green: '#22c55e', amber: '#f59e0b', red: '#ef4444' }

/** «پروژه‌های من» — one tap straight into a project's command room (recently opened first). */
export function MyProjectsPanel({ onOpen }: { onOpen: (projectId: string | null) => void }) {
  const projects = useMasterDataStore((s) => s.projects)
  const loaded = useMasterDataStore((s) => s.loaded)
  const hasRecent = recentProjects().some((id) => projects.some((p) => p.id === id))
  const list = orderProjects(projects).slice(0, 4)

  return (
    <section className="lp-myp" aria-label="پروژه‌های من">
      <header className="lp-myp-head">
        <span className="lp-myp-title"><FolderKanban size={15} aria-hidden /> {hasRecent ? 'پروژه‌های اخیر من' : 'پروژه‌ها'}</span>
        {projects.length > 0 && (
          <button type="button" className="lp-myp-all" onClick={() => onOpen(null)}>
            همه ({projects.length.toLocaleString('fa-IR')}) <ArrowLeft size={13} aria-hidden />
          </button>
        )}
      </header>
      {!loaded && !projects.length ? (
        <div className="lp-myp-list">{[0, 1, 2].map((i) => <span key={i} className="lp-myp-row is-skel" />)}</div>
      ) : !projects.length ? (
        <p className="lp-myp-empty">هنوز پروژه‌ای تعریف نشده است. پروژه‌ها در «مدیریت کاربران ← اطلاعات پایه» ساخته می‌شوند.</p>
      ) : (
        <div className="lp-myp-list">
          {list.map((p) => {
            const used = timeElapsed(p)
            return (
              <button type="button" key={p.id} className="lp-myp-row" onClick={() => onOpen(p.id)} style={{ '--tone': TONE[PROJECT_STATUS_TONE[p.status] ?? 'neutral'] } as CSSProperties}>
                <span className="lp-myp-dot" title={PROJECT_STATUS_LABEL_FA[p.status]} aria-hidden />
                <span className="lp-myp-name">{p.officialName}</span>
                {used != null && (
                  <span className="lp-myp-time" title="زمان سپری‌شدهٔ قرارداد">
                    <span className="lp-myp-bar"><span style={{ width: `${used}%` }} /></span>
                    {used.toLocaleString('fa-IR')}٪
                  </span>
                )}
                <ArrowLeft size={14} className="lp-myp-go" aria-hidden />
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
