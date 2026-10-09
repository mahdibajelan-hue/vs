import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Download } from 'lucide-react'
import { HelpButton } from '../../issues/components/Help'
import { Ring } from '../../issues/components/charts'
import { useRiskData, useRiskDirectory } from '../lib/useRiskData'
import { RK_HELP } from '../lib/help'
import { clusterSimilar, repeatedRiskIds } from '../lib/riskPortfolio'
import { SIZE_BAND_LABEL_FA, compareProjects, computeKpis, effectivenessBy, type KpiResult } from '../lib/riskKpi'
import { downloadXlsx } from '../lib/riskExport'
import { todayIso } from '../lib/riskScore'
import type { PageProps } from '../RiskApp'

const TONE = { ok: '#22c55e', warn: '#f59e0b', bad: '#ef4444', na: '#94a3b8' } as const
const fmt = (k: KpiResult) => (k.value === null ? '—' : k.unit === '%' ? k.value + '٪' : k.unit === '#' ? String(k.value) : `${k.value} ${k.unit}`)

export function KpiPage({ onOpenRisk }: PageProps) {
  void onOpenRisk
  const d = useRiskData()
  const dir = useRiskDirectory()
  const today = todayIso()
  const [open, setOpen] = useState<string | null>(null)
  const clusters = useMemo(() => clusterSimilar(d.risks), [d.risks])
  const ctx = useMemo(() => ({ risks: d.risks, states: d.states, assessments: d.assessments, actions: d.actions, controls: d.controls, kris: d.kris, kriEvents: d.kriEvents, repeatedRiskIds: repeatedRiskIds(clusters), today }), [d, clusters, today])
  const kpis = useMemo(() => computeKpis(ctx), [ctx])
  const compare = useMemo(() => compareProjects(ctx, [...new Set(d.risks.map((r) => r.projectId))]), [ctx, d.risks])
  const byOwner = useMemo(() => effectivenessBy(ctx, (r) => dir.name(r.ownerId)), [ctx, dir])
  const projName = (id: string) => d.allProjects.find((p) => p.id === id)?.name ?? '—'
  const groups = useMemo(() => { const m = new Map<string, typeof compare>(); for (const c of compare) m.set(c.group, [...(m.get(c.group) ?? []), c]); return [...m.entries()] }, [compare])

  const exportAll = () => downloadXlsx('risk-kpis', [
    { name: 'KPI', headers: ['شاخص', 'مقدار', 'صورت', 'مخرج', 'فرمول', 'منبع داده', 'توضیح'], rows: kpis.map((k) => [k.label, k.value ?? '', k.num ?? '', k.den ?? '', k.formula, k.source, k.note]) },
    { name: 'مقایسه پروژه‌ها', headers: ['پروژه', 'اندازه', 'مرحله', 'ریسک فعال', 'بحرانی ٪', 'خارج از تحمل ٪', 'بازنگری معوق ٪', 'بدون مالک/برنامه ٪', 'کاهش میانه ٪', 'اطمینان'], rows: compare.map((c) => [projName(c.projectId), SIZE_BAND_LABEL_FA[c.sizeBand], c.phase, c.active, c.criticalShare ?? '', c.outsideToleranceShare ?? '', c.overdueReviewShare ?? '', c.noPlanShare ?? '', c.medianReduction ?? '', c.confidence === 'low' ? 'پایین' : 'کافی']) },
  ])

  return (
    <div className="im-page">
      <div className="im-topbar"><div><div className="im-page-title">شاخص‌های عملکرد مدیریت ریسک</div><div className="im-page-sub">سیزده شاخص با فرمول و منبع داده؛ «—» یعنی داده‌ای برای محاسبه نیست</div></div><div className="im-actions"><HelpButton content={RK_HELP.kpi} /><button className="im-btn im-btn-ghost im-btn-sm" onClick={exportAll}><Download size={14} /> Excel</button></div></div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginBottom: 18 }}>
        {kpis.map((k, i) => (
          <div key={k.id} className="im-stat-card" style={{ ['--c' as string]: TONE[k.tone], ['--i' as string]: i, cursor: 'pointer' }} onClick={() => setOpen(open === k.id ? null : k.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(open === k.id ? null : k.id)} aria-expanded={open === k.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {k.unit === '%' ? <Ring value={k.value} size={64} stroke={8} color={TONE[k.tone]} label="" suffix="" /> : null}
              <div style={{ minWidth: 0 }}><div className="im-num" style={{ color: TONE[k.tone] }}>{fmt(k)}</div><div className="im-lbl">{k.label}</div></div>
              <span style={{ marginInlineStart: 'auto', color: 'var(--im-muted)' }}>{open === k.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
            </div>
            {k.note && <div className="im-helper" style={{ marginTop: 6 }}>{k.note}</div>}
            {open === k.id && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--im-line)', fontSize: 12, display: 'grid', gap: 3 }}>
                <div><b>فرمول:</b> {k.formula}</div><div><b>منبع داده:</b> {k.source}</div>
                {k.den !== null && <div><b>صورت / مخرج:</b> {k.num ?? '—'} / {k.den}</div>}
                <div><b>جهت مطلوب:</b> {k.good === 'low' ? 'کمتر بهتر است' : 'بیشتر بهتر است'}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="im-card" style={{ marginBottom: 14 }}>
        <div className="im-section-title">مقایسهٔ پروژه‌ها در گروه‌های هم‌اندازه و هم‌مرحله</div>
        <div className="im-notice info" style={{ marginBottom: 10 }}>مقایسهٔ تعداد خام ریسک بین پروژه‌های بزرگ و کوچک یا در مراحل مختلف گمراه‌کننده است. اینجا فقط نرخ‌ها (٪) و فقط داخل گروهی مقایسه می‌شوند که اندازه (تعداد ریسک فعال) و مرحلهٔ غالب چرخه عمر یکسان دارند؛ گروه‌های تک‌عضوی قابل مقایسه نیستند.</div>
        {groups.length === 0 ? <div className="im-empty">داده‌ای نیست.</div> : groups.map(([g, list]) => (
          <div key={g} style={{ marginBottom: 12 }}>
            <div className="im-helper" style={{ marginBottom: 4 }}><b>{SIZE_BAND_LABEL_FA[list[0].sizeBand]}</b> · مرحله: {list[0].phase === 'unspecified' ? 'نامشخص' : list[0].phase}{list.length < 2 ? ' — تنها پروژهٔ این گروه؛ مقایسه‌ای ممکن نیست' : ''}</div>
            <div className="im-table-wrap"><table className="rk-compare"><thead><tr><th>پروژه</th><th>فعال</th><th>بحرانی</th><th>خارج از تحمل</th><th>بازنگری معوق</th><th>بدون مالک/برنامه</th><th>کاهش (میانه)</th><th>اقدام در موعد</th></tr></thead><tbody>
              {list.map((c) => <tr key={c.projectId}><td><b>{projName(c.projectId)}</b>{c.confidence === 'low' && <span className="rk-flag" style={{ ['--c' as string]: '#94a3b8', marginInlineStart: 6 }}>اطمینان پایین</span>}</td><td>{c.active}</td>
                {[c.criticalShare, c.outsideToleranceShare, c.overdueReviewShare, c.noPlanShare].map((v, i) => <td key={i} className="rk-bar-cell" style={{ ['--c' as string]: i === 0 ? '#ef4444' : '#f59e0b' }}>{v !== null && <i style={{ width: `${v}%` }} />}<b>{v === null ? '—' : v + '٪'}</b></td>)}<td>{c.medianReduction === null ? '—' : c.medianReduction + '٪'}</td><td>{c.actionsOnTime === null ? '—' : c.actionsOnTime + '٪'}</td></tr>)}
            </tbody></table></div>
          </div>
        ))}
      </div>

      <div className="im-card">
        <div className="im-section-title">اثربخشی برنامه‌های پاسخ به تفکیک مالک ریسک</div>
        {byOwner.length === 0 ? <div className="im-helper">اقدام تکمیل‌شده‌ای نیست.</div> : <div className="im-table-wrap"><table className="rk-compare"><thead><tr><th>مالک</th><th>اقدام تکمیل‌شده</th><th>راستی‌آزمایی‌شده</th><th>اثربخشی تأییدشده</th></tr></thead><tbody>{byOwner.map((o) => <tr key={o.key}><td>{o.key}</td><td>{o.completed}</td><td>{o.verified}</td><td>{o.effectivenessPct === null ? '—' : o.effectivenessPct + '٪'}</td></tr>)}</tbody></table></div>}
      </div>
    </div>
  )
}
