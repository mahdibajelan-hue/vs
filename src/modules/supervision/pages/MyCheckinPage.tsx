import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, LogIn, LogOut, MapPin, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { formatJalali } from '../../../lib/jalali'
import { STATUS_FA } from '../lib/svCalc'
import { fixWithNetworkFallback, isApproximate } from '../lib/geo'
import { addDays, fa, faNum, monthDays, monthLabel, thisMonth, todayLocal, weekdayFa } from '../lib/svMonth'
import type { SvStatus } from '../types'

export interface MyLink { person_id: string; project_id: string; project_name: string; full_name: string; role_title: string; shift_start: string | null; shift_end: string | null; sites: number }
type Day = { day: string; status: SvStatus; check_in: string | null; check_out: string | null; hours: number; overtime: number; source: string }
type Punch = { kind: 'in' | 'out'; at: string; day: string; accepted: boolean; reason: string; distance_m: number | null; site: string | null }
type Result = { accepted: boolean; reason: string; quality: 'gps' | 'network'; distance_m: number; radius_m: number; site: string; day: string; accuracy_m: number; network_max_m: number; check_in: string | null; check_out: string | null }

export async function loadMyLinks(): Promise<MyLink[]> {
  const { data, error } = await supabase.rpc('sv_my_links')
  return error ? [] : ((data ?? []) as MyLink[])
}

