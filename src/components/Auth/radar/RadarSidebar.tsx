import { ArrowLeftRight, Home, PanelRightClose } from 'lucide-react'
import type { CSSProperties } from 'react'
import { PROJECT_STATUS_LABEL_FA, PROJECT_STATUS_TONE, type MasterProject } from '../../../modules/masterdata/types'
import type { ModuleKey } from '../../../store/useModuleStore'
import { PROJECT_NAV, type ProjectNavItem } from './projectNav'

const TONE: Record<'neutral' | 'green' | 'amber' | 'red', string> = { neutral: '#94a3b8', green: '#22c55e', amber: '#f59e0b', red: '#ef4444' }

/**
 * منوی کناری اتاق فرمان — docked on the right (RTL), grouped by how a project team works.
 * The project card on top is the one place the project is chosen; everything below opens for it.
 */
export function RadarSidebar({ project, active, canSee, badgeFor, open, overlay, onItem, onSwitch, onHome, onClose }: {
  project: MasterProject
  active: string
  canSee: (key: ModuleKey) => boolean
  badgeFor: (key: ModuleKey) => number
  open: boolean
  /** phone/tablet: floats over the page instead of pushing it */
  overlay: boolean
  onItem: (item: ProjectNavItem) => void
  onSwitch: () => void
  onHome: () => void
  onClose: () => void
}) {
  const tone = TONE[PROJECT_STATUS_TONE[project.status] ?? 'neutral']
  const code = project.projectIdCode || project.projectCode
  const groups = PROJECT_NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.module || canSee(i.module)) })).filter((g) => g.items.length)

  return (
    <>
      {overlay && open && <button type="button" className="rs-scrim" onClick={onClose} aria-label="بستن منو" />}
      <aside dir="rtl" className={`rs-side ${open ? 'is-open' : ''}`} aria-label="ماژول‌های پروژه" aria-hidden={!open}>
        <div className="rs-project" style={{ '--tone': tone } as CSSProperties}>
          <div className="rs-project-row">
            <span className="rs-status"><i aria-hidden />{PROJECT_STATUS_LABEL_FA[project.status] ?? project.status}</span>
            <button type="button" className="rs-icon" onClick={onClose} title="بستن منو" aria-label="بستن منو"><PanelRightClose size={15} /></button>
          </div>
          <p className="rs-project-name">{project.officialName}</p>
          {code && <p className="rs-project-code" dir="ltr">{code}</p>}
          <button type="button" className="rs-switch" onClick={onSwitch}><ArrowLeftRight size={13} aria-hidden /> تعویض پروژه</button>
        </div>

        <nav className="rs-nav">
          {groups.map((g) => (
            <div key={g.id} className="rs-group">
              <p className="rs-group-label">{g.label}</p>
              {g.items.map((item) => {
                const n = item.module ? badgeFor(item.module) : 0
                const on = active === item.id
                return (
                  <button
                    type="button" key={item.id} onClick={() => onItem(item)}
                    className={`rs-item ${on ? 'is-on' : ''}`} style={{ '--a': item.accent } as CSSProperties}
                    aria-current={on ? 'page' : undefined}
                  >
                    <span className="rs-item-ico"><item.icon size={15} aria-hidden /></span>
                    <span className="rs-item-label">{item.label}</span>
                    {n > 0 && <span className="rs-badge" aria-label={`${n.toLocaleString('fa-IR')} مورد نیازمند اقدام`}>{n.toLocaleString('fa-IR')}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        <button type="button" className="rs-home" onClick={onHome}><Home size={14} aria-hidden /> صفحهٔ اصلی و ابزارهای سازمانی</button>
      </aside>
    </>
  )
}
