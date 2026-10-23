import { useEffect, type CSSProperties } from 'react'
import { Activity, ArrowLeftRight, ArrowRight, ChevronLeft, Clock3, Flag, RefreshCw, ShieldAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { MasterProject } from '../../../modules/masterdata/types'
import { PROJECT_STATUS_LABEL_FA } from '../../../modules/masterdata/types'
import type { ModuleKey } from '../../../store/useModuleStore'
import { PROJECT_NAV, type ProjectNavItem } from './projectNav'
import { SEVERITY_COLOR, SEVERITY_LABEL_FA, SIGNAL_CATEGORY_LABEL_FA, STATUS_COLOR, STATUS_LABEL_FA, type RadarData } from './radarTypes'

const fa = (n: number) => Math.round(n).toLocaleString('fa-IR')

/**
 * رادار روی گوشی — one column, read top to bottom in a few seconds: how the project is, what needs attention,
 * what comes next, then every module of the project as a tap target. The desktop radar stays as it is.
 */
export function MobileRadar({ project, data, canSee, badgeFor, onItem, onSwitch, onHome }: {
  project: MasterProject
  data: RadarData
  canSee: (key: ModuleKey) => boolean
  badgeFor: (key: ModuleKey) => number
  onItem: (item: ProjectNavItem) => void
  onSwitch: () => void
  onHome: () => void
}) {
  const k = data.kpi
  // coming back from a module the window may still be scrolled down
  useEffect(() => { window.scrollTo(0, 0) }, [])
  const statusColor = STATUS_COLOR[data.status]
  const code = project.projectIdCode || project.projectCode
  const critical = [...data.signals].sort((a, b) => sevRank(a.severity) - sevRank(b.severity)).slice(0, 3)
  const items = PROJECT_NAV.flatMap((g) => g.items)
  const open = (module: ModuleKey) => { const it = items.find((i) => i.module === module); if (it && canSee(module)) onItem(it) }
  const gate = data.nextGate
  const groups = PROJECT_NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.id !== 'overview' && (!i.module || canSee(i.module))) })).filter((g) => g.items.length)

  return (
    <div dir="rtl" className="mr-shell">
      <header className="mr-top">
        <button type="button" className="mr-icon-btn" onClick={onHome} aria-label="صفحهٔ اصلی"><ArrowRight size={18} /></button>
        <span className="mr-top-title">رادار پروژه</span>
        <button type="button" className="mr-switch" onClick={onSwitch}><ArrowLeftRight size={14} aria-hidden /> تعویض</button>
      </header>

      <section className="mr-id">
        <p className="mr-meta">
          <span>{PROJECT_STATUS_LABEL_FA[project.status] ?? project.status}</span>
          {code && <><i aria-hidden>·</i><span dir="ltr">{code}</span></>}
        </p>
        <h1 className="mr-name">{project.officialName}</h1>
        <p className="mr-sub">گزارش {data.reportDateFa} · مرحلهٔ جاری: {data.currentStageLabel}</p>
      </section>

      <section className="mr-hero" style={{ '--st': statusColor } as CSSProperties}>
        <Ring value={k.health} color={statusColor} />
        <div className="mr-hero-body">
          <p className="mr-hero-label">سلامت پروژه</p>
          <p className="mr-hero-status"><span className="mr-pulse" aria-hidden />{STATUS_LABEL_FA[data.status]}</p>
          <Bar label="پیشرفت واقعی" value={k.progressActual} ref2={k.progressPlanned} ref2Label="برنامه" color={k.progressActual >= k.progressPlanned ? '#22c55e' : '#f59e0b'} />
          <Bar label="عملکرد هزینه" value={k.costPerformancePct} color={k.costVariancePct >= 0 ? '#22c55e' : '#f59e0b'} />
        </div>
      </section>

      <section className="mr-kpis" aria-label="شاخص‌های پایش">
        <Kpi icon={ShieldAlert} label="ریسک فعال" value={k.activeRisks} sub={k.activeRisksHigh ? `${fa(k.activeRisksHigh)} بالا` : undefined} color="#f43f5e" onClick={() => open('risk')} />
        <Kpi icon={Activity} label="مسئلهٔ باز" value={k.openIssues} sub={k.openIssuesHigh ? `${fa(k.openIssuesHigh)} بالا` : undefined} color="#a78bfa" onClick={() => open('taskissue')} />
        <Kpi icon={Clock3} label="فعالیت معوق" value={k.delayedActivities} color="#f59e0b" onClick={() => open('scheduling')} />
        <Kpi icon={RefreshCw} label="تغییر در انتظار" value={k.pendingChanges} color="#38bdf8" onClick={() => open('change')} />
      </section>

      {critical.length > 0 && (
        <section className="mr-card">
          <h2 className="mr-h">نیازمند توجه</h2>
          <ul className="mr-signals">
            {critical.map((s) => (
              <li key={s.id} style={{ '--sev': SEVERITY_COLOR[s.severity] } as CSSProperties}>
                <span className="mr-sev">{SEVERITY_LABEL_FA[s.severity]}</span>
                <span className="mr-sig-body">
                  <b>{s.title}</b>
                  <small>{SIGNAL_CATEGORY_LABEL_FA[s.category]}{s.subject ? ` · ${s.subject}` : ''}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mr-card mr-gate">
        <div className="mr-gate-row">
          <span className="mr-gate-ico"><Flag size={16} aria-hidden /></span>
          <span className="mr-gate-text">
            <small>گیت بعدی</small>
            <b>{gate.name}</b>
          </span>
          <span className="mr-gate-pct">{fa(gate.readinessPct)}٪<small>آمادگی</small></span>
        </div>
        <span className="mr-track"><span style={{ width: `${Math.max(0, Math.min(100, gate.readinessPct))}%`, background: '#22c55e' }} /></span>
        <p className="mr-gate-foot">{gate.prerequisites ? `${fa(gate.passed)} از ${fa(gate.prerequisites)} پیش‌نیاز تأیید شده${gate.failed ? ` · ${fa(gate.failed)} رد شده` : ''}` : 'هنوز پیش‌نیازی برای این گیت ثبت نشده است.'}</p>
      </section>

      <section className="mr-mods" aria-label="ماژول‌های پروژه">
        {groups.map((g) => (
          <div key={g.id} className="mr-group">
            <h2 className="mr-h">{g.label}</h2>
            <div className="mr-tiles">
              {g.items.map((it) => {
                const n = it.module ? badgeFor(it.module) : 0
                return (
                  <button key={it.id} type="button" className="mr-tile" style={{ '--a': it.accent } as CSSProperties} onClick={() => onItem(it)}>
                    <span className="mr-tile-ico"><it.icon size={18} aria-hidden /></span>
                    <span className="mr-tile-label">{it.label}</span>
                    {n > 0 && <span className="mr-badge">{fa(n)}</span>}
                    <ChevronLeft size={14} className="mr-tile-go" aria-hidden />
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </section>

      <p className="mr-foot">ریسک، مسائل، چرخهٔ عمر و قرارداد از ماژول‌ها خوانده می‌شوند؛ بخشی که هنوز دادهٔ این پروژه را ندارد، تصویر نمونه نشان می‌دهد.</p>
    </div>
  )
}

const sevRank = (s: string) => ({ critical: 0, high: 1, medium: 2, low: 3 } as Record<string, number>)[s] ?? 4

function Ring({ value, color }: { value: number; color: string }) {
  const r = 40, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, value))
  return (
    <div className="mr-ring" role="img" aria-label={`سلامت ${fa(v)} از ۱۰۰`}>
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} className="mr-ring-bg" />
        {v > 0 && <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 50 50)" className="mr-ring-fg" />}
      </svg>
      <span className="mr-ring-num">{fa(v)}<small>از ۱۰۰</small></span>
    </div>
  )
}

function Bar({ label, value, color, ref2, ref2Label }: { label: string; value: number; color: string; ref2?: number; ref2Label?: string }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className="mr-bar">
      <span className="mr-bar-row"><span>{label}</span><b>{fa(v)}٪{ref2 != null && <small> / {ref2Label} {fa(ref2)}٪</small>}</b></span>
      <span className="mr-track">
        <span style={{ width: `${v}%`, background: color }} />
        {ref2 != null && <i style={{ right: `${Math.max(0, Math.min(100, ref2))}%` }} aria-hidden />}
      </span>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, sub, color, onClick }: { icon: LucideIcon; label: string; value: number; sub?: string; color: string; onClick: () => void }) {
  return (
    <button type="button" className="mr-kpi" style={{ '--c': color } as CSSProperties} onClick={onClick}>
      <span className="mr-kpi-ico"><Icon size={15} aria-hidden /></span>
      <span className="mr-kpi-val">{fa(value)}</span>
      <span className="mr-kpi-label">{label}</span>
      {sub && <span className="mr-kpi-sub">{sub}</span>}
    </button>
  )
}
