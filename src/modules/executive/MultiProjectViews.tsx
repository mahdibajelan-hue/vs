import type { CSSProperties } from 'react'
import { ArrowLeft, BadgeDollarSign, ListTree, ClipboardList, GitBranch, GitPullRequestArrow, ShieldAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ModuleKey } from '../../store/useModuleStore'
import { hasModuleAccess, useModuleAccessStore } from '../../store/useModuleAccessStore'
import { openPortfolioView } from '../../components/common/PortfolioViewButton'

const VIEWS: { module: ModuleKey; tab?: string; title: string; text: string; icon: LucideIcon; color: string }[] = [
  { module: 'risk', tab: 'portfolio', title: 'ریسک در سطح سبد', text: 'ریسک‌های مشترک، علل تکرارشونده و پروژه‌های نیازمند مداخله', icon: ShieldAlert, color: '#f43f5e' },
  { module: 'issues', tab: 'portfolio', title: 'موانع و مسائل سه‌سطحی', text: 'پروژه ← طرح ← سبد: تجمیع موانع و تأخیرها', icon: ClipboardList, color: '#f97316' },
  { module: 'finance', tab: 'cash:portfolio', title: 'نقدینگی سبد پروژه‌ها', text: 'جریان نقدی پیش‌بینی‌شدهٔ همهٔ پروژه‌ها کنار هم', icon: BadgeDollarSign, color: '#10b981' },
  { module: 'change', tab: 'dashboard', title: 'تغییرات همهٔ پروژه‌ها', text: 'درخواست‌های تغییر، اثر هزینه و زمان در کل سبد', icon: GitPullRequestArrow, color: '#eab308' },
  { module: 'lifecycle', title: 'چرخهٔ عمر سبد', text: 'مرحله و گیت بعدی هر پروژه در یک نما', icon: GitBranch, color: '#22d3ee' },
]

/**
 * نماهای چندپروژه‌ای — the same project modules, opened for every project of the portfolio at once.
 * Inside a project (from the radar) these modules show one project only; here they show them all.
 */
export function MultiProjectViews({ onOpenPipeline }: { onOpenPipeline: () => void }) {
  const access = useModuleAccessStore((s) => s.accessibleModules)
  const list = VIEWS.filter((v) => hasModuleAccess(access, v.module))
  return (
    <section className="mpv" dir="rtl" aria-labelledby="mpv-title">
      <div className="mpv-head">
        <h2 id="mpv-title">نماهای چندپروژه‌ای</h2>
        <p>همان ماژول‌های پروژه، این‌بار برای همهٔ پروژه‌های سبد. برای کار روی یک پروژه از «رادار پروژه‌ها» وارد شوید.</p>
      </div>
      <div className="mpv-grid">
        <button type="button" className="mpv-card is-feature" style={{ '--c': '#6366f1' } as CSSProperties} onClick={onOpenPipeline}>
          <span className="mpv-ico"><ListTree size={17} aria-hidden /></span>
          <span className="mpv-title">پروژه‌ها در مراحل چرخهٔ عمر</span>
          <span className="mpv-text">چند پروژه در هر مرحلهٔ G1 تا G9، گام جاری و آخرین اقدام هر کدام</span>
          <ArrowLeft size={14} className="mpv-go" aria-hidden />
        </button>
        {list.map((v) => (
          <button key={v.module} type="button" className="mpv-card" style={{ '--c': v.color } as CSSProperties} onClick={() => openPortfolioView(v.module, v.tab)}>
            <span className="mpv-ico"><v.icon size={17} aria-hidden /></span>
            <span className="mpv-title">{v.title}</span>
            <span className="mpv-text">{v.text}</span>
            <ArrowLeft size={14} className="mpv-go" aria-hidden />
          </button>
        ))}
      </div>
    </section>
  )
}
