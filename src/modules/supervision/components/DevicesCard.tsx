import { useEffect, useMemo, useState } from 'react'
import { Ban, CheckCircle2, Loader2, Smartphone } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { useSupervisionStore } from '../store/useSupervisionStore'
import { fa } from '../lib/svMonth'
import { Flash } from './common'
import type { SvDevice } from '../types'

const STATUS: Record<SvDevice['status'], { t: string; c: string }> = { pending: { t: 'در انتظار تأیید', c: '#f59e0b' }, active: { t: 'تأییدشده', c: '#22c55e' }, revoked: { t: 'غیرفعال', c: '#64748b' } }
const tehranDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const when = (iso: string | null) => (iso ? `${fa(formatJalali(tehranDay(iso)))} ${fa(new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' }))}` : '—')

/**
 * گوشی‌های ثبت‌شده — each person's phone as their key. New phones wait for the head of supervision; approving a phone
 * retires the person's previous one. «فقط با گوشی ثبت‌شده» makes the phone mandatory for this project.
 */
export function DevicesCard() {
  const devices = useSupervisionStore((s) => s.devices)
  const people = useSupervisionStore((s) => s.people)
  const punches = useSupervisionStore((s) => s.punches)
  const settings = useSupervisionStore((s) => s.settings)
  const saveSettings = useSupervisionStore((s) => s.saveSettings)
  const decide = useSupervisionStore((s) => s.decideDevice)
  const canHand = useSupervisionStore((s) => s.canHand)()
  const loadDevices = useSupervisionStore((s) => s.loadDevices)
  // newly registered phones appear when the card opens
  useEffect(() => { void loadDevices() }, [loadDevices])
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [showOld, setShowOld] = useState(false)
  const name = useMemo(() => new Map(people.map((p) => [p.id, p.fullName])), [people])
  const linked = people.filter((p) => p.active && p.userId)
  const withActive = new Set(devices.filter((d) => d.status === 'active').map((d) => d.personId))
  const missing = linked.filter((p) => !withActive.has(p.id))
  // a phone whose browser also checked in for somebody else
  const sharedInstall = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const p of punches) if (p.installId) m.set(p.installId, (m.get(p.installId) ?? new Set()).add(p.personId))
    return m
  }, [punches])
  const warn = (d: SvDevice) => {
    const who = d.installId ? [...(sharedInstall.get(d.installId) ?? [])].filter((id) => id !== d.personId) : []
    return who.length ? `این مرورگر برای ${who.map((id) => name.get(id) ?? '؟').join('، ')} هم ثبت حضور کرده است` : ''
  }
  const order: Record<SvDevice['status'], number> = { pending: 0, active: 1, revoked: 2 }
  const list = [...devices].sort((a, b) => order[a.status] - order[b.status] || b.createdAt.localeCompare(a.createdAt)).filter((d) => showOld || d.status !== 'revoked')

  const act = async (d: SvDevice, status: 'active' | 'revoked') => {
    setBusy(d.id); setMsg(null)
    const r = await decide(d.id, status, '')
    setBusy(null)
    setMsg(r.ok ? { ok: true, text: status === 'active' ? `گوشی ${name.get(d.personId) ?? ''} تأیید شد.` : 'گوشی غیرفعال شد.' } : { ok: false, text: r.error ?? '' })
  }
  const toggle = async () => {
    if (!settings.requireDevice && missing.length && !window.confirm(`${fa(missing.length)} نفر هنوز گوشی تأییدشده ندارند و پس از این کار تا ثبت و تأیید گوشی نمی‌توانند ورود و خروج ثبت کنند. ادامه می‌دهید؟`)) return
    const r = await saveSettings({ ...settings, requireDevice: !settings.requireDevice })
    setMsg(r.ok ? { ok: true, text: !settings.requireDevice ? 'از این پس ورود و خروج فقط با گوشی ثبت‌شده پذیرفته می‌شود.' : 'ثبت بدون گوشی تأییدشده دوباره پذیرفته می‌شود.' } : { ok: false, text: r.error ?? '' })
  }

  return (
    <div className="im-card sv-devices">
      <h2 style={{ fontSize: 16, fontWeight: 900, margin: '0 0 6px' }}><Smartphone size={17} style={{ display: 'inline', verticalAlign: -3 }} /> گوشی‌های ثبت‌شده</h2>
      <p className="sv-note" style={{ margin: '0 0 10px', lineHeight: 1.9 }}>
        هر نفر گوشی خودش را در «ورود و خروج من» ثبت می‌کند. پس از تأیید شما، هر ورود و خروج او با اثر انگشت، تشخیص چهره یا قفل همان گوشی امضا می‌شود؛ پس دانستن رمز عبور کسی برای ثبت حضور به‌جای او کافی نیست. هر نفر یک گوشی فعال دارد و تأیید گوشی تازه، گوشی قبلی را غیرفعال می‌کند. گوشی‌ای که پیش‌تر برای نفر دیگری ثبت شده پذیرفته نمی‌شود.
      </p>
      <div className="sv-dev-policy">
        <label className="sv-switch">
          <input type="checkbox" checked={settings.requireDevice} onChange={toggle} disabled={!canHand} />
          <span><b>ورود و خروج فقط با گوشی ثبت‌شده</b><small>{settings.requireDevice ? 'فعال: ثبت بدون امضای گوشی تأییدشده پذیرفته نمی‌شود.' : 'غیرفعال: ثبت بدون گوشی هم پذیرفته می‌شود و در «ثبت‌های مشکوک» نشان داده می‌شود. پس از ثبت و تأیید گوشی همهٔ نفرات آن را فعال کنید.'}</small></span>
        </label>
        <span className="sv-dev-count">{fa(linked.length - missing.length)} از {fa(linked.length)} نفر گوشی تأییدشده دارند</span>
      </div>
      {missing.length > 0 && <p className="sv-note" style={{ margin: '8px 0 0' }}>بدون گوشی تأییدشده: {missing.map((p) => p.fullName).join('، ')}</p>}
      <Flash msg={msg} />
      {list.length ? (
        <ul className="sv-dev-list">
          {list.map((d) => {
            const w = warn(d)
            return (
              <li key={d.id} style={{ ['--c' as string]: STATUS[d.status].c }}>
                <span className="sv-dev-main">
                  <b>{name.get(d.personId) ?? 'نفر نامشخص'}</b>
                  <small>{d.label || 'گوشی'} · ثبت {when(d.createdAt)}{d.lastUsedAt ? ` · آخرین استفاده ${when(d.lastUsedAt)}` : ''}{d.ip ? ` · ${d.ip}` : ''}</small>
                  {w && <em>{w}</em>}
                </span>
                <span className="sv-dev-state">{STATUS[d.status].t}</span>
                {canHand && d.status !== 'revoked' && (
                  <span className="sv-dev-btns">
                    {d.status === 'pending' && <button className="im-btn im-btn-primary" onClick={() => act(d, 'active')} disabled={!!busy}>{busy === d.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} تأیید</button>}
                    <button className="im-btn im-btn-ghost" onClick={() => act(d, 'revoked')} disabled={!!busy}><Ban size={14} /> {d.status === 'pending' ? 'رد' : 'غیرفعال'}</button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      ) : <p className="sv-note" style={{ marginTop: 10 }}>هنوز گوشی‌ای ثبت نشده است.</p>}
      {devices.some((d) => d.status === 'revoked') && <button className="im-btn im-btn-ghost" style={{ marginTop: 8 }} onClick={() => setShowOld((x) => !x)}>{showOld ? 'پنهان کردن گوشی‌های غیرفعال' : 'نمایش گوشی‌های غیرفعال'}</button>}
    </div>
  )
}
