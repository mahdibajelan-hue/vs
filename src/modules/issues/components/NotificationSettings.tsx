import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../store/useAuthStore'
import { useIssuesStore } from '../store/useIssuesStore'

interface Prefs { in_app: boolean; email: boolean; sms: boolean; push: boolean; messenger: boolean; quiet_start: number | null; quiet_end: number | null; muted_projects: string[]; contact: { phone?: string; messenger_id?: string } }
interface Rule { key: string; name: string; description: string; recipients: string[]; escalate_to: string[]; channels: string[]; is_active: boolean; sort: number }
interface OutRow { channel: string; status: string; c: number }

const DEFAULT: Prefs = { in_app: true, email: true, sms: false, push: false, messenger: false, quiet_start: null, quiet_end: null, muted_projects: [], contact: {} }
const CH_FA: Record<string, string> = { in_app: 'درون‌برنامه', email: 'ایمیل', sms: 'پیامک', push: 'اعلان فوری (Push)', messenger: 'پیام‌رسان' }
const ROLE_FA: Record<string, string> = { owner: 'مالک', follow_up: 'پیگیری‌کننده', pursuer: 'مسئول انجام', approver: 'مسئول تأیید', admins: 'مدیران پروژه' }
const ST_FA: Record<string, string> = { queued: 'در صف', sent: 'ارسال‌شده', read: 'خوانده‌شده', skipped: 'ردشده (کانال غیرفعال/بدون مخاطب)', failed: 'ناموفق' }

