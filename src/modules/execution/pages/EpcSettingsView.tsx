import { useEffect, useState } from 'react'
import { useExecutionStore } from '../store/useExecutionStore'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionModel } from '../lib/useExecutionModel'
import { epcSettings } from '../lib/epcSettings'
import { compressImage } from '../../../lib/imageTools'
import { Chip, Section } from '../../finance/components/fn'
import { EpcGate } from '../components/epc/EpcBanner'
import { fa } from '../components/common'
import { EMPLOYER_STEP_LABEL_FA, LOGO_MAX_BYTES, LOGO_TYPES, type EmployerStep, type Parties } from '../epcTypes'
import type { ExSettings } from '../types'

type Raw = Record<string, unknown>
const num = (v: string, d: number) => (v === '' ? d : Number(v))

export function EpcSettingsView(p: { projectId: string }) { return <EpcGate><Inner {...p} /></EpcGate> }
function Inner({ projectId }: { projectId: string }) {
  const ex = useExecutionStore()
  const m = useExecutionModel(projectId)
  const s = epcSettings(m.settings as unknown as Raw)
  const canCfg = ex.can(projectId, '*') || ex.can(projectId, 'configure')
  const save = (patch: Raw) => ex.saveSettings(projectId, patch as Partial<ExSettings>)
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {!canCfg && <p className="im-helper" style={{ margin: 0 }}>فقط مدیر پروژه یا مدیر سامانه می‌تواند این تنظیمات را تغییر دهد.</p>}
      <Section title="مرحلهٔ کارفرما" hint="اگر برای پروژه لازم نیست، غیرفعال بماند؛ گردش کار پیمانکار ← نظارت بدون وقفه کار می‌کند">
        <div style={{ display: 'grid', gap: 6 }}>{(Object.keys(EMPLOYER_STEP_LABEL_FA) as EmployerStep[]).map((k) => (
          <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><input type="radio" name="emp" disabled={!canCfg} checked={s.employerStep === k} onChange={() => void save({ employerStep: k })} /><span>{EMPLOYER_STEP_LABEL_FA[k]}</span></label>
        ))}</div>
      </Section>
      <Parties parties={s.parties} can={canCfg} onSave={(parties) => save({ parties })} />
      <LegalView projectId={projectId} />
      <Section title="پارامترهای موتور بهره‌وری" hint="هر عدد در خروجی‌ها به‌عنوان فرض نمایش داده می‌شود">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label className="ex-lab">پنجرهٔ تاریخی (روز)<input type="number" min={7} disabled={!canCfg} value={s.productivity.windowDays} onChange={(e) => void save({ productivity: { ...s.productivity, windowDays: num(e.target.value, 28) } })} style={{ width: 90 }} /></label>
          <label className="ex-lab">وزن‌دهی<select disabled={!canCfg} value={s.productivity.weighting} onChange={(e) => void save({ productivity: { ...s.productivity, weighting: e.target.value } })}><option value="wma">وزنی (روزهای اخیر مهم‌تر)</option><option value="sma">میانگین متحرک</option><option value="all">میانگین ساده</option></select></label>
          <label className="ex-lab">طول میانگین متحرک (روز)<input type="number" min={2} disabled={!canCfg} value={s.productivity.smaDays} onChange={(e) => void save({ productivity: { ...s.productivity, smaDays: num(e.target.value, 7) } })} style={{ width: 90 }} /></label>
          <label className="ex-lab">آستانهٔ حذف پرت (σ مقاوم)<input type="number" step="0.5" min={2} disabled={!canCfg} value={s.productivity.outlierSigma} onChange={(e) => void save({ productivity: { ...s.productivity, outlierSigma: num(e.target.value, 3.5) } })} style={{ width: 90 }} /></label>
          <label className="ex-lab">کشش فرضی خروجی نسبت به منبع (۰ تا ۱)<input type="number" step="0.05" min={0} max={1} disabled={!canCfg} value={s.productivity.assumedElasticity} onChange={(e) => void save({ productivity: { ...s.productivity, assumedElasticity: num(e.target.value, 0.6) } })} style={{ width: 110 }} /></label>
          <label className="ex-lab">بازده شیفت دوم نسبت به شیفت روز<input type="number" step="0.05" min={0} max={1} disabled={!canCfg} value={s.productivity.extraShiftEfficiency} onChange={(e) => void save({ productivity: { ...s.productivity, extraShiftEfficiency: num(e.target.value, 0.8) } })} style={{ width: 110 }} /></label>
          <label className="ex-lab">هزینهٔ تقریبی یک اکیپ در روز (ریال) — اختیاری<input type="number" min={0} disabled={!canCfg} value={s.productivity.crewDayCost ?? ''} onChange={(e) => void save({ productivity: { ...s.productivity, crewDayCost: e.target.value === '' ? null : Number(e.target.value) } })} style={{ width: 150 }} /></label>
        </div>
        <p className="im-helper" style={{ margin: '8px 0 0' }}>اگر هزینه وارد نشود، ستون هزینهٔ سناریوها «—» می‌ماند؛ هزینه‌ای ساخته نمی‌شود.</p>
      </Section>
      <Section title="آستانهٔ هشدارها">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{([['spiWarn', 'SPI هشدار'], ['spiCritical', 'SPI بحرانی'], ['onTimeWarn', 'احتمال اتمام در موعد — هشدار'], ['onTimeCritical', 'احتمال اتمام در موعد — بحرانی'], ['reviewOverdueDays', 'تأخیر بررسی گزارش (روز)'], ['ppcWarn', 'PPC هشدار'], ['readinessHorizonDays', 'افق آمادگی (روز)'], ['financeGapPct', 'اختلاف مالی (نسبت)']] as const).map(([k, l]) => (
          <label key={k} className="ex-lab">{l}<input type="number" step="0.05" disabled={!canCfg} value={s.thresholds[k]} onChange={(e) => void save({ thresholds: { ...s.thresholds, [k]: num(e.target.value, s.thresholds[k]) } })} style={{ width: 100 }} /></label>
        ))}</div>
      </Section>
      <Proposals projectId={projectId} canCfg={canCfg} />
    </div>
  )
}

