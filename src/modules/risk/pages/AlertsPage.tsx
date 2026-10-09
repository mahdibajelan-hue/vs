import { useEffect, useState } from 'react'
import { BellRing, CheckCheck, ExternalLink, Save } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { supabase } from '../../../lib/supabaseClient'
import { HelpButton } from '../../issues/components/Help'
import { NotificationSettings } from '../../issues/components/NotificationSettings'
import { useRiskStore } from '../store/useRiskStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { RK_HELP } from '../lib/help'
import type { RmNotifRule } from '../types'
import type { PageProps } from '../RiskApp'

const ROLES: [string, string][] = [['owner', 'مالک ریسک'], ['monitor', 'مسئول پایش'], ['approver', 'مرجع تأیید'], ['action_owner', 'مسئول اقدام'], ['project_manager', 'مدیر پروژه'], ['risk_manager', 'مدیر ریسک'], ['management', 'مدیریت ارشد'], ['admins', 'مدیران سامانه']]
const CH: [string, string][] = [['in_app', 'درون‌برنامه'], ['email', 'ایمیل'], ['sms', 'پیامک'], ['push', 'Push'], ['messenger', 'پیام‌رسان']]
interface Notif { id: number; title: string; body: string; level: number; risk_id: string; created_at: string; status: string; severity: string }

function Toggle({ set, value, onChange, options, disabled }: { set?: string; value: string[]; onChange: (v: string[]) => void; options: [string, string][]; disabled?: boolean }) {
  return <div className="im-actions" style={{ gap: 4 }} aria-label={set}>{options.map(([k, l]) => <label key={k} className="im-chip" style={{ cursor: disabled ? 'default' : 'pointer', margin: 0, opacity: value.includes(k) ? 1 : 0.55 }}><input type="checkbox" disabled={disabled} style={{ width: 'auto', marginInlineEnd: 4 }} checked={value.includes(k)} onChange={(e) => onChange(e.target.checked ? [...value, k] : value.filter((x) => x !== k))} />{l}</label>)}</div>
}

