import { useEffect, useMemo, useState } from 'react'
import { Camera, CheckCircle2, Printer, Undo2 } from 'lucide-react'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { cardFields, cardProblems, cardValues, wqtValues, WQT_FIELDS, KIND_FA, type PField } from '../lib/personnelForms'
import type { Welder, WelderQual } from '../lib/registers'
import { Chip } from '../../finance/components/fn'
import { PersonSheet, jdLatin, photoFromFile } from './PersonSheet'

const defaults = (fs: PField[]) => Object.fromEntries(fs.filter((f) => f.def).map((f) => [f.key, f.def as string]))

function Field({ f, v, set, dis }: { f: PField; v: string; set: (x: string) => void; dis: boolean }) {
  return (
    <label>{f.label}
      {f.kind === 'select' ? <select disabled={dis} value={v} onChange={(e) => set(e.target.value)}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        : f.kind === 'date' ? <JalaliDateInput value={v} onChange={(x) => !dis && set(x)} />
        : <input disabled={dis} dir="auto" value={v} onChange={(e) => set(e.target.value)} placeholder={f.hint} />}
    </label>
  )
}

/** The qualification card of a welder or coating applicator: the sheet's data, a photo, a reviewer's confirmation, and the card printed on the approved layout. */
export function PersonnelCard({ w, projectId, can, canConfirm }: { w: Welder; projectId: string; can: boolean; canConfirm: boolean }) {
  const epc = useEpcStore()
  const people = useExecutionStore((s) => s.people)
  const fields = useMemo(() => cardFields(w.kind), [w.kind])
  const init = () => ({ name: w.fullName, stamp: w.raw, ...defaults(fields), ...w.card })
  const [d, setD] = useState<Record<string, string>>(init)
  const [photo, setPhoto] = useState(w.photo)
  useEffect(() => { setD(init()); setPhoto(w.photo) }, [w.id, w.card, w.photo]) // eslint-disable-line react-hooks/exhaustive-deps
  const locked = w.cardStatus === 'confirmed'
  const dirty = JSON.stringify(d) !== JSON.stringify(init()) || photo !== w.photo
  const problems = cardProblems(w.kind, d)
  const nameOf = (id: string | null) => (id ? people.get(id) ?? '' : '')
  const values = useMemo(() => cardValues(w.kind, d, locked ? { consultant: { name: nameOf(w.cardConfirmedBy), date: w.cardConfirmedAt?.slice(0, 10) ?? '' }, contractor: { name: nameOf(w.createdBy), date: '' } } : {}, jdLatin), [w, d, locked, people]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => { await epc.saveWelder({ ...w, projectId, raw: w.raw, fullName: d.name || w.fullName, card: d, photo }) }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <b>کارت شناسایی {KIND_FA[w.kind]}</b>
        <Chip tone={locked ? 'good' : 'warn'}>{locked ? `تأییدشده${w.cardConfirmedAt ? ` · ${jdLatin(w.cardConfirmedAt.slice(0, 10))}` : ''}` : 'پیش‌نویس — تأیید نشده'}</Chip>
        {locked && nameOf(w.cardConfirmedBy) && <span className="sub">توسط {nameOf(w.cardConfirmedBy)}</span>}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
          <div style={{ width: 130, height: 165, border: '1px dashed var(--im-line, #94a3b8)', borderRadius: 6, display: 'grid', placeItems: 'center', overflow: 'hidden', background: 'rgba(148,163,184,.08)' }}>
            {photo ? <img src={photo} alt={`عکس ${w.fullName || w.raw}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span className="sub">بدون عکس</span>}
          </div>
          {can && !locked && <label className="im-btn im-btn-sm" style={{ cursor: 'pointer' }}><Camera size={13} /> بارگذاری عکس<input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { setPhoto(await photoFromFile(f)) } catch { window.alert('این فایل تصویر قابل خواندن نیست.') } } e.target.value = '' }} /></label>}
          {can && !locked && photo && <button className="im-btn im-btn-sm" onClick={() => setPhoto('')}>حذف عکس</button>}
        </div>
        <div className="ex-sheet-grid" style={{ flex: 1, minWidth: 300 }}>{fields.map((f) => <Field key={f.key} f={f} v={d[f.key] ?? ''} set={(x) => setD({ ...d, [f.key]: x })} dis={!can || locked} />)}</div>
      </div>
      {problems.length > 0 && <p className="im-helper" style={{ margin: 0, color: 'var(--im-amber)' }}>برای تأیید لازم است: {problems.join('، ')}.</p>}
      <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {can && !locked && <button className="im-btn im-btn-primary im-btn-sm" disabled={!dirty} onClick={() => void save()}>ذخیرهٔ کارت</button>}
        {canConfirm && !locked && <button className="im-btn im-btn-sm" disabled={dirty || problems.length > 0} title={dirty ? 'ابتدا ذخیره کنید' : undefined} onClick={() => void epc.setConfirm('card', w.id, true)}><CheckCircle2 size={13} /> تأیید کارت</button>}
        {canConfirm && locked && <button className="im-btn im-btn-sm" onClick={() => { if (window.confirm('کارت تأییدشده بازگشایی شود؟ تغییرات در تاریخچه ثبت می‌شود.')) void epc.setConfirm('card', w.id, false) }}><Undo2 size={13} /> بازگشایی برای اصلاح</button>}
        <button className="im-btn im-btn-sm" onClick={() => window.print()}><Printer size={13} /> چاپ کارت</button>
      </div>
      <PersonSheet formKey={w.kind === 'welder' ? 'welder_card' : 'coater_card'} values={values} photo={photo} note={w.kind === 'coater' ? 'فرم کارت عایق‌کار بر پایهٔ کارت جوشکار طراحی شده و پیش از چاپ رسمی باید مسئول فرم تأیید کند.' : undefined} />
    </div>
  )
}

/** The welder qualification test (WQT sheet) of one qualification. */
export function WqtPanel({ q, w, can, canConfirm }: { q: WelderQual; w: Welder; can: boolean; canConfirm: boolean }) {
  const epc = useEpcStore()
  const init = () => ({ ...defaults(WQT_FIELDS), welderName: w.fullName || w.card.name || '', welderId: w.card.id || w.raw, wqtNo: q.wqtNo, ...(q.process ? { process: q.process } : {}), ...q.wqt } as Record<string, string>)
  const [d, setD] = useState<Record<string, string>>(init)
  useEffect(() => setD(init()), [q.id, q.wqt]) // eslint-disable-line react-hooks/exhaustive-deps
  const locked = q.wqtStatus === 'confirmed'
  const dirty = JSON.stringify(d) !== JSON.stringify(init())
  const values = useMemo(() => wqtValues(d, jdLatin), [d])
  return (
    <details style={{ marginTop: 6 }}>
      <summary><b>فرم WQT</b> — {q.wqtNo || 'بدون شماره'} <Chip tone={locked ? 'good' : 'warn'}>{locked ? 'تأییدشده' : 'پیش‌نویس'}</Chip></summary>
      <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
        <div className="ex-sheet-grid">{WQT_FIELDS.map((f) => <Field key={f.key} f={f} v={d[f.key] ?? ''} set={(x) => setD({ ...d, [f.key]: x })} dis={!can || locked} />)}</div>
        <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {can && !locked && <button className="im-btn im-btn-primary im-btn-sm" disabled={!dirty} onClick={() => void epc.saveQual({ ...q, wqt: d, wqtNo: d.wqtNo || q.wqtNo, process: d.process || q.process })}>ذخیرهٔ فرم</button>}
          {canConfirm && !locked && <button className="im-btn im-btn-sm" disabled={dirty || !(d.wqtNo ?? '').trim()} onClick={() => void epc.setConfirm('wqt', q.id, true)}><CheckCircle2 size={13} /> تأیید WQT</button>}
          {canConfirm && locked && <button className="im-btn im-btn-sm" onClick={() => { if (window.confirm('WQT تأییدشده بازگشایی شود؟')) void epc.setConfirm('wqt', q.id, false) }}><Undo2 size={13} /> بازگشایی</button>}
          <button className="im-btn im-btn-sm" onClick={() => window.print()}><Printer size={13} /> چاپ</button>
        </div>
        <PersonSheet formKey="wqt" values={values} />
      </div>
    </details>
  )
}
