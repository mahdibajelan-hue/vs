import { ArrowUpRight, Dices } from 'lucide-react'
import { jalaliText } from '../../execution/lib/periods'
import { Section } from '../../finance/components/fn'
import { fa } from '../../execution/components/common'
import { useModuleStore } from '../../../store/useModuleStore'
import { useQuantNavStore } from '../../risk/store/useQuantNavStore'
import type { McResult } from '../lib/monteCarlo'
import type { LiveModel } from '../store/useScheduleModel'
import { Hint } from '../components/Hint'

const d = (x: string | null | undefined) => (x ? jalaliText(x) : '—')

/** The quantitative risk analysis lives in the Risk module; this tab shows what it has stored for the schedule and opens it on the same project. */
export function SchRiskLink({ projectId, m }: { projectId: string; m: LiveModel }) {
  const sims = m.st.simulations
  const open = () => { useQuantNavStore.getState().request(projectId); useModuleStore.getState().enterModule('risk') }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="im-card" style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Dices size={22} aria-hidden />
        <div style={{ flex: 1, minWidth: 220 }}>
          <b>تحلیل کمی ریسک زمان و هزینه در ماژول «مدیریت ریسک» انجام می‌شود</b> <Hint id="mc-sim" />
          <p className="im-helper" style={{ margin: '4px 0 0' }}>همان برنامهٔ جاری، تقویم و تاریخ وضعیت از اینجا خوانده می‌شود؛ ورودی‌ها ({fa(m.st.durationRisks.length)} عدم‌قطعیت مدت، {fa(m.st.riskEvents.length)} رویداد ریسکی) و نتایج ذخیره‌شده در همین پروژه می‌مانند.</p>
        </div>
        <button className="im-btn im-btn-primary" onClick={open}><ArrowUpRight size={14} /> باز کردن در مدیریت ریسک</button>
      </div>
      {sims.length > 0 && (
        <Section title="آخرین نتایج ذخیره‌شده" flush>
          <table className="ex-lines"><thead><tr><th>زمان</th><th className="num">تکرار</th><th>P50</th><th>P80</th><th>P90</th></tr></thead><tbody>
            {sims.map((s) => { const r = s.result as unknown as McResult; return <tr key={s.id}><td className="sub">{new Date(s.createdAt).toLocaleString('fa-IR')}</td><td className="num">{fa(s.iterations)}</td><td>{d(r.finish?.p50)}</td><td>{d(r.finish?.p80)}</td><td>{d(r.finish?.p90)}</td></tr> })}
          </tbody></table>
        </Section>
      )}
    </div>
  )
}