export function NotificationSettings({ isAdmin }: { isAdmin: boolean }) {
  const me = useAuthStore((s) => s.profile?.id)
  const projects = useIssuesStore((s) => s.projects)
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT)
  const [rules, setRules] = useState<Rule[]>([])
  const [outbox, setOutbox] = useState<OutRow[]>([])
  const [problems, setProblems] = useState<{ channel: string; status: string; last_error: string }[]>([])
  const [channels, setChannels] = useState<Record<string, boolean> | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    if (!me) return
    const [p, r] = await Promise.all([supabase.from('im_notif_prefs').select('*').eq('user_id', me).maybeSingle(), supabase.from('im_notif_rules').select('*').order('sort')])
    if (p.data) setPrefs({ ...DEFAULT, ...(p.data as Partial<Prefs>) })
    setRules((r.data ?? []) as Rule[])
    if (isAdmin) {
      const o = await supabase.from('im_notif_outbox').select('channel,status').order('id', { ascending: false }).limit(2000)
      const m = new Map<string, number>()
      for (const x of (o.data ?? []) as { channel: string; status: string }[]) m.set(x.channel + '|' + x.status, (m.get(x.channel + '|' + x.status) ?? 0) + 1)
      setOutbox([...m.entries()].map(([k, c]) => ({ channel: k.split('|')[0], status: k.split('|')[1], c })))
      const bad = await supabase.from('im_notif_outbox').select('channel,status,last_error').in('status', ['failed', 'skipped']).order('id', { ascending: false }).limit(200)
      const seen = new Set<string>()
      setProblems(((bad.data ?? []) as { channel: string; status: string; last_error: string }[]).filter((x) => { const k = x.channel + x.last_error; if (seen.has(k)) return false; seen.add(k); return true }).slice(0, 6))
      const st = await supabase.functions.invoke('im-notify', { body: { action: 'status' } })
      setChannels(st.error ? null : (st.data as { channels: Record<string, boolean> }).channels)
    }
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [me, isAdmin])

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 3000) }
  const save = async (next: Prefs) => {
    setPrefs(next)
    if (!me) return
    const { error } = await supabase.from('im_notif_prefs').upsert({ user_id: me, ...next, updated_at: new Date().toISOString() })
    flash(error ? 'ذخیره نشد' : 'ذخیره شد')
  }
  const toggleRule = async (r: Rule) => {
    const { error } = await supabase.from('im_notif_rules').update({ is_active: !r.is_active }).eq('key', r.key)
    if (!error) setRules((rs) => rs.map((x) => (x.key === r.key ? { ...x, is_active: !x.is_active } : x)))
    else flash('فقط مدیر سیستم می‌تواند قاعده‌ها را تغییر دهد')
  }
  const runNow = async () => {
    setBusy(true)
    const r = await supabase.functions.invoke('im-notify', { body: { action: 'dispatch' } })
    if (r.error) {
      const g = await supabase.rpc('im_generate_notifications_now')
      flash(g.error ? 'اجرا ناموفق بود' : `اسکن انجام شد (${(g.data as { enqueued: number }).enqueued} اعلان جدید؛ ارسال بیرونی انجام نشد)`)
    } else {
      const d = r.data as { generated?: { enqueued: number }; delivered: { sent: number; skipped: number; retry: number; failed: number } }
      flash(`اعلان جدید ${d.generated?.enqueued ?? 0} · ارسال ${d.delivered.sent} · ردشده ${d.delivered.skipped} · تلاش مجدد ${d.delivered.retry} · ناموفق ${d.delivered.failed}`)
    }
    setBusy(false)
    load()
  }

  const hourOpts = Array.from({ length: 24 }, (_, h) => h)
  return (
    <div className="im-grid" style={{ gap: 14 }}>
      {msg && <div className="im-notice ok" role="status">{msg}</div>}
      <div className="im-card">
        <div className="im-section-title">ترجیحات من</div>
        <div className="im-actions" style={{ marginBottom: 12 }}>
          <label className="im-chip"><input type="checkbox" checked disabled /> درون‌برنامه (همیشه فعال)</label>
          {(['email', 'sms', 'push', 'messenger'] as const).map((c) => <label key={c} className="im-chip" style={{ cursor: 'pointer' }}><input type="checkbox" checked={prefs[c]} onChange={(e) => save({ ...prefs, [c]: e.target.checked })} /> {CH_FA[c]}</label>)}
        </div>
        <div className="im-row">
          <div className="im-field"><label>شمارهٔ موبایل (برای پیامک)</label><input dir="ltr" value={prefs.contact.phone ?? ''} onChange={(e) => setPrefs({ ...prefs, contact: { ...prefs.contact, phone: e.target.value } })} onBlur={() => save(prefs)} placeholder="09xxxxxxxxx" /></div>
          <div className="im-field"><label>شناسهٔ پیام‌رسان</label><input dir="ltr" value={prefs.contact.messenger_id ?? ''} onChange={(e) => setPrefs({ ...prefs, contact: { ...prefs.contact, messenger_id: e.target.value } })} onBlur={() => save(prefs)} /></div>
        </div>
        <div className="im-row">
          <div className="im-field"><label>ساعت سکوت از</label><select value={prefs.quiet_start ?? ''} onChange={(e) => save({ ...prefs, quiet_start: e.target.value === '' ? null : Number(e.target.value) })}><option value="">— ندارد —</option>{hourOpts.map((h) => <option key={h} value={h}>{h}:00</option>)}</select></div>
          <div className="im-field"><label>تا</label><select value={prefs.quiet_end ?? ''} onChange={(e) => save({ ...prefs, quiet_end: e.target.value === '' ? null : Number(e.target.value) })}><option value="">— ندارد —</option>{hourOpts.map((h) => <option key={h} value={h}>{h}:00</option>)}</select></div>
        </div>
        <div className="im-helper">در ساعت سکوت، اعلان‌های بیرونی تا پایان سکوت نگه داشته می‌شوند؛ اعلان‌های بحرانی و تشدید سطح ۳ استثنا هستند. اعلان‌های درون‌برنامه همیشه نمایش داده می‌شوند.</div>
        {projects.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div className="im-helper" style={{ marginBottom: 4 }}>بی‌صدا کردن پروژه‌ها (تشدیدهای سطح ۳ همچنان می‌رسند):</div>
            <div className="im-actions">{projects.map((p) => <label key={p.id} className="im-chip" style={{ cursor: 'pointer' }}><input type="checkbox" checked={prefs.muted_projects.includes(p.id)} onChange={(e) => save({ ...prefs, muted_projects: e.target.checked ? [...prefs.muted_projects, p.id] : prefs.muted_projects.filter((x) => x !== p.id) })} /> {p.name}</label>)}</div>
          </div>
        )}
      </div>

      <div className="im-card">
        <div className="im-section-title">قاعده‌های اعلان و تشدید</div>
        <div className="im-table-wrap" style={{ border: 'none' }}><table className="im-table"><thead><tr><th>قاعده</th><th>گیرندگان</th><th>تشدید به</th><th>کانال‌ها</th><th>فعال</th></tr></thead>
          <tbody>{rules.map((r) => (
            <tr key={r.key}><td><b>{r.name}</b><div className="im-helper">{r.description}</div></td>
              <td>{r.recipients.map((x) => ROLE_FA[x] ?? x).join('، ') || 'ذی‌نفع رویداد'}</td><td>{r.escalate_to.map((x) => ROLE_FA[x] ?? x).join('، ') || '—'}</td>
              <td style={{ fontSize: 11.5 }}>{r.channels.map((c) => CH_FA[c] ?? c).join('، ')}</td>
              <td><input type="checkbox" disabled={!isAdmin} checked={r.is_active} onChange={() => toggleRule(r)} aria-label={`فعال بودن ${r.name}`} /></td></tr>
          ))}</tbody></table></div>
        <div className="im-helper" style={{ marginTop: 8 }}>تکرار پیام‌ها با کلید یکتا (قاعده + مسئله + گیرنده + سطح تشدید) مهار می‌شود: هر سطح تشدید فقط یک‌بار ارسال می‌شود.</div>
      </div>

      {isAdmin && (
        <div className="im-card">
          <div className="im-section-title">وضعیت ارسال (مدیر) <button className="im-btn im-btn-primary im-btn-sm" disabled={busy} onClick={runNow}>{busy ? 'در حال اجرا…' : 'اسکن و ارسال اکنون'}</button></div>
          <div className="im-actions" style={{ marginBottom: 10 }}>
            {(['email', 'sms', 'push', 'messenger'] as const).map((c) => (
              <span key={c} className="im-chip" style={{ color: channels ? (channels[c] ? 'var(--im-mint)' : 'var(--im-amber)') : 'var(--im-muted)' }}>
                {CH_FA[c]}: {channels ? (channels[c] ? 'پیکربندی شده' : 'پیکربندی نشده — ارسال انجام نمی‌شود') : 'نامشخص'}
              </span>
            ))}
          </div>
          <div className="im-helper" style={{ marginBottom: 8 }}>کانال‌های بیرونی فقط وقتی «پیکربندی شده» هستند که آدرس وب‌هوک درگاه (ایمیل/پیامک/…) در تنظیمات توابع Supabase ثبت شده باشد. تا آن زمان اعلان‌ها فقط درون‌برنامه نمایش داده می‌شوند و ردیف‌های بیرونی با وضعیت «ردشده» ثبت می‌شوند — چیزی «ارسال‌شده» نمایش داده نمی‌شود مگر واقعاً ارسال شده باشد.</div>
          <div className="im-table-wrap" style={{ border: 'none' }}><table className="im-table"><thead><tr><th>کانال</th><th>وضعیت</th><th>تعداد (۲۰۰۰ ردیف اخیر)</th></tr></thead>
            <tbody>{outbox.sort((a, b) => a.channel.localeCompare(b.channel)).map((o) => <tr key={o.channel + o.status}><td>{CH_FA[o.channel] ?? o.channel}</td><td>{ST_FA[o.status] ?? o.status}</td><td>{o.c}</td></tr>)}</tbody></table></div>
          {problems.length > 0 && <div style={{ marginTop: 8 }}>{problems.map((p, k) => <div key={k} className="im-notice" style={{ marginBottom: 4 }}>{CH_FA[p.channel]}: {p.last_error || p.status}</div>)}</div>}
        </div>
      )}
    </div>
  )
}
