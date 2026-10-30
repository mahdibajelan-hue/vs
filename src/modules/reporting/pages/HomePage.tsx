import { useMemo, useState, type CSSProperties } from 'react'
import { Activity, AlertTriangle, Bot, CalendarDays, CalendarRange, FileText, Gavel, HardHat, Layers, Microscope, Network, Presentation, ShieldCheck } from 'lucide-react'
import { jd, DOMAIN_FA, WARNING_KIND_FA, deviations, earlyWarnings, summarise, type Domain, type ProjectFacts } from '../lib/analyticsCore'
import { CONF_FA, FactsGate, Freshness, Panel, ScopeBar, Tag, confTone, fa, inScope, type Scope } from '../components/rpx'
import { BarList, Donut, KpiTile, SideSheet } from '../../executive/components/viz'
import type { Section } from '../ReportingApp'
import './periodReports.css'

const DOMAIN_C: Record<Domain, string> = { schedule: '#6366f1', cost: '#ec4899', engineering: '#06b6d4', procurement: '#f59e0b', construction: '#0ea5e9', contract: '#a78bfa', risk: '#f97316', issues: '#f43f5e', execution: '#14b8a6', decisions: '#8b5cf6' }
type Sheet = { title: string; sub?: string; head: string[]; rows: string[][]; tones?: ('bad' | 'warn' | 'none')[]; projectId?: string }

/** The module's front page: what needs the manager's attention, as charts that open the records behind them, and the way into the periodic reports and the three sections. */
export function HomePage({ scope, onScope, onOpen }: { scope: Scope; onScope: (s: Scope) => void; onOpen: (section: Section, sub?: string, projectId?: string) => void }) {
  return (
    <div className="rpx">
      <div className="rpx-bar" style={{ justifyContent: 'space-between' }}>
        <ScopeBar scope={scope} onChange={onScope} />
        <Freshness />
      </div>
      <FactsGate>{(all) => <Home list={all.filter((f) => inScope(f, scope))} onOpen={onOpen} />}</FactsGate>
    </div>
  )
}

