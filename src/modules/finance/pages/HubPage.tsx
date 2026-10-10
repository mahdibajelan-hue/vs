import { useMemo } from 'react'
import { AlertOctagon, ArrowUpLeft, Banknote, CalendarClock, FileText, Gauge, LineChart, Receipt, Settings2, ShieldAlert, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useCountUp } from '../../issues/lib/useCountUp'
import { usePortfolioModel } from '../lib/usePortfolioModel'
import { useFinanceStore } from '../store/useFinanceStore'
import { useFinanceControlStore } from '../store/useFinanceControlStore'
import { fmtCurrency } from '../components/FinanceKpiTile'
import type { FinTab } from '../FinanceApp'

interface TileDef { tab: FinTab; en: string; fa: string; desc: string; icon: LucideIcon; color: string; stat?: { n: number; label: string } }

function Tile({ t, i, onGo }: { t: TileDef; i: number; onGo: (tab: FinTab) => void }) {
  const n = useCountUp(t.stat?.n ?? 0)
  return (
    <button className="im-tile" style={{ ['--c' as string]: t.color, ['--i' as string]: i }} onClick={() => onGo(t.tab)}>
      <span className="im-tile-ico"><t.icon size={24} aria-hidden /></span>
      <span className="im-tile-body">
        <h2 className="im-tile-title">{t.en}</h2>
        <p className="im-tile-fa">{t.fa}</p>
        <p className="im-tile-desc">{t.desc}</p>
      </span>
      {t.stat && <span className="im-tile-stat"><b>{Math.round(n).toLocaleString('fa-IR')}</b><span>{t.stat.label}</span></span>}
    </button>
  )
}

