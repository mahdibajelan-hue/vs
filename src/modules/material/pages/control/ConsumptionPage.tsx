import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { useMasterDataStore } from '../../../masterdata/store/useMasterDataStore'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { useMaterialModel } from '../../lib/control/useMaterialModel'
import { consumptionReport, jalaliMonthKey, jalaliMonthLabel, type ConsumptionRow } from '../../lib/control/consumption'
import { weldNeeds, type MaterialNeed } from '../../lib/control/weldPlan'
import { writeXlsx } from '../../lib/control/xlsx'
import { PB, HBars, Tile } from '../../../finance/components/charts'
import { Chip, DataTable, KpiCard, NumInput, Section, type Col } from '../../../finance/components/fn'
import { JalaliDateInput } from '../../../../components/common/JalaliDateInput'
import { bn, fa } from '../../components/control/common'

type Dim = 'contractor' | 'facility' | 'front' | 'month' | 'op'
const DIMS: [Dim, string][] = [['facility', 'ایستگاه'], ['front', 'جبهه کاری'], ['contractor', 'پیمانکار'], ['op', 'نوع عملیات'], ['month', 'ماه']]

/** Use of consumables (electrodes, coating, radiography film, gases…) by contractor, station, front, period and operation, set against the norm where there is one. */
export function ConsumptionPage({ projectId }: { projectId: string; sub?: string }) {
  const m = useMaterialModel(projectId)
  const cs = useMaterialControlStore()
  const orgs = useMasterDataStore((s) => s.organizations)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [org, setOrg] = useState('')
  const [dim, setDim] = useState<Dim>('facility')
  const byId = useMemo(() => new Map(m.materials.map((x) => [x.id, x])), [m.materials])
  const norms = cs.norms.filter((n) => n.masterProjectId === projectId)
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? id
  const canEdit = cs.can(projectId, 'edit_items')

  const report = useMemo(() => consumptionReport({ materials: m.materials, groups: cs.groups, norms, txns: m.data.txns, settings: cs.settings, from: from || undefined, to: to || undefined, contractorId: org || undefined }), [m.materials, cs.groups, norms, m.data.txns, cs.settings, from, to, org])
  const valueBy = useMemo(() => {
    const acc = new Map<string, number>()
    for (const t of m.data.txns) {
      if (t.status !== 'posted' || (t.kind !== 'issue' && t.kind !== 'return')) continue
      if ((from && t.txnDate < from) || (to && t.txnDate > to) || (org && t.contractorOrgId !== org)) continue
      const x = byId.get(t.materialId); if (!x || !cs.groups.find((g) => g.id === x.groupId)?.isConsumable) continue
      const k = dim === 'contractor' ? (t.contractorOrgId ? orgName(t.contractorOrgId) : '—') : dim === 'facility' ? t.facility || '—' : dim === 'front' ? t.front || '—' : dim === 'month' ? jalaliMonthKey(t.txnDate) : t.workOp || '—'
      acc.set(k, (acc.get(k) ?? 0) + (t.kind === 'issue' ? 1 : -1) * t.qty * x.unitPrice * (x.fxRate || 1))
    }
    const out = [...acc.entries()].map(([name, value]) => ({ name: dim === 'month' ? jalaliMonthLabel(name) : name, key: name, value }))
    return (dim === 'month' ? out.sort((a, b) => a.key.localeCompare(b.key)).slice(-12) : out.sort((a, b) => b.value - a.value).slice(0, 8))
  }, [m.data.txns, byId, cs.groups, from, to, org, dim]) // eslint-disable-line react-hooks/exhaustive-deps
  const sets = cs.weldSets.filter((x) => x.masterProjectId === projectId)
  const needs = useMemo(() => { const ids = new Set(sets.map((x) => x.id)); return weldNeeds(sets, cs.weldLines.filter((l) => ids.has(l.setId)), m.positions) }, [sets, cs.weldLines, m.positions]) // eslint-disable-line react-hooks/exhaustive-deps
  const tol = 1 + cs.settings.consumptionTolerancePct / 100
  const overNeed = needs.filter((n) => n.issued > n.need * tol + 1e-9)
  const allow = (gid: string | null) => cs.groups.find((g) => g.id === gid)?.scrapAllowPct ?? cs.settings.scrapWarnPct
  const scrap = m.materials.map((x) => { const p = m.positions.get(x.id)!; return { x, p, pct: p.received > 0 ? p.scrapped / p.received : 0 } }).filter((r) => r.p.scrapped > 0).sort((a, b) => b.pct - a.pct)

  const cols: Col<ConsumptionRow>[] = [
    { key: 'm', label: 'قلم', render: (r) => <><span className="strong">{byId.get(r.materialId)?.description ?? '—'}</span><span className="sub fn-code">{byId.get(r.materialId)?.materialCode}</span></> },
    { key: 'o', label: 'عملیات', render: (r) => r.workOp || '—' },
    { key: 'a', label: 'مصرف واقعی', num: true, render: (r) => `${fa(r.actual, 2)} ${byId.get(r.materialId)?.unit ?? ''}`, sort: (r) => r.actual },
    { key: 'v', label: 'حجم فعالیت', num: true, render: (r) => (r.activityQty ? fa(r.activityQty, 1) : '—') },
  ]
  const needCols: Col<MaterialNeed>[] = [
    { key: 'm', label: 'کالا', render: (n) => <><span className="strong">{byId.get(n.materialId)?.description ?? '—'}</span><span className="sub fn-code">{byId.get(n.materialId)?.itemUid}</span></> },
    { key: 'n', label: 'نیاز محاسبه‌شده', num: true, render: (n) => `${fa(n.need, 1)} ${byId.get(n.materialId)?.unit ?? ''}`, sort: (n) => n.need },
    { key: 'u', label: 'مصرف واقعی', num: true, render: (n) => fa(n.issued, 1), sort: (n) => n.issued },
    { key: 'p', label: 'نسبت به نیاز', num: true, render: (n) => (n.need > 0 ? `${fa((n.issued / n.need) * 100, 0)}٪` : '—'), sort: (n) => (n.need > 0 ? n.issued / n.need : 0) },
    { key: 's', label: 'وضعیت', render: (n) => (n.issued > n.need * tol + 1e-9 ? <Chip tone="bad">بیش از نیاز</Chip> : <Chip tone="good">در محدوده</Chip>) },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="سطرهای مصرف" value={fa(report.length)} sub={`${fa(needs.length)} کالا دارای مبنای محاسبه`} />
        <KpiCard i={1} label="مصرف بیش از نیاز محاسبه‌شده" value={fa(overNeed.length)} tone={overNeed.length ? 'bad' : 'good'} sub={`حد مجاز انحراف ${fa(cs.settings.consumptionTolerancePct)}٪`} />
        <KpiCard i={2} label="اقلام دارای ضایعات" value={fa(scrap.length)} tone={scrap.some((r) => r.pct * 100 > allow(r.x.groupId)) ? 'warn' : 'neutral'} sub={`هشدار بالای مبنای مجاز هر گروه (پیش‌فرض ${fa(cs.settings.scrapWarnPct)}٪)`} />
        <KpiCard i={3} label="ارزش مصرف اقلام مصرفی" value={bn(valueBy.reduce((a, x) => a + x.value, 0))} unit="میلیارد ریال" />
      </div>
      <div className="mt-filters no-print">
        <span className="im-helper" style={{ margin: 0, display: 'inline-flex', gap: 6, alignItems: 'center' }}>از <span style={{ minWidth: 150 }}><JalaliDateInput value={from} onChange={setFrom} /></span></span>
        <span className="im-helper" style={{ margin: 0, display: 'inline-flex', gap: 6, alignItems: 'center' }}>تا <span style={{ minWidth: 150 }}><JalaliDateInput value={to} onChange={setTo} /></span></span>
        <select value={org} onChange={(e) => setOrg(e.target.value)} aria-label="پیمانکار"><option value="">همهٔ پیمانکارها</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        <button className="im-btn im-btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => void writeXlsx(report.map((r) => ({ 'قلم': byId.get(r.materialId)?.description ?? '', 'عملیات': r.workOp, 'مصرف واقعی': r.actual, 'حجم فعالیت': r.activityQty, 'مصرف مبنا': r.expected ?? '', 'انحراف ٪': r.deviationPct == null ? '' : Math.round(r.deviationPct * 10) / 10 })), 'مصرف.xlsx', 'مصرف')}><Download size={13} /> اکسل</button>
      </div>
      <div className="mt-two">
        <Section title="مصرف ثبت‌شده" hint="خروج و مصرف اقلام مصرفی به‌تفکیک قلم و نوع عملیات، از حواله‌های انبار" flush><DataTable cols={cols} rows={report} rowKey={(r) => r.key} empty="مصرفی ثبت نشده است. حواله مصرف را در «موجودی و انبار ← حواله انبار» ثبت کنید." /></Section>
        <Tile title="ارزش مصرف" hint="میلیارد ریال" action={<select value={dim} onChange={(e) => setDim(e.target.value as Dim)} aria-label="بر پایهٔ" style={{ width: 'auto' }}>{DIMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}>
          {valueBy.length === 0 ? <p className="im-helper" style={{ margin: '20px 0' }}>—</p> : <HBars fmt={(x) => fa(x / 1e9, 2)} data={valueBy.map((x, i) => ({ ...x, color: [PB.teal, PB.blue, PB.yellow, PB.violet, PB.orange, PB.sky, PB.green, PB.slate][i % 8] }))} />}
        </Tile>
      </div>
      <Section title="مصرف واقعی در برابر نیاز محاسبه‌شده" hint="نیاز از «جداول مبنای محاسبه اقلام مصرفی» و حجم کاری که در بالانس وارد شده حساب می‌شود؛ مصرف واقعی از حواله‌های انبار." flush>
        <DataTable cols={needCols} rows={needs} rowKey={(n) => n.materialId} empty="جدول مبنا یا حجم کار تعریف نشده است؛ «جداول مبنای محاسبه اقلام مصرفی» و «بالانس ← برآورد اقلام مصرفی» را تکمیل کنید." />
      </Section>
      <Section title="مبنای مجاز ضایعات هر گروه" hint="درصد مجاز ضایعات از کالای دریافتی؛ قابل ویرایش. خالی یعنی پیش‌فرض پروژه (تنظیمات ← آستانه‌ها)." flush>
        <DataTable rows={cs.groups.filter((g) => g.active)} rowKey={(g) => g.id} empty="گروهی تعریف نشده است." cols={[{ key: 'g', label: 'گروه کالا', render: (g) => <span className="strong">{g.title}</span> }, { key: 'a', label: 'مجاز (٪ از دریافتی)', num: true, render: (g) => (canEdit ? <NumInput value={g.scrapAllowPct ?? 0} label={`مبنای ضایعات ${g.title}`} decimals={2} onCommit={(n) => void cs.setGroupScrapAllow(g.id, n > 0 ? n : null)} /> : g.scrapAllowPct == null ? '—' : fa(g.scrapAllowPct, 2)) }, { key: 'e', label: 'مبنای مؤثر', num: true, render: (g) => (g.scrapAllowPct == null ? <span className="sub">{fa(cs.settings.scrapWarnPct)}٪ (پیش‌فرض)</span> : `${fa(g.scrapAllowPct, 2)}٪`) }]} />
      </Section>
      <Section title="ضایعات" hint="ضایعات تأییدشده نسبت به کالای دریافتی هر قلم" flush>
        <DataTable rows={scrap} rowKey={(r) => r.x.id} empty="ضایعاتی ثبت نشده است." cols={[{ key: 'm', label: 'قلم', render: (r) => <span className="strong">{r.x.description}</span> }, { key: 's', label: 'ضایعات', num: true, render: (r) => `${fa(r.p.scrapped, 2)} ${r.x.unit}` }, { key: 'r', label: 'دریافتی', num: true, render: (r) => fa(r.p.received, 2) }, { key: 'al', label: 'مجاز', num: true, render: (r) => `${fa(allow(r.x.groupId), 1)}٪` }, { key: 'p', label: 'سهم ضایعات', num: true, render: (r) => <span style={{ color: r.pct * 100 > allow(r.x.groupId) ? 'var(--im-coral)' : undefined }}>{fa(r.pct * 100, 1)}٪</span>, sort: (r) => r.pct }]} />
      </Section>
    </div>
  )
}
