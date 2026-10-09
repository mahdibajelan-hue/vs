import { useMemo, useState } from 'react'
import { Download, FileSpreadsheet, Printer } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { HelpButton } from '../../issues/components/Help'
import { useRiskData, useRiskDirectory } from '../lib/useRiskData'
import { RK_HELP } from '../lib/help'
import { analyzeActionEffects, EFFECT_VERDICT_LABEL_FA } from '../lib/riskEffect'
import { clusterSimilar, sharedFactors, FACTOR_LABEL_FA } from '../lib/riskPortfolio'
import { REGISTER_HEADERS, downloadText, downloadXlsx, printTable, registerRows } from '../lib/riskExport'
import { toCsv } from '../lib/riskImport'
import { RISK_LEVEL_LABEL_FA, todayIso } from '../lib/riskScore'
import { ZONE_LABEL_FA, levelOf } from '../lib/riskPolicy'
import { addDays, scoreAt } from '../lib/riskState'
import { RM_ACTION_STATUS_LABEL_FA, RM_ACTION_TYPE_LABEL_FA, RM_KRI_STATE_LABEL_FA, type RmRisk } from '../types'
import { useCategoryLabel } from '../components/rk'
import { supabase } from '../../../lib/supabaseClient'
import type { PageProps } from '../RiskApp'

type Cell = string | number | null
interface Rep { headers: string[]; rows: Cell[][]; riskIds: (string | null)[]; note?: string }
type GroupBy = 'project' | 'category' | 'contractor' | 'owner' | 'discipline' | 'level'

const CATALOG: { id: string; label: string }[] = [
  { id: 'register', label: 'Risk Register' }, { id: 'matrix', label: 'ماتریس و Heatmap ریسک' }, { id: 'scores', label: 'ریسک ذاتی، فعلی و باقیمانده' }, { id: 'actions', label: 'اقدامات کاهشی و میزان اثربخشی' },
  { id: 'kri', label: 'KRI و عبور از آستانه‌ها' }, { id: 'noplan', label: 'ریسک‌های بدون مالک یا برنامهٔ پاسخ' }, { id: 'review', label: 'ریسک‌های معوق یا بدون بازنگری' }, { id: 'shared', label: 'ریسک‌های مشترک بین پروژه‌ها' },
  { id: 'issues', label: 'ریسک‌های تبدیل‌شده به Issue' }, { id: 'trend', label: 'روند مواجهه با ریسک در طول زمان' }, { id: 'breakdown', label: 'ریسک به تفکیک پروژه، دسته، پیمانکار، مالک…' },
]