/** Landing page: the areas of the module with one live number each, and the handful of things that need a decision first. */
export function HubPage({ onGo }: { onGo: (tab: FinTab, sub?: string) => void }) {
  const { model } = usePortfolioModel()
  const contracts = useFinanceStore((s) => s.contracts)
  const certificates = useFinanceStore((s) => s.certificates)
  const changes = useFinanceControlStore((s) => s.changes)
  const s = useMemo(() => {
    const crit = model.exceptions.filter((e) => e.severity === 'critical').length
    return {
      projects: model.rows.length,
      active: contracts.filter((c) => c.status === 'active').length,
      waiting: certificates.filter((c) => c.status === 'submitted' || c.status === 'under_review').length,
      overBudget: model.rows.filter((r) => r.fc.overrun === 'likely' || r.fc.overrun === 'possible').length,
      attention: model.exceptions.length,
      crit,
      expiring: model.exceptions.filter((e) => e.kind.startsWith('guarantee')).length,
      overdue: model.exceptions.filter((e) => e.kind === 'payment_overdue').length,
      pendingChanges: changes.filter((c) => ['submitted', 'evaluating', 'awaiting_approval'].includes(c.status)).length,
      paid: model.rows.reduce((n, r) => n + r.fc.paid, 0),
    }
  }, [model, contracts, certificates, changes])

  const tiles: TileDef[] = [
    { tab: 'contracts', en: 'Contracts', fa: 'قراردادها', desc: 'شناسنامه، الحاقیه و تغییرات، ضمانت‌نامه، ادعا، مفاصاحساب', icon: FileText, color: '#10b981', stat: { n: s.active, label: 'قرارداد فعال' } },
    { tab: 'billing', en: 'Payment Certificates', fa: 'صورت‌وضعیت و پرداخت', desc: 'گردش مرحله‌ای، کسورات و پرداخت‌های جزئی', icon: Receipt, color: '#0ea5e9', stat: { n: s.waiting, label: 'در انتظار' } },
    { tab: 'budget', en: 'Budget & Cost', fa: 'بودجه و هزینه', desc: 'ردیف‌های بودجه، هزینهٔ نهایی پیش‌بینی‌شده و تملک اراضی', icon: Wallet, color: '#f59e0b', stat: { n: s.overBudget, label: 'خطر تجاوز' } },
    { tab: 'cash', en: 'Cash Flow', fa: 'جریان نقدی', desc: 'منحنی‌های پایه، واقعی و پیش‌بینی؛ ریالی و ارزی جدا', icon: LineChart, color: '#14b8a6' },
    { tab: 'dashboard', en: 'Management Views', fa: 'داشبوردهای مدیریتی', desc: 'نمای مدیرعامل، مجری، مدیر پروژه و مالی؛ مقایسه و خروجی', icon: Gauge, color: '#6366f1', stat: { n: s.projects, label: 'پروژه' } },
    { tab: 'attention', en: 'Decisions & Follow-up', fa: 'موارد نیازمند تصمیم', desc: 'استثناها، یافته‌های تحلیلی و ثبت مسئله یا ریسک', icon: ShieldAlert, color: '#ef4444', stat: { n: s.attention, label: 'مورد باز' } },
  ]
  const top = model.exceptions.slice(0, 5)
  const nameOf = (id: string) => model.rows.find((r) => r.p.id === id)?.p.officialName ?? ''

  return (
    <div>
      <section className="im-banner" aria-label="معرفی">
        <div className="im-banner-art" aria-hidden>
          <span className="blob b1" /><span className="blob b2" /><span className="blob b3" />
          <svg viewBox="0 0 800 200" preserveAspectRatio="none">
            <g fill="none" stroke="#fff" strokeWidth="1.2">
              <path d="M0 160 C 100 150, 180 120, 280 124 S 460 70, 560 80 S 700 40, 800 34" />
              <path d="M0 170 C 120 168, 220 150, 320 140 S 500 116, 620 96 S 740 80, 800 70" opacity=".55" strokeDasharray="5 6" />
              {[0, 160, 320, 480, 640, 800].map((x, k) => <circle key={x} cx={x} cy={[160, 130, 130, 84, 78, 34][k]} r="4" fill="#fff" />)}
            </g>
          </svg>
        </div>
        <h1>Contract &amp; Portfolio Finance Control</h1>
        <p>کنترل قراردادها، بودجه، پرداخت و نقدینگی سبد پروژه‌ها</p>
        <div className="im-banner-pills">
          <button className="im-banner-pill" onClick={() => onGo('attention')}><AlertOctagon size={13} aria-hidden />بحرانی <b>{s.crit.toLocaleString('fa-IR')}</b></button>
          <button className="im-banner-pill" onClick={() => onGo('billing', 'pipeline')}><CalendarClock size={13} aria-hidden />پرداخت معوق <b>{s.overdue.toLocaleString('fa-IR')}</b></button>
          <button className="im-banner-pill" onClick={() => onGo('contracts', 'guarantees')}><ShieldAlert size={13} aria-hidden />ضمانت‌نامه در خطر <b>{s.expiring.toLocaleString('fa-IR')}</b></button>
          <button className="im-banner-pill" onClick={() => onGo('contracts', 'changes')}><Banknote size={13} aria-hidden />تغییر در جریان <b>{s.pendingChanges.toLocaleString('fa-IR')}</b></button>
        </div>
      </section>

      <div className="im-tiles">{tiles.map((t, i) => <Tile key={t.tab} t={t} i={i} onGo={(tab) => onGo(tab)} />)}</div>

      <p className="im-section-label"><span>اول این‌ها را ببینید</span></p>
      <div className="im-card" style={{ padding: 0, overflow: 'hidden' }}>
        {top.length === 0 ? <div className="im-empty">مورد استثنایی نیست؛ همه‌چیز در محدودهٔ آستانه‌هاست.</div> : top.map((e, i) => (
          <button key={e.key} className="im-issue-card" style={{ borderRadius: 0, border: 0, borderTop: i ? '1px solid var(--im-line)' : 0 }} onClick={() => onGo('attention')}>
            <span className="im-chip-dot" style={{ width: 9, height: 9, background: e.severity === 'critical' ? 'var(--im-coral)' : e.severity === 'high' ? '#f97316' : 'var(--im-amber)' }} />
            <span className="im-issue-main"><span className="im-issue-title" style={{ display: 'block' }}>{e.title}</span><span className="im-issue-meta"><span>{nameOf(e.masterProjectId)}</span><span>{e.detail}</span></span></span>
            <ArrowUpLeft size={15} style={{ color: 'var(--im-muted)' }} aria-hidden />
          </button>
        ))}
      </div>
      <p className="im-helper" style={{ textAlign: 'center', marginTop: 14 }}>مجموع پرداخت‌های واقعی ثبت‌شده در سبد: {fmtCurrency(s.paid)} ریال · {s.projects.toLocaleString('fa-IR')} پروژه</p>
      <button className="im-ghostlink" style={{ display: 'block', margin: '6px auto 0' }} onClick={() => onGo('admin')}><Settings2 size={12} style={{ display: 'inline', marginInlineEnd: 4 }} />تنظیمات، آستانه‌ها و گزارش‌ها</button>
    </div>
  )
}