/** Alert rules are DATA (recipients, escalation, channels, thresholds, de-duplication) — an admin changes them here, no code change. */
export function AlertsPage({ onOpenRisk }: PageProps) {
  const rules = useRiskStore((s) => s.notifRules)
  const saveRule = useRiskStore((s) => s.saveNotifRule)
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin) ?? false
  const me = useAuthStore((s) => s.profile?.id)
  const [draft, setDraft] = useState<Record<string, RmNotifRule>>({})
  const [msg, setMsg] = useState('')
  const [mine, setMine] = useState<Notif[] | null>(null)

  const load = async () => {
    if (!me) return
    const { data } = await supabase.from('im_notif_outbox').select('id, title, body, level, risk_id, created_at, status, severity').eq('recipient_id', me).eq('channel', 'in_app').not('risk_id', 'is', null).order('id', { ascending: false }).limit(40)
    setMine((data ?? []) as Notif[])
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [me])
  const val = (r: RmNotifRule) => draft[r.key] ?? r
  const edit = (r: RmNotifRule, patch: Partial<RmNotifRule>) => setDraft((d) => ({ ...d, [r.key]: { ...val(r), ...patch } }))
  const save = async (r: RmNotifRule) => {
    const v = val(r)
    const res = await saveRule(r.key, { recipients: v.recipients, escalateTo: v.escalateTo, channels: v.channels, thresholdHours: v.thresholdHours, dedupeHours: v.dedupeHours, isActive: v.isActive })
    setMsg(res.ok ? `قاعدهٔ «${r.name}» ذخیره شد` : res.error ?? 'ذخیره نشد (فقط مدیر سامانه)')
    if (res.ok) setDraft((d) => { const n = { ...d }; delete n[r.key]; return n })
    setTimeout(() => setMsg(''), 3500)
  }
  const markRead = async (riskId: string) => { await supabase.rpc('rm_notif_mark_risk_read', { p_risk: riskId }); load() }

  return (
    <div className="im-page">
      <div className="im-topbar"><div><div className="im-page-title"><BellRing size={22} style={{ color: 'var(--im-coral)' }} />اعلان و تشدید هشدار</div><div className="im-page-sub">هشدار بازنگری، ریسک بحرانی، عبور KRI، تأخیر اقدام، کنترل ناقص و ریسک بدون مالک/برنامه</div></div><div className="im-actions"><HelpButton content={RK_HELP.alerts} /></div></div>
      {msg && <div className="im-notice ok" role="status" style={{ marginBottom: 10 }}>{msg}</div>}

      <div className="im-card" style={{ marginBottom: 14 }}>
        <div className="im-section-title">اعلان‌های ریسک من <span className="im-chip">{mine?.filter((n) => n.status !== 'read').length ?? 0} خوانده‌نشده</span></div>
        {mine === null ? <div className="im-skeleton" style={{ height: 60 }} /> : mine.length === 0 ? <div className="im-helper">اعلانی نیست. موتور اعلان به‌صورت دوره‌ای قاعده‌ها را بررسی می‌کند (هر ۱۵ دقیقه در صورت زمان‌بندی؛ یا دستی از مدیر سامانه).</div> : mine.map((n) => (
          <div key={n.id} className="im-task" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6, opacity: n.status === 'read' ? 0.6 : 1, borderInlineStart: `4px solid ${n.level >= 2 ? '#ef4444' : n.level === 1 ? '#f59e0b' : '#0ea5e9'}` }}>
            <div><b>{n.title}</b><div className="im-helper">{n.body}</div><div className="im-helper" style={{ fontSize: 10.5 }}>{formatJalali(n.created_at.slice(0, 10))} · {n.created_at.slice(11, 16)}{n.level >= 1 ? ` · سطح تشدید ${n.level}` : ''}</div></div>
            <div className="im-actions" style={{ flexShrink: 0 }}><button className="im-ghostlink" onClick={() => { markRead(n.risk_id); onOpenRisk(n.risk_id) }}><ExternalLink size={11} /> باز کردن</button>{n.status !== 'read' && <button className="im-ghostlink" onClick={() => markRead(n.risk_id)}><CheckCheck size={11} /> خوانده شد</button>}</div>
          </div>
        ))}
      </div>

      <div className="im-card" style={{ marginBottom: 14 }}>
        <div className="im-section-title">قاعده‌های هشدار {!isAdmin && <span className="im-helper">(فقط مشاهده — ویرایش با مدیر سامانه)</span>}</div>
        <div className="im-grid" style={{ gap: 10 }}>
          {rules.map((r) => {
            const v = val(r)
            const changed = !!draft[r.key]
            return (
              <div key={r.key} className="im-task" style={{ opacity: v.isActive ? 1 : 0.6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div><b>{r.name}</b> <span className="rk-flag" style={{ ['--c' as string]: r.kind === 'event' ? '#0ea5e9' : '#8b5cf6' }}>{r.kind === 'event' ? 'رویدادی' : 'پایش وضعیت'}</span><div className="im-helper">{r.description}</div></div>
                  <label className="im-chip" style={{ cursor: isAdmin ? 'pointer' : 'default', margin: 0 }}><input type="checkbox" disabled={!isAdmin} style={{ width: 'auto', marginInlineEnd: 5 }} checked={v.isActive} onChange={(e) => edit(r, { isActive: e.target.checked })} />فعال</label>
                </div>
                <div className="rk-grid2" style={{ marginTop: 8 }}>
                  <div><div className="im-helper" style={{ marginBottom: 3 }}>گیرندگان</div><Toggle options={ROLES} value={v.recipients} disabled={!isAdmin} onChange={(x) => edit(r, { recipients: x })} /></div>
                  <div><div className="im-helper" style={{ marginBottom: 3 }}>تشدید به (با طولانی‌شدن)</div><Toggle options={ROLES} value={v.escalateTo} disabled={!isAdmin} onChange={(x) => edit(r, { escalateTo: x })} /></div>
                  <div><div className="im-helper" style={{ marginBottom: 3 }}>کانال‌ها</div><Toggle options={CH} value={v.channels} disabled={!isAdmin} onChange={(x) => edit(r, { channels: x })} /></div>
                  <div className="im-actions">{r.kind === 'state' && <label className="im-helper">آستانه (ساعت) <input type="number" min={0} style={{ width: 80 }} disabled={!isAdmin} value={v.thresholdHours} onChange={(e) => edit(r, { thresholdHours: Number(e.target.value) })} /></label>}<label className="im-helper">جلوگیری از تکرار (ساعت) <input type="number" min={0} style={{ width: 80 }} disabled={!isAdmin} value={v.dedupeHours} onChange={(e) => edit(r, { dedupeHours: Number(e.target.value) })} /></label></div>
                </div>
                {isAdmin && changed && <button className="im-btn im-btn-primary im-btn-sm" style={{ marginTop: 8 }} onClick={() => save(r)}><Save size={12} /> ذخیرهٔ قاعده</button>}
              </div>
            )
          })}
          {rules.length === 0 && <div className="im-empty">قاعده‌ای یافت نشد.</div>}
        </div>
        <div className="im-helper" style={{ marginTop: 10 }}>تغییر قاعده‌ها در «سابقهٔ تغییر تنظیمات» ثبت می‌شود. تشدید مرحله‌ای: سطح ۱ فقط گیرندگان اصلی، سطح ۲ به بعد گیرندگان «تشدید به» هم اضافه می‌شوند؛ هر سطح یک‌بار ارسال می‌شود.</div>
      </div>

      <NotificationSettings isAdmin={isAdmin} scope="risk" hideRules />
    </div>
  )
}
