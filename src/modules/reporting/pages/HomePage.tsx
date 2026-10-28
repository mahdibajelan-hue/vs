import { useMemo } from 'react'
import { AlertTriangle, Bot, FileText, Gavel, Microscope, Network } from 'lucide-react'
import { jd, DOMAIN_FA, WARNING_KIND_FA, summarise, type ProjectFacts } from '../lib/analyticsCore'
import { CONF_FA, FactsGate, Freshness, KpiBand, Panel, ScopeBar, Tag, confTone, fa, inScope, type Scope } from '../components/rpx'
import type { Section } from '../ReportingApp'

/** The module's front page: what needs the manager's attention, in order of management importance, and the way into the three sections. */
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
  if (!list.length) return <p className="rpx-empty">پروژه‌ای در این محدوده در دسترس شما نیست.</p>
  const conf = { high: 0, medium: 0, low: 0 }
  for (const f of list) conf[f.report.confidence]++
  const odDec = sm.decisions.filter((d) => d.overdue).length
  return (
    <>
      <KpiBand items={[
        { label: 'پروژه‌ها', value: fa(sm.projects), tone: 'none', sub: `${fa(sm.withData)} با شاخص پیشرفت` },
        { label: 'پروژه با انحراف مهم', value: fa(sm.critical.length), tone: sm.critical.length ? 'bad' : 'good', sub: `${fa(sm.material.length)} انحراف بالاتر از آستانه` },
        { label: 'هشدار با اهمیت بالا', value: fa(sm.warnings.length), tone: sm.warnings.length ? 'warn' : 'good', sub: 'قاعده‌محور و آماری' },
        { label: 'تصمیم معوق', value: fa(odDec), tone: odDec ? 'bad' : 'good', sub: `${fa(sm.decisions.length)} تصمیم در انتظار` },
        { label: 'اعتبار داده', value: `${fa(conf.high)} / ${fa(conf.medium)} / ${fa(conf.low)}`, tone: conf.low > list.length / 3 ? 'bad' : conf.low ? 'warn' : 'good', sub: 'اطمینان بالا / متوسط / پایین' },
      ]} />

      <div className="rpx-grid2">
        <Panel title="مهم‌ترین انحرافات" sub="بالاتر از آستانه‌های مصوب، بدترین اول" help="آستانه‌ها در «تنظیمات» تعریف می‌شوند. تعریف هر شاخص در جدول انحرافات کنار همان شاخص آمده است."
          actions={<button className="rpx-btn" onClick={() => onOpen('analysis', 'deviations')}>همهٔ انحرافات</button>}>
          {!sm.material.length ? <p className="rpx-empty">انحرافی بالاتر از آستانه‌ها نیست.</p> : (
            <div className="rpx-items">{sm.material.slice(0, 6).map((d) => (
              <div key={`${d.projectId}-${d.key}`} className="rpx-item t-bad" style={{ borderInlineStartColor: 'var(--c)' }}>
                <div className="rpx-item-head"><b>{d.project}</b><Tag tone="bad">{DOMAIN_FA[d.domain]}</Tag></div>
                <p>{d.metric}: <b>{d.actual}</b> در برابر {d.reference}{d.note ? ` — ${d.note}` : ''}</p>
              </div>
            ))}</div>
          )}
        </Panel>

        <Panel title={<><AlertTriangle size={14} /> هشدارهای فعال</>} sub="نشانه‌های اولیهٔ مشکل؛ نوع هر هشدار جدا مشخص است"
          actions={<button className="rpx-btn" onClick={() => onOpen('analysis', 'warnings')}>همهٔ هشدارها</button>}>
          {!sm.warnings.length ? <p className="rpx-empty">هشدار با اهمیت بالا نیست.</p> : (
            <div className="rpx-items">{sm.warnings.slice(0, 6).map((w) => (
              <div key={`${w.projectId}-${w.key}`} className="rpx-item t-warn" style={{ borderInlineStartColor: 'var(--c)' }}>
                <div className="rpx-item-head"><b>{w.project}: {w.title}</b><Tag tone={w.kind === 'rule' ? 'acc' : 'violet'}>{WARNING_KIND_FA[w.kind]}</Tag><Tag tone={confTone(w.confidence)}>{CONF_FA[w.confidence]}</Tag></div>
                <p>{w.reason}</p>
              </div>
            ))}</div>
          )}
        </Panel>
      </div>

      <div className="rpx-grid2">
        <Panel title="پروژه‌ها و حوزه‌های بحرانی" sub="به ترتیب تعداد انحراف مهم">
          {!sm.critical.length ? <p className="rpx-empty">پروژهٔ بحرانی نیست.</p> : (
            <div className="rpx-table-wrap"><table className="rpx-table"><thead><tr><th>پروژه</th><th>انحراف مهم</th><th>حوزه‌ها</th><th /></tr></thead><tbody>
              {sm.critical.slice(0, 8).map((c) => (
                <tr key={c.projectId} className="tone-bad"><td>{c.project}</td><td>{fa(c.material)}</td><td className="rpx-sec">{c.reasons.slice(0, 3).map((r) => r.split(':')[0]).join('، ')}</td>
                  <td><button className="rpx-btn" onClick={() => onOpen('analysis', 'causes', c.projectId)}>علت‌ها</button></td></tr>
              ))}
            </tbody></table></div>
          )}
        </Panel>

        <Panel title={<><Gavel size={14} /> تصمیمات و اقدامات موردنیاز</>} sub="تصمیم‌های در انتظار، معوق‌ها اول"
          actions={<button className="rpx-btn" onClick={() => onOpen('analysis', 'actions')}>پیشنهاد اقدام</button>}>
          {!sm.decisions.length ? <p className="rpx-empty">تصمیمی در انتظار نیست.</p> : (
            <div className="rpx-items">{sm.decisions.slice(0, 6).map((d, i) => (
              <div key={i} className={`rpx-item ${d.overdue ? 't-bad' : 't-warn'}`} style={{ borderInlineStartColor: 'var(--c)' }}>
                <div className="rpx-item-head"><b>{d.title}</b>{d.overdue && <Tag tone="bad">موعد گذشته</Tag>}</div>
                <p>{d.project}{d.owner ? ` · مرجع: ${d.owner}` : ''}</p>
              </div>
            ))}</div>
          )}
        </Panel>
      </div>

      {sm.patterns.length > 0 && (
        <Panel title={<><Network size={14} /> یافته‌های بین‌پروژه‌ای</>} sub="موضوعاتی که در چند پروژه تکرار شده‌اند" help="«نیازمند تصمیم سطح بالاتر» یعنی موضوع در سه پروژه یا بیشتر دیده شده و راه‌حل آن احتمالاً در سطح طرح یا سبد است. الگوی پیمانکار فقط همبستگی است.">
          <div className="rpx-items">{sm.patterns.slice(0, 5).map((p) => (
            <div key={p.key} className={`rpx-item ${p.escalate ? 't-bad' : 't-warn'}`} style={{ borderInlineStartColor: 'var(--c)' }}>
              <div className="rpx-item-head"><b>{p.text}</b><Tag tone={p.escalate ? 'bad' : 'warn'}>{p.escalate ? 'نیازمند تصمیم سطح بالاتر' : `${fa(p.projects.length)} پروژه`}</Tag></div>
              <p>{p.projects.slice(0, 5).join('، ')} — {p.note}</p>
            </div>
          ))}</div>
        </Panel>
      )}

      <div className="rpx-doors">
        <button className="rpx-door" onClick={() => onOpen('builder')}><b><FileText size={15} /> گزارش‌ساز هوشمند</b><span>گزارش روزانه، هفتگی و ماهانه برای مدیر پروژه، مدیر طرح و مدیرعامل؛ ذخیره، Excel و PDF.</span></button>
        <button className="rpx-door" onClick={() => onOpen('analysis')}><b><Microscope size={15} /> مرکز تحلیل</b><span>انحرافات حوزه‌ای، علل ریشه‌ای، هشدارهای پیش‌نگر، مقایسهٔ پروژه‌ها و پیشنهاد اقدام.</span></button>
        <button className="rpx-door" onClick={() => onOpen('assistant')}><b><Bot size={15} /> دستیار هوشمند</b><span>پرسش فارسی دربارهٔ پروژه‌ها، با پاسخ عددی، شواهد و ارجاع به صفحهٔ مرتبط.</span></button>
      </div>
      {sm.asOf && <p className="rpx-note">آخرین ثبت شاخص پیشرفت در این محدوده: {jd(sm.asOf)}</p>}
    </>
  )
}