export function ReportsPage({ onOpenRisk }: PageProps) {
  const d = useRiskData()
  const dir = useRiskDirectory()
  const catLabel = useCategoryLabel()
  const [id, setId] = useState('register')
  const [status, setStatus] = useState<'active' | 'all'>('active')
  const [group, setGroup] = useState<GroupBy>('project')
  const [issueMap, setIssueMap] = useState<Map<string, { code: string; stage: string | null }> | null>(null)
  const today = todayIso()
  const projName = (pid: string) => d.allProjects.find((p) => p.id === pid)?.name ?? '—'
  const st = (r: RmRisk) => d.states.get(r.id)!
  const pool = useMemo(() => d.risks.filter((r) => status === 'all' || r.status !== 'closed'), [d.risks, status])
  const exportCtx = { project: projName, user: dir.name, category: catLabel, states: d.states }

  const loadIssues = async () => {
    const { data } = await supabase.from('im_issues').select('code, stage, source_ref_id').eq('source', 'risk')
    setIssueMap(new Map(((data ?? []) as { code: string; stage: string | null; source_ref_id: string }[]).map((x) => [x.source_ref_id, { code: x.code, stage: x.stage }])))
  }

  const rep: Rep = useMemo(() => {
    const riskOf = new Map(d.risks.map((r) => [r.id, r]))
    switch (id) {
      case 'register': return { headers: REGISTER_HEADERS, rows: registerRows(pool, exportCtx), riskIds: pool.map((r) => r.id) }
      case 'matrix': {
        const rows: Cell[][] = []; const ids: (string | null)[] = []
        for (const cat of [...new Set(pool.map((r) => r.category))]) { const rs = pool.filter((r) => r.category === cat); rows.push([catLabel(cat), rs.length, ...(['critical', 'high', 'medium', 'low'] as const).map((l) => rs.filter((r) => st(r).level === l).length), rs.filter((r) => st(r).outsideTolerance).length]); ids.push(null) }
        for (let i = 5; i >= 1; i--) for (let p = 1; p <= 5; p++) { const n = pool.filter((r) => st(r).currentP === p && st(r).currentI === i).length; if (n) { rows.push([`احتمال ${p} × اثر ${i} (فعلی)`, n, '', '', '', '', '']); ids.push(null) } }
        return { headers: ['دسته / خانه', 'تعداد', 'بحرانی', 'زیاد', 'متوسط', 'کم', 'خارج از تحمل'], rows, riskIds: ids, note: 'ردیف‌های بالا: Heatmap دسته × سطح؛ ردیف‌های پایین: خانه‌های ماتریس ۵×۵ فعلی' }
      }
      case 'scores': return { headers: ['کد', 'پروژه', 'عنوان', 'ذاتی', 'فعلی', 'باقیمانده', 'کاهش ٪', 'سطح فعلی', 'ناحیهٔ باقیمانده', 'روند', 'تعداد ارزیابی', 'آخرین ارزیابی'], rows: pool.map((r) => { const s = st(r); return [r.code, projName(r.projectId), r.title, s.inherent, s.current, s.residual, s.reductionPct ?? '', RISK_LEVEL_LABEL_FA[s.level], ZONE_LABEL_FA[s.residualZone], { improving: 'بهبود', stable: 'ثابت', worsening: 'وخامت' }[s.trend], s.assessmentCount, s.lastReviewDate ? formatJalali(s.lastReviewDate) : '—'] }), riskIds: pool.map((r) => r.id) }
      case 'actions': {
        const rows: Cell[][] = []; const ids: (string | null)[] = []
        for (const r of pool) for (const e of analyzeActionEffects(r, d.assessments, d.actions, today)) { const a = e.action; rows.push([r.code, projName(r.projectId), a.description, RM_ACTION_TYPE_LABEL_FA[a.actionType], dir.name(a.ownerId), a.dueDate ? formatJalali(a.dueDate) : '', RM_ACTION_STATUS_LABEL_FA[a.status], a.completionPercentage, a.status === 'completed' ? EFFECT_VERDICT_LABEL_FA[e.verdict] : '', e.before ?? '', e.after ?? '', a.effectNote]); ids.push(r.id) }
        return { headers: ['ریسک', 'پروژه', 'اقدام', 'نوع', 'مسئول', 'سررسید', 'وضعیت', 'پیشرفت ٪', 'اثر', 'امتیاز قبل', 'امتیاز بعد', 'یادداشت اثر'], rows, riskIds: ids }
      }
      case 'kri': {
        const rows: Cell[][] = []; const ids: (string | null)[] = []
        for (const k of d.kris) { rows.push([k.name, projName(k.projectId), k.riskId ? riskOf.get(k.riskId)?.code ?? '' : '—', RM_KRI_STATE_LABEL_FA[k.state], k.currentValue ?? '', k.unit, k.warnThreshold, k.criticalThreshold, k.lastReadingAt ? formatJalali(k.lastReadingAt.slice(0, 10)) : '', d.kriEvents.filter((e) => e.kriId === k.id && (e.toState === 'warn' || e.toState === 'critical')).length]); ids.push(k.riskId) }
        return { headers: ['شاخص', 'پروژه', 'ریسک', 'وضعیت', 'مقدار', 'واحد', 'آستانهٔ هشدار', 'آستانهٔ بحرانی', 'آخرین قرائت', 'تعداد عبور از آستانه'], rows, riskIds: ids }
      }
      case 'noplan': { const l = pool.filter((r) => r.status !== 'closed' && (!st(r).hasOwner || !st(r).hasPlan)); return { headers: ['کد', 'پروژه', 'عنوان', 'سطح', 'مالک', 'مشکل'], rows: l.map((r) => [r.code, projName(r.projectId), r.title, RISK_LEVEL_LABEL_FA[st(r).level], dir.name(r.ownerId), st(r).attention.filter((a) => a.startsWith('بدون')).join('، ')]), riskIds: l.map((r) => r.id) } }
      case 'review': { const l = pool.filter((r) => r.status !== 'closed' && (st(r).reviewOverdue || st(r).stale || st(r).assessmentCount === 0)); return { headers: ['کد', 'پروژه', 'عنوان', 'سطح', 'آخرین ارزیابی', 'موعد بازنگری', 'تأخیر (روز)', 'وضعیت'], rows: l.map((r) => [r.code, projName(r.projectId), r.title, RISK_LEVEL_LABEL_FA[st(r).level], st(r).lastReviewDate ? formatJalali(st(r).lastReviewDate!) : 'ندارد', formatJalali(st(r).reviewDue), Math.max(0, -st(r).reviewDaysLeft), st(r).assessmentCount === 0 ? 'ارزیابی نشده' : st(r).stale ? 'قدیمی' : 'معوق']), riskIds: l.map((r) => r.id) } }
      case 'shared': {
        const cl = clusterSimilar(d.risks); const rows: Cell[][] = []; const ids: (string | null)[] = []
        for (const c of cl) for (const m of c.members) { rows.push([`گروه ${c.id.slice(0, 4)}`, c.keywords.join('، '), m.code, projName(m.projectId), m.title, RISK_LEVEL_LABEL_FA[st(m).level]]); ids.push(m.id) }
        for (const f of sharedFactors(d.risks, d.states).filter((x) => x.kind !== 'category')) { rows.push([FACTOR_LABEL_FA[f.kind], f.label, `${f.risks} ریسک`, `${f.projects} پروژه`, '', `${f.criticalCount} بحرانی`]); ids.push(null) }
        return { headers: ['گروه / نوع منبع', 'کلیدواژه / منبع', 'ریسک', 'پروژه', 'عنوان', 'سطح'], rows, riskIds: ids }
      }
      case 'issues': { const l = d.risks.filter((r) => r.status === 'realized' || r.realizedAt); return { headers: ['کد', 'پروژه', 'عنوان', 'تاریخ تحقق', 'مسئله', 'مرحلهٔ مسئله', 'امتیاز ذاتی', 'امتیاز در زمان تحقق'], rows: l.map((r) => [r.code, projName(r.projectId), r.title, r.realizedAt ? formatJalali(r.realizedAt.slice(0, 10)) : '', issueMap?.get(r.id)?.code ?? (issueMap ? '—' : '(بارگذاری…)'), issueMap?.get(r.id)?.stage ?? '', r.initialScore, st(r).current]), riskIds: l.map((r) => r.id), note: issueMap ? undefined : 'برای دیدن کد و مرحلهٔ مسئله، «بارگذاری مسائل» را بزنید.' } }
      case 'trend': {
        const months = Array.from({ length: 12 }, (_, k) => addDays(today, -30 * (11 - k))); const pol = d.policyFor(d.scope === 'all' ? '' : d.scope)
        return { headers: ['تاریخ', 'فعال', 'بحرانی', 'زیاد', 'متوسط', 'کم', 'میانهٔ امتیاز فعلی'], rows: months.map((m) => { const xs = d.risks.map((r) => scoreAt(r, d.assessments, m)).filter(Boolean) as { current: number }[]; const lv = (l: string) => xs.filter((x) => levelOf(x.current, pol) === l).length; const sorted = xs.map((x) => x.current).sort((a, b) => a - b); return [formatJalali(m), xs.length, lv('critical'), lv('high'), lv('medium'), lv('low'), sorted.length ? sorted[Math.floor(sorted.length / 2)] : ''] }), riskIds: months.map(() => null), note: 'میانه (نه میانگین) برای جلوگیری از جمع‌زدن امتیازهای ترتیبی' }
      }
      default: {
        const keyOf = (r: RmRisk): string => ({ project: projName(r.projectId), category: catLabel(r.category), contractor: r.contractor || '—', owner: dir.name(r.ownerId), discipline: r.discipline || '—', level: RISK_LEVEL_LABEL_FA[st(r).level] })[group]
        const g = new Map<string, RmRisk[]>(); for (const r of pool.filter((x) => x.status !== 'closed')) g.set(keyOf(r), [...(g.get(keyOf(r)) ?? []), r])
        const rows = [...g.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, rs]) => [k, rs.length, ...(['critical', 'high', 'medium', 'low'] as const).map((l) => rs.filter((r) => st(r).level === l).length), rs.filter((r) => st(r).outsideTolerance).length, rs.length ? Math.round((rs.filter((r) => st(r).level === 'critical').length / rs.length) * 100) + '٪' : ''])
        return { headers: ['گروه', 'ریسک فعال', 'بحرانی', 'زیاد', 'متوسط', 'کم', 'خارج از تحمل', 'سهم بحرانی'], rows, riskIds: rows.map(() => null) }
      }
    }
  }, [id, pool, d, group, issueMap, today]) // eslint-disable-line react-hooks/exhaustive-deps

  const title = CATALOG.find((c) => c.id === id)!.label
  const filters = [status === 'active' ? 'فقط ریسک‌های فعال' : 'همهٔ وضعیت‌ها', d.scope === 'all' ? 'همهٔ پروژه‌ها' : projName(d.scope)]
  return (
    <div className="im-page">
      <div className="im-topbar"><div><div className="im-page-title">گزارش‌ها</div><div className="im-page-sub">{title} · {rep.rows.length} ردیف</div></div><div className="im-actions"><HelpButton content={RK_HELP.reports} />
        <button className="im-btn im-btn-ghost im-btn-sm" disabled={!rep.rows.length} onClick={() => printTable(title, 'مدیریت ریسک', filters, rep.headers, rep.rows) || window.alert('مرورگر پنجرهٔ چاپ را مسدود کرد.')}><Printer size={14} /> چاپ / PDF</button>
        <button className="im-btn im-btn-ghost im-btn-sm" disabled={!rep.rows.length} onClick={() => downloadXlsx('risk-' + id, [{ name: title, headers: rep.headers, rows: rep.rows }])}><FileSpreadsheet size={14} /> Excel</button>
        <button className="im-btn im-btn-ghost im-btn-sm" disabled={!rep.rows.length} onClick={() => downloadText(`risk-${id}.csv`, toCsv([rep.headers, ...rep.rows]))}><Download size={14} /> CSV</button></div></div>
      <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0, 1fr)', gap: 14, alignItems: 'start' }} className="im-cal-layout">
        <div className="im-card" style={{ padding: 8 }} role="tablist" aria-label="فهرست گزارش‌ها">
          {CATALOG.map((c) => <button key={c.id} role="tab" aria-selected={id === c.id} className={`im-tab ${id === c.id ? 'on' : ''}`} style={{ width: '100%', justifyContent: 'flex-start', borderBottom: 0, borderInlineStart: `3px solid ${id === c.id ? 'var(--im-accent)' : 'transparent'}`, textAlign: 'right', fontSize: 12.5 }} onClick={() => setId(c.id)}>{c.label}</button>)}
        </div>
        <div className="im-card">
          <div className="im-actions" style={{ marginBottom: 10 }}>
            <div className="im-seg" role="tablist">{([['active', 'ریسک‌های فعال'], ['all', 'همه']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={status === k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l}</button>)}</div>
            {id === 'breakdown' && <select value={group} onChange={(e) => setGroup(e.target.value as GroupBy)} aria-label="گروه‌بندی" style={{ width: 'auto' }}><option value="project">پروژه</option><option value="category">دسته‌بندی</option><option value="contractor">پیمانکار</option><option value="owner">مالک ریسک</option><option value="discipline">حوزهٔ تخصصی</option><option value="level">سطح</option></select>}
            {id === 'issues' && !issueMap && <button className="im-btn im-btn-ghost im-btn-sm" onClick={loadIssues}>بارگذاری مسائل</button>}
          </div>
          {rep.note && <div className="im-helper" style={{ marginBottom: 8 }}>{rep.note}</div>}
          {rep.rows.length === 0 ? <div className="im-empty">دادهای برای این گزارش نیست.</div> : (
            <div className="im-table-wrap" style={{ maxHeight: '68vh', overflow: 'auto' }}><table className="im-table"><thead><tr>{rep.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>
              {rep.rows.slice(0, 500).map((r, i) => <tr key={i} className={rep.riskIds[i] ? 'rk-row-click' : ''} onClick={() => rep.riskIds[i] && onOpenRisk(rep.riskIds[i]!)}>{r.map((c, j) => <td key={j} className={typeof c === 'number' ? '' : 'im-helper'} style={{ color: 'var(--im-text)', fontSize: 12 }}>{c === null ? '' : String(c)}</td>)}</tr>)}
            </tbody></table></div>
          )}
          {rep.rows.length > 500 && <div className="im-helper" style={{ marginTop: 6 }}>۵۰۰ ردیف اول نمایش داده می‌شود؛ خروجی Excel/CSV/چاپ همهٔ ردیف‌هاست. ردیف‌های دارای پیوند را بزنید تا ریسک باز شود (Drill-down).</div>}
        </div>
      </div>
      <style>{`@media (max-width: 900px) { .im-cal-layout { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
