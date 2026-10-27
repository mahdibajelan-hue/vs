import { useMemo, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download, Printer } from 'lucide-react'
import { useMasterDataStore } from '../../../masterdata/store/useMasterDataStore'
import { useFinanceStore } from '../../store/useFinanceStore'
import { useFinanceControlStore } from '../../store/useFinanceControlStore'
import { useThresholds } from '../../lib/useThresholds'
import { todayIso } from '../../lib/financeCalc'
import { computeContractorScorecard } from '../../lib/financeCalc'
import { exportFinanceReportToExcel } from '../../lib/financeExport'
import { idxToYM } from '../../lib/financeCurves'
import { JALALI_MONTHS } from '../../../../lib/jalali'
import {
  AGING_BUCKETS, STAGE_COLOR, STAGE_LABEL, STAGE_ORDER, advanceReport, agingReport, claimsReport, consumptionReport, delayByContract, delayReport, expiryCalendar, growthReport, monthlyFlow, stageSummary, type StageKey,
} from '../../lib/financeReports'
import { Chip, DataTable, KpiCard, fmtBn, fmtD, fmtPct, type Col } from '../../components/fn'
import { ChartTip, HBars, PB, Ring, Tile, axisProps, gridProps } from '../../components/charts'
import { FIN_CERTIFICATE_STATUS_LABEL_FA, FIN_CLAIM_TYPE_LABEL_FA } from '../../types'

export type ReportId = 'delay' | 'matrix' | 'aging' | 'flow' | 'consumption' | 'growth' | 'advance' | 'guarantees' | 'claims' | 'contractors'
const FULL_CATALOG: { group: string; items: { id: ReportId; label: string; hint: string }[] }[] = [
  { group: 'صورت‌وضعیت و پرداخت', items: [
    { id: 'delay', label: 'تأخیر مراحل صورت‌وضعیت', hint: 'هر صورت‌وضعیت در چهار مرحله و تجمع تأخیرها' },
    { id: 'matrix', label: 'نقشهٔ حرارتی تأخیر', hint: 'قرارداد در برابر مرحله' },
    { id: 'aging', label: 'سنی‌بندی بدهی', hint: 'مانده پرداخت‌نشده بر پایهٔ سن' },
    { id: 'flow', label: 'تأیید در برابر پرداخت', hint: 'ماه‌به‌ماه و تجمعی؛ شکاف = بدهی انباشته' },
    { id: 'advance', label: 'پیش‌پرداخت و حسن انجام کار', hint: 'استهلاک پیش‌پرداخت و کسور' },
    { id: 'contractors', label: 'کارنامهٔ پیمانکاران', hint: 'تعهد، پرداخت، تأخیر و ادعا' }] },
  { group: 'بودجه و قرارداد', items: [
    { id: 'consumption', label: 'مصرف بودجه', hint: 'به‌تفکیک ردیف یا دستهٔ هزینه' },
    { id: 'growth', label: 'رشد قراردادها', hint: 'مبلغ اولیه تا جاری و الحاقیه‌ها' }] },
  { group: 'ریسک مالی', items: [
    { id: 'guarantees', label: 'تقویم سررسید ضمانت‌نامه‌ها', hint: 'تمدید و آزادسازی' },
    { id: 'claims', label: 'ادعاها', hint: 'به‌تفکیک نوع و سن ادعاهای باز' }] },
]
const bn = (v: number) => fmtBn(v)
const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })
const monthName = (idx: number) => { const { jy, jm } = idxToYM(idx); return `${JALALI_MONTHS[jm - 1]} ${String(jy).slice(2).replace(/\d/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[+x])}` }
const heat = (d: number, max: number) => (d <= 0 || max <= 0 ? undefined : `color-mix(in srgb, #fd625e ${Math.round(15 + 55 * Math.min(1, d / max))}%, transparent)`)

/** reports of statements and payments — shown in the statements module (where statements are approved and paid) */
export const STATEMENT_REPORTS: ReportId[] = ['delay', 'matrix', 'aging', 'flow', 'advance', 'contractors']
/** reports of budget, contracts and financial risk — the finance module */
export const CONTRACT_REPORTS: ReportId[] = ['consumption', 'growth', 'guarantees', 'claims']

