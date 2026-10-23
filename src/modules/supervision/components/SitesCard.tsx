import { useEffect, useState } from 'react'
import { Crosshair, Loader2, MapPin, Plus, Save, Smartphone, Trash2 } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { useSupervisionStore } from '../store/useSupervisionStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { fa } from '../lib/svMonth'
import { bestFix, isApproximate } from '../lib/geo'
import type { SvPerson, SvSite } from '../types'
import { Flash } from './common'

type Draft = { id?: string; name: string; lat: string; lng: string; radiusM: string; active: boolean }
const blank: Draft = { name: '', lat: '', lng: '', radiusM: '300', active: true }
const toNum = (x: string) => Number(x.replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace('٫', '.'))

/**
 * ثبت حضور با گوشی — where people may check in (sites: centre + radius) and which platform account belongs to which
 * person. Only linked people see «ورود و خروج من»; a check-in counts only inside a site.
 */
export function SitesCard() {
  const sites = useSupervisionStore((s) => s.sites)
  const saveSite = useSupervisionStore((s) => s.saveSite)
  const deleteSite = useSupervisionStore((s) => s.deleteSite)
  const [d, setD] = useState<Draft | null>(null)
  const [locating, setLocating] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // the site centre is only as good as the fix it was taken from: an approximate (±km) point is refused
  const here = async () => {
    if (!d) return
    setLocating(true); setMsg(null)
    try {
      const p = await bestFix({ target: 25, maxMs: 20000 })
      const acc = Math.round(p.coords.accuracy)
      if (isApproximate(acc)) { setMsg({ ok: false, text: `گوشی فقط «موقعیت تقریبی» داد (±${fa(acc)} متر)؛ این مختصات قابل استفاده نیست. «Precise Location / موقعیت دقیق» را برای مرورگر روشن کنید (آیفون: Settings ← Privacy & Security ← Location Services ← مرورگر) و دوباره بزنید، یا مختصات را از نقشه بنویسید.` }); return }
      setD({ ...d, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) })
      setMsg(acc <= 60 ? { ok: true, text: `موقعیت فعلی گرفته شد (دقت ±${fa(acc)} متر).` } : { ok: false, text: `موقعیت گرفته شد ولی دقت آن ±${fa(acc)} متر است؛ برای مرکز محل، در فضای باز دوباره بزنید یا مختصات را از نقشه اصلاح کنید.` })
    } catch {
      setMsg({ ok: false, text: 'موقعیت گرفته نشد؛ دسترسی موقعیت مکانی مرورگر را روشن کنید یا مختصات را از نقشه بنویسید.' })
    } finally { setLocating(false) }
  }
  const save = async () => {
    if (!d) return
    const lat = toNum(d.lat), lng = toNum(d.lng), radiusM = toNum(d.radiusM)
    if (!d.name.trim()) return setMsg({ ok: false, text: 'نام محل را بنویسید (مثلاً کمپ کوهدشت).' })
    if (!(lat >= 24 && lat <= 40 && lng >= 44 && lng <= 64)) return setMsg({ ok: false, text: 'مختصات معتبر نیست؛ عرض جغرافیایی ایران بین ۲۴ و ۴۰ و طول بین ۴۴ و ۶۴ است.' })
    if (!(radiusM >= 30 && radiusM <= 20000)) return setMsg({ ok: false, text: 'شعاع باید بین ۳۰ متر و ۲۰ کیلومتر باشد.' })
    if (radiusM < 80 && !window.confirm('شعاع کمتر از ۸۰ متر است؛ دقت GPS گوشی در ساختمان معمولاً ۲۰ تا ۶۵ متر است و بسیاری از ثبت‌ها رد می‌شوند. همین شعاع ذخیره شود؟')) return
    const r = await saveSite({ id: d.id, name: d.name, lat, lng, radiusM, active: d.active })
    setMsg(r.ok ? { ok: true, text: 'محل ذخیره شد.' } : { ok: false, text: r.error ?? '' })
    if (r.ok) setD(null)
  }
  const del = async (x: SvSite) => {
    if (!window.confirm(`محل «${x.name}» حذف شود؟ ثبت‌های گذشته می‌مانند.`)) return
    const r = await deleteSite(x.id)
    setMsg(r.ok ? { ok: true, text: 'حذف شد.' } : { ok: false, text: r.error ?? '' })
  }

  return (
    <div className="im-card">
      <h2 style={{ fontSize: 16, fontWeight: 900, margin: '0 0 6px' }}><Smartphone size={17} style={{ display: 'inline', verticalAlign: -3 }} /> ثبت حضور با گوشی</h2>
      <p className="sv-note" style={{ margin: '0 0 12px' }}>
        هر نفری که حسابش در جدول پایین وصل شود، در این ماژول صفحهٔ «ورود و خروج من» را می‌بیند و با گوشی خودش ورود و خروج می‌زند. موقعیت گوشی فقط هنگام زدن دکمه خوانده می‌شود و ثبت فقط وقتی پذیرفته است که در شعاع یکی از محل‌های زیر باشد.
        ساعت، ساعت سرور است. اگر GPS گوشی دقیق نباشد (مثلاً داخل ساختمان)، موقعیت آنتن و شبکهٔ خود گوشی به کار می‌رود و تا حد «حداکثر خطای موقعیت آنتن» (تنظیمات بالا) پذیرفته و با برچسب «آنتن» برای سرپرست مشخص می‌شود. هر تلاش، پذیرفته یا رد، با فاصله و دقت موقعیت در سابقه می‌ماند. برای شیفت شب، «خروج» صبح روز بعد روزِ دیروز را می‌بندد.
      </p>
      <h3 className="sv-h3"><MapPin size={14} style={{ display: 'inline', verticalAlign: -2 }} /> محل‌های مجاز (کمپ، دفتر کارگاه، جبهه‌ها)</h3>
      {sites.length > 0 && (
        <div className="im-table-wrap"><table className="im-table">
          <thead><tr><th>محل</th><th>مختصات</th><th>شعاع</th><th>وضعیت</th><th /></tr></thead>
          <tbody>{sites.map((x) => (
            <tr key={x.id}>
              <td><b>{x.name}</b></td>
              <td dir="ltr" className="sv-num"><a href={`https://www.google.com/maps?q=${x.lat},${x.lng}`} target="_blank" rel="noreferrer">{x.lat.toFixed(5)}, {x.lng.toFixed(5)}</a></td>
              <td className="sv-num">{fa(x.radiusM)} متر</td>
              <td>{x.active ? 'فعال' : 'غیرفعال'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setD({ id: x.id, name: x.name, lat: String(x.lat), lng: String(x.lng), radiusM: String(x.radiusM), active: x.active })}>ویرایش</button>{' '}
                <button className="im-btn im-btn-danger im-btn-sm" onClick={() => del(x)} aria-label={`حذف ${x.name}`}><Trash2 size={13} /></button>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {!d && <button className="im-btn im-btn-ghost im-btn-sm" style={{ marginTop: 8 }} onClick={() => { setD(blank); setMsg(null) }}><Plus size={14} /> افزودن محل</button>}
      {d && (
        <div className="sv-site-form">
          <div className="im-field" style={{ margin: 0 }}><label htmlFor="st-name">نام محل *</label><input id="st-name" autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="مثلاً کمپ کوهدشت" /></div>
          <div className="im-field" style={{ margin: 0 }}><label htmlFor="st-lat">عرض جغرافیایی</label><input id="st-lat" dir="ltr" inputMode="decimal" value={d.lat} onChange={(e) => setD({ ...d, lat: e.target.value })} placeholder="33.535" /></div>
          <div className="im-field" style={{ margin: 0 }}><label htmlFor="st-lng">طول جغرافیایی</label><input id="st-lng" dir="ltr" inputMode="decimal" value={d.lng} onChange={(e) => setD({ ...d, lng: e.target.value })} placeholder="47.606" /></div>
          <div className="im-field" style={{ margin: 0 }}><label htmlFor="st-r">شعاع (متر)</label><input id="st-r" inputMode="numeric" value={d.radiusM} onChange={(e) => setD({ ...d, radiusM: e.target.value })} /></div>
          <label className="sv-check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} /> فعال</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', gridColumn: '1 / -1' }}>
            <button type="button" className="im-btn im-btn-ghost im-btn-sm" onClick={here} disabled={locating}>{locating ? <Loader2 size={13} className="animate-spin" /> : <Crosshair size={13} />} موقعیت فعلی من</button>
            <span style={{ flex: 1 }} />
            <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setD(null)}>انصراف</button>
            <button className="im-btn im-btn-primary im-btn-sm" onClick={save}><Save size={13} /> ذخیرهٔ محل</button>
          </div>
        </div>
      )}
      <Flash msg={msg} />
      <h3 className="sv-h3" style={{ marginTop: 16 }}>حساب کاربری نفرات</h3>
      <AccountLinks />
    </div>
  )
}

type Profile = { id: string; full_name: string; email: string }
function AccountLinks() {
  const people = useSupervisionStore((s) => s.people)
  const [profiles, setProfiles] = useState<Profile[] | null>(null)
  useEffect(() => { void supabase.from('profiles').select('id,full_name,email').order('full_name').then(({ data }) => setProfiles((data ?? []) as Profile[])) }, [])
  const active = people.filter((p) => p.active)
  if (!active.length) return <p className="sv-note">نفر فعالی نیست.</p>
  const unlinked = active.filter((p) => !p.userId).length
  const heads = active.filter((p) => p.isHead).length
  return (
    <>
    <p className="sv-note" style={{ margin: '0 0 8px' }}>
      همهٔ نفرات باید خودشان با گوشی ورود و خروج بزنند؛ روزی که تردد نداشته باشد شب همان روز خودکار «غایب» ثبت می‌شود. فقط «سرپرست نظارت» (تیک ستون سوم) می‌تواند حضور را دستی ثبت یا اصلاح کند، مثلاً غیبت را به استراحت، مرخصی، استعلاجی یا مأموریت تبدیل کند.
      {!heads && <b className="sv-warn"> هنوز سرپرستی تعیین نشده؛ تا تعیین آن هر کس دسترسی ویرایش دارد می‌تواند دستی ثبت کند.</b>}
      {unlinked > 0 && <b className="sv-warn"> {fa(unlinked)} نفر حساب کاربری وصل ندارد و نمی‌تواند با گوشی ثبت کند؛ روزهایش «غایب» می‌شود مگر سرپرست دستی ثبت کند.</b>}
    </p>
    <div className="im-table-wrap"><table className="im-table">
      <thead><tr><th>نفر</th><th>حساب کاربری برای ثبت با گوشی</th><th>سرپرست نظارت</th><th /></tr></thead>
      <tbody>{active.map((p) => <LinkRow key={p.id} p={p} profiles={profiles} taken={new Set(active.filter((o) => o.id !== p.id && o.userId).map((o) => o.userId!))} />)}</tbody>
    </table></div>
    </>
  )
}

function LinkRow({ p, profiles, taken }: { p: SvPerson; profiles: Profile[] | null; taken: Set<string> }) {
  const savePerson = useSupervisionStore((s) => s.savePerson)
  const me = useAuthStore((s) => s.profile?.id)
  const [state, setState] = useState('')
  const change = async (userId: string) => {
    setState('…')
    const r = await savePerson({ id: p.id, userId: userId || null })
    setState(!r.ok ? r.error ?? 'ذخیره نشد' : userId && userId === me ? 'وصل شد؛ تب «ورود و خروج من» در بالای صفحه' : 'ذخیره شد')
  }
  return (
    <tr>
      <td><b>{p.fullName}</b><div className="sv-sub">{p.roleTitle}</div></td>
      <td>
        <select className="sv-select" value={p.userId ?? ''} onChange={(e) => change(e.target.value)} disabled={profiles === null} aria-label={`حساب کاربری ${p.fullName}`}>
          <option value="">— ثبت توسط سرپرست —</option>
          {(profiles ?? []).filter((u) => !taken.has(u.id)).map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}{u.full_name && u.email ? ` (${u.email})` : ''}</option>)}
        </select>
      </td>
      <td><label className="sv-check" style={{ margin: 0 }}><input type="checkbox" checked={p.isHead} onChange={async (e) => { setState('…'); const r = await savePerson({ id: p.id, isHead: e.target.checked }); setState(r.ok ? (e.target.checked ? 'سرپرست شد' : 'ذخیره شد') : r.error ?? 'ذخیره نشد') }} aria-label={`سرپرست نظارت: ${p.fullName}`} /> ثبت دستی</label></td>
      <td className="sv-note">{state}</td>
    </tr>
  )
}
