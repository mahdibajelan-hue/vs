import { useMemo, useState, type ReactNode } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { ChevronDown, ChevronLeft, ClipboardList, Flame, Layers, Repeat } from 'lucide-react'
import type { MasterProject, Portfolio, Program } from '../../masterdata/types'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import type { ImIssue } from '../../issues/types'
import { useModuleStore } from '../../../store/useModuleStore'
import { useProjectContextStore } from '../../../store/useProjectContextStore'
import { formatJalali } from '../../../lib/jalali'
import { criticalOverdue, ISSUE_BANDS, issueKpi, pressureOrder, sharedCategories, signalOf, type IssueKpi, type Signal } from '../lib/issueKpiCore'
import { Empty, faNum, Kpi, Panel } from '../components/pfUi'

const today = () => new Date().toISOString().slice(0, 10)
const pct = (x: number | null) => (x == null ? '—' : `${faNum(Math.round(x * 100))}٪`)
const SIG: Record<Signal, string> = { good: '#22c55e', watch: '#f59e0b', bad: '#ef4444', none: 'var(--text-muted)' }

function Cell({ v, s }: { v: string; s?: Signal }) {
  return <td className="pf-num" style={s && s !== 'none' ? { color: SIG[s], fontWeight: 700 } : undefined}>{v}</td>
}
function KpiRow({ k }: { k: IssueKpi }) {
  return <>
    <Cell v={faNum(k.backlog)} />
    <Cell v={`${faNum(k.critical)} / ${faNum(k.high)}`} s={k.critical ? 'bad' : k.high ? 'watch' : 'good'} />
    <Cell v={pct(k.overdueRate)} s={signalOf('overdueRate', k.overdueRate)} />
    <Cell v={k.medianAge == null ? '—' : faNum(k.medianAge)} />
    <Cell v={k.mttr == null ? '—' : faNum(k.mttr)} />
    <Cell v={pct(k.onTimeRate)} s={signalOf('onTimeRate', k.onTimeRate)} />
    <Cell v={k.flowRatio == null ? '—' : faNum(k.flowRatio, 2)} s={signalOf('flowRatio', k.flowRatio)} />
    <Cell v={faNum(k.blocked)} s={k.blocked ? 'watch' : undefined} />
    <Cell v={pct(k.reopenRate)} s={signalOf('reopenRate', k.reopenRate)} />
  </>
}

interface Node { id: string; name: string; kind: 'portfolio' | 'program' | 'project'; issues: ImIssue[]; children: Node[]; mapped: boolean }

function buildTree(portfolios: Portfolio[], programs: Program[], projects: MasterProject[], issuesOf: (id: string) => ImIssue[] | undefined): Node[] {
  const proj = (p: MasterProject): Node => ({ id: p.id, name: p.officialName, kind: 'project', issues: issuesOf(p.id) ?? [], children: [], mapped: issuesOf(p.id) !== undefined })
  const sum = (c: Node[]) => c.flatMap((x) => x.issues)
  const out: Node[] = []
  for (const pf of portfolios) {
    const progs = programs.filter((g) => g.portfolioId === pf.id).map((g) => { const ch = projects.filter((p) => p.programId === g.id).map(proj); return { id: g.id, name: g.name, kind: 'program' as const, issues: sum(ch), children: ch, mapped: ch.some((c) => c.mapped) } }).filter((g) => g.children.length)
    const direct = projects.filter((p) => p.portfolioId === pf.id && !p.programId).map(proj)
    const ch = [...progs, ...direct]
    if (ch.length) out.push({ id: pf.id, name: pf.name, kind: 'portfolio', issues: sum(ch), children: ch, mapped: ch.some((c) => c.mapped) })
  }
  const rest = projects.filter((p) => !p.portfolioId).map(proj)
  if (rest.length) out.push({ id: 'none', name: 'خارج از سبد', kind: 'portfolio', issues: sum(rest), children: rest, mapped: rest.some((c) => c.mapped) })
  return out
}

/**
 * Issues and obstacles across the portfolio (moved here from the issue module's three-level analysis): one set of
 * indicators, computed from the issues themselves at every level, with the bands that colour them shown on the page.
 */