/** Varied reports for one project. Every report is computed by pure functions in financeReports.ts; `only` limits the catalog. */
export function ReportsCenter({ masterProjectId, only }: { masterProjectId: string; only?: ReportId[] }) {
  const CATALOG = only ? FULL_CATALOG.map((g) => ({ ...g, items: g.items.filter((i) => only.includes(i.id)) })).filter((g) => g.items.length) : FULL_CATALOG
  const [rid, setRid] = useState<ReportId>(CATALOG[0].items[0].id)
  const [contractId, setContractId] = useState('')
  const [by, setBy] = useState<'line' | 'category'>('line')
  const { thresholds } = useThresholds()
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const orgs = useMasterDataStore((s) => s.organizations)
  const allContracts = useFinanceStore((s) => s.contracts)
  const allCerts = useFinanceStore((s) => s.certificates)
  const allPays = useFinanceStore((s) => s.payments)
  const allAm = useFinanceStore((s) => s.amendments)
  const allGs = useFinanceStore((s) => s.guarantees)
  const allClaims = useFinanceStore((s) => s.claims)
  const lines = useFinanceControlStore((s) => s.budgetLines)
  const items = useFinanceControlStore((s) => s.configItems)
  const today = todayIso()

  const contracts = useMemo(() => allContracts.filter((c) => c.masterProjectId === masterProjectId), [allContracts, masterProjectId])
  const scoped = useMemo(() => contracts.filter((c) => !contractId || c.id === contractId), [contracts, contractId])
  const ids = useMemo(() => new Set(scoped.map((c) => c.id)), [scoped])
  const certs = useMemo(() => allCerts.filter((c) => ids.has(c.contractId)), [allCerts, ids])
  const pays = useMemo(() => allPays.filter((p) => certs.some((c) => c.id === p.certificateId)), [allPays, certs])
  const am = useMemo(() => allAm.filter((a) => ids.has(a.contractId)), [allAm, ids])
  const gs = useMemo(() => allGs.filter((g) => ids.has(g.contractId)), [allGs, ids])
  const claims = useMemo(() => allClaims.filter((c) => ids.has(c.contractId)), [allClaims, ids])
  const cName = (id: string) => { const c = contracts.find((x) => x.id === id); return c?.contractNumber || c?.title || '—' }
  const orgOf = (id: string) => { const c = contracts.find((x) => x.id === id); return orgs.find((o) => o.id === c?.contractorOrgId)?.name ?? '—' }

  const delays = useMemo(() => delayReport(certs.filter((c) => c.status !== 'draft'), today, thresholds), [certs, today, thresholds])
  const summary = useMemo(() => stageSummary(delays), [delays])
  const flow = useMemo(() => monthlyFlow(certs, pays), [certs, pays])
  const aging = useMemo(() => agingReport(certs, today), [certs, today])
  const cons = useMemo(() => consumptionReport({ lines: lines.filter((l) => l.masterProjectId === masterProjectId && l.isActive), contracts: scoped, amendments: am, certs, categories: new Map(items.filter((i) => i.kind === 'cost_category').map((i) => [i.key, i.label])), by }), [lines, masterProjectId, scoped, am, certs, items, by])
  const growth = useMemo(() => growthReport(scoped, am), [scoped, am])
  const adv = useMemo(() => advanceReport(scoped, am, certs), [scoped, am, certs])
  const cal = useMemo(() => expiryCalendar(gs, today), [gs, today])
  const clm = useMemo(() => claimsReport(claims, today), [claims, today])
  const score = useMemo(() => scoped.map((c) => ({ c, s: computeContractorScorecard(c, certs, claims, today, thresholds.overdueCertificateDays) })), [scoped, certs, claims, today, thresholds])

  const exportRows = (): Record<string, string | number>[] => {
    switch (rid) {
      case 'delay': return delays.map((r) => ({ قرارداد: cName(r.cert.contractId), شماره: r.cert.certificateNumber, تاریخ: fmtD(r.cert.certificateDate), ...Object.fromEntries(r.stages.flatMap((s) => [[`${STAGE_LABEL[s.stage]} (روز)`, s.days ?? ''], [`تأخیر ${STAGE_LABEL[s.stage]}`, s.delay]])), 'جمع تأخیر': r.totalDelay, 'تأخیر تجمعی': r.cumDelay, 'چرخهٔ کل (روز)': r.cycleDays }))
      case 'matrix': return delayByContract(delays).map((r) => ({ قرارداد: cName(r.contractId), تعداد: r.n, ...Object.fromEntries(STAGE_ORDER.map((s) => [STAGE_LABEL[s], r.byStage[s]])), جمع: r.total }))
      case 'aging': return aging.map((b) => ({ بازه: b.label, تعداد: b.count, 'مبلغ (ریال)': Math.round(b.amount) }))
      case 'flow': return flow.map((m) => ({ ماه: monthName(m.idx), تأییدشده: Math.round(m.certified), پرداخت‌شده: Math.round(m.paid), 'تأیید تجمعی': Math.round(m.cumCertified), 'پرداخت تجمعی': Math.round(m.cumPaid), بدهی: Math.round(m.gap) }))
      case 'consumption': return cons.map((r) => ({ عنوان: r.label, بودجه: Math.round(r.budget), تعهد: Math.round(r.committed), تأییدشده: Math.round(r.certified), پرداخت‌شده: Math.round(r.paid), مانده: Math.round(r.remaining), 'درصد تعهد': r.usedPct ?? '' }))
      case 'growth': return growth.map((r) => ({ قرارداد: r.contract.contractNumber || r.contract.title, اولیه: Math.round(r.original), جاری: Math.round(r.current), افزایش: Math.round(r.delta), درصد: r.pct, الحاقیه: r.amendments, 'تمدید (روز)': r.daysExtension }))
      case 'advance': return adv.map((r) => ({ قرارداد: r.contract.contractNumber || r.contract.title, پیش‌پرداخت: Math.round(r.advance), مستهلک‌شده: Math.round(r.recovered), مانده: Math.round(r.remaining), 'حسن انجام کار': Math.round(r.retentionHeld) }))
      case 'guarantees': return gs.map((g) => ({ قرارداد: cName(g.contractId), شماره: g.number, مبلغ: Math.round(g.amount), وضعیت: g.status, سررسید: fmtD(g.expiryDate) }))
      case 'claims': return clm.open.map((o) => ({ قرارداد: cName(o.claim.contractId), ادعا: o.claim.claimNumber, عنوان: o.claim.title, مبلغ: Math.round(o.claim.amountClaimed), 'سن (روز)': o.ageDays }))
      case 'contractors': return score.map(({ c, s }) => ({ قرارداد: c.contractNumber || c.title, پیمانکار: orgOf(c.id), تأییدشده: Math.round(s.certifiedTotal), پرداخت‌شده: Math.round(s.paidTotal), مانده: Math.round(s.outstandingTotal), 'میانگین تأخیر پرداخت': s.avgPaymentDelayDays ?? '', امتیاز: s.score }))
    }
  }
  const meta = CATALOG.flatMap((g) => g.items).find((i) => i.id === rid)!

  const totalDelay = delays.reduce((s, r) => s + r.totalDelay, 0)
  const lateCerts = delays.filter((r) => r.totalDelay > 0).length
  const worst = [...summary].sort((a, b) => (b.avgDelay ?? 0) - (a.avgDelay ?? 0))[0]
  const stackData = delays.map((r) => ({ name: `${r.cert.certificateNumber}`, full: `${cName(r.cert.contractId)} · ${r.cert.certificateNumber}`, ...Object.fromEntries(r.stages.map((s) => [s.stage, s.delay])), cum: r.cumDelay }))

  const delayCols: Col<(typeof delays)[number]>[] = [
    { key: 'n', label: 'صورت‌وضعیت', render: (r) => <><span className="strong">{r.cert.certificateNumber}</span><span className="sub">{cName(r.cert.contractId)} · {fmtD(r.cert.certificateDate)}</span></>, sort: (r) => r.cert.certificateDate },
    { key: 's', label: 'وضعیت', render: (r) => <Chip tone={r.settled ? 'good' : r.totalDelay > 0 ? 'bad' : 'neutral'}>{FIN_CERTIFICATE_STATUS_LABEL_FA[r.cert.status]}</Chip> },
    ...STAGE_ORDER.map((st): Col<(typeof delays)[number]> => ({ key: st, label: <span title={`مهلت مجاز ${fa(thresholds.stageSlaDays.submitted)} روز و …`}>{STAGE_LABEL[st]}<span className="sub" style={{ fontWeight: 400 }}>روز · تأخیر</span></span>, num: true,
      render: (r) => { const s = r.stages.find((x) => x.stage === st)!; return s.days == null ? <span style={{ opacity: .4 }}>—</span> : <span style={{ background: heat(s.delay, 40), borderRadius: 6, padding: '2px 8px', display: 'inline-block' }}>{fa(s.days)}{s.delay > 0 && <b style={{ color: '#fd625e' }}> · {fa(s.delay)}</b>}{s.open && ' ⏳'}</span> }, sort: (r) => r.stages.find((x) => x.stage === st)!.delay })),
    { key: 't', label: 'جمع تأخیر', num: true, render: (r) => <b>{fa(r.totalDelay)}</b>, sort: (r) => r.totalDelay, foot: <b>{fa(totalDelay)}</b> },
    { key: 'cu', label: 'تجمعی', num: true, render: (r) => fa(r.cumDelay), sort: (r) => r.cumDelay },
    { key: 'cy', label: 'چرخهٔ کل (روز)', num: true, render: (r) => fa(r.cycleDays), sort: (r) => r.cycleDays },
  ]

  if (!project) return <div className="fn-empty">پروژه یافت نشد.</div>
  return (
    <div className="fn-reports">
      <nav className="fn-rep-nav no-print" aria-label="فهرست گزارش‌ها">
        {CATALOG.map((g) => <div key={g.group}><h4>{g.group}</h4>{g.items.map((i) => <button key={i.id} className={i.id === rid ? 'on' : ''} onClick={() => setRid(i.id)}><b>{i.label}</b><span>{i.hint}</span></button>)}</div>)}
      </nav>
      <div className="fn-rep-body">
        <div className="fn-toolbar no-print">
          <div style={{ minWidth: 0 }}><h2 className="fn-rep-title">{meta.label}</h2><p className="im-helper" style={{ margin: 0 }}>{project.officialName} · {meta.hint}</p></div>
          <select value={contractId} onChange={(e) => setContractId(e.target.value)} aria-label="قرارداد" style={{ maxWidth: 240, marginInlineStart: 'auto' }}><option value="">همهٔ قراردادها</option>{contracts.map((c) => <option key={c.id} value={c.id}>{c.contractNumber || c.title}</option>)}</select>
          <button className="im-btn im-btn-sm" style={{ marginInlineStart: 0 }} onClick={() => void exportFinanceReportToExcel(exportRows(), `${meta.label}.xlsx`)}><Download size={14} /> اکسل</button>
          <button className="im-btn im-btn-sm" style={{ marginInlineStart: 0 }} onClick={() => window.print()}><Printer size={14} /> چاپ</button>
        </div>

        {rid === 'delay' && <>
          <div className="fn-kpis" style={{ marginBottom: 12 }}>
            <KpiCard i={0} label="جمع روزهای تأخیر" value={fa(totalDelay)} unit="روز" tone={totalDelay ? 'bad' : 'good'} sub={`${fa(lateCerts)} از ${fa(delays.length)} صورت‌وضعیت دیرکرد دارد`} />
            <KpiCard i={1} label="میانگین چرخهٔ کل" value={delays.length ? fa(delays.reduce((s, r) => s + r.cycleDays, 0) / delays.length) : '—'} unit="روز" sub="از تاریخ صورت‌وضعیت تا پرداخت" />
            <KpiCard i={2} label="کندترین مرحله" value={worst && worst.avgDelay ? STAGE_LABEL[worst.stage] : '—'} tone={worst?.avgDelay ? 'warn' : 'good'} sub={worst?.avgDelay ? `میانگین ${fa(worst.avgDelay, 1)} روز بیش از مهلت` : undefined} />
            <KpiCard i={3} label="بدون تأخیر" value={fmtPct(delays.length ? ((delays.length - lateCerts) / delays.length) * 100 : null, 0)} tone="good" />
          </div>
          <div className="fn-grid-2" style={{ marginBottom: 12 }}>
            <Tile title="تأخیر هر صورت‌وضعیت به‌تفکیک مرحله" hint="ستون‌ها: روز بیش از مهلت هر مرحله · خط: تأخیر تجمعی" span={2}>
              <div dir="ltr" style={{ height: 300 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={stackData} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid {...gridProps} /><XAxis dataKey="name" {...axisProps} /><YAxis yAxisId="a" {...axisProps} width={36} tickFormatter={(v: number) => fa(v)} /><YAxis yAxisId="b" orientation="right" {...axisProps} width={40} tickFormatter={(v: number) => fa(v)} />
                <Tooltip content={<ChartTip unit="روز" />} labelFormatter={(_, p) => (p?.[0]?.payload?.full as string) ?? ''} /><Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                {STAGE_ORDER.map((st) => <Bar key={st} yAxisId="a" stackId="d" dataKey={st} name={STAGE_LABEL[st]} fill={STAGE_COLOR[st]} radius={st === 'pay' ? [4, 4, 0, 0] : 0} />)}
                <Line yAxisId="b" type="monotone" dataKey="cum" name="تجمعی" stroke={PB.teal} strokeWidth={2.4} dot={{ r: 3 }} />
              </ComposedChart></ResponsiveContainer></div>
            </Tile>
            <Tile title="میانگین روز هر مرحله در برابر مهلت" hint="مهلت‌ها از «تنظیمات و سابقه» می‌آید">
              <HBars data={summary.map((s) => ({ name: STAGE_LABEL[s.stage], value: Math.round((s.avgDays ?? 0) * 10) / 10, color: s.avgDelay ? STAGE_COLOR[s.stage] : PB.teal }))} fmt={(v) => `${fa(v, 1)} روز`} />
              <p className="im-helper" style={{ margin: '4px 0 0' }}>مهلت‌ها: {STAGE_ORDER.map((st) => `${STAGE_LABEL[st]} ${fa(summary.length ? (delays[0]?.stages.find((s) => s.stage === st)?.sla ?? 0) : 0)}`).join(' · ')} روز</p>
            </Tile>
          </div>
          <DataTable cols={delayCols} rows={delays} rowKey={(r) => r.cert.id} empty="صورت‌وضعیتی برای گزارش نیست." foot />
        </>}

        {rid === 'matrix' && (() => {
          const rows = delayByContract(delays)
          const max = Math.max(1, ...rows.flatMap((r) => STAGE_ORDER.map((s) => r.byStage[s])))
          return <>
            <div className="fn-kpis" style={{ marginBottom: 12 }}>{summary.map((s, i) => <KpiCard key={s.stage} i={i} label={STAGE_LABEL[s.stage]} value={s.avgDelay == null ? '—' : fa(s.avgDelay, 1)} unit="روز تأخیر میانگین" tone={s.late ? 'warn' : 'good'} sub={`${fa(s.late)} از ${fa(s.n)} مورد دیرکرد · بیشترین ${fa(s.maxDelay)} روز`} />)}</div>
            <DataTable rows={rows} rowKey={(r) => r.contractId} empty="داده‌ای نیست." foot cols={[
              { key: 'c', label: 'قرارداد', render: (r) => <><span className="strong">{cName(r.contractId)}</span><span className="sub">{orgOf(r.contractId)} · {fa(r.n)} صورت‌وضعیت</span></> },
              ...STAGE_ORDER.map((st): Col<(typeof rows)[number]> => ({ key: st, label: STAGE_LABEL[st], num: true, render: (r) => <span style={{ background: heat(r.byStage[st], max), borderRadius: 6, padding: '3px 12px', display: 'inline-block', minWidth: 44 }}>{fa(r.byStage[st])}</span>, sort: (r) => r.byStage[st], foot: <b>{fa(rows.reduce((s, r) => s + r.byStage[st], 0))}</b> })),
              { key: 't', label: 'جمع (روز)', num: true, render: (r) => <b>{fa(r.total)}</b>, sort: (r) => r.total, foot: <b>{fa(rows.reduce((s, r) => s + r.total, 0))}</b> }]} />
          </>
        })()}

        {rid === 'aging' && <>
          <div className="fn-kpis" style={{ marginBottom: 12 }}>
            <KpiCard i={0} label="کل مانده پرداخت‌نشده" value={fmtBn(aging.reduce((s, b) => s + b.amount, 0))} unit="میلیارد ریال" tone="warn" sub={`${fa(aging.reduce((s, b) => s + b.count, 0))} صورت‌وضعیت`} />
            <KpiCard i={1} label="بیش از ۹۰ روز" value={fmtBn(aging[3].amount)} unit="میلیارد ریال" tone={aging[3].amount ? 'bad' : 'good'} sub={`${fa(aging[3].count)} مورد`} />
            <KpiCard i={2} label="بیش از ۶۰ روز" value={fmtBn(aging[2].amount + aging[3].amount)} unit="میلیارد ریال" tone={aging[2].amount + aging[3].amount ? 'warn' : 'good'} />
            <KpiCard i={3} label="تا ۳۰ روز" value={fmtBn(aging[0].amount)} unit="میلیارد ریال" tone="good" />
          </div>
          <Tile title="مانده پرداخت‌نشده بر پایهٔ سن" hint="سن از تاریخ ارسال صورت‌وضعیت حساب می‌شود">
            <HBars data={aging.map((b, i) => ({ name: b.label, value: b.amount / 1e9, color: [PB.teal, PB.yellow, PB.orange, PB.coral][i] }))} fmt={(v) => `${fa(v, 1)} میلیارد`} />
          </Tile>
          <div style={{ height: 12 }} />
          <DataTable rows={certs.filter((c) => c.status !== 'rejected' && c.status !== 'draft' && (c.certifiedAmount ?? c.payableAmount) - c.paidAmount - c.paidFx.fcRialEquivalent > 0).map((c) => ({ c, age: Math.max(0, Math.round((Date.parse(today) - Date.parse(c.submittedDate ?? c.certificateDate)) / 86400000)), left: (c.certifiedAmount ?? c.payableAmount) - c.paidAmount - c.paidFx.fcRialEquivalent })).sort((a, b) => b.age - a.age)} rowKey={(r) => r.c.id} empty="مانده‌ای نیست." foot cols={[
            { key: 'n', label: 'صورت‌وضعیت', render: (r) => <><span className="strong">{r.c.certificateNumber}</span><span className="sub">{cName(r.c.contractId)}</span></> },
            { key: 'a', label: 'سن (روز)', num: true, render: (r) => <span style={{ color: r.age > 90 ? '#fd625e' : r.age > 60 ? '#fe9666' : undefined }}>{fa(r.age)}</span>, sort: (r) => r.age },
            { key: 'l', label: 'مانده (میلیارد)', num: true, render: (r) => fmtBn(r.left), sort: (r) => r.left }]} />
        </>}

        {rid === 'flow' && <>
          <div className="fn-kpis" style={{ marginBottom: 12 }}>
            <KpiCard i={0} label="تأییدشدهٔ تجمعی" value={fmtBn(flow.at(-1)?.cumCertified ?? 0)} unit="میلیارد ریال" />
            <KpiCard i={1} label="پرداخت‌شدهٔ تجمعی" value={fmtBn(flow.at(-1)?.cumPaid ?? 0)} unit="میلیارد ریال" tone="good" />
            <KpiCard i={2} label="بدهی انباشته" value={fmtBn(flow.at(-1)?.gap ?? 0)} unit="میلیارد ریال" tone={(flow.at(-1)?.gap ?? 0) > 0 ? 'warn' : 'good'} />
            <KpiCard i={3} label="بیشترین شکاف" value={fmtBn(Math.max(0, ...flow.map((m) => m.gap)))} unit="میلیارد ریال" />
          </div>
          <Tile title="تأیید در برابر پرداخت" hint="ستون‌ها ماهانه؛ خط‌ها تجمعی. فاصلهٔ دو خط، بدهی انباشتهٔ کارفرما است." span={2}>
            <div dir="ltr" style={{ height: 320 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={flow.map((m) => ({ name: monthName(m.idx), certified: m.certified / 1e9, paid: m.paid / 1e9, cumC: m.cumCertified / 1e9, cumP: m.cumPaid / 1e9 }))} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid {...gridProps} /><XAxis dataKey="name" {...axisProps} /><YAxis {...axisProps} width={44} tickFormatter={(v: number) => fa(v)} />
              <Tooltip content={<ChartTip unit="میلیارد" />} /><Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
              <Bar dataKey="certified" name="تأییدشده" fill={PB.blue} radius={[4, 4, 0, 0]} /><Bar dataKey="paid" name="پرداخت‌شده" fill={PB.teal} radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="cumC" name="تأیید تجمعی" stroke={PB.violet} strokeWidth={2.4} dot={false} /><Line type="monotone" dataKey="cumP" name="پرداخت تجمعی" stroke={PB.green} strokeWidth={2.4} dot={false} />
            </ComposedChart></ResponsiveContainer></div>
          </Tile>
          <div style={{ height: 12 }} />
          <DataTable rows={flow} rowKey={(m) => String(m.idx)} empty="داده‌ای نیست." foot cols={[
            { key: 'm', label: 'ماه', render: (m) => monthName(m.idx), sort: (m) => m.idx }, { key: 'c', label: 'تأییدشده', num: true, render: (m) => bn(m.certified), foot: <b>{bn(flow.reduce((s, m) => s + m.certified, 0))}</b> },
            { key: 'p', label: 'پرداخت‌شده', num: true, render: (m) => bn(m.paid), foot: <b>{bn(flow.reduce((s, m) => s + m.paid, 0))}</b> }, { key: 'cc', label: 'تأیید تجمعی', num: true, render: (m) => bn(m.cumCertified) },
            { key: 'cp', label: 'پرداخت تجمعی', num: true, render: (m) => bn(m.cumPaid) }, { key: 'g', label: 'بدهی انباشته', num: true, render: (m) => <span style={{ color: m.gap > 0 ? '#fe9666' : undefined }}>{bn(m.gap)}</span> }]} />
        </>}

        {rid === 'consumption' && <>
          <div className="fn-toolbar no-print"><div className="fn-seg" role="group" aria-label="گروه‌بندی"><button className={by === 'line' ? 'on' : ''} onClick={() => setBy('line')}>به‌تفکیک ردیف بودجه</button><button className={by === 'category' ? 'on' : ''} onClick={() => setBy('category')}>به‌تفکیک دستهٔ هزینه</button></div></div>
          <Tile title="بودجه، تعهد و پرداخت" hint="میلیارد ریال">
            <div dir="ltr" style={{ height: Math.max(220, cons.length * 54 + 60) }}><ResponsiveContainer width="100%" height="100%"><ComposedChart layout="vertical" data={cons.map((r) => ({ name: r.label, budget: r.budget / 1e9, committed: r.committed / 1e9, paid: r.paid / 1e9 }))} margin={{ left: 8, right: 20, top: 4 }}>
              <CartesianGrid {...gridProps} horizontal={false} vertical /><XAxis type="number" {...axisProps} tickFormatter={(v: number) => fa(v)} /><YAxis type="category" dataKey="name" {...axisProps} width={120} tick={{ fontSize: 11, fill: 'var(--im-muted-2)' }} />
              <Tooltip content={<ChartTip unit="میلیارد" />} /><Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
              <Bar dataKey="budget" name="بودجه" fill={PB.sky} radius={[0, 4, 4, 0]} barSize={10} /><Bar dataKey="committed" name="تعهد" fill={PB.blue} radius={[0, 4, 4, 0]} barSize={10} /><Bar dataKey="paid" name="پرداخت" fill={PB.teal} radius={[0, 4, 4, 0]} barSize={10} />
            </ComposedChart></ResponsiveContainer></div>
          </Tile>
          <div style={{ height: 12 }} />
          <DataTable rows={cons} rowKey={(r) => r.key} empty="ردیفی نیست." foot cols={[
            { key: 'l', label: 'عنوان', render: (r) => <span className="strong">{r.label}</span> },
            { key: 'b', label: 'بودجه', num: true, render: (r) => bn(r.budget), sort: (r) => r.budget, foot: <b>{bn(cons.reduce((s, r) => s + r.budget, 0))}</b> },
            { key: 'c', label: 'تعهد', num: true, render: (r) => bn(r.committed), sort: (r) => r.committed, foot: <b>{bn(cons.reduce((s, r) => s + r.committed, 0))}</b> },
            { key: 'k', label: 'تأییدشده', num: true, render: (r) => bn(r.certified), foot: <b>{bn(cons.reduce((s, r) => s + r.certified, 0))}</b> },
            { key: 'p', label: 'پرداخت', num: true, render: (r) => bn(r.paid), foot: <b>{bn(cons.reduce((s, r) => s + r.paid, 0))}</b> },
            { key: 'r', label: 'مانده بودجه', num: true, render: (r) => <span style={{ color: r.remaining < 0 ? '#fd625e' : undefined }}>{bn(r.remaining)}</span>, sort: (r) => r.remaining },
            { key: 'u', label: 'تعهد از بودجه', num: true, render: (r) => <span style={{ color: (r.usedPct ?? 0) >= thresholds.budgetCriticalPct ? '#fd625e' : (r.usedPct ?? 0) >= thresholds.budgetWarnPct ? '#fe9666' : undefined }}>{fmtPct(r.usedPct, 0)}</span>, sort: (r) => r.usedPct ?? -1 }]} />
        </>}

        {rid === 'growth' && <>
          <Tile title="مبلغ اولیه و جاری قراردادها" hint="میلیارد ریال">
            <div dir="ltr" style={{ height: Math.max(200, growth.length * 48 + 60) }}><ResponsiveContainer width="100%" height="100%"><ComposedChart layout="vertical" data={growth.map((r) => ({ name: r.contract.contractNumber || r.contract.title, original: r.original / 1e9, current: r.current / 1e9 }))} margin={{ left: 8, right: 20 }}>
              <CartesianGrid {...gridProps} horizontal={false} vertical /><XAxis type="number" {...axisProps} tickFormatter={(v: number) => fa(v)} /><YAxis type="category" dataKey="name" {...axisProps} width={90} />
              <Tooltip content={<ChartTip unit="میلیارد" />} /><Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" /><Bar dataKey="original" name="اولیه" fill={PB.sky} barSize={12} radius={[0, 4, 4, 0]} /><Bar dataKey="current" name="جاری" fill={PB.violet} barSize={12} radius={[0, 4, 4, 0]} />
            </ComposedChart></ResponsiveContainer></div>
          </Tile>
          <div style={{ height: 12 }} />
          <DataTable rows={growth} rowKey={(r) => r.contract.id} empty="قراردادی نیست." foot cols={[
            { key: 'c', label: 'قرارداد', render: (r) => <><span className="strong">{r.contract.title || r.contract.contractNumber}</span><span className="sub">{orgOf(r.contract.id)}</span></> },
            { key: 'o', label: 'اولیه', num: true, render: (r) => bn(r.original), foot: <b>{bn(growth.reduce((s, r) => s + r.original, 0))}</b> }, { key: 'u', label: 'جاری', num: true, render: (r) => bn(r.current), foot: <b>{bn(growth.reduce((s, r) => s + r.current, 0))}</b> },
            { key: 'd', label: 'افزایش', num: true, render: (r) => bn(r.delta), sort: (r) => r.delta }, { key: 'p', label: 'درصد', num: true, render: (r) => <span style={{ color: r.pct >= thresholds.amendmentJumpPct ? '#fd625e' : undefined }}>{fmtPct(r.pct)}</span>, sort: (r) => r.pct },
            { key: 'a', label: 'الحاقیه', num: true, render: (r) => fa(r.amendments) }, { key: 'x', label: 'تمدید (روز)', num: true, render: (r) => fa(r.daysExtension) }]} />
        </>}

        {rid === 'advance' && <>
          <div className="fn-kpis" style={{ marginBottom: 12 }}>
            <KpiCard i={0} label="پیش‌پرداخت‌ها" value={fmtBn(adv.reduce((s, r) => s + r.advance, 0))} unit="میلیارد ریال" />
            <KpiCard i={1} label="مستهلک‌شده" value={fmtBn(adv.reduce((s, r) => s + r.recovered, 0))} unit="میلیارد ریال" tone="good" />
            <KpiCard i={2} label="مانده استهلاک" value={fmtBn(adv.reduce((s, r) => s + r.remaining, 0))} unit="میلیارد ریال" tone="warn" />
            <KpiCard i={3} label="حسن انجام کار کسرشده" value={fmtBn(adv.reduce((s, r) => s + r.retentionHeld, 0))} unit="میلیارد ریال" />
          </div>
          <DataTable rows={adv} rowKey={(r) => r.contract.id} empty="قراردادی نیست." foot cols={[
            { key: 'c', label: 'قرارداد', render: (r) => <><span className="strong">{r.contract.title || r.contract.contractNumber}</span><span className="sub">پیش‌پرداخت {fa(r.contract.advancePaymentPercent)}٪</span></> },
            { key: 'a', label: 'پیش‌پرداخت', num: true, render: (r) => bn(r.advance) }, { key: 'r', label: 'مستهلک', num: true, render: (r) => bn(r.recovered) }, { key: 'm', label: 'مانده', num: true, render: (r) => bn(r.remaining) },
            { key: 'p', label: 'استهلاک', render: (r) => <span style={{ display: 'inline-flex' }}><Ring pct={r.pctRecovered} label="" size={46} /></span> }, { key: 'h', label: 'حسن انجام کار', num: true, render: (r) => bn(r.retentionHeld) }]} />
        </>}

        {rid === 'guarantees' && <>
          <div className="fn-kpis" style={{ marginBottom: 12 }}>
            <KpiCard i={0} label="سررسید گذشته" value={fa(cal.overdue.count)} tone={cal.overdue.count ? 'bad' : 'good'} sub={`${fmtBn(cal.overdue.amount)} میلیارد ریال`} />
            <KpiCard i={1} label="معتبر" value={fa(gs.filter((g) => g.status === 'active').length)} sub={`${fmtBn(gs.filter((g) => g.status === 'active').reduce((s, g) => s + g.amount, 0))} میلیارد ریال`} tone="good" />
            <KpiCard i={2} label="سررسید ظرف ۶۰ روز" value={fa(gs.filter((g) => g.status === 'active' && g.expiryDate && g.expiryDate >= today && Date.parse(g.expiryDate) - Date.parse(today) <= 60 * 864e5).length)} tone="warn" />
          </div>
          <Tile title="سررسید ضمانت‌نامه‌های معتبر به‌تفکیک ماه" hint="مبلغ، میلیارد ریال">
            <div dir="ltr" style={{ height: 260 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={cal.months.map((m) => ({ name: monthName(m.idx), amount: m.amount / 1e9, count: m.count }))}>
              <CartesianGrid {...gridProps} /><XAxis dataKey="name" {...axisProps} /><YAxis {...axisProps} width={40} tickFormatter={(v: number) => fa(v)} /><Tooltip content={<ChartTip unit="میلیارد" />} /><Bar dataKey="amount" name="مبلغ" fill={PB.yellow} radius={[6, 6, 0, 0]} />
            </ComposedChart></ResponsiveContainer></div>
          </Tile>
          <div style={{ height: 12 }} />
          <DataTable rows={gs.filter((g) => g.status === 'active').sort((a, b) => ((a.expiryDate ?? '9') < (b.expiryDate ?? '9') ? -1 : 1))} rowKey={(g) => g.id} empty="ضمانت‌نامهٔ معتبری نیست." foot cols={[
            { key: 'n', label: 'ضمانت‌نامه', render: (g) => <><span className="strong">{g.number}</span><span className="sub">{cName(g.contractId)}</span></> }, { key: 'a', label: 'مبلغ (میلیارد)', num: true, render: (g) => bn(g.amount) },
            { key: 'e', label: 'سررسید', render: (g) => { const d = g.expiryDate ? Math.round((Date.parse(g.expiryDate) - Date.parse(today)) / 864e5) : null; return <>{fmtD(g.expiryDate)}{d != null && <span className="sub" style={{ color: d < 0 ? '#fd625e' : d <= 60 ? '#fe9666' : undefined }}>{d < 0 ? `${fa(-d)} روز گذشته` : `${fa(d)} روز مانده`}</span>}</> }, sort: (g) => g.expiryDate ?? '' }]} />
        </>}

        {rid === 'claims' && <>
          <div className="fn-kpis" style={{ marginBottom: 12 }}>
            <KpiCard i={0} label="ادعاهای باز" value={fa(clm.open.length)} tone={clm.open.length ? 'warn' : 'good'} />
            <KpiCard i={1} label="تعهد احتمالی" value={fmtBn(clm.open.reduce((s, o) => s + o.claim.amountClaimed, 0))} unit="میلیارد ریال" tone="warn" />
            <KpiCard i={2} label="نسبت پذیرش" value={fmtPct(clm.acceptancePct, 0)} sub="در ادعاهای تعیین‌تکلیف‌شده" />
          </div>
          <Tile title="ادعا و تأیید به‌تفکیک نوع" hint="میلیارد ریال">
            <HBars data={clm.byType.flatMap((t) => [{ name: `${FIN_CLAIM_TYPE_LABEL_FA[t.type as keyof typeof FIN_CLAIM_TYPE_LABEL_FA] ?? t.type} · ادعا`, value: t.claimed / 1e9, color: PB.coral }, { name: `${FIN_CLAIM_TYPE_LABEL_FA[t.type as keyof typeof FIN_CLAIM_TYPE_LABEL_FA] ?? t.type} · تأیید`, value: t.approved / 1e9, color: PB.teal }])} fmt={(v) => fa(v, 1)} />
          </Tile>
          <div style={{ height: 12 }} />
          <DataTable rows={clm.open} rowKey={(o) => o.claim.id} empty="ادعای بازی نیست." cols={[
            { key: 'n', label: 'ادعا', render: (o) => <><span className="strong">{o.claim.title}</span><span className="sub">{o.claim.claimNumber} · {cName(o.claim.contractId)}</span></> }, { key: 'a', label: 'مبلغ (میلیارد)', num: true, render: (o) => bn(o.claim.amountClaimed) },
            { key: 'g', label: 'سن (روز)', num: true, render: (o) => <span style={{ color: o.ageDays > thresholds.claimStaleDays ? '#fd625e' : undefined }}>{fa(o.ageDays)}</span>, sort: (o) => o.ageDays }]} />
        </>}

        {rid === 'contractors' && <DataTable rows={score} rowKey={(r) => r.c.id} empty="قراردادی نیست." foot cols={[
          { key: 'c', label: 'پیمانکار', render: (r) => <><span className="strong">{orgOf(r.c.id)}</span><span className="sub">{r.c.title || r.c.contractNumber}</span></> },
          { key: 'k', label: 'تأییدشده', num: true, render: (r) => bn(r.s.certifiedTotal), foot: <b>{bn(score.reduce((s, r) => s + r.s.certifiedTotal, 0))}</b> }, { key: 'p', label: 'پرداخت‌شده', num: true, render: (r) => bn(r.s.paidTotal), foot: <b>{bn(score.reduce((s, r) => s + r.s.paidTotal, 0))}</b> },
          { key: 'o', label: 'مانده', num: true, render: (r) => bn(r.s.outstandingTotal) }, { key: 'd', label: 'میانگین تأخیر پرداخت', num: true, render: (r) => (r.s.avgPaymentDelayDays == null ? '—' : fa(r.s.avgPaymentDelayDays)), sort: (r) => r.s.avgPaymentDelayDays ?? -1 },
          { key: 'cl', label: 'ادعای باز', num: true, render: (r) => bn(r.s.claimsExposure) }, { key: 's', label: 'امتیاز', num: true, render: (r) => <Chip tone={r.s.score >= 75 ? 'good' : r.s.score >= 50 ? 'warn' : 'bad'}>{fa(r.s.score)}</Chip>, sort: (r) => r.s.score }]} />}
        <p className="im-helper no-print" style={{ marginTop: 14 }}>همهٔ مبالغ جداول به میلیارد ریال است. مبالغ ارزی با معادل ریالی ثبت‌شده در محاسبه می‌آید. بازه‌های سنی: {AGING_BUCKETS.map((b) => b.label).join('، ')}.</p>
      </div>
    </div>
  )
}

export type { StageKey }
