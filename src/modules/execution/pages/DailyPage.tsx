import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { projectParties } from '../lib/projectParties'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { useExecutionModel } from '../lib/useExecutionModel'
import { DAILY_FORMS, FORMS, FORM_GROUP_LABEL_FA, FORM_BY_KEY, type FormGroup } from '../lib/formCatalog'
import { Chip, DataTable, KpiCard, fmtD, type Col } from '../../finance/components/fn'
import { ReportEditor } from '../components/ReportEditor'
import { ReportStatusChip, Empty, fa } from '../components/common'
import { REPORT_STATUS_LABEL_FA, type Report, type ReportStatus } from '../types'

/** Daily work reports on the price-list rows, and the technical forms (welding, radiography, coating …). */
export function DailyPage({ projectId, sub }: { projectId: string; sub: string }) {
  const m = useExecutionModel(projectId)
  const ex = useExecutionStore()
  const ex0 = useExecutionStore.getState()
  const orgs = useMasterDataStore((s) => s.organizations)
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId))
  const [open, setOpen] = useState<string | null>(null)
  const focus = useExecutionStore((x) => x.focusReportId)
  useEffect(() => { if (focus) { setOpen(focus); ex0.setFocus(null) } }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps
  const [status, setStatus] = useState<ReportStatus | ''>('')
  const [formKey, setFormKey] = useState('')
  const isWork = sub === 'work'
  const canRecord = ex.can(projectId, 'record')
  const enabled = m.settings.enabledForms
  const forms = FORMS.filter((f) => !enabled.length || enabled.includes(f.key))
  const rows = useMemo(() => m.reports.filter((r) => (isWork ? r.formKey === 'work' : r.formKey !== 'work' && (!formKey || r.formKey === formKey)) && (!status || r.status === status)).sort((a, b) => b.reportDate.localeCompare(a.reportDate) || b.reportNo.localeCompare(a.reportNo)), [m.reports, isWork, formKey, status])
  const orgName = (id: string | null) => orgs.find((o) => o.id === id)?.name ?? '—'
  const myOrg = ex.roles.find((x) => x.projectId === projectId && x.active && x.organizationId)?.organizationId ?? null

  const create = async (key: string) => {
    const front = m.settings.expectedFronts[0] ?? ''
    const id = await ex.createReport({ projectId, formKey: key, reportDate: m.today, front, contractorOrgId: projectParties(project, orgs).contractor?.id ?? myOrg })
    if (id) setOpen(id)
  }
  if (open) return <ReportEditor reportId={open} model={m} onClose={() => setOpen(null)} />

  const cols: Col<Report>[] = [
    { key: 'n', label: 'شماره', render: (r) => <span className="strong fn-code">{r.reportNo}</span>, sort: (r) => r.reportNo },
    ...(isWork ? [] : [{ key: 'f', label: 'فرم', render: (r: Report) => FORM_BY_KEY[r.formKey]?.title ?? r.formKey } as Col<Report>]),
    { key: 'd', label: 'تاریخ', render: (r) => fmtD(r.reportDate), sort: (r) => r.reportDate },
    { key: 'c', label: 'پیمانکار', render: (r) => orgName(r.contractorOrgId) },
    { key: 'fr', label: 'جبهه / ایستگاه', render: (r) => [r.front, r.station].filter(Boolean).join(' · ') || '—' },
    { key: 'l', label: 'ردیف‌ها', num: true, render: (r) => { const ls = m.linesByReport.get(r.id) ?? []; const ap = ls.filter((l) => l.status === 'approved').length; return ls.length ? `${fa(ap)} از ${fa(ls.length)} تأیید` : '—' } },
    { key: 's', label: 'وضعیت', render: (r) => <><ReportStatusChip status={r.status} />{r.completionOf && <Chip tone="warn">تکمیلی</Chip>}</> },
  ]
  const mine = (st: ReportStatus) => rows.filter((r) => r.status === st).length
  const groups = (Object.keys(FORM_GROUP_LABEL_FA) as FormGroup[]).map((g) => ({ g, items: forms.filter((f) => f.group === g) })).filter((x) => x.items.length)

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="گزارش‌ها" value={fa(rows.length)} />
        <KpiCard i={1} label="پیش‌نویس و نیازمند تکمیل" value={fa(mine('draft') + mine('incomplete'))} tone={mine('incomplete') ? 'warn' : 'neutral'} />
        <KpiCard i={2} label="در انتظار بررسی" value={fa(mine('submitted') + mine('partially_approved'))} />
        <KpiCard i={3} label="برگشت‌خورده" value={fa(mine('returned'))} tone={mine('returned') ? 'bad' : 'good'} />
      </div>
      {isWork ? (
        <div className="mt-filters no-print">
          <p className="im-helper" style={{ margin: 0 }}>برای هر روز و هر جبهه یک گزارش کارکرد بسازید؛ کارکرد روزانه و تجمعی از روی ردیف‌های فهرست‌بها خودکار حساب می‌شود و پس از ارسال، دستگاه نظارت هر ردیف را جداگانه تأیید یا رد می‌کند.</p>
          {canRecord && <button className="im-btn im-btn-primary im-btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => void create('work')}><Plus size={14} /> گزارش کارکرد جدید</button>}
        </div>
      ) : canRecord && (
        <div style={{ display: 'grid', gap: 10 }}>
          {groups.map(({ g, items }) => (
            <div key={g}><div className="im-helper" style={{ margin: '0 0 6px', fontWeight: 700 }}>{FORM_GROUP_LABEL_FA[g]}</div>
              <div className="ex-form-grid">{items.map((f) => <button key={f.key} className="ex-form-tile" onClick={() => void create(f.key)}><b>{f.title}</b><small>{f.en}{f.kind === 'record' ? ' · سابقهٔ کیفیت' : ''}</small></button>)}</div></div>
          ))}
        </div>
      )}
      <div className="mt-filters no-print">
        {!isWork && <select value={formKey} onChange={(e) => setFormKey(e.target.value)} aria-label="فرم"><option value="">همهٔ فرم‌ها</option>{DAILY_FORMS.concat(FORMS.filter((f) => f.kind === 'record')).map((f) => <option key={f.key} value={f.key}>{f.title}</option>)}</select>}
        <select value={status} onChange={(e) => setStatus(e.target.value as ReportStatus | '')} aria-label="وضعیت"><option value="">همهٔ وضعیت‌ها</option>{Object.entries(REPORT_STATUS_LABEL_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      {rows.length === 0 ? <Empty>گزارشی ثبت نشده است.</Empty> : <DataTable cols={cols} rows={rows} rowKey={(r) => r.id} onRow={(r) => setOpen(r.id)} />}
    </div>
  )
}
