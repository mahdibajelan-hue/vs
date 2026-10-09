import { useMemo } from 'react'
import { Bell, BookOpen, Building2, CalendarDays, CircleHelp, Gauge, Layers, ListChecks, OctagonAlert, Radar, Scale, ShieldAlert, Telescope } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useScoped } from '../lib/useScoped'
import { effectiveDue, isActiveIssue, priorityRank } from '../lib/imModel'
import { todayIso } from '../lib/issueRing'
import { decisionHealth } from '../lib/imDecisions'
import { useCountUp } from '../lib/useCountUp'
import type { Tab } from '../IssuesApp'

interface TileDef { tab: Tab; en: string; fa: string; desc: string; icon: LucideIcon; color: string; stat?: { n: number; label: string } }

function Tile({ t, i, onGo }: { t: TileDef; i: number; onGo: (tab: Tab) => void }) {
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

/** Landing page of the module: the six areas of the platform, each one tap away. */
export function HubPage({ onGo }: { onGo: (tab: Tab) => void }) {
  const sc = useScoped()
  const today = todayIso()
  const s = useMemo(() => {
    const act = sc.issues.filter(isActiveIssue)
    const late = act.filter((i) => effectiveDue(i) < today)
    const openTasks = sc.tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled')
    const lateTasks = openTasks.filter((t) => t.dueDate && t.dueDate < today)
    const pendingDec = sc.decisions.filter((d) => d.status === 'pending')
    return {
      active: act.length, late: late.length, critical: act.filter((i) => priorityRank(i.severity ?? i.priority) >= 4).length,
      openTasks: openTasks.length, lateTasks: lateTasks.length, blocked: sc.tasks.filter((t) => t.status === 'blocked').length,
      pendingDec: pendingDec.length, lateDec: pendingDec.filter((d) => decisionHealth(d, today) === 'overdue').length,
    }
  }, [sc.issues, sc.tasks, sc.decisions, today])

  const main: TileDef[] = [
    { tab: 'issues', en: 'Issue Management', fa: 'مدیریت مسائل', desc: 'ثبت، تحلیل، اولویت‌بندی و رفع مسائل', icon: OctagonAlert, color: '#f97316', stat: { n: s.active, label: 'مسئلهٔ فعال' } },
    { tab: 'tracking', en: 'Task & Action Management', fa: 'مدیریت اقدام‌ها', desc: 'اقدام‌ها، تعهدات، مسئولیت و تحویل', icon: ListChecks, color: '#0ea5e9', stat: { n: s.openTasks, label: 'اقدام باز' } },
    { tab: 'decisions', en: 'Decision & Dependency Management', fa: 'تصمیم‌ها و وابستگی‌ها', desc: 'تصمیمات معطل و وابستگی‌ها', icon: Scale, color: '#8b5cf6', stat: { n: s.pendingDec, label: 'منتظر تصمیم' } },
    { tab: 'insights', en: 'Portfolio Intelligence', fa: 'هوش پورتفولیو', desc: 'کشف الگوهای مشترک و تحلیل هوشمند', icon: Telescope, color: '#14b8a6' },
    { tab: 'notifications', en: 'Notification & Escalation Engine', fa: 'موتور اعلان و تشدید', desc: 'اعلان، یادآوری، هشدار تصاعدی و پیگیری تعهدات', icon: Bell, color: '#f43f5e' },
    { tab: 'tower', en: 'Executive Control Tower', fa: 'برج کنترل مدیریتی', desc: 'داشبورد مدیر پروژه، مدیر طرح، مدیر واحد و مدیرعامل', icon: Gauge, color: '#6366f1', stat: { n: s.late, label: 'مورد تأخیردار' } },
  ]
  const more: TileDef[] = [
    { tab: 'calendar', en: 'Work Calendar', fa: 'تقویم کاری', desc: 'سررسیدها روی تقویم شمسی', icon: CalendarDays, color: '#eab308' },
    { tab: 'kpi', en: 'KPIs & Charts', fa: 'شاخص‌ها و نمودارها', desc: 'حلقه، دونات و روند', icon: Layers, color: '#22c55e' },
    { tab: 'mywork', en: 'My Work', fa: 'کارهای من', desc: 'منتظر تأیید و امروز', icon: ShieldAlert, color: '#ef4444' },
    { tab: 'knowledge', en: 'Lessons Learned', fa: 'دانش و درس‌آموخته', desc: 'تجربه‌های بسته‌شده', icon: BookOpen, color: '#ec4899' },
    { tab: 'projects', en: 'Projects', fa: 'پروژه‌ها', desc: 'از اطلاعات پایه سامانه', icon: Building2, color: '#0891b2' },
    { tab: 'field', en: 'Field Monitoring', fa: 'پایش میدانی (قبلی)', desc: 'پایش اقدامات و پیگیری موانع', icon: Radar, color: '#d97706' },
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
        <h1>Project Intelligence &amp; Execution Platform</h1>
        <p>مدیریت هوشمند مسائل، اقدامات، تصمیمات و پیگیری‌ها</p>
        <div className="im-banner-pills">
          <button className="im-banner-pill" onClick={() => onGo('tracking')}><ShieldAlert size={13} aria-hidden />تأخیردار <b>{s.late + s.lateTasks}</b></button>
          <button className="im-banner-pill" onClick={() => onGo('issues')}><OctagonAlert size={13} aria-hidden />بحرانی <b>{s.critical}</b></button>
          <button className="im-banner-pill" onClick={() => onGo('decisions')}><Scale size={13} aria-hidden />تصمیم معوق <b>{s.lateDec}</b></button>
          <button className="im-banner-pill" onClick={() => onGo('tracking')}><ListChecks size={13} aria-hidden />اقدام مسدود <b>{s.blocked}</b></button>
        </div>
      </section>

      <div className="im-tiles">{main.map((t, i) => <Tile key={t.tab} t={t} i={i} onGo={onGo} />)}</div>
      <div className="im-section-label">امکانات تکمیلی</div>
      <div className="im-tiles im-tiles-sm">{more.map((t, i) => <Tile key={t.tab} t={t} i={i + 6} onGo={onGo} />)}</div>
    </div>
  )
}
