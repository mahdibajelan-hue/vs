import { useState } from 'react'
import { Car, Pencil, Plus, Trash2, UserRound, X } from 'lucide-react'
import { ModalPortal } from '../../../components/common/ModalPortal'
import { JalaliDateField } from '../../issues/components/JalaliDateField'
import { useSupervisionStore } from '../store/useSupervisionStore'
import { formatJalali } from '../../../lib/jalali'
import { fa } from '../lib/svMonth'
import type { SvGearbox, SvOwnership, SvPerson, SvVehicle, SvVehicleKind } from '../types'
import { Empty, Flash } from '../components/common'

const SIDE_FA = { supervision: 'دستگاه نظارت', employer: 'نمایندهٔ کارفرما' } as const
const KIND_FA: Record<SvVehicleKind, string> = { sedan: 'سواری', pickup: 'وانت', suv: 'شاسی‌بلند', van: 'ون', minibus: 'مینی‌بوس', other: 'سایر' }
const GEAR_FA: Record<SvGearbox, string> = { manual: 'دستی', automatic: 'اتوماتیک' }
const OWN_FA: Record<SvOwnership, string> = { rented: 'استیجاری', company: 'شرکتی' }

/** نفرات و خودروها — who is on the project and which cars are rented for them. */
export function RosterPage() {
  const people = useSupervisionStore((s) => s.people)
  const vehicles = useSupervisionStore((s) => s.vehicles)
  const settings = useSupervisionStore((s) => s.settings)
  const deletePerson = useSupervisionStore((s) => s.deletePerson)
  const deleteVehicle = useSupervisionStore((s) => s.deleteVehicle)
  const [editP, setEditP] = useState<Partial<SvPerson> | null>(null)
  const [editV, setEditV] = useState<Partial<SvVehicle> | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const name = (id: string | null) => people.find((p) => p.id === id)?.fullName

  const delP = async (p: SvPerson) => { if (!window.confirm(`«${p.fullName}» و همهٔ روزهای ثبت‌شده‌اش حذف شود؟ برای کسی که از پروژه رفته، بهتر است «فعال» را بردارید.`)) return; const r = await deletePerson(p.id); setMsg(r.ok ? { ok: true, text: 'حذف شد.' } : { ok: false, text: r.error ?? '' }) }
  const delV = async (v: SvVehicle) => { if (!window.confirm(`خودروی «${v.title}» و روزهای ثبت‌شده‌اش حذف شود؟`)) return; const r = await deleteVehicle(v.id); setMsg(r.ok ? { ok: true, text: 'حذف شد.' } : { ok: false, text: r.error ?? '' }) }
  const period = (a: string | null, b: string | null) => a || b ? `${a ? 'از ' + fa(formatJalali(a)) : ''}${b ? ' تا ' + fa(formatJalali(b)) : ''}` : ''

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <Flash msg={msg} />
      <section>
        <div className="im-topbar" style={{ marginBottom: 10 }}>
          <h2 style={{ fontSize: 16, fontWeight: 900, margin: 0 }}><UserRound size={17} style={{ display: 'inline', verticalAlign: -3 }} /> ناظران و نمایندگان کارفرما ({fa(people.length)})</h2>
          <button className="im-btn im-btn-primary im-btn-sm" onClick={() => setEditP({ side: 'supervision', mealBreakfast: true, mealLunch: true, mealDinner: true, active: true, overtimeCap: null })}><Plus size={15} /> افزودن نفر</button>
        </div>
        {!people.length ? <Empty>نفری ثبت نشده است.</Empty> : (
          <div className="im-table-wrap"><table className="im-table">
            <thead><tr><th>نام</th><th>سمت</th><th>ساعت کار</th><th>سقف اضافه‌کار</th><th>کارت ساعت</th><th>دوره</th><th /></tr></thead>
            <tbody>{people.map((p) => (
              <tr key={p.id} style={p.active ? undefined : { opacity: 0.55 }}>
                <td><b>{p.fullName}</b>{!p.active && <span className="im-chip" style={{ marginInlineStart: 6 }}>غیرفعال</span>}<div className="sv-note" style={{ fontSize: 11 }}>{SIDE_FA[p.side]}{p.mobile && ` · ${fa(p.mobile)}`}</div></td>
                <td>{p.roleTitle || '—'}</td>
                <td className="sv-num">{p.shiftStart && p.shiftEnd ? `${fa(p.shiftStart)} تا ${fa(p.shiftEnd)}` : '—'}</td>
                <td className="sv-num">{fa(p.overtimeCap ?? settings.overtimeMax)} ساعت{p.overtimeCap == null && <span className="sv-note"> (پیش‌فرض)</span>}</td>
                <td>{p.cardNo ? fa(p.cardNo) : '—'}</td>
                <td className="sv-note">{period(p.startDate, p.endDate) || '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setEditP(p)} aria-label={`ویرایش ${p.fullName}`}><Pencil size={13} /></button> <button className="im-btn im-btn-danger im-btn-sm" onClick={() => delP(p)} aria-label={`حذف ${p.fullName}`}><Trash2 size={13} /></button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <section>
        <div className="im-topbar" style={{ marginBottom: 10 }}>
          <h2 style={{ fontSize: 16, fontWeight: 900, margin: 0 }}><Car size={17} style={{ display: 'inline', verticalAlign: -3 }} /> خودروها ({fa(vehicles.length)})</h2>
          <button className="im-btn im-btn-primary im-btn-sm" onClick={() => setEditV({ kind: 'sedan', ownership: 'rented', active: true })}><Plus size={15} /> افزودن خودرو</button>
        </div>
        {!vehicles.length ? <Empty>خودرویی ثبت نشده است.</Empty> : (
          <div className="im-table-wrap"><table className="im-table">
            <thead><tr><th>خودرو</th><th>پلاک</th><th>مشخصات</th><th>مالکیت</th><th>راننده</th><th>در اختیار</th><th>دوره</th><th /></tr></thead>
            <tbody>{vehicles.map((v) => (
              <tr key={v.id} style={v.active ? undefined : { opacity: 0.55 }}>
                <td><b>{v.title}</b>{!v.active && <span className="im-chip" style={{ marginInlineStart: 6 }}>غیرفعال</span>}</td>
                <td>{v.plate || '—'}</td>
                <td className="sv-note">{[KIND_FA[v.kind], v.modelYear && `مدل ${fa(v.modelYear)}`, v.engineCc && `${fa(v.engineCc)} سی‌سی`, v.gearbox && `گیربکس ${GEAR_FA[v.gearbox]}`].filter(Boolean).join(' · ')}</td>
                <td><span className="im-chip">{OWN_FA[v.ownership]}</span>{v.ownership === 'rented' && v.lessor && <div className="sv-sub">{v.lessor}</div>}</td>
                <td>{v.driver || '—'}</td><td>{name(v.personId) || '—'}</td>
                <td className="sv-note">{period(v.startDate, v.endDate) || '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setEditV(v)} aria-label={`ویرایش ${v.title}`}><Pencil size={13} /></button> <button className="im-btn im-btn-danger im-btn-sm" onClick={() => delV(v)} aria-label={`حذف ${v.title}`}><Trash2 size={13} /></button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      {editP && <PersonForm value={editP} onClose={() => setEditP(null)} onSaved={(t) => { setEditP(null); setMsg({ ok: true, text: t }) }} />}
      {editV && <VehicleForm value={editV} people={people} onClose={() => setEditV(null)} onSaved={(t) => { setEditV(null); setMsg({ ok: true, text: t }) }} />}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <ModalPortal>
      <div className="im-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }} onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
        <div className="im-modal sv-root" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: 620, height: 'auto' }}>
          <div className="im-modal-head" style={{ cursor: 'default' }}><span className="im-modal-title">{title}</span><button className="im-modal-close" onClick={onClose} aria-label="بستن"><X size={16} /></button></div>
          {children}
        </div>
      </div>
    </ModalPortal>
  )
}

function PersonForm({ value, onClose, onSaved }: { value: Partial<SvPerson>; onClose: () => void; onSaved: (msg: string) => void }) {
  const savePerson = useSupervisionStore((s) => s.savePerson)
  const settings = useSupervisionStore((s) => s.settings)
  const [f, setF] = useState<Partial<SvPerson>>(value)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const up = (p: Partial<SvPerson>) => setF((x) => ({ ...x, ...p }))
  const submit = async () => {
    if (!f.fullName?.trim()) return setError('نام را بنویسید.')
    if (f.startDate && f.endDate && f.endDate < f.startDate) return setError('تاریخ پایان قبل از تاریخ شروع است.')
    setBusy(true)
    const r = await savePerson({ ...f, fullName: f.fullName.trim(), roleTitle: f.roleTitle?.trim() ?? '', cardNo: f.cardNo?.trim() ?? '' })
    setBusy(false)
    if (!r.ok) return setError(r.error ?? 'ذخیره نشد')
    onSaved(value.id ? 'تغییرات ذخیره شد.' : `«${f.fullName.trim()}» اضافه شد.`)
  }
  return (
    <Modal title={value.id ? 'ویرایش نفر' : 'افزودن ناظر یا نماینده'} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div className="im-field"><label htmlFor="sv-name">نام و نام خانوادگی *</label><input id="sv-name" autoFocus value={f.fullName ?? ''} onChange={(e) => up({ fullName: e.target.value })} /></div>
        <div className="im-field"><label htmlFor="sv-side">طرف</label><select id="sv-side" value={f.side ?? 'supervision'} onChange={(e) => up({ side: e.target.value as SvPerson['side'] })}><option value="supervision">دستگاه نظارت</option><option value="employer">نمایندهٔ کارفرما</option></select></div>
        <div className="im-field"><label htmlFor="sv-role">سمت</label><input id="sv-role" placeholder="مثلاً ناظر مقیم جوش" value={f.roleTitle ?? ''} onChange={(e) => up({ roleTitle: e.target.value })} /></div>
        <div className="im-field"><label htmlFor="sv-mobile">موبایل</label><input id="sv-mobile" inputMode="tel" dir="ltr" value={f.mobile ?? ''} onChange={(e) => up({ mobile: e.target.value })} /></div>
        <div className="im-field"><label htmlFor="sv-nid">کد ملی</label><input id="sv-nid" inputMode="numeric" dir="ltr" value={f.nationalId ?? ''} onChange={(e) => up({ nationalId: e.target.value })} /></div>
        <div className="im-field"><label htmlFor="sv-cap">سقف اضافه‌کار ماهانه (ساعت)</label><input id="sv-cap" inputMode="numeric" placeholder={`پیش‌فرض پروژه: ${settings.overtimeMax}`} value={f.overtimeCap ?? ''} onChange={(e) => up({ overtimeCap: e.target.value.trim() === '' ? null : Math.max(0, Math.min(200, Number(e.target.value) || 0)) })} /></div>
        <div className="im-field"><label htmlFor="sv-card">شمارهٔ کارت ساعت</label><input id="sv-card" dir="ltr" placeholder="برای اتصال دستگاه حضور و غیاب" value={f.cardNo ?? ''} onChange={(e) => up({ cardNo: e.target.value })} /></div>
        <div className="im-field"><label>شروع حضور در پروژه</label><JalaliDateField value={f.startDate ?? ''} onChange={(d) => up({ startDate: d })} /></div>
        <div className="im-field"><label>پایان حضور (اختیاری)</label><JalaliDateField value={f.endDate ?? ''} onChange={(d) => up({ endDate: d })} />{f.endDate && <button type="button" className="im-ghostlink" onClick={() => up({ endDate: null })}>پاک کردن</button>}</div>
      </div>
      <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginTop: 12 }}><input type="checkbox" checked={f.active !== false} onChange={(e) => up({ active: e.target.checked })} />فعال</label>
      <p className="sv-note" style={{ margin: '6px 0 0' }}>هر روزی که «حاضر» باشد صبحانه، ناهار و شام برایش حساب می‌شود.</p>
      <div className="im-field" style={{ marginTop: 12 }}><label htmlFor="sv-note">یادداشت</label><input id="sv-note" value={f.note ?? ''} onChange={(e) => up({ note: e.target.value })} /></div>
      {error && <p role="alert" style={{ color: 'var(--im-coral)', fontWeight: 700, margin: '10px 0 0' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}><button className="im-btn im-btn-ghost" onClick={onClose}>انصراف</button><button className="im-btn im-btn-primary" disabled={busy} onClick={submit}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button></div>
    </Modal>
  )
}

function VehicleForm({ value, people, onClose, onSaved }: { value: Partial<SvVehicle>; people: SvPerson[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const saveVehicle = useSupervisionStore((s) => s.saveVehicle)
  const [f, setF] = useState<Partial<SvVehicle>>(value)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const up = (p: Partial<SvVehicle>) => setF((x) => ({ ...x, ...p }))
  const submit = async () => {
    if (!f.title?.trim()) return setError('نام خودرو را بنویسید (مثلاً «پژو پارس سفید»).')
    if (f.modelYear != null && (f.modelYear < 1300 || f.modelYear > 2100)) return setError('سال ساخت را چهار رقمی بنویسید (مثلاً ۱۴۰۱ یا ۲۰۲۲).')
    if (f.engineCc != null && (f.engineCc < 50 || f.engineCc > 20000)) return setError('حجم موتور را به سی‌سی بنویسید (مثلاً ۱۶۵۰).')
    setBusy(true)
    const r = await saveVehicle({ ...f, title: f.title.trim(), cardNo: f.cardNo?.trim() ?? '' })
    setBusy(false)
    if (!r.ok) return setError(r.error ?? 'ذخیره نشد')
    onSaved(value.id ? 'تغییرات ذخیره شد.' : `خودروی «${f.title.trim()}» اضافه شد.`)
  }
  return (
    <Modal title={value.id ? 'ویرایش خودرو' : 'افزودن خودرو'} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div className="im-field"><label htmlFor="sv-vt">خودرو *</label><input id="sv-vt" autoFocus placeholder="مثلاً تویوتا هایلوکس سفید" value={f.title ?? ''} onChange={(e) => up({ title: e.target.value })} /></div>
        <div className="im-field"><label htmlFor="sv-vp">پلاک</label><input id="sv-vp" placeholder="۱۲ ب ۳۴۵ ایران ۳۶" value={f.plate ?? ''} onChange={(e) => up({ plate: e.target.value })} /></div>
        <div className="im-field"><label htmlFor="sv-vo">مالکیت</label><select id="sv-vo" value={f.ownership ?? 'rented'} onChange={(e) => up({ ownership: e.target.value as SvOwnership })}><option value="rented">استیجاری</option><option value="company">شرکتی</option></select></div>
        <div className="im-field"><label htmlFor="sv-vy">سال ساخت (مدل)</label><input id="sv-vy" inputMode="numeric" placeholder="مثلاً ۱۴۰۱" value={f.modelYear ?? ''} onChange={(e) => up({ modelYear: toInt(e.target.value) })} /></div>
        <div className="im-field"><label htmlFor="sv-vcc">حجم موتور (سی‌سی)</label><input id="sv-vcc" inputMode="numeric" placeholder="مثلاً ۱۶۵۰" value={f.engineCc ?? ''} onChange={(e) => up({ engineCc: toInt(e.target.value) })} /></div>
        <div className="im-field"><label htmlFor="sv-vg">گیربکس</label><select id="sv-vg" value={f.gearbox ?? ''} onChange={(e) => up({ gearbox: (e.target.value || null) as SvGearbox | null })}><option value="">—</option><option value="manual">دستی</option><option value="automatic">اتوماتیک</option></select></div>
        <div className="im-field"><label htmlFor="sv-vk">نوع</label><select id="sv-vk" value={f.kind ?? 'sedan'} onChange={(e) => up({ kind: e.target.value as SvVehicleKind })}>{Object.entries(KIND_FA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="im-field"><label htmlFor="sv-vd">راننده</label><input id="sv-vd" value={f.driver ?? ''} onChange={(e) => up({ driver: e.target.value })} /></div>
        <div className="im-field"><label htmlFor="sv-vperson">در اختیار</label><select id="sv-vperson" value={f.personId ?? ''} onChange={(e) => up({ personId: e.target.value || null })}><option value="">—</option>{people.filter((p) => p.active || p.id === f.personId).map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}</select></div>
        {(f.ownership ?? 'rented') === 'rented' && <div className="im-field"><label htmlFor="sv-vl">موجر (شرکت یا شخص)</label><input id="sv-vl" value={f.lessor ?? ''} onChange={(e) => up({ lessor: e.target.value })} /></div>}
        <div className="im-field"><label htmlFor="sv-vc">شمارهٔ کارت ساعت</label><input id="sv-vc" dir="ltr" value={f.cardNo ?? ''} onChange={(e) => up({ cardNo: e.target.value })} /></div>
        <div className="im-field"><label>{(f.ownership ?? 'rented') === 'rented' ? 'شروع اجاره' : 'شروع کار در پروژه'}</label><JalaliDateField value={f.startDate ?? ''} onChange={(d) => up({ startDate: d })} /></div>
        <div className="im-field"><label>{(f.ownership ?? 'rented') === 'rented' ? 'پایان اجاره (اختیاری)' : 'پایان (اختیاری)'}</label><JalaliDateField value={f.endDate ?? ''} onChange={(d) => up({ endDate: d })} />{f.endDate && <button type="button" className="im-ghostlink" onClick={() => up({ endDate: null })}>پاک کردن</button>}</div>
      </div>
      <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginTop: 12 }}><input type="checkbox" checked={f.active !== false} onChange={(e) => up({ active: e.target.checked })} />فعال</label>
      {error && <p role="alert" style={{ color: 'var(--im-coral)', fontWeight: 700, margin: '10px 0 0' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}><button className="im-btn im-btn-ghost" onClick={onClose}>انصراف</button><button className="im-btn im-btn-primary" disabled={busy} onClick={submit}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button></div>
    </Modal>
  )
}

/** Persian or Latin digits → integer; '' → null */
function toInt(v: string): number | null {
  const t = v.replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[^0-9]/g, '')
  return t === '' ? null : Number(t)
}
