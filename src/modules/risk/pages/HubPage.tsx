import { useMemo } from 'react'
import { Activity, ArrowLeftRight, Bell, Bot, BookOpen, CircleHelp, FileBarChart, Gauge, Layers, Network, ScanSearch, Settings2, ShieldCheck, ShieldHalf, Siren, TrendingUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useRiskData } from '../lib/useRiskData'
import { useCountUp } from '../../issues/lib/useCountUp'
import type { RiskTab } from '../RiskApp'

interface TileDef { tab: RiskTab; en: string; fa: string; desc: string; icon: LucideIcon; color: string; stat?: { n: number; label: string } }

function Tile({ t, i, onGo }: { t: TileDef; i: number; onGo: (tab: RiskTab) => void }) {
  const n = useCountUp(t.stat?.n ?? 0)
  return (
    <button className="im-tile" style={{ ['--c' as string]: t.color, ['--i' as string]: i }} onClick={() => onGo(t.tab)}>
      <span className="im-tile-ico"><t.icon size={24} aria-hidden /></span>
      <span className="im-tile-body">
        <h2 className="im-tile-title">{t.en}</h2>
        <p className="im-tile-fa">{t.fa}</p>
        <p className="im-tile-desc">{t.desc}</p>
      </span>
      {t.stat && <span className="im-tile-stat"><b>{n}</b><span>{t.stat.label}</span></span>}
    </button>
  )
}