export function IssuesTab({ projects, issuesByMaster }: { projects: MasterProject[]; issuesByMaster: Map<string, ImIssue[]> | null }) {
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const d = today()
  const issuesOf = (id: string) => issuesByMaster?.get(id)
  const all = useMemo(() => projects.flatMap((p) => issuesOf(p.id) ?? []), [projects, issuesByMaster]) // eslint-disable-line react-hooks/exhaustive-deps
  const k = useMemo(() => issueKpi(all, d), [all, d])
  const tree = useMemo(() => buildTree(portfolios, programs, projects, issuesOf), [portfolios, programs, projects, issuesByMaster]) // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => pressureOrder(projects.map((p) => ({ p, kpi: issueKpi(issuesOf(p.id) ?? [], d), criticalOverdue: criticalOverdue(issuesOf(p.id) ?? [], d) }))).filter((r) => r.kpi.backlog > 0), [projects, issuesByMaster, d]) // eslint-disable-line react-hooks/exhaustive-deps
  const shared = useMemo(() => sharedCategories(projects.map((p) => ({ projectId: p.id, name: p.officialName, issues: issuesOf(p.id) ?? [] }))), [projects, issuesByMaster]) // eslint-disable-line react-hooks/exhaustive-deps
  const mapped = projects.filter((p) => issuesOf(p.id) !== undefined).length
  const uncategorised = all.length ? all.filter((i) => !i.category).length / all.length : 0

  if (!issuesByMaster) return <div className="pf-skel-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="pf-skel" />)}</div>

  const openProject = (id: string) => { useProjectContextStore.getState().setProject(id); useModuleStore.getState().enterModule('taskissue', 'project') }
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const render = (n: Node, depth: number): ReactNode[] => {
    const kk = issueKpi(n.issues, d)
    const isOpen = open.has(n.id) || (depth === 0 && tree.length === 1)
    const row = (
      <tr key={`${n.kind}-${n.id}`} className={n.kind !== 'project' ? 'pf-tree-group' : ''}>
        <td style={{ paddingInlineStart: `${0.6 + depth * 1.1}rem` }}>
          {n.kind !== 'project'
            ? <button type="button" className="pf-tree-btn" onClick={() => toggle(n.id)} aria-expanded={isOpen}>{isOpen ? <ChevronDown size={13} /> : <ChevronLeft size={13} />}<b>{n.name}</b><small className="pf-muted"> · {faNum(n.children.length)} {n.kind === 'portfolio' ? 'زیرمجموعه' : 'پروژه'}</small></button>
            : <span>{n.name}{!n.mapped && <small className="pf-muted block">به مدیریت موانع متصل نیست</small>}</span>}
        </td>
        <KpiRow k={kk} />
      </tr>
    )
    return [row, ...(isOpen ? n.children.flatMap((c) => render(c, depth + 1)) : [])]
  }

  return (
    <div className="pf-stack">
      <div className="pf-kpis">
        <Kpi icon={<ClipboardList size={14} />} label="مسائل باز" value={faNum(k.backlog)} sub={`${faNum(k.critical)} بحرانی · ${faNum(k.high)} بالا · ${faNum(k.blocked)} متوقف`} tone="#f97316" />
        <Kpi label="نرخ معوق" value={pct(k.overdueRate)} sub={`${faNum(k.overdue)} مسئلهٔ باز از مهلت گذشته`} tone={SIG[signalOf('overdueRate', k.overdueRate)]} />
        <Kpi label="سن میانهٔ مسائل باز" value={k.medianAge == null ? '—' : `${faNum(k.medianAge)} روز`} sub={k.mttr == null ? 'زمان رفع: بدون مسئلهٔ بسته‌شده در ۹۰ روز' : `زمان میانهٔ رفع: ${faNum(k.mttr)} روز${k.badDates ? ` · ${faNum(k.badDates)} مسئله با تاریخ بستنِ پیش از شناسایی کنار گذاشته شد` : ''}`} tone="#0ea5e9" />
        <Kpi label="رفع به‌موقع (۹۰ روز)" value={pct(k.onTimeRate)} sub={`${faNum(k.closed90)} مسئلهٔ بسته‌شده`} tone={SIG[signalOf('onTimeRate', k.onTimeRate)]} />
        <Kpi label="نسبت رفع به ورود (۳۰ روز)" value={k.flowRatio == null ? '—' : faNum(k.flowRatio, 2)} sub={`${faNum(k.closed30)} بسته در برابر ${faNum(k.opened30)} تازه — زیر ۱ یعنی انباشت`} tone={SIG[signalOf('flowRatio', k.flowRatio)]} />
        <Kpi icon={<Repeat size={14} />} label="بازگشایی پس از بستن" value={pct(k.reopenRate)} sub={`علت ریشه‌ای تأییدشده: ${pct(k.rootCauseRate)} · تمدید مهلت: ${pct(k.extendedRate)}`} tone={SIG[signalOf('reopenRate', k.reopenRate)]} />
      </div>

      <div className="pf-grid-2">
        <Panel title="روند موجودی مسائل باز" icon={<ClipboardList size={15} />} hint="تعداد مسائل باز در پایان هر ماه، از تاریخ شناسایی و بستن خود مسائل.">
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={k.trend.map((x) => ({ ...x, label: formatJalali(x.date).slice(2, 7) }))} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
                <Tooltip contentStyle={{ background: 'var(--bg-panel-solid)', border: '1px solid var(--border-soft)', borderRadius: 10, fontSize: 12 }} formatter={(v) => [faNum(Number(v)), 'باز']} />
                <Area dataKey="open" stroke="#f97316" fill="#f97316" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="پروژه‌های پرفشار" icon={<Flame size={15} />} hint="مرتب بر اساس مسئلهٔ مهمِ معوق، بعد معوق، بعد موجودی — ترتیب است، نه امتیاز.">
          {!rows.length ? <Empty>هیچ پروژه‌ای مسئلهٔ باز ندارد.</Empty> : (
            <ol className="pf-queue">{rows.slice(0, 7).map((r) => (
              <li key={r.p.id}>
                <div className="min-w-0"><b>{r.p.officialName}</b>
                  <div className="pf-reasons">
                    {r.criticalOverdue > 0 && <span className="pf-reason is-health">{faNum(r.criticalOverdue)} مسئلهٔ مهمِ معوق</span>}
                    <span className="pf-reason">{faNum(r.kpi.overdue)} معوق از {faNum(r.kpi.backlog)}</span>
                    {r.kpi.blocked > 0 && <span className="pf-reason is-review_due">{faNum(r.kpi.blocked)} متوقف</span>}
                  </div>
                </div>
                <button type="button" className="pf-btn" onClick={() => openProject(r.p.id)}>مسائل</button>
              </li>
            ))}</ol>
          )}
        </Panel>
      </div>

      <Panel title="سبد ← طرح ← پروژه" icon={<Layers size={15} />} hint={`شاخص هر سطح از همهٔ مسائل زیرمجموعه حساب می‌شود، نه میانگین پروژه‌ها. رنگ‌ها: معوق ≥ ${faNum(ISSUE_BANDS.overdueRate.bad * 100)}٪ قرمز، ≥ ${faNum(ISSUE_BANDS.overdueRate.watch * 100)}٪ زرد؛ رفع به ورود < ${faNum(ISSUE_BANDS.flowRatio.bad, 1)} قرمز، < ۱ زرد؛ بازگشایی ≥ ${faNum(ISSUE_BANDS.reopenRate.bad * 100)}٪ قرمز.`}>
        <div className="pf-table-wrap">
          <table className="pf-table">
            <thead><tr><th>سطح</th><th>باز</th><th>بحرانی / بالا</th><th>معوق</th><th>سن میانه (روز)</th><th>زمان رفع (روز)</th><th>به‌موقع</th><th>رفع/ورود</th><th>متوقف</th><th>بازگشایی</th></tr></thead>
            <tbody>{tree.flatMap((n) => render(n, 0))}</tbody>
          </table>
        </div>
      </Panel>

      <Panel title="دسته‌های مشترک بین پروژه‌ها" icon={<Repeat size={15} />} hint="دسته‌ای که در دو پروژه یا بیشتر تکرار شده، نشانهٔ مسئلهٔ سطح سبد است و راه‌حلش هم سطح سبد است (قرارداد، تأمین، مجوز…).">
        {!shared.length ? <Empty>دسته‌ای در بیش از یک پروژه تکرار نشده است{uncategorised > 0.3 ? `؛ ${pct(uncategorised)} مسائل دسته ندارند و این تحلیل را محدود می‌کنند` : ''}.</Empty> : (
          <ul className="pf-res-flags">{shared.slice(0, 8).map((c) => (
            <li key={c.key}><b>{c.key}</b><small className="pf-muted">{faNum(c.count)} مسئله ({faNum(c.open)} باز) در {faNum(c.projects.length)} پروژه: {c.projects.join('، ')}</small></li>
          ))}</ul>
        )}
      </Panel>

      <p className="pf-foot">
        {faNum(mapped)} از {faNum(projects.length)} پروژه به مدیریت موانع و اقدامات متصل‌اند.{uncategorised > 0 ? ` ${pct(uncategorised)} مسائل دسته ندارند.` : ''} زمان رفع و رفع به‌موقع فقط از مسائل بسته‌شده در ۹۰ روز اخیر است.
      </p>
    </div>
  )
}