function Home({ list, onOpen }: { list: ProjectFacts[]; onOpen: (section: Section, sub?: string, projectId?: string) => void }) {
  const sm = useMemo(() => summarise(list), [list])
  const devs = useMemo(() => list.flatMap(deviations).filter((d) => d.severity === 'material' || d.severity === 'watch'), [list])
  const warns = useMemo(() => list.flatMap(earlyWarnings), [list])
  const [sheet, setSheet] = useState<Sheet | null>(null)
  if (!list.length) return <p className="rpx-empty">پروژه‌ای در این محدوده در دسترس شما نیست.</p>

  const conf = { high: 0, medium: 0, low: 0 }
  for (const f of list) conf[f.report.confidence]++
  const odDec = sm.decisions.filter((d) => d.overdue)
  const material = devs.filter((d) => d.severity === 'material')
  const byDomain = new Map<Domain, number>()
  for (const d of material) byDomain.set(d.domain, (byDomain.get(d.domain) ?? 0) + 1)
  const devSheet = (title: string, ds: typeof devs, sub?: string): Sheet => ({ title, sub, head: ['پروژه', 'حوزه', 'شاخص', 'مقدار', 'مرجع', 'یادداشت'], rows: ds.map((d) => [d.project, DOMAIN_FA[d.domain], d.metric, d.actual, d.reference, d.note || '—']), tones: ds.map((d) => (d.severity === 'material' ? 'bad' : 'warn')) })
  const warnSheet = (title: string, ws: typeof warns): Sheet => ({ title, head: ['پروژه', 'هشدار', 'نوع', 'اطمینان', 'دلیل', 'اقدام پیشنهادی'], rows: ws.map((w) => [w.project, w.title, WARNING_KIND_FA[w.kind], CONF_FA[w.confidence], w.reason, w.suggestion]), tones: ws.map((w) => (w.severity === 'high' ? 'bad' : 'warn')) })
  const decSheet = (title: string, ds: typeof sm.decisions): Sheet => ({ title, head: ['پروژه', 'تصمیم', 'موعد', 'مرجع', 'وضعیت'], rows: ds.map((d) => [d.project, d.title, jd(d.dueBy), d.owner ?? '—', d.overdue ? 'موعد گذشته' : 'در انتظار']), tones: ds.map((d) => (d.overdue ? 'bad' : 'none')) })
  const projSheet = (projectId: string): Sheet => {
    const f = list.find((x) => x.id === projectId)!
    const ds = deviations(f).filter((d) => d.severity === 'material' || d.severity === 'watch')
    return { ...devSheet(f.name, ds, f.report.headline.join(' ')), projectId }
  }
  const lowList = list.filter((f) => f.report.confidence === 'low')

  return (
    <>
      <div className="vz-kpis">
        <KpiTile i={0} icon={<Layers size={15} />} tone="#6366f1" label="پروژه‌ها" value={fa(sm.projects)} sub={`${fa(sm.withData)} با شاخص پیشرفت`} onClick={() => setSheet({ title: 'پروژه‌های محدوده', head: ['پروژه', 'مرحله', 'پیشرفت', 'برنامه', 'اعتبار داده'], rows: list.map((f) => [f.name, f.phase?.title ?? '—', f.input.metrics ? `${fa(f.input.metrics.lifecycle.actual, 1)}٪` : '—', f.input.metrics ? `${fa(f.input.metrics.lifecycle.planned, 1)}٪` : '—', CONF_FA[f.report.confidence]]) })} />
        <KpiTile i={1} icon={<Activity size={15} />} tone="#f43f5e" label="پروژه با انحراف مهم" value={fa(sm.critical.length)} sub={`${fa(material.length)} انحراف بالاتر از آستانه`} onClick={() => setSheet(devSheet('انحرافات مهم', material))} />
        <KpiTile i={2} icon={<AlertTriangle size={15} />} tone="#f59e0b" label="هشدار با اهمیت بالا" value={fa(sm.warnings.length)} sub={`از ${fa(warns.length)} هشدار فعال`} onClick={() => setSheet(warnSheet('هشدارهای فعال', warns))} />
        <KpiTile i={3} icon={<Gavel size={15} />} tone="#a78bfa" label="تصمیم معوق" value={fa(odDec.length)} sub={`${fa(sm.decisions.length)} تصمیم در انتظار`} onClick={() => setSheet(decSheet('تصمیم‌های در انتظار', sm.decisions))} />
        <KpiTile i={4} icon={<ShieldCheck size={15} />} tone={conf.low > list.length / 3 ? '#f43f5e' : '#22c55e'} label="اعتبار داده" value={`${fa(conf.high)} / ${fa(conf.medium)} / ${fa(conf.low)}`} sub="اطمینان بالا / متوسط / پایین" onClick={lowList.length ? () => setSheet({ title: 'پروژه‌های با اطمینان پایین', head: ['پروژه', 'منبع', 'آخرین ثبت', 'وضعیت'], rows: lowList.flatMap((f) => f.report.quality.filter((q) => !q.available || (q.staleDays ?? 0) > f.report.thresholds.staleDays).map((q) => [f.name, q.source, jd(q.lastUpdate), q.note])) }) : undefined} />
      </div>

      <section className="prx-quick" aria-label="گزارش‌های دوره‌ای">
        {[{ k: 'daily', t: 'روزانهٔ کارگاه', i: HardHat, c: '#0ea5e9' }, { k: 'weekly', t: 'هفتگی', i: CalendarDays, c: '#14b8a6' }, { k: 'monthly', t: 'ماهانه', i: CalendarRange, c: '#6366f1' }, { k: 'executive', t: 'خلاصهٔ مدیریتی', i: Presentation, c: '#ec4899' }].map((x, n) => (
          <button key={x.k} type="button" style={{ '--c': x.c, '--i': n } as CSSProperties} onClick={() => onOpen('reports', x.k)}><x.i size={16} aria-hidden /><span>گزارش {x.t}</span></button>
        ))}
      </section>

      <div className="rpx-grid2">
        <Panel title="انحرافات مهم به تفکیک حوزه" sub="روی هر بخش بزنید تا انحرافات آن حوزه باز شود" help="آستانه‌ها در «تنظیمات» تعریف می‌شوند. تعریف هر شاخص در جدول انحرافات مرکز تحلیل کنار همان شاخص آمده است."
          actions={<button className="rpx-btn" onClick={() => onOpen('analysis', 'deviations')}>مرکز تحلیل</button>}>
          {!material.length ? <p className="rpx-empty">انحرافی بالاتر از آستانه‌ها نیست.</p> : (
            <Donut sub="انحراف مهم" parts={[...byDomain].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ key: k, label: DOMAIN_FA[k], value: n, color: DOMAIN_C[k] }))}
              onPick={(k) => { if (k) setSheet(devSheet(`انحرافات مهم — ${DOMAIN_FA[k as Domain]}`, material.filter((d) => d.domain === k))) }} />
          )}
        </Panel>

        <Panel title="پروژه‌های بحرانی" sub="به ترتیب تعداد انحراف مهم؛ روی هر پروژه بزنید">
          {!sm.critical.length ? <p className="rpx-empty">پروژهٔ بحرانی نیست.</p> : (
            <BarList onPick={(id) => setSheet(projSheet(id))} items={sm.critical.slice(0, 8).map((c) => ({ key: c.projectId, label: c.project, value: c.material, display: `${fa(c.material)} انحراف`, color: c.material >= 3 ? '#f43f5e' : '#f59e0b', note: c.reasons.slice(0, 3).map((r) => r.split(':')[0]).join('، ') }))} />
          )}
        </Panel>
      </div>

      <div className="rpx-grid2">
        <Panel title={<><AlertTriangle size={14} /> هشدارهای فعال</>} sub="قاعده‌محور (عبور از آستانه) در برابر آماری (ادامهٔ روند)"
          actions={<button className="rpx-btn" onClick={() => onOpen('analysis', 'warnings')}>همهٔ هشدارها</button>}>
          {!warns.length ? <p className="rpx-empty">هشدار فعالی نیست.</p> : (
            <>
              <Donut size={130} sub="هشدار" onPick={(k) => { if (k) setSheet(warnSheet(`هشدارهای ${WARNING_KIND_FA[k as 'rule']}`, warns.filter((w) => w.kind === k))) }}
                parts={(['rule', 'statistical'] as const).map((k) => ({ key: k, label: WARNING_KIND_FA[k], value: warns.filter((w) => w.kind === k).length, color: k === 'rule' ? '#0ea5e9' : '#a78bfa' }))} />
              <div className="rpx-items" style={{ marginTop: '.6rem' }}>{sm.warnings.slice(0, 3).map((w) => (
                <div key={`${w.projectId}-${w.key}`} className="rpx-item t-warn" style={{ borderInlineStartColor: 'var(--c)' }}>
                  <div className="rpx-item-head"><b>{w.project}: {w.title}</b><Tag tone={confTone(w.confidence)}>{CONF_FA[w.confidence]}</Tag></div>
                  <p>{w.reason}</p>
                </div>
              ))}</div>
            </>
          )}
        </Panel>

        <Panel title={<><Gavel size={14} /> تصمیمات موردنیاز</>} sub="تصمیم‌های در انتظار هر پروژه؛ قرمز یعنی موعد گذشته"
          actions={<button className="rpx-btn" onClick={() => onOpen('analysis', 'actions')}>پیشنهاد اقدام</button>}>
          {!sm.decisions.length ? <p className="rpx-empty">تصمیمی در انتظار نیست.</p> : (() => {
            const by = new Map<string, { p: string; n: number; od: number }>()
            for (const d of sm.decisions) { const x = by.get(d.projectId) ?? { p: d.project, n: 0, od: 0 }; x.n++; if (d.overdue) x.od++; by.set(d.projectId, x) }
            return <BarList onPick={(id) => setSheet(decSheet(`تصمیم‌های ${by.get(id)?.p ?? ''}`, sm.decisions.filter((d) => d.projectId === id)))}
              items={[...by].sort((a, b) => b[1].od - a[1].od || b[1].n - a[1].n).slice(0, 8).map(([id, x]) => ({ key: id, label: x.p, value: x.n, display: `${fa(x.n)} تصمیم`, color: x.od ? '#f43f5e' : '#a78bfa', note: x.od ? `${fa(x.od)} مورد موعد گذشته` : 'در موعد' }))} />
          })()}
        </Panel>
      </div>

      {sm.patterns.length > 0 && (
        <Panel title={<><Network size={14} /> یافته‌های بین‌پروژه‌ای</>} sub="موضوعاتی که در چند پروژه تکرار شده‌اند" help="«نیازمند تصمیم سطح بالاتر» یعنی موضوع در سه پروژه یا بیشتر دیده شده و راه‌حل آن احتمالاً در سطح طرح یا سبد است. الگوی پیمانکار فقط همبستگی است.">
          <BarList onPick={(k) => { const p = sm.patterns.find((x) => x.key === k); if (p) setSheet({ title: p.text, sub: p.note, head: ['پروژه'], rows: p.projects.map((x) => [x]) }) }}
            items={sm.patterns.slice(0, 6).map((p) => ({ key: p.key, label: p.text, value: p.projects.length, display: `${fa(p.projects.length)} پروژه`, color: p.escalate ? '#f43f5e' : '#f59e0b', note: p.escalate ? 'نیازمند تصمیم سطح بالاتر' : p.projects.slice(0, 3).join('، ') }))} />
        </Panel>
      )}

      <div className="rpx-doors">
        <button className="rpx-door" onClick={() => onOpen('reports')}><b><CalendarRange size={15} /> گزارش‌های دوره‌ای</b><span>گزارش روزانهٔ کارگاه، هفتگی، ماهانه و خلاصهٔ مدیریتی؛ گرافیکی، با جزئیات هر بخش.</span></button>
        <button className="rpx-door" onClick={() => onOpen('builder')}><b><FileText size={15} /> گزارش‌ساز</b><span>گزارش ترکیبی برای مخاطب دلخواه، گزارش رسمی پروژه و قالب‌های ویجتی.</span></button>
        <button className="rpx-door" onClick={() => onOpen('analysis')}><b><Microscope size={15} /> مرکز تحلیل</b><span>انحرافات حوزه‌ای، علل ریشه‌ای، هشدارهای پیش‌نگر، مقایسهٔ پروژه‌ها و پیشنهاد اقدام.</span></button>
        <button className="rpx-door" onClick={() => onOpen('assistant')}><b><Bot size={15} /> دستیار هوشمند</b><span>پرسش فارسی دربارهٔ پروژه‌ها، با پاسخ عددی، شواهد و ارجاع به صفحهٔ مرتبط.</span></button>
      </div>
      {sm.asOf && <p className="rpx-note">آخرین ثبت شاخص پیشرفت در این محدوده: {jd(sm.asOf)}</p>}

      <SideSheet open={!!sheet} onClose={() => setSheet(null)} crumb="نمای مدیریتی" title={sheet?.title ?? ''} sub={sheet?.sub}
        actions={sheet?.projectId ? <button type="button" className="rpx-btn" onClick={() => { const id = sheet.projectId; setSheet(null); onOpen('analysis', 'causes', id) }}>علت‌ها در مرکز تحلیل</button> : null}>
        {sheet && (!sheet.rows.length ? <p className="rpx-empty">موردی نیست.</p> : (
          <div className="rpx-table-wrap"><table className="rpx-table"><thead><tr>{sheet.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{sheet.rows.map((r, i) => <tr key={i} className={sheet.tones?.[i] && sheet.tones[i] !== 'none' ? `tone-${sheet.tones[i]}` : ''}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody></table></div>
        ))}
      </SideSheet>
    </>
  )
}
