import { useEffect, useMemo, useState } from 'react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { useExecutionModel } from '../lib/useExecutionModel'
import { welderStats, type Welder, type WelderQual } from '../lib/registers'
import { Chip, KpiCard, NumInput, Section, fmtD } from '../../finance/components/fn'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { Empty, fa } from '../components/common'
import { EpcGate } from '../components/epc/EpcBanner'
import { PersonnelCard, WqtPanel } from '../components/PersonnelCard'
import { KIND_FA, type PersonKind } from '../lib/personnelForms'

const ST_FA = { active: 'فعال', suspended: 'معلق', left: 'ترک کار' } as const
const today = () => new Date().toISOString().slice(0, 10)
const plus = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10)
/** valid today = at least one non-revoked qualification inside its dates */
const qualState = (qs: WelderQual[], on: string): 'valid' | 'soon' | 'expired' | 'none' => {
  const live = qs.filter((q) => q.status === 'valid')
  if (!qs.length) return 'none'
  const ok = live.filter((q) => (!q.issueDate || q.issueDate <= on) && (!q.expiryDate || q.expiryDate >= on))
  if (!ok.length) return 'expired'
  return ok.some((q) => !q.expiryDate || q.expiryDate > plus(on, 30)) ? 'valid' : 'soon'
}

