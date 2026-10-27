import { useMemo, useState } from 'react'
import { useModuleStore } from '../../../../store/useModuleStore'
import { ArrowRight, Search } from 'lucide-react'
import { useFinanceStore } from '../../store/useFinanceStore'
import { useFinanceControlStore } from '../../store/useFinanceControlStore'
import { certificatePaidTotal, claimsExposureTotal } from '../../lib/financeCalc'
import { contractFile, daysBetween, PENDING_CHANGE_STATUSES } from '../../lib/financeControl'
import { advanceStatus, CLEARANCE_FA } from '../../lib/financeInsights'
import { toneOf, type Tone } from '../../lib/financeKpis'
import { useThresholds } from '../../lib/useThresholds'
import { Chip, DataTable, KpiCard, Section, StackBar, faDigits, fmtBn, fmtD, fmtPct, splitMoney, type Col } from '../../components/fn'
import { FIN_CERTIFICATE_STATUS_LABEL_FA, FIN_CONTRACT_ROLE_LABEL_FA, FIN_CONTRACT_STATUS_LABEL_FA, FIN_GUARANTEE_STATUS_LABEL_FA, FIN_CLAIM_STATUS_LABEL_FA, type FinContract } from '../../types'
import type { FinTab } from '../../FinanceApp'

const ST_TONE: Record<string, Tone> = { active: 'good', completed: 'neutral', draft: 'neutral', suspended: 'warn', terminated: 'bad', replaced: 'neutral' }
const CERT_TONE: Record<string, Tone> = { paid: 'good', certified: 'warn', partially_paid: 'warn', rejected: 'bad', submitted: 'neutral', under_review: 'neutral', draft: 'neutral' }

interface Row { c: FinContract; f: ReturnType<typeof contractFile>; paid: number; certified: number; flags: string[]; pending: number; typeLabel: string }