function Parties({ parties, can, onSave }: { parties: Parties; can: boolean; onSave: (p: Parties) => Promise<boolean> }) {
  const [msg, setMsg] = useState('')
  const set = async (who: keyof Parties, patch: Partial<Parties[keyof Parties]>) => { await onSave({ ...parties, [who]: { ...parties[who], ...patch } }) }
  const pick = async (who: keyof Parties, f: File) => {
    setMsg('')
    if (!LOGO_TYPES.includes(f.type)) { setMsg('نوع فایل مجاز نیست (PNG، JPEG، WebP یا SVG).'); return }
    let blob: Blob = f
    if (f.type !== 'image/svg+xml' && f.size > LOGO_MAX_BYTES) blob = await compressImage(f, { maxEdge: 600, maxBytes: LOGO_MAX_BYTES })
    if (blob.size > LOGO_MAX_BYTES) { setMsg(`اندازهٔ لوگو باید حداکثر ${fa(LOGO_MAX_BYTES / 1024)} کیلوبایت باشد.`); return }
    const url = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(blob) })
    await set(who, { logo: url })
  }
  const L: [keyof Parties, string][] = [['employer', 'کارفرما'], ['consultant', 'مشاور'], ['contractor', 'پیمانکار']]
  return (
    <Section title="سربرگ و لوگوی طرف‌های پیمان" hint="در چاپ و PDF گزارش‌ها دیده می‌شود. گزارش‌های ارسال‌شده سربرگ زمان ارسال را نگه می‌دارند و با تغییر بعدی عوض نمی‌شوند.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {L.map(([k, label]) => (
          <div key={k} className="im-card" style={{ padding: 12, display: 'grid', gap: 8 }}>
            <b>{label}</b>
            <input disabled={!can} placeholder="نام رسمی" defaultValue={parties[k].name} onBlur={(e) => { if (e.target.value !== parties[k].name) void set(k, { name: e.target.value }) }} dir="auto" aria-label={`نام رسمی ${label}`} />
            <div style={{ height: 64, display: 'grid', placeItems: 'center', background: 'rgba(148,163,184,.1)', borderRadius: 8 }}>{parties[k].logo ? <img src={parties[k].logo} alt={`لوگوی ${label}`} style={{ maxHeight: 56, maxWidth: '90%', objectFit: 'contain' }} /> : <span className="im-helper">بدون لوگو</span>}</div>
            {can && <span style={{ display: 'flex', gap: 6 }}><label className="im-btn im-btn-sm" style={{ cursor: 'pointer' }}>بارگذاری<input type="file" accept={LOGO_TYPES.join(',')} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(k, f); e.target.value = '' }} /></label>{parties[k].logo && <button className="im-btn im-btn-sm" onClick={() => void set(k, { logo: '' })}>برداشتن</button>}</span>}
          </div>))}
      </div>
      {msg && <p className="ex-bad" style={{ margin: '8px 0 0' }}>{msg}</p>}
    </Section>
  )
}