/** Landing page: the six areas of the risk process, in the order work flows. */
export function HubPage({ onGo }: { onGo: (tab: RiskTab) => void }) {
  const d = useRiskData()
  const s = useMemo(() => {
    const act = d.active
    const st = (id: string) => d.states.get(id)!
    const openActs = d.actions.filter((a) => a.status !== 'completed' && a.status !== 'cancelled')
    return {
      active: act.length,
      critical: act.filter((r) => st(r.id).level === 'critical').length,
      outside: act.filter((r) => st(r.id).outsideTolerance).length,
      reviewDue: act.filter((r) => st(r.id).reviewOverdue).length,
      kriBad: d.kris.filter((k) => k.active && (k.state === 'warn' || k.state === 'critical')).length,
      openActs: openActs.length,
      overdueActs: openActs.filter((a) => a.dueDate && a.dueDate < new Date().toISOString().slice(0, 10)).length,
      noPlan: act.filter((r) => !st(r.id).hasPlan || !st(r.id).hasOwner).length,
      pending: d.suggestions.filter((x) => x.status === 'pending').length,
      realized: d.risks.filter((r) => r.status === 'realized').length,
    }
  }, [d])

  const main: TileDef[] = [
    { tab: 'register', en: 'Risk Identification', fa: 'شناسایی و ثبت ریسک', desc: 'شناسایی، طبقه‌بندی و ثبت ریسک با شناسنامهٔ کامل', icon: ScanSearch, color: '#0ea5e9', stat: { n: s.active, label: 'ریسک فعال' } },
    { tab: 'assessment', en: 'Risk Assessment', fa: 'ارزیابی و اولویت‌بندی', desc: 'تحلیل احتمال، اثر و اولویت؛ ذاتی، فعلی و باقیمانده', icon: TrendingUp, color: '#f59e0b', stat: { n: s.critical, label: 'بحرانی' } },
    { tab: 'response', en: 'Risk Response', fa: 'پاسخ و اقدامات کاهشی', desc: 'برنامهٔ پاسخ، اقدامات کاهشی و پذیرش رسمی', icon: ShieldCheck, color: '#22c55e', stat: { n: s.openActs, label: 'اقدام باز' } },
    { tab: 'monitoring', en: 'Risk Monitoring', fa: 'پایش و اثربخشی', desc: 'شاخص‌های هشدار (KRI) و اثربخشی کنترل‌ها و اقدام‌ها', icon: Activity, color: '#8b5cf6', stat: { n: s.kriBad, label: 'KRI در هشدار' } },
    { tab: 'portfolio', en: 'Portfolio Risk Intelligence', fa: 'هوش پورتفولیو', desc: 'ریسک‌های مشترک، تجمیعی و گلوگاه‌های سازمانی', icon: Network, color: '#14b8a6' },
    { tab: 'integration', en: 'Risk–Issue Integration', fa: 'یکپارچگی با مدیریت مسائل', desc: 'ارتباط دوطرفه با Issue Management، مأموریت و سامانه‌های شرکت', icon: ArrowLeftRight, color: '#f43f5e', stat: { n: s.pending, label: 'پیشنهاد منتظر' } },
  ]
  const more: TileDef[] = [
    { tab: 'assistant', en: 'AI Risk Assistant', fa: 'دستیار هوشمند', desc: 'پرسش، استخراج و پیشنهاد', icon: Bot, color: '#a78bfa' },
    { tab: 'dashboard', en: 'Control Tower', fa: 'داشبوردها', desc: 'مدیر پروژه، طرح، مدیریت ارشد', icon: Gauge, color: '#6366f1' },
    { tab: 'kpi', en: 'KPIs', fa: 'شاخص‌های عملکرد', desc: 'سیزده شاخص با فرمول', icon: Layers, color: '#eab308' },
    { tab: 'reports', en: 'Reports', fa: 'گزارش‌ها', desc: 'Excel، چاپ و Drill-down', icon: FileBarChart, color: '#0891b2' },
    { tab: 'alerts', en: 'Alerts & Escalation', fa: 'اعلان و تشدید', desc: 'قاعده‌های هشدار', icon: Bell, color: '#ef4444' },
    { tab: 'settings', en: 'Policy & Settings', fa: 'سیاست و تنظیمات', desc: 'آستانه‌ها، دسته‌ها', icon: Settings2, color: '#94a3b8' },
    { tab: 'help', en: 'Guide', fa: 'راهنمای کامل', desc: 'آموزش هر بخش', icon: CircleHelp, color: '#64748b' },
  ]
  return (
    <div className="im-page">
      <section className="im-banner" aria-label="معرفی">
        <div className="im-banner-art" aria-hidden>
          <span className="blob b1" /><span className="blob b2" /><span className="blob b3" />
          <svg viewBox="0 0 800 200" preserveAspectRatio="none">
            <g fill="none" stroke="#fff" strokeWidth="1.2">
              <path d="M0 150 C 120 90, 220 190, 340 120 S 560 60, 800 130" />
              <path d="M0 110 C 140 160, 260 50, 400 100 S 640 170, 800 80" opacity=".6" />
              {[60, 180, 300, 420, 540, 660, 760].map((x, k) => <circle key={x} cx={x} cy={[148, 116, 136, 104, 90, 118, 100][k]} r="4" fill="#fff" />)}
            </g>
          </svg>
        </div>
        <h1>Enterprise Project Risk Management</h1>
        <p>سامانه هوشمند مدیریت ریسک پروژه، طرح و پورتفولیو</p>
        <div className="im-banner-pills">
          <button className="im-banner-pill" onClick={() => onGo('assessment')}><Siren size={13} aria-hidden />بحرانی <b>{s.critical}</b></button>
          <button className="im-banner-pill" onClick={() => onGo('dashboard')}><ShieldHalf size={13} aria-hidden />خارج از تحمل <b>{s.outside}</b></button>
          <button className="im-banner-pill" onClick={() => onGo('assessment')}><BookOpen size={13} aria-hidden />بازنگری معوق <b>{s.reviewDue}</b></button>
          <button className="im-banner-pill" onClick={() => onGo('response')}><ShieldCheck size={13} aria-hidden />بدون مالک/برنامه <b>{s.noPlan}</b></button>
        </div>
      </section>
      <div className="im-tiles">{main.map((t, i) => <Tile key={t.tab} t={t} i={i} onGo={onGo} />)}</div>
      <div className="im-section-label">امکانات تکمیلی</div>
      <div className="im-tiles im-tiles-sm">{more.map((t, i) => <Tile key={t.tab} t={t} i={i + 6} onGo={onGo} />)}</div>
    </div>
  )
}