/** Welder register: who may weld (identity + qualifications). The forms refer to a welder by his stamp/ID; his record of welds and radiography is derived from those forms. */
export function WeldersPage({ projectId }: { projectId: string }) { return <EpcGate><Inner projectId={projectId} /></EpcGate> }
function Inner({ projectId }: { projectId: string }) {
  const epc = useEpcStore()
  const m = useExecutionModel(projectId)
  const orgs = useMasterDataStore((s) => s.organizations)
  const can = useExecutionStore((s) => s.can(projectId, 'record') || s.can(projectId, 'review') || s.can(projectId, '*') || s.can(projectId, 'configure'))
  const [kind, setKind] = useState<PersonKind>('welder')
  const allPeople = useMemo(() => epc.welders.filter((w) => w.projectId === projectId), [epc.welders, projectId])
  const welders = useMemo(() => allPeople.filter((w) => w.kind === kind).sort((a, b) => a.key.localeCompare(b.key)), [allPeople, kind])
  const quals = useMemo(() => epc.quals.filter((q) => q.projectId === projectId), [epc.quals, projectId])
  const stats = useMemo(() => welderStats(m.lines.map((l) => ({ formKey: m.reports.find((r) => r.id === l.reportId)?.formKey ?? '', detail: l.detail }))), [m.lines, m.reports])
  const [sel, setSel] = useState('')
  const [q, setQ] = useState('')
  const [nw, setNw] = useState({ raw: '', fullName: '', nationalId: '', orgId: '' })
  const canConfirm = useExecutionStore((s) => s.can(projectId, 'review') || s.can(projectId, '*') || s.can(projectId, 'configure'))
  const on = today()
  const cur = welders.find((w) => w.id === sel)
  useEffect(() => { if (cur) void epc.loadRegisterHistory('welder', cur.id) }, [cur?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const qsOf = (id: string) => quals.filter((x) => x.welderId === id)
  const rows = welders.filter((w) => !q || `${w.raw} ${w.fullName}`.toLowerCase().includes(q.toLowerCase()))
  const add = async () => { const id = await epc.saveWelder({ projectId, kind, raw: nw.raw, fullName: nw.fullName, nationalId: nw.nationalId, orgId: nw.orgId || null }); if (id) { setNw({ raw: '', fullName: '', nationalId: '', orgId: '' }); setSel(id) } }
  const stateOf = (w: Welder) => (w.kind === 'coater' ? (w.cardStatus === 'confirmed' && w.card.validity ? (w.card.validity >= on ? (w.card.validity > plus(on, 30) ? 'valid' : 'soon') : 'expired') : 'none') : qualState(qsOf(w.id), on)) as ReturnType<typeof qualState>
  const states = welders.map(stateOf)
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6 }}>{(['welder', 'coater'] as PersonKind[]).map((k) => <button key={k} className={`im-btn im-btn-sm${kind === k ? ' im-btn-primary' : ''}`} onClick={() => { setKind(k); setSel('') }}>{KIND_FA[k]}ان ({fa(allPeople.filter((w) => w.kind === k).length)})</button>)}</div>
      <div className="fn-kpis">
        <KpiCard label={`${KIND_FA[kind]}ان ثبت‌شده`} value={fa(welders.length)} sub={`${fa(welders.filter((w) => w.status === 'active').length)} فعال`} />
        <KpiCard label="دارای صلاحیت معتبر امروز" value={fa(states.filter((s) => s === 'valid' || s === 'soon').length)} tone="good" />
        <KpiCard label="صلاحیت در ۳۰ روز آینده منقضی می‌شود" value={fa(states.filter((s) => s === 'soon').length)} tone={states.includes('soon') ? 'warn' : 'good'} />
        <KpiCard label="بدون صلاحیت معتبر" value={fa(states.filter((s) => s === 'none' || s === 'expired').length)} tone={states.some((s) => s === 'none' || s === 'expired') ? 'bad' : 'good'} hint="جوشکار بدون صلاحیت معتبر نباید در فرم‌ها انتخاب شود" />
      </div>
      {can && (
        <Section title={`${KIND_FA[kind]} جدید`} hint="شناسه همان نشانه/شماره‌ای است که در فرم‌ها می‌نویسند (مثلاً A12). هر شناسه فقط یک‌بار در پروژه ثبت می‌شود و پس از ثبت، حذف نمی‌شود؛ فقط وضعیتش تغییر می‌کند.">
          <div className="ex-sheet-grid">
            <label>شناسه / نشانه جوشکار *<input dir="ltr" value={nw.raw} onChange={(e) => setNw({ ...nw, raw: e.target.value })} /></label>
            <label>نام و نام‌خانوادگی<input dir="auto" value={nw.fullName} onChange={(e) => setNw({ ...nw, fullName: e.target.value })} /></label>
            <label>کد ملی<input dir="ltr" value={nw.nationalId} onChange={(e) => setNw({ ...nw, nationalId: e.target.value })} /></label>
            <label>شرکت / پیمانکار<select value={nw.orgId} onChange={(e) => setNw({ ...nw, orgId: e.target.value })}><option value="">—</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          </div>
          <div style={{ marginTop: 8 }}><button className="im-btn im-btn-primary im-btn-sm" disabled={!nw.raw.trim()} onClick={() => void add()}>ثبت جوشکار</button></div>
        </Section>
      )}
      <Section title={`فهرست ${KIND_FA[kind]}ان`} action={<input placeholder="جست‌وجوی شناسه یا نام…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />}>
        {rows.length === 0 ? <Empty>هنوز جوشکاری ثبت نشده است.</Empty> : (
          <div className="fn-tbl-wrap" style={{ maxHeight: 420 }}><table className="ex-lines"><thead><tr><th>شناسه</th><th>نام</th><th>شرکت</th><th>وضعیت</th><th>صلاحیت</th><th className="num">سرجوش</th><th className="num">دارای RT</th><th className="num">نرخ تعمیر</th></tr></thead>
            <tbody>{rows.map((w) => { const qs = stateOf(w), s = stats.get(w.key)
              return <tr key={w.id} onClick={() => setSel(w.id)} style={{ cursor: 'pointer', background: w.id === sel ? 'rgba(14,165,233,.1)' : undefined }}>
                <td dir="ltr"><b>{w.raw}</b></td><td>{w.fullName || '—'}</td><td>{orgs.find((o) => o.id === w.orgId)?.name ?? '—'}</td>
                <td><Chip tone={w.status === 'active' ? 'good' : 'warn'}>{ST_FA[w.status]}</Chip></td>
                <td><Chip tone={qs === 'valid' ? 'good' : qs === 'soon' ? 'warn' : 'bad'}>{{ valid: 'معتبر', soon: 'رو به انقضا', expired: 'منقضی / لغو', none: 'ثبت نشده' }[qs]}</Chip></td>
                <td className="num">{fa(s?.welds ?? 0)}</td><td className="num">{fa(s?.rtWelds ?? 0)}</td><td className="num">{s && s.rtWelds ? `${fa(Math.round((s.rtRepair / s.rtWelds) * 100))}٪` : '—'}</td></tr> })}</tbody></table></div>
        )}
      </Section>
      {cur && <Card w={cur} can={can} canConfirm={canConfirm} projectId={projectId} stats={stats.get(cur.key)} quals={qsOf(cur.id)} history={epc.registerHistory.filter((h) => h.entity === 'welder' || h.entity === 'welder_qual')} />}
    </div>
  )
}

