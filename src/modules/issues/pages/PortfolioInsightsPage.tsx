import { useMemo, useState } from 'react'
import { AlertOctagon, AlertTriangle, CheckCircle2, Compass, Lightbulb, Link2, Network } from 'lucide-react'
import { IM_CATEGORY_FA } from '../lib/imModel'
import { corporateRollup, heatmap, sharedCauses } from '../lib/imPortfolio'
import { advise, categoryShare, projectHealth, type Level } from '../lib/imIntel'
import { todayIso } from '../lib/issueRing'
import { useScoped } from '../lib/useScoped'
import { IssueCode, SeverityChip } from '../components/ui'
import { HBars, Ring } from '../components/charts'
import { HelpButton } from '../components/Help'

const LV: Record<Level, { color: string; label: string; icon: typeof AlertOctagon }> = {
  bad: { color: 'var(--im-coral)', label: 'فوری', icon: AlertOctagon },
  warn: { color: 'var(--im-amber)', label: 'قابل‌توجه', icon: AlertTriangle },
  ok: { color: 'var(--im-mint)', label: 'مطلوب', icon: CheckCircle2 },
}

/** Portfolio intelligence: answers three questions — where is the pressure, why, and what should I do first. Rule-based and explainable. */
export function PortfolioInsightsPage({ onSelectIssue }: { onSelectIssue: (id: string) => void }) {
  const { issues, projects, decisions } = useScoped()
  const today = todayIso()
  const name = (id: string) => projects.find((p) => p.id === id)?.name ?? '—'
  const [open, setOpen] = useState<string | null>(null)
  const active = useMemo(() => issues.filter((i) => !['closed', 'cancelled', 'duplicate'].includes(i.stage ?? '')), [issues])
  const health = useMemo(() => projectHealth(issues, projects.map((p) => p.id), today).filter((h) => h.active > 0), [issues, projects, today])
  const cats = useMemo(() => categoryShare(issues, today), [issues, today])
  const advice = useMemo(() => advise(issues, decisions, name, today), [issues, decisions, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const hm = useMemo(() => heatmap(issues, today), [issues, today])
  const causes = useMemo(() => sharedCauses(issues), [issues])
  const corp = useMemo(() => corporateRollup(issues, today), [issues, today])
  const heatCats = useMemo(() => [...new Set(hm.cells.map((c) => c.category))], [hm])
  const heatProjs = projects.filter((p) => hm.cells.some((c) => c.projectId === p.id))
  const pressured = health.filter((h) => h.level !== 'ok').length

  return (
    <div className="im-page">
      <div className="im-topbar">
        <div><div className="im-page-title"><Compass size={22} style={{ color: 'var(--im-teal, #14b8a6)' }} />هوش پورتفولیو</div><div className="im-page-sub">کجا فشار بیشتر است؟ چرا؟ و اول چه کار کنیم؟</div></div>
        <div className="im-actions"><HelpButton topic="insights" /></div>
      </div>

      <div className="im-intel-hero">
        <div className="im-intel-q"><b>۱</b><span>کجا فشار هست؟<small>رتبهٔ پروژه‌ها بر اساس تأخیر، بحرانی و مسدود</small></span></div>
        <div className="im-intel-q"><b>۲</b><span>چرا؟<small>تمرکز در دسته‌ها و علل مشترک بین پروژه‌ها</small></span></div>
        <div className="im-intel-q"><b>۳</b><span>چه کنیم؟<small>پیشنهادهای مشخص با دلیل و گام بعدی</small></span></div>
      </div>

      <div className="im-card" style={{ marginBottom: 14 }}>
        <div className="im-section-title"><Lightbulb size={16} style={{ color: 'var(--im-amber)' }} />اول چه کنم؟ <span className="im-helper">پیشنهادها از روی داده‌های واقعی ساخته می‌شوند و هرکدام دلیل دارند</span></div>
        {advice.length === 0 ? <div className="im-notice ok"><b>وضعیت مطلوب است.</b> مسئلهٔ بحرانی تأخیردار، رهاشده یا بی‌مسئول وجود ندارد.</div> : (
          <div className="im-adv-list">
            {advice.map((a) => {
              const L = LV[a.level]
              const isOpen = open === a.id
              return (
                <div key={a.id} className="im-adv" style={{ ['--c' as string]: L.color }}>
                  <div className="im-adv-ic"><L.icon size={18} aria-hidden /></div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="im-adv-t">{a.title}<span className="im-pill" style={{ ['--c' as string]: L.color }}>{L.label}</span></div>
                    <div className="im-adv-why"><b>چرا مهم است:</b> {a.why}</div>
                    <div className="im-adv-do"><b>گام پیشنهادی:</b> {a.todo}</div>
                    {a.issueIds.length > 0 && <button className="im-ghostlink" onClick={() => setOpen(isOpen ? null : a.id)}>{isOpen ? 'پنهان‌کردن' : `نمایش ${a.issueIds.length} مورد`}</button>}
                    {isOpen && <div className="im-actions" style={{ marginTop: 6 }}>{a.issueIds.slice(0, 12).map((id) => { const i = issues.find((x) => x.id === id); return i ? <button key={id} className="im-chip" title={i.title} onClick={() => onSelectIssue(id)}>{i.code} · {i.title.slice(0, 28)}</button> : null })}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="im-intel-grid">
        <div className="im-card">
          <div className="im-section-title">کدام پروژه‌ها فشار بیشتری دارند؟ <span className="im-helper">{pressured} پروژه نیازمند توجه</span></div>
          {health.length === 0 ? <div className="im-helper">مسئلهٔ فعالی وجود ندارد.</div> : health.map((h) => (
            <div key={h.projectId} className="im-prj-row">
              <Ring value={h.risk} size={58} stroke={7} color={LV[h.level].color} label="" suffix="" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>{name(h.projectId)}</div>
                <div className="im-issue-meta">
                  <span className="im-chip">{h.active} فعال</span>
                  {h.overdue > 0 && <span className="im-chip" style={{ color: 'var(--im-coral)' }}>{h.overdue} تأخیردار{h.avgLate ? ` (میانگین ${h.avgLate} روز)` : ''}</span>}
                  {h.critical > 0 && <span className="im-chip" style={{ color: 'var(--im-coral)' }}>{h.critical} بحرانی</span>}
                  {h.blocked > 0 && <span className="im-chip" style={{ color: 'var(--im-amber)' }}>{h.blocked} مسدود</span>}
                  {h.stale > 0 && <span className="im-chip">{h.stale} رهاشده</span>}
                  {h.unassigned > 0 && <span className="im-chip">{h.unassigned} بی‌مسئول</span>}
                </div>
              </div>
            </div>
          ))}
          <div className="im-helper" style={{ marginTop: 8 }}>شاخص فشار (۰ تا ۱۰۰) = ۴۵٪ نسبت تأخیردار + ۲۵٪ بحرانی + ۱۵٪ مسدود + ۱۰٪ رهاشده + ۵٪ بی‌مسئول + اثر میانگین تأخیر.</div>
        </div>

        <div className="im-card">
          <div className="im-section-title">فشار در کدام دسته است؟ <span className="im-helper">سهم از {active.length} مسئلهٔ فعال</span></div>
          {cats.length === 0 ? <div className="im-helper">مسئلهٔ فعالی وجود ندارد.</div> : <HBars rows={cats.map((c) => ({ key: c.category, label: c.label, value: c.active, color: c.share >= 0.4 ? 'var(--im-coral)' : undefined, hint: `${Math.round(c.share * 100)}٪${c.overdue ? ` · ${c.overdue} تأخیردار` : ''}` }))} />}
          {heatProjs.length > 1 && heatCats.length > 1 && (
            <>
              <div className="im-section-title" style={{ marginTop: 14 }}>نقشهٔ حرارتی فشرده <span className="im-helper">پروژه × دسته؛ عدد = مسئلهٔ فعال، حاشیهٔ قرمز = دارای تأخیر</span></div>
              <div style={{ overflowX: 'auto' }}>
                <div className="im-heat2" style={{ gridTemplateColumns: `minmax(110px, 1.4fr) repeat(${heatCats.length}, minmax(44px, 1fr))` }}>
                  <span />
                  {heatCats.map((c) => <span key={c} className="h">{c === 'none' ? 'بدون دسته' : IM_CATEGORY_FA[c] ?? c}</span>)}
                  {heatProjs.map((p) => (
                    <div key={p.id} style={{ display: 'contents' }}>
                      <span className="p">{p.name}</span>
                      {heatCats.map((c) => {
                        const cell = hm.cells.find((x) => x.projectId === p.id && x.category === c)
                        return <span key={c} className={`c ${cell?.overdue ? 'late' : ''}`} title={cell ? `${cell.active} فعال · ${cell.overdue} تأخیردار · ${cell.critical} بحرانی` : ''} style={cell ? { background: `rgba(245,178,72,${0.14 + 0.6 * (cell.active / hm.max)})` } : undefined}>{cell ? cell.active : ''}</span>
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="im-card" style={{ marginBottom: 14 }}>
        <div className="im-section-title"><Network size={16} style={{ color: 'var(--im-indigo)' }} />علل مشترک بین پروژه‌ها <span className="im-helper">وقتی یک علت در چند پروژه تکرار شود، رفع یک‌باره‌اش از رفع تک‌تک مسائل ارزان‌تر است</span></div>
        {causes.length === 0 ? <div className="im-helper">هنوز علت مشترکی بین دست‌کم دو پروژه دیده نشده. با ثبت «علت ریشه‌ای» در تب «تحلیل علت» هر مسئله، این بخش فعال می‌شود.</div> : causes.map((c) => (
          <div key={c.label} className="im-task" style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{c.label}</div>
            <div className="im-helper">{c.projectIds.length} پروژه ({c.projectIds.map(name).join('، ')}) · {c.issueIds.length} مسئله · {c.closedCount} بسته‌شده</div>
            <div className="im-helper" style={{ color: 'var(--im-amber)' }}>پیشنهاد: یک اقدام اصلاحی سازمانی تعریف و به‌عنوان «درس‌آموخته» ثبت کنید.</div>
            <div className="im-actions">{c.issueIds.slice(0, 6).map((id) => { const i = issues.find((x) => x.id === id); return i ? <button key={id} className="im-chip" onClick={() => onSelectIssue(id)}>{i.code}</button> : null })}</div>
          </div>
        ))}
      </div>

      <div className="im-card">
        <div className="im-section-title"><Link2 size={16} style={{ color: 'var(--im-teal, #14b8a6)' }} />مسائل مادر (سطح شرکت) <span className="im-helper">یک مشکل سازمانی که در چند پروژه خودش را نشان می‌دهد</span></div>
        {corp.length === 0 ? <div className="im-helper">هنوز مسئلهٔ مادری تعریف نشده. در جزئیات هر مسئله می‌توانید آن را به یک «مسئلهٔ مادر» پیوند دهید تا اثر کلی‌اش یک‌جا دیده شود.</div> : corp.map((c) => (
          <div key={c.parent.id} className="im-task" style={{ marginBottom: 8 }}>
            <button style={{ textAlign: 'right' }} onClick={() => onSelectIssue(c.parent.id)}><IssueCode issue={c.parent} /> <b>{c.parent.title}</b></button>
            <div className="im-issue-meta"><span className="im-chip">{c.children.length} مسئلهٔ فرزند در {c.projects} پروژه</span><span className="im-chip">{c.active} فعال</span><span className="im-chip" style={{ color: c.overdue ? 'var(--im-coral)' : undefined }}>{c.overdue} تأخیردار</span>{c.worstSeverity > 0 && <SeverityChip level={(['low', 'low', 'medium', 'high', 'critical'] as const)[c.worstSeverity]} />}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
