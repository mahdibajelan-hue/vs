import { HEALTH_VERDICT_FA, HealthGuideButton, healthColor as healthColorOf } from '../../../modules/projectMetrics/HealthGuide'
import { HEALTH_COLOR, statusFromScore } from '../../../modules/lifecycle/lib/health'
import { useEffect, type CSSProperties } from 'react'
import { Activity, ArrowLeftRight, ArrowRight, ChevronLeft, Clock3, RefreshCw, ShieldAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { MasterProject } from '../../../modules/masterdata/types'
import { PROJECT_STATUS_LABEL_FA } from '../../../modules/masterdata/types'
import type { ModuleKey } from '../../../store/useModuleStore'
import { PROJECT_NAV, type ProjectNavItem } from './projectNav'
import { STATUS_COLOR, STATUS_LABEL_FA, type RadarData } from './radarTypes'

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
  // Until the live read lands the numbers are placeholders: show dashes and a reading state, never «عادی ۰ از ۱۰۰».
  const loading = !data.live
  // coming back from a module the window may still be scrolled down
  useEffect(() => { window.scrollTo(0, 0) }, [])
  // colour = the health verdict (worst dimension) when known, so the ring and the status always agree
  // The ring is always coloured by health severity: a blocked gate (black verdict) shows its
  // score's severity colour, never grey — the gate-blocked state is conveyed by the label, not by
  // draining the colour out of the gauge.
  const hd0 = data.healthDetail
  const statusColor = hd0 ? (hd0.status === 'black' ? HEALTH_COLOR[statusFromScore(hd0.score)] : healthColorOf(hd0)) : STATUS_COLOR[data.status]
  const code = project.projectIdCode || project.projectCode
  const items = PROJECT_NAV.flatMap((g) => g.items)
  const open = (module: ModuleKey) => { const it = items.find((i) => i.module === module); if (it && canSee(module)) onItem(it) }
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

      <section className="mr-hero" style={{ '--st': loading ? 'var(--text-muted, #94a3b8)' : statusColor } as CSSProperties} aria-busy={loading || undefined}>
        <Ring value={k.health} color={statusColor} loading={loading} />
        <div className="mr-hero-body">
          <p className="mr-hero-label">سلامت پروژه <HealthGuideButton health={data.healthDetail} /></p>
          <p className="mr-hero-status">{!loading && <span className="mr-pulse" aria-hidden />}{loading ? 'در حال خواندن…' : data.healthDetail ? HEALTH_VERDICT_FA[data.healthDetail.status] : STATUS_LABEL_FA[data.status]}</p>
          <Bar loading={loading} label="پیشرفت واقعی" value={k.progressActual} ref2={k.progressPlanned} ref2Label="برنامه" color={k.progressActual >= k.progressPlanned ? '#22c55e' : '#f59e0b'} />
          <Bar loading={loading} label="عملکرد هزینه" value={k.costPerformancePct} color={k.costVariancePct >= 0 ? '#22c55e' : '#f59e0b'} />
        </div>
      </section>

      <section className="mr-kpis" aria-label="شاخص‌های پایش">
        <Kpi loading={loading} icon={ShieldAlert} label="ریسک فعال" value={k.activeRisks} sub={k.activeRisksHigh ? `${fa(k.activeRisksHigh)} بالا` : undefined} color="#f43f5e" onClick={() => open('risk')} />
        <Kpi loading={loading} icon={Activity} label="مسئلهٔ باز" value={k.openIssues} sub={k.openIssuesHigh ? `${fa(k.openIssuesHigh)} بالا` : undefined} color="#a78bfa" onClick={() => open('taskissue')} />
        <Kpi loading={loading} icon={Clock3} label="فعالیت معوق" value={k.delayedActivities} color="#f59e0b" onClick={() => open('scheduling')} />
        <Kpi loading={loading} icon={RefreshCw} label="تغییر در انتظار" value={k.pendingChanges} color="#38bdf8" onClick={() => open('change')} />
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


// A compact holographic gauge: a tick ring that lights up to the score, a glowing arc, a dashed
// pulsing halo and a pedestal "floor" so the index reads as a small 3-D instrument floating above the
// card — the same visual language as the Health Centre's HoloRing, sized to fit the radar hero.
// Colour comes from --st on the hero (the health verdict), so the ring and the status always agree.
function Ring({ value, loading }: { value: number; color?: string; loading?: boolean }) {
  const R = 38, C = 2 * Math.PI * R, N = 48
  const v = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className="mr-holo" role="img" aria-label={loading ? 'سلامت پروژه در حال خواندن' : `سلامت ${fa(v)} از ۱۰۰`}>
      <svg viewBox="0 0 100 118" aria-hidden>
        {/* pedestal — the hologram floor the index floats on */}
        <ellipse cx="50" cy="106" rx="45" ry="11" className="mr-holo-ped-glow" />
        <ellipse cx="50" cy="106" rx="40" ry="8" className="mr-holo-ped-ring" />
        <ellipse cx="50" cy="106" rx="29" ry="5.4" className="mr-holo-ped-ring is-dash" />
        <ellipse cx="50" cy="106" rx="17" ry="3.1" className="mr-holo-ped-ring is-bright" />
        {/* ring stack */}
        <circle cx="50" cy="50" r="46" className="mr-holo-halo" />
        {Array.from({ length: N }, (_, i) => {
          const a = (i / N) * Math.PI * 2 - Math.PI / 2, r1 = 46, r2 = i % 4 ? 43.5 : 41
          const lit = !loading && v > 0 && i / N <= v / 100
          return <line key={i} x1={50 + r1 * Math.cos(a)} y1={50 + r1 * Math.sin(a)} x2={50 + r2 * Math.cos(a)} y2={50 + r2 * Math.sin(a)} className={lit ? 'mr-holo-tick on' : 'mr-holo-tick'} />
        })}
        <circle cx="50" cy="50" r={R} className="mr-holo-track" />
        {!loading && v > 0 && <circle cx="50" cy="50" r={R} className="mr-holo-val" strokeDasharray={`${(v / 100) * C} ${C}`} transform="rotate(-90 50 50)" />}
        <circle cx="50" cy="50" r="28" className="mr-holo-inner" />
      </svg>
      <span className="mr-holo-num">{loading ? '—' : fa(v)}<small>از ۱۰۰</small></span>
    </div>
  )
}

function Bar({ label, value, color, ref2, ref2Label, loading }: { label: string; value: number; color: string; ref2?: number; ref2Label?: string; loading?: boolean }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className="mr-bar">
      <span className="mr-bar-row"><span>{label}</span><b>{loading ? '—' : <>{fa(v)}٪{ref2 != null && <small> / {ref2Label} {fa(ref2)}٪</small>}</>}</b></span>
      <span className="mr-track">
        <span style={{ width: loading ? 0 : `${v}%`, background: color }} />
        {!loading && ref2 != null && <i style={{ right: `${Math.max(0, Math.min(100, ref2))}%` }} aria-hidden />}
      </span>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, sub, color, onClick, loading }: { icon: LucideIcon; label: string; value: number; sub?: string; color: string; onClick: () => void; loading?: boolean }) {
  return (
    <button type="button" className="mr-kpi" style={{ '--c': color } as CSSProperties} onClick={onClick}>
      <span className="mr-kpi-ico"><Icon size={15} aria-hidden /></span>
      <span className="mr-kpi-val">{loading ? '—' : fa(value)}</span>
      <span className="mr-kpi-label">{label}</span>
      {!loading && sub && <span className="mr-kpi-sub">{sub}</span>}
    </button>
  )
}