function LegalView({ projectId }: { projectId: string }) {
  const epc = useEpcStore()
  const can = useExecutionStore((x) => x.can(projectId, '*') || x.can(projectId, 'configure'))
  useEffect(() => { void epc.loadLegal(projectId) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId, epc.available])
  const cur = epc.legalByProject.get(projectId)
  const [body, setBody] = useState('')
  const [approved, setApproved] = useState(false)
  const [note, setNote] = useState('')
  useEffect(() => { if (cur) setBody(cur.body) }, [cur?.version, cur?.scope]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Section title="متن تحفظ قراردادی" hint="در پایان همهٔ گزارش‌های روزانه و فرم‌های فنی (نمایش، چاپ، PDF) درج می‌شود. کاربران عادی نمی‌توانند آن را تغییر دهند و هر تغییر با نسخه و هویت ثبت می‌شود.">
      {cur && <p style={{ margin: '0 0 8px' }}><Chip tone={cur.status === 'legal_approved' ? 'good' : 'warn'}>{cur.status === 'legal_approved' ? 'تأییدشدهٔ واحد حقوقی' : 'پیش‌نویس — هنوز تأیید حقوقی نشده'}</Chip> <Chip>نسخهٔ {fa(cur.version)}</Chip> <Chip>{cur.scope === 'project' ? 'مخصوص این پروژه' : 'متن پیش‌فرض شرکت'}</Chip></p>}
      <textarea rows={4} value={body} disabled={!can} onChange={(e) => setBody(e.target.value)} dir="auto" style={{ width: '100%' }} aria-label="متن تحفظ" />
      {can && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} /> این متن به تأیید واحد حقوقی رسیده است</label>
        <input placeholder="یادداشت تغییر (مثلاً شمارهٔ نظر حقوقی)" value={note} onChange={(e) => setNote(e.target.value)} dir="auto" style={{ minWidth: 260 }} />
        <button className="im-btn im-btn-primary im-btn-sm" disabled={!body.trim() || body === cur?.body && (approved ? 'legal_approved' : 'draft') === cur?.status} onClick={() => void epc.setLegal(projectId, body, approved ? 'legal_approved' : 'draft', note)}>ثبت نسخهٔ جدید</button>
      </div>}
    </Section>
  )
}

function Proposals({ projectId, canCfg }: { projectId: string; canCfg: boolean }) {
  const epc = useEpcStore()
  const list = epc.proposals.filter((x) => x.projectId === projectId)
  const [f, setF] = useState({ formKey: '', title: '', reason: '', fields: '' })
  const mine = useExecutionStore((x) => x.can(projectId, 'record') || x.can(projectId, 'edit_activities'))
  const propose = async () => {
    const fields = f.fields.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [label, type = 'text'] = l.split('|').map((x) => x.trim()); return { label, type } })
    if (await epc.proposeForm({ projectId, formKey: f.formKey.trim(), title: f.title.trim(), definition: { fields }, reason: f.reason })) setF({ formKey: '', title: '', reason: '', fields: '' })
  }
  return (
    <Section title="فرم‌های پیشنهادی" hint="فرم‌های استاندارد موجود دست‌نخورده می‌مانند. فرم تازه فقط پیشنهاد است و تا تأیید فرد مجاز فعال نمی‌شود.">
      {list.length > 0 && <div className="fn-tbl-wrap" style={{ maxHeight: 'none', marginBottom: 10 }}><table className="ex-lines"><thead><tr><th>کلید</th><th>عنوان</th><th>فیلدها</th><th>علت</th><th>وضعیت</th><th /></tr></thead>
        <tbody>{list.map((x) => <tr key={x.id}><td className="fn-code">{x.formKey}</td><td>{x.title}</td><td className="sub">{((x.definition.fields as { label: string }[] | undefined) ?? []).map((q) => q.label).join('، ')}</td><td className="sub">{x.reason}</td><td><Chip tone={x.status === 'approved' ? 'good' : x.status === 'rejected' ? 'bad' : 'warn'}>{x.status === 'approved' ? 'تأییدشده' : x.status === 'rejected' ? 'ردشده' : 'در انتظار تأیید'}</Chip></td>
          <td>{canCfg && x.status === 'proposed' && <span style={{ display: 'flex', gap: 4 }}><button className="im-btn im-btn-sm im-btn-primary" onClick={() => void epc.decideProposal(x.id, true, '')}>تأیید</button><button className="im-btn im-btn-sm" onClick={() => { const n = window.prompt('علت رد:'); if (n?.trim()) void epc.decideProposal(x.id, false, n.trim()) }}>رد</button></span>}</td></tr>)}</tbody></table></div>}
      {mine && <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><input placeholder="کلید لاتین فرم (مثلاً hydro_test)" value={f.formKey} onChange={(e) => setF({ ...f, formKey: e.target.value })} dir="ltr" /><input placeholder="عنوان فرم" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} dir="auto" style={{ minWidth: 220 }} /><input placeholder="علت نیاز" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} dir="auto" style={{ minWidth: 220 }} /></div>
        <textarea rows={3} placeholder={'فیلدها، هر خط یکی: عنوان | نوع (text/num/date/select)\nفشار آزمون | num'} value={f.fields} onChange={(e) => setF({ ...f, fields: e.target.value })} dir="auto" />
        <div><button className="im-btn im-btn-primary im-btn-sm" disabled={!/^[a-z][a-z0-9_]{2,40}$/.test(f.formKey.trim()) || !f.title.trim() || !f.fields.trim()} onClick={() => void propose()}>ثبت پیشنهاد فرم</button></div>
      </div>}
    </Section>
  )
}