function Card({ w, can, canConfirm, projectId, stats, quals, history }: { w: Welder; can: boolean; canConfirm: boolean; projectId: string; stats?: { welds: number; rtWelds: number; rtRepair: number }; quals: WelderQual[]; history: { entity: string; attr: string; oldValue: string | null; newValue: string | null; at: string }[] }) {
  const epc = useEpcStore()
  const blank = { wqtNo: '', process: '', position: '', materialGroup: '', thkMin: null as number | null, thkMax: null as number | null, diaMin: null as number | null, diaMax: null as number | null, issueDate: '', expiryDate: '' }
  const [f, setF] = useState(blank)
  const [d, setD] = useState({ fullName: w.fullName, nationalId: w.nationalId, status: w.status, note: w.note })
  useEffect(() => setD({ fullName: w.fullName, nationalId: w.nationalId, status: w.status, note: w.note }), [w.id, w.fullName, w.nationalId, w.status, w.note])
  const dirty = d.fullName !== w.fullName || d.nationalId !== w.nationalId || d.status !== w.status || d.note !== w.note
  return (
    <Section title={`شناسنامهٔ ${KIND_FA[w.kind]} — ${w.raw}`} hint="تغییر مشخصات و صلاحیت‌ها در تاریخچهٔ زیر ثبت می‌شود. سرجوش‌ها و نتیجهٔ RT از فرم‌های ثبت‌شده محاسبه می‌شوند و در اینجا تایپ نمی‌شوند.">
      <PersonnelCard w={w} projectId={projectId} can={can} canConfirm={canConfirm} />
      <h4 style={{ margin: '14px 0 6px' }}>وضعیت و مشخصات عمومی</h4>
      <div className="ex-sheet-grid">
        <label>نام<input disabled={!can} dir="auto" value={d.fullName} onChange={(e) => setD({ ...d, fullName: e.target.value })} /></label>
        <label>کد ملی<input disabled={!can} dir="ltr" value={d.nationalId} onChange={(e) => setD({ ...d, nationalId: e.target.value })} /></label>
        <label>وضعیت<select disabled={!can} value={d.status} onChange={(e) => setD({ ...d, status: e.target.value as Welder['status'] })}>{Object.entries(ST_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="wide">یادداشت<input disabled={!can} dir="auto" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></label>
      </div>
      {can && dirty && <div style={{ marginTop: 8 }}><button className="im-btn im-btn-primary im-btn-sm" onClick={() => void epc.saveWelder({ ...w, ...d, projectId, raw: w.raw })}>ذخیرهٔ مشخصات</button></div>}
      {w.kind === 'welder' && <p className="im-helper" style={{ margin: '10px 0 4px' }}>سابقهٔ کاری (از فرم‌ها): <b>{fa(stats?.welds ?? 0)}</b> سرجوش · <b>{fa(stats?.rtWelds ?? 0)}</b> سرجوش دارای نتیجهٔ RT · <b>{fa(stats?.rtRepair ?? 0)}</b> مورد نیازمند تعمیر</p>}
      {w.kind === 'welder' && <>
      <h4 style={{ margin: '12px 0 6px' }}>صلاحیت‌ها (WQT)</h4>
      <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>شمارهٔ WQT</th><th>فرایند</th><th>وضعیت جوش</th><th>گروه متریال</th><th>ضخامت (in)</th><th>قطر (in)</th><th>صدور</th><th>انقضا</th><th>وضعیت</th></tr></thead>
        <tbody>{quals.map((q) => <tr key={q.id}><td dir="ltr">{q.wqtNo || '—'}</td><td>{q.process || '—'}</td><td>{q.position || '—'}</td><td>{q.materialGroup || '—'}</td>
          <td dir="ltr">{q.thkMin ?? '…'} – {q.thkMax ?? '…'}</td><td dir="ltr">{q.diaMin ?? '…'} – {q.diaMax ?? '…'}</td><td>{q.issueDate ? fmtD(q.issueDate) : '—'}</td><td>{q.expiryDate ? fmtD(q.expiryDate) : '—'}</td>
          <td>{can ? <select value={q.status} onChange={(e) => void epc.saveQual({ ...q, status: e.target.value as WelderQual['status'] })}><option value="valid">معتبر</option><option value="revoked">لغو شده</option></select> : q.status === 'valid' ? 'معتبر' : 'لغو شده'}</td></tr>)}
          {quals.length === 0 && <tr><td colSpan={9} className="sub">صلاحیتی ثبت نشده است.</td></tr>}</tbody></table></div>
      {can && (
        <div className="ex-sheet-grid" style={{ marginTop: 8 }}>
          <label>شمارهٔ WQT<input dir="ltr" value={f.wqtNo} onChange={(e) => setF({ ...f, wqtNo: e.target.value })} /></label>
          <label>فرایند (SMAW/GTAW…)<input dir="ltr" value={f.process} onChange={(e) => setF({ ...f, process: e.target.value })} /></label>
          <label>وضعیت جوش (Position)<input dir="ltr" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} /></label>
          <label>گروه متریال<input dir="ltr" value={f.materialGroup} onChange={(e) => setF({ ...f, materialGroup: e.target.value })} /></label>
          <label>ضخامت از (in)<NumInput value={f.thkMin ?? 0} label="ضخامت از" decimals={3} onCommit={(n) => setF({ ...f, thkMin: n || null })} /></label>
          <label>ضخامت تا (in)<NumInput value={f.thkMax ?? 0} label="ضخامت تا" decimals={3} onCommit={(n) => setF({ ...f, thkMax: n || null })} /></label>
          <label>قطر از (in)<NumInput value={f.diaMin ?? 0} label="قطر از" decimals={2} onCommit={(n) => setF({ ...f, diaMin: n || null })} /></label>
          <label>قطر تا (in)<NumInput value={f.diaMax ?? 0} label="قطر تا" decimals={2} onCommit={(n) => setF({ ...f, diaMax: n || null })} /></label>
          <label>تاریخ صدور<JalaliDateInput value={f.issueDate} onChange={(x) => setF({ ...f, issueDate: x })} /></label>
          <label>تاریخ انقضا<JalaliDateInput value={f.expiryDate} onChange={(x) => setF({ ...f, expiryDate: x })} /></label>
          <div style={{ alignSelf: 'end' }}><button className="im-btn im-btn-primary im-btn-sm" disabled={!f.wqtNo.trim() && !f.process.trim()} onClick={async () => { if (await epc.saveQual({ projectId, welderId: w.id, ...f, issueDate: f.issueDate || null, expiryDate: f.expiryDate || null })) setF(blank) }}>افزودن صلاحیت</button></div>
        </div>
      )}
      {quals.map((q) => <WqtPanel key={q.id} q={q} w={w} can={can} canConfirm={canConfirm} />)}
      </>}
      {history.length > 0 && <details style={{ marginTop: 10 }}><summary className="im-helper">تاریخچهٔ تغییرات ({fa(history.length)})</summary><table className="ex-lines"><tbody>{history.map((h, i) => <tr key={i}><td>{fmtD(h.at.slice(0, 10))}</td><td>{h.entity === 'welder_qual' ? 'صلاحیت' : 'جوشکار'}</td><td dir="ltr">{h.attr}</td><td dir="auto">{h.oldValue ?? '—'} ← {h.newValue ?? '—'}</td></tr>)}</tbody></table></details>}
    </Section>
  )
}