/** The contract register: one line per contract with the figures a contracts manager scans first; a click opens the contract file. */
export function ContractsRegister({ masterProjectId, onGo }: { masterProjectId: string; onGo: (tab: FinTab, sub?: string) => void }) {
  const contracts = useFinanceStore((s) => s.contracts).filter((c) => c.masterProjectId === masterProjectId)
  const amendments = useFinanceStore((s) => s.amendments)
  const certificates = useFinanceStore((s) => s.certificates)
  const guarantees = useFinanceStore((s) => s.guarantees)
  const items = useFinanceControlStore((s) => s.configItems)
  const changes = useFinanceControlStore((s) => s.changes)
  const clearances = useFinanceControlStore((s) => s.clearances)
  const { thresholds } = useThresholds()
  const [status, setStatus] = useState<'all' | 'active' | 'closed'>('active')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  const rows = useMemo<Row[]>(() => contracts.map((c) => {
    const f = contractFile(c, amendments)
    const certs = certificates.filter((x) => x.contractId === c.id && x.status !== 'rejected' && x.status !== 'draft')
    const flags: string[] = []
    if (guarantees.some((g) => g.contractId === c.id && g.status === 'active' && g.expiryDate && daysBetween(g.expiryDate, today) <= thresholds.guaranteeExpiryDays)) flags.push('ضمانت‌نامه')
    if (f.increasePct >= thresholds.amendmentJumpPct) flags.push('رشد مبلغ')
    if (c.status === 'completed' && !clearances.some((x) => x.contractId === c.id && x.kind === 'social_security' && x.status === 'issued')) flags.push('مفاصاحساب')
    return { c, f, paid: certs.reduce((n, x) => n + certificatePaidTotal(x), 0), certified: certs.reduce((n, x) => n + (x.certifiedAmount ?? 0), 0), flags, pending: changes.filter((x) => x.contractId === c.id && PENDING_CHANGE_STATUSES.includes(x.status)).length, typeLabel: items.find((i) => i.kind === 'contract_type' && i.key === c.contractType)?.label ?? FIN_CONTRACT_ROLE_LABEL_FA[c.contractRole] }
  }), [contracts, amendments, certificates, guarantees, changes, clearances, items, thresholds, today])

  const shown = rows.filter((r) => (status === 'all' || (status === 'active' ? r.c.status === 'active' || r.c.status === 'suspended' || r.c.status === 'draft' : r.c.status === 'completed' || r.c.status === 'terminated' || r.c.status === 'replaced')) && (!q || `${r.c.title} ${r.c.contractNumber}`.includes(q)))
  const open = rows.find((r) => r.c.id === openId)
  if (open) return <ContractFile row={open} onBack={() => setOpenId(null)} onGo={onGo} />

  const tot = shown.reduce((a, r) => ({ o: a.o + r.f.original, c: a.c + r.f.current, p: a.p + r.paid }), { o: 0, c: 0, p: 0 })
  const cols: Col<Row>[] = [
    { key: 'n', label: 'قرارداد', render: (r) => <><span className="strong">{r.c.title || r.c.contractNumber}</span><span className="sub"><span className="fn-code">{r.c.contractNumber}</span> · {r.typeLabel}</span></>, sort: (r) => r.c.title },
    { key: 's', label: 'وضعیت', render: (r) => <Chip tone={ST_TONE[r.c.status]}>{FIN_CONTRACT_STATUS_LABEL_FA[r.c.status]}</Chip>, sort: (r) => r.c.status },
    { key: 'o', label: 'مبلغ اولیه', num: true, render: (r) => fmtBn(r.f.original), sort: (r) => r.f.original, foot: fmtBn(tot.o) },
    { key: 'cur', label: 'مبلغ جاری', num: true, render: (r) => <span className="strong">{fmtBn(r.f.current)}</span>, sort: (r) => r.f.current, foot: fmtBn(tot.c) },
    { key: 'g', label: 'رشد', num: true, render: (r) => <span style={{ color: r.f.increasePct >= thresholds.amendmentJumpPct ? 'var(--im-amber)' : undefined }}>{r.f.increasePct ? fmtPct(r.f.increasePct) : '—'}</span>, sort: (r) => r.f.increasePct },
    { key: 'p', label: 'پرداخت‌شده', w: 190, render: (r) => <div style={{ minWidth: 130 }}><StackBar max={r.f.current} segs={[{ v: r.paid, c: 'var(--im-mint)', label: 'پرداخت‌شده' }, { v: Math.max(0, r.certified - r.paid), c: 'var(--im-amber)', label: 'تأییدشده، پرداخت‌نشده' }]} /><span className="sub">{fmtPct(r.f.current ? (r.paid / r.f.current) * 100 : null, 0)} · {fmtBn(r.paid)}</span></div>, sort: (r) => (r.f.current ? r.paid / r.f.current : 0) },
    { key: 'e', label: 'پایان', render: (r) => (r.f.currentEnd ? <>{fmtD(r.f.currentEnd)}{r.f.daysExtension ? <span className="sub">+{r.f.daysExtension.toLocaleString('fa-IR')} روز تمدید</span> : null}</> : '—'), sort: (r) => r.f.currentEnd ?? '' },
    { key: 'f', label: 'توجه', render: (r) => <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{r.pending ? <Chip tone="warn">{r.pending.toLocaleString('fa-IR')} تغییر</Chip> : null}{r.flags.map((x) => <Chip key={x} tone="bad">{x}</Chip>)}{!r.pending && !r.flags.length && <span className="fn-code">—</span>}</span> },
  ]
  return (
    <div>
      <div className="fn-toolbar no-print">
        <div className="im-seg" role="group" aria-label="وضعیت">{([['active', 'جاری'], ['closed', 'پایان‌یافته'], ['all', 'همه']] as const).map(([k, l]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l}</button>)}</div>
        <label className="fn-search"><Search size={14} aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجوی عنوان یا شماره" aria-label="جست‌وجو" /></label>
        <button className="im-btn im-btn-primary im-btn-sm" onClick={() => onGo('contracts', 'manage')}>قرارداد جدید / ویرایش</button>
      </div>
      <DataTable cols={cols} rows={shown} rowKey={(r) => r.c.id} onRow={(r) => setOpenId(r.c.id)} foot empty="قراردادی با این فیلتر نیست." />
      <p className="im-helper">مبالغ به میلیارد ریال. «رشد» افزایش تجمعی مبلغ نسبت به مبلغ اولیه است؛ «توجه» موارد نیازمند پیگیری هر قرارداد را نشان می‌دهد.</p>
    </div>
  )
}