const dist = (m: number) => (m >= 1000 ? `${faNum(Math.round(m / 100) / 10)} کیلومتر` : `${fa(Math.round(m))} متر`)
const clock = (iso: string) => { const d = new Date(iso); return fa(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`) }
const REASON: Record<string, string> = { outside: 'خارج از محدوده', low_accuracy: 'دقت کم', no_check_in: 'بدون ورود', locked: 'ماه بسته', '': '' }

const IOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)
function geoError(e: unknown): string {
  const code = (e as GeolocationPositionError)?.code
  if (code === 1) return IOS
    ? 'اجازهٔ موقعیت داده نشده است. در آیفون: Settings ← Privacy & Security ← Location Services را روشن کنید، سپس در همان صفحه مرورگرتان (Chrome یا Safari) را روی «While Using the App» بگذارید و «Precise Location» را روشن کنید. بعد صفحه را تازه کنید و دوباره بزنید؛ اگر مرورگر پرسید «Allow» را بزنید.'
    : 'اجازهٔ موقعیت داده نشده است. روی آیکون قفل کنار نشانی سایت بزنید، «Location / موقعیت» را روی «اجازه» بگذارید، صفحه را تازه کنید و دوباره بزنید. موقعیت (GPS) گوشی هم باید روشن باشد.'
  if (code === 2) return 'موقعیت در دسترس نیست. GPS (مکان‌یاب) گوشی را روشن کنید و ترجیحاً در فضای باز دوباره امتحان کنید.'
  if (code === 3) return 'گرفتن موقعیت طول کشید. GPS را روشن کنید و دوباره بزنید.'
  if (typeof window !== 'undefined' && !window.isSecureContext) return 'مرورگر فقط روی نشانی امن (https) موقعیت می‌دهد؛ سامانه را با https باز کنید.'
  return 'این مرورگر موقعیت مکانی را پشتیبانی نمی‌کند.'
}
const APPROX_MSG = (acc: number) => IOS
  ? `گوشی فقط «موقعیت تقریبی» می‌دهد (±${fa(Math.round(acc))} متر)، چون «Precise Location» برای مرورگر خاموش است. در آیفون: Settings ← Privacy & Security ← Location Services ← Chrome (یا Safari Websites) ← «Precise Location» را روشن کنید و «While Using the App» را انتخاب کنید. سپس این صفحه را تازه کنید و دوباره بزنید.`
  : `گوشی فقط «موقعیت تقریبی» می‌دهد (±${fa(Math.round(acc))} متر). در تنظیمات گوشی ← Location ← دسترسی برنامه‌ها ← مرورگر، «Use precise location / موقعیت دقیق» را روشن کنید و GPS را روشن نگه دارید، سپس صفحه را تازه کنید و دوباره بزنید.`
function rpcError(m: string): string {
  if (/no_site/.test(m)) return 'هنوز محدودهٔ کارگاه برای این پروژه تعریف نشده است؛ به سرپرست دستگاه نظارت اطلاع دهید.'
  if (/not_linked/.test(m)) return 'حساب شما به نفری در این پروژه وصل نیست یا غیرفعال شده است.'
  if (/no_location/.test(m)) return 'موقعیت گوشی خوانده نشد.'
  return 'ثبت انجام نشد. اتصال اینترنت را بررسی کنید و دوباره بزنید.'
}

/**
 * ورود و خروج من — the person checks in and out with their own phone. The location is read only when a button is pressed
 * and checked on the server against the project's sites; time is the server's. Every attempt, accepted or not, is kept.
 */
export function MyCheckinPage({ links }: { links: MyLink[] }) {
  const [pid, setPid] = useState(links[0]?.person_id ?? '')
  const link = links.find((l) => l.person_id === pid) ?? links[0]
  const days = useMemo(() => monthDays(thisMonth()), [])
  const [att, setAtt] = useState<Day[]>([])
  const [punches, setPunches] = useState<Punch[]>([])
  const [busy, setBusy] = useState<'in' | 'out' | null>(null)
  const [acc, setAcc] = useState<number | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const today = todayLocal()

  const refresh = useCallback(async () => {
    if (!link) return
    const { data } = await supabase.rpc('sv_my_month', { p_person: link.person_id, p_from: days[0].iso, p_to: days[days.length - 1].iso })
    const d = (data ?? { att: [], punches: [] }) as { att: Day[]; punches: Punch[] }
    setAtt(d.att); setPunches(d.punches)
  }, [link, days])
  useEffect(() => { void refresh() }, [refresh])

  const punch = async (kind: 'in' | 'out') => {
    if (!link) return
    setBusy(kind); setMsg(null)
    let pos: GeolocationPosition
    setAcc(null)
    try { pos = await fixWithNetworkFallback({ target: 50, maxMs: 15000, onProgress: setAcc }) } catch (e) { setBusy(null); setMsg({ ok: false, text: geoError(e) }); return }
    // every reading goes to the server, which decides (GPS, or a cell/Wi-Fi position within the project's limit) and keeps the attempt
    const { data, error } = await supabase.rpc('sv_self_punch', { p_person: link.person_id, p_kind: kind, p_lat: pos.coords.latitude, p_lng: pos.coords.longitude, p_accuracy: pos.coords.accuracy, p_device: navigator.userAgent })
    setBusy(null)
    if (error) { setMsg({ ok: false, text: rpcError(error.message) }); return }
    const r = data as Result
    if (r.accepted) {
      const t = kind === 'in' ? r.check_in : r.check_out
      setMsg({ ok: true, text: `${kind === 'in' ? 'ورود' : 'خروج'} ثبت شد${t ? ` — ساعت ${fa(t)}` : ''}؛ «${r.site}»، ${dist(r.distance_m)} از مرکز${r.quality === 'network' ? `، با موقعیت آنتن/شبکهٔ گوشی (±${dist(r.accuracy_m)})؛ برای دقت بیشتر GPS را روشن نگه دارید` : ''}.${r.day !== today ? ` (برای روز ${fa(formatJalali(r.day))})` : ''}` })
    } else if (r.reason === 'outside') {
      setMsg({ ok: false, text: `خارج از محدودهٔ کارگاه هستید: ${dist(r.distance_m)} تا «${r.site}» (شعاع مجاز ${fa(r.radius_m)} متر). ثبت نشد؛ این تلاش در سابقه می‌ماند.` })
    } else if (r.reason === 'low_accuracy') {
      setMsg({ ok: false, text: isApproximate(r.accuracy_m)
        ? `${APPROX_MSG(r.accuracy_m)} (حتی موقعیت آنتن تا ±${dist(r.network_max_m)} پذیرفته می‌شود.)`
        : `دقت موقعیت گوشی کافی نیست (±${dist(r.accuracy_m)}؛ حداکثر مجاز ±${dist(r.network_max_m)}). GPS را روشن کنید، چند لحظه در فضای باز بمانید و دوباره بزنید.` })
    } else if (r.reason === 'no_check_in') {
      setMsg({ ok: false, text: 'امروز «ورود» ثبت نشده است؛ اول ورود را بزنید.' })
    } else if (r.reason === 'locked') {
      setMsg({ ok: false, text: 'گزارش این ماه امضا شده و بسته است؛ به سرپرست نظارت اطلاع دهید.' })
    }
    await refresh()
  }

  if (!link) return <div className="im-card im-empty">حساب شما به هیچ نفری وصل نیست. برای ثبت ورود و خروج با گوشی، سرپرست دستگاه نظارت باید در «تنظیمات ← ثبت حضور با گوشی ← حساب کاربری نفرات» حساب شما را جلوی نام شما انتخاب کند و دست‌کم یک «محل مجاز» تعریف شده باشد؛ بلافاصله بعد از آن همین صفحه فعال می‌شود.</div>
  const t = att.find((a) => a.day === today)
  // a night shift checked in yesterday evening is closed with «خروج» this morning
  const yesterdayOpen = att.find((a) => a.day === addDays(today, -1) && a.check_in && !a.check_out)
  const next: 'in' | 'out' = t?.check_in && !t.check_out ? 'out' : yesterdayOpen && !t?.check_in ? 'out' : 'in'
  const worked = att.filter((a) => a.status === 'present' || a.status === 'mission').length
  const gps = att.filter((a) => a.source === 'gps').length

  return (
    <div className="sv-me">
      {links.length > 1 && (
        <div className="im-seg" role="tablist" aria-label="پروژه">
          {links.map((l) => <button key={l.person_id} role="tab" aria-selected={l.person_id === link.person_id} className={l.person_id === link.person_id ? 'on' : ''} onClick={() => { setPid(l.person_id); setMsg(null) }}>{l.project_name}</button>)}
        </div>
      )}
      <section className="sv-me-card">
        <div className="sv-me-who">
          <b>{link.full_name}</b>
          <span>{link.role_title}{link.shift_start && link.shift_end ? `، ساعت کاری از ${fa(link.shift_start)} تا ${fa(link.shift_end)}` : ''}</span>
          <span>{link.project_name}</span>
        </div>
        <div className="sv-me-today">
          <span>{weekdayFa(today)} {fa(formatJalali(today))}</span>
          <div className="sv-me-times">
            <div><small>ورود</small><b>{t?.check_in ? fa(t.check_in) : '—'}</b></div>
            <div><small>خروج</small><b>{t?.check_out ? fa(t.check_out) : '—'}</b></div>
            <div><small>کارکرد</small><b>{t?.check_in && t.check_out ? faNum(t.hours) : '—'}</b></div>
          </div>
          {t && t.status !== 'present' && <span className="sv-note">وضعیت امروز: {STATUS_FA[t.status]}</span>}
        </div>
        {link.sites === 0 && <p className="sv-me-msg bad"><TriangleAlert size={16} /> هنوز محدودهٔ کارگاه تعریف نشده؛ ثبت با گوشی پس از تعریف آن در «تنظیمات» ممکن می‌شود.</p>}
        <div className="sv-me-btns">
          <button className={`sv-me-btn in ${next === 'in' ? 'next' : ''}`} onClick={() => punch('in')} disabled={!!busy}>
            {busy === 'in' ? <Loader2 className="animate-spin" size={26} /> : <LogIn size={26} />}<span>ثبت ورود</span>
          </button>
          <button className={`sv-me-btn out ${next === 'out' ? 'next' : ''}`} onClick={() => punch('out')} disabled={!!busy}>
            {busy === 'out' ? <Loader2 className="animate-spin" size={26} /> : <LogOut size={26} />}<span>ثبت خروج</span>
          </button>
        </div>
        {busy && <p className="sv-note" style={{ textAlign: 'center' }}>در حال گرفتن موقعیت گوشی (GPS، و اگر دقیق نشد آنتن و شبکه){acc != null ? ` — دقت فعلی ±${fa(Math.round(acc))} متر` : ''}…</p>}
        {msg && <p className={`sv-me-msg ${msg.ok ? 'ok' : 'bad'}`} role="status">{msg.ok ? <ShieldCheck size={16} /> : <TriangleAlert size={16} />}{msg.text}</p>}
        <p className="sv-note sv-me-privacy"><MapPin size={12} /> موقعیت فقط هنگام زدن دکمه یک بار خوانده می‌شود و با محدودهٔ کارگاه مقایسه می‌شود؛ ساعت ثبت، ساعت سرور است نه ساعت گوشی.</p>
      </section>

      <section className="sv-me-card">
        <div className="sv-me-head"><b>{fa(monthLabel(thisMonth()))}</b><span>{fa(worked)} روز کارکرد، {fa(gps)} روز با گوشی</span><button className="sv-iconbtn" onClick={() => void refresh()} aria-label="تازه کردن"><RefreshCw size={15} /></button></div>
        <div className="im-table-wrap"><table className="im-table sv-me-table">
          <thead><tr><th>روز</th><th>وضعیت</th><th>ورود</th><th>خروج</th><th>ساعت</th></tr></thead>
          <tbody>
            {[...att].reverse().map((a) => (
              <tr key={a.day}>
                <td>{fa(formatJalali(a.day).slice(5))} <small className="sv-note">{weekdayFa(a.day)}</small></td>
                <td>{STATUS_FA[a.status]}{a.source === 'gps' && <MapPin size={11} className="sv-gps-ico" aria-label="با گوشی" />}</td>
                <td>{a.check_in ? fa(a.check_in) : '—'}</td><td>{a.check_out ? fa(a.check_out) : '—'}</td><td>{a.check_in && a.check_out ? faNum(a.hours) : '—'}</td>
              </tr>
            ))}
            {!att.length && <tr><td colSpan={5} className="sv-note">در این ماه روزی ثبت نشده است.</td></tr>}
          </tbody>
        </table></div>
        {punches.length > 0 && (
          <details className="sv-sign-hist">
            <summary>همهٔ تلاش‌های ثبت ({fa(punches.length)})</summary>
            <ul>{punches.map((p, i) => <li key={i}>{fa(formatJalali(p.day).slice(5))}، {clock(p.at)}، {p.kind === 'in' ? 'ورود' : 'خروج'}، {p.accepted ? 'پذیرفته' : `رد: ${REASON[p.reason] ?? p.reason}`}{p.distance_m != null ? `، ${dist(p.distance_m)}${p.site ? ` تا ${p.site}` : ''}` : ''}</li>)}</ul>
          </details>
        )}
      </section>
    </div>
  )
}