function ContractFile({ row, onBack, onGo }: { row: Row; onBack: () => void; onGo: (tab: FinTab, sub?: string) => void }) {
  const { c, f } = row
  const amendments = useFinanceStore((s) => s.amendments).filter((a) => a.contractId === c.id)
  const allCerts = useFinanceStore((s) => s.certificates)
  const certs = allCerts.filter((x) => x.contractId === c.id)
  const payments = useFinanceStore((s) => s.payments)
  const guarantees = useFinanceStore((s) => s.guarantees).filter((g) => g.contractId === c.id)
  const claims = useFinanceStore((s) => s.claims).filter((x) => x.contractId === c.id)
  const changes = useFinanceControlStore((s) => s.changes).filter((x) => x.contractId === c.id)
  const clearances = useFinanceControlStore((s) => s.clearances).filter((x) => x.contractId === c.id)
  const lines = useFinanceControlStore((s) => s.budgetLines)
  const { thresholds } = useThresholds()
  const [tab, setTab] = useState<'sum' | 'amend' | 'bill' | 'guar' | 'claims'>('sum')
  const adv = advanceStatus(c, amendments, certs)
  const today = new Date().toISOString().slice(0, 10)
  const payRows = payments.filter((p) => certs.some((x) => x.id === p.certificateId))
  const cur = splitMoney(f.current)
  const TABS = [['sum', 'خلاصه'], ['amend', `الحاقیه و تغییرات (${(amendments.length + changes.filter((x) => PENDING_CHANGE_STATUSES.includes(x.status)).length).toLocaleString('fa-IR')})`], ['bill', `صورت‌وضعیت و پرداخت (${certs.length.toLocaleString('fa-IR')})`], ['guar', 'ضمانت‌نامه و مفاصاحساب'], ['claims', `ادعاها (${claims.length.toLocaleString('fa-IR')})`]] as const

  return (
    <div>
      <button className="im-ghostlink no-print" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 10 }}><ArrowRight size={14} /> فهرست قراردادها</button>
      <div className="fn-file-head">
        <div><h2>{c.title || c.contractNumber}</h2><p><span className="fn-code">{c.contractNumber}</span> · {row.typeLabel} · <Chip tone={ST_TONE[c.status]}>{FIN_CONTRACT_STATUS_LABEL_FA[c.status]}</Chip></p></div>
        <button className="im-btn im-btn-ghost im-btn-sm no-print" onClick={() => onGo('contracts', 'manage')}>ویرایش و ثبت</button>
      </div>
      <div className="fn-kpis">
        <KpiCard i={0} label="مبلغ اولیه" value={splitMoney(f.original).v} unit={splitMoney(f.original).u} />
        <KpiCard i={1} label="مبلغ جاری (با الحاقیه)" value={cur.v} unit={cur.u} sub={f.amendmentCount ? `${fmtPct(f.increasePct)} رشد · ${f.amendmentCount.toLocaleString('fa-IR')} الحاقیه` : 'بدون الحاقیه'} tone={toneOf.growth(f.increasePct, thresholds)} />
        <KpiCard i={2} label="تأییدشده" value={splitMoney(row.certified).v} unit={splitMoney(row.certified).u} sub={`${fmtPct(f.current ? (row.certified / f.current) * 100 : null)} مبلغ جاری`} />
        <KpiCard i={3} label="پرداخت‌شده" value={splitMoney(row.paid).v} unit={splitMoney(row.paid).u} sub={`${fmtPct(f.current ? (row.paid / f.current) * 100 : null)} مبلغ جاری`} />
        <KpiCard i={4} label="مانده تعهد" value={splitMoney(f.current - row.certified).v} unit={splitMoney(f.current - row.certified).u} sub="مبلغ جاری منهای تأییدشده" />
        <KpiCard i={5} label="پایان قرارداد" value={f.currentEnd ? fmtD(f.currentEnd) : '—'} sub={f.daysExtension ? `${f.daysExtension.toLocaleString('fa-IR')} روز تمدید` : undefined} tone={f.currentEnd && daysBetween(f.currentEnd, today) < 0 && c.status === 'active' ? 'bad' : 'neutral'} />
      </div>
      <div className="fn-seg-scroll" style={{ margin: '18px 0 12px' }}><div className="im-seg" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div></div>

      {tab === 'sum' && (
        <div className="fn-cols">
          <Section title="شناسنامه">
            <dl className="fn-dl">
              <dt>نوع و نقش</dt><dd>{row.typeLabel} · {FIN_CONTRACT_ROLE_LABEL_FA[c.contractRole]}</dd>
              <dt>تاریخ شروع</dt><dd>{fmtD(c.startDate)}</dd>
              <dt>پایان مصوب</dt><dd>{fmtD(c.plannedCompletionDate)}</dd>
              <dt>پیش‌پرداخت</dt><dd>{fmtPct(c.advancePaymentPercent)}</dd>
              <dt>حسن انجام کار</dt><dd>{fmtPct(c.retentionPercent)}</dd>
              <dt>ضمانت انجام تعهدات</dt><dd>{fmtPct(c.performanceGuaranteePercent)}</dd>
              <dt>ردیف بودجه</dt><dd>{(() => { const l = lines.find((x) => x.id === c.budgetLineId); return l ? `${l.code} · ${l.title}` : 'تعیین نشده' })()}</dd>
              {c.fx.fcAmount > 0 && <><dt>بخش ارزی</dt><dd>{c.fx.fcAmount.toLocaleString('fa-IR')} {c.fx.fcCurrency} با نرخ {c.fx.exchangeRate.toLocaleString('fa-IR')}{c.fx.rateDate ? ` (${fmtD(c.fx.rateDate)})` : ' — تاریخ نرخ ثبت نشده'}</dd></>}
              {c.statusNote && <><dt>یادداشت وضعیت</dt><dd>{c.statusNote}</dd></>}
            </dl>
          </Section>
          <Section title="پیش‌پرداخت و استهلاک">
            {adv ? <><div className="fn-row-between"><span>پیش‌پرداخت {fmtBn(adv.advance)} میلیارد</span><b className="fn-num">{fmtPct(adv.recoveredPct, 0)} مستهلک</b></div><StackBar max={adv.advance} segs={[{ v: adv.recovered, c: adv.behind ? 'var(--im-coral)' : 'var(--im-mint)', label: 'مستهلک‌شده' }]} marker={(adv.certifiedPct / 100) * adv.advance} /><p className="im-helper">خط عمودی = درصد کارکرد تأییدشده ({fmtPct(adv.certifiedPct, 0)}). استهلاک باید با آن هم‌گام باشد.</p></> : <p className="im-helper">این قرارداد پیش‌پرداخت ندارد.</p>}
          </Section>
        </div>
      )}
      {tab === 'amend' && (
        <>
          <DataTable rowKey={(a) => a.id} rows={amendments} empty="الحاقیه‌ای ثبت نشده است." cols={[
            { key: 'd', label: 'تاریخ', render: (a) => fmtD(a.amendmentDate), sort: (a) => a.amendmentDate },
            { key: 'n', label: 'الحاقیه', render: (a) => <><span className="strong" style={{ textDecoration: a.voidedAt ? 'line-through' : undefined }}>{a.reason || '—'}</span><span className="sub fn-code">{a.amendmentNumber}</span></> },
            { key: 'src', label: 'منبع', render: (a) => (a.cmRequestId ? <Chip tone={a.voidedAt ? 'neutral' : 'good'}>{a.voidedAt ? 'تغییر باطل‌شده' : 'مدیریت تغییرات'}</Chip> : <Chip>ثبت دستی</Chip>) },
            { key: 'days', label: 'تمدید (روز)', num: true, render: (a) => (a.daysDelta ? a.daysDelta.toLocaleString('fa-IR') : '—') },
            { key: 'a', label: 'مبلغ (میلیارد)', num: true, render: (a) => <span style={{ color: a.amount < 0 ? 'var(--im-coral)' : undefined }}>{fmtBn(a.amount)}</span>, sort: (a) => a.amount },
          ]} />
          <Section title="تغییرات در جریان (سناریو، مصوب نیست)" hint="اثر مالی این‌ها تا تصویب در مبلغ جاری نمی‌آید" flush>
            <DataTable rowKey={(x) => x.id} rows={changes.filter((x) => PENDING_CHANGE_STATUSES.includes(x.status))} empty="تغییر در جریانی نیست." cols={[
              { key: 'n', label: 'درخواست', render: (x) => <><span className="strong">{x.title}</span><span className="sub fn-code">{x.crNumber}</span></> },
              { key: 'a', label: 'مبلغ پیشنهادی (میلیارد)', num: true, render: (x) => fmtBn(x.proposedAmount) },
              { key: 'd', label: 'روز', num: true, render: (x) => x.proposedDays.toLocaleString('fa-IR') },
            ]} />
          </Section>
        </>
      )}
      {tab === 'bill' && (
        <>
          <DataTable rowKey={(x) => x.id} rows={certs} empty="صورت‌وضعیتی ثبت نشده است." cols={[
            { key: 'n', label: 'صورت‌وضعیت', render: (x) => <><span className="strong">{faDigits(x.certificateNumber)}</span><span className="sub">{fmtD(x.certificateDate)}</span></>, sort: (x) => x.certificateDate },
            { key: 's', label: 'وضعیت', render: (x) => <Chip tone={CERT_TONE[x.status]}>{FIN_CERTIFICATE_STATUS_LABEL_FA[x.status]}</Chip> },
            { key: 'g', label: 'ناخالص', num: true, render: (x) => fmtBn(x.grossAmount), sort: (x) => x.grossAmount },
            { key: 'd', label: 'کسورات و کسر پیش‌پرداخت', num: true, render: (x) => fmtBn(x.deductions + x.retentionAmount + x.advanceRecoveryAmount) },
            { key: 'c', label: 'تأییدشده', num: true, render: (x) => (x.certifiedAmount == null ? '—' : fmtBn(x.certifiedAmount)) },
            { key: 'p', label: 'پرداخت‌شده', num: true, render: (x) => fmtBn(certificatePaidTotal(x)) },
          ]} />
          <Section title={`پرداخت‌های ثبت‌شده (${payRows.length.toLocaleString('fa-IR')})`} flush>
            <DataTable rowKey={(p) => p.id} rows={payRows} empty="پرداخت جداگانه‌ای ثبت نشده؛ پرداخت کل در خود صورت‌وضعیت می‌آید." cols={[
              { key: 'd', label: 'تاریخ', render: (p) => fmtD(p.paymentDate) }, { key: 'm', label: 'روش', render: (p) => p.method || '—' }, { key: 'r', label: 'مرجع', render: (p) => <span className="fn-code">{p.referenceNumber || '—'}</span> }, { key: 'a', label: 'مبلغ (میلیارد)', num: true, render: (p) => fmtBn(p.amount) },
            ]} />
          </Section>
          <p style={{ marginTop: 10 }}><button className="im-ghostlink" onClick={() => useModuleStore.getState().enterModule('statements', undefined, 'pay')}>تأیید صورت‌وضعیت و ثبت پرداخت در ماژول «تولید صورت‌وضعیت» ←</button></p>
        </>
      )}
      {tab === 'guar' && (
        <div className="fn-cols">
          <DataTable rowKey={(g) => g.id} rows={guarantees} empty="ضمانت‌نامه‌ای ثبت نشده است." cols={[
            { key: 'n', label: 'ضمانت‌نامه', render: (g) => <><span className="fn-code">{g.number}</span></> },
            { key: 'e', label: 'انقضا', render: (g) => { const d = g.expiryDate ? daysBetween(g.expiryDate, today) : null; return <>{fmtD(g.expiryDate)}{d != null && g.status === 'active' && <span className="sub" style={{ color: d < 0 ? 'var(--im-coral)' : d <= thresholds.guaranteeExpiryDays ? 'var(--im-amber)' : undefined }}>{d < 0 ? `${(-d).toLocaleString('fa-IR')} روز گذشته` : `${d.toLocaleString('fa-IR')} روز مانده`}</span>}</> }, sort: (g) => g.expiryDate ?? '' },
            { key: 's', label: 'وضعیت', render: (g) => <Chip tone={g.status === 'active' ? 'good' : g.status === 'expired' || g.status === 'claimed' ? 'bad' : 'neutral'}>{FIN_GUARANTEE_STATUS_LABEL_FA[g.status]}</Chip> },
            { key: 'a', label: 'مبلغ (میلیارد)', num: true, render: (g) => fmtBn(g.amount) },
          ]} />
          <DataTable rowKey={(k) => k} rows={['social_security', 'insurance', 'tax'] as const} cols={[
            { key: 'k', label: 'مفاصاحساب', render: (k) => CLEARANCE_FA[k] },
            { key: 's', label: 'وضعیت', render: (k) => { const x = clearances.find((y) => y.kind === k); return <Chip tone={x?.status === 'issued' ? 'good' : x?.status === 'expired' ? 'bad' : 'warn'}>{x ? ({ pending: 'در جریان', issued: 'صادر شد', expired: 'منقضی' } as const)[x.status] : 'ثبت نشده'}</Chip> } },
            { key: 'e', label: 'انقضا', render: (k) => fmtD(clearances.find((y) => y.kind === k)?.expiryDate ?? null) },
          ]} />
        </div>
      )}
      {tab === 'claims' && (
        <DataTable rowKey={(x) => x.id} rows={claims} empty="ادعایی ثبت نشده است." cols={[
          { key: 'n', label: 'ادعا', render: (x) => <><span className="strong">{x.title}</span><span className="sub fn-code">{x.claimNumber}</span></> },
          { key: 'd', label: 'تاریخ', render: (x) => fmtD(x.submittedDate), sort: (x) => x.submittedDate },
          { key: 's', label: 'وضعیت', render: (x) => <Chip tone={x.status === 'approved' ? 'good' : x.status === 'rejected' ? 'neutral' : 'warn'}>{FIN_CLAIM_STATUS_LABEL_FA[x.status]}</Chip> },
          { key: 'a', label: 'مبلغ ادعا (میلیارد)', num: true, render: (x) => fmtBn(x.amountClaimed), foot: undefined },
          { key: 'v', label: 'تأییدشده', num: true, render: (x) => (x.amountApproved == null ? '—' : fmtBn(x.amountApproved)) },
        ]} foot={false} />
      )}
      {tab === 'claims' && claims.length > 0 && <p className="im-helper">مجموع ادعاهای باز: {fmtBn(claimsExposureTotal(claims))} میلیارد ریال</p>}
      {tab === 'sum' && null}
    </div>
  )
}
