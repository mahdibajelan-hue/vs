import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../../../store/useAuthStore'
import { useIssuesStore } from '../store/useIssuesStore'
import { useIssuesMembersStore } from '../store/useIssuesMembersStore'
import { useIssueConfigStore } from '../store/useIssueConfigStore'
import { IM_PRIORITY_LABEL_FA } from '../types'
import { IM_STAGE_LABEL_FA } from '../lib/imModel'
import { validateWorkflow } from '../lib/imWorkflow'

/** Read-mostly configuration. Admin-only edits (SLA, category rules) are written straight to the config tables; the workflow graph is shown with a live validity check. */
export function SettingsPage() {
  const cfg = useIssueConfigStore()
  const projects = useIssuesStore((s) => s.projects)
  const members = useIssuesMembersStore((s) => s.membersByProject)
  const me = useAuthStore((s) => s.profile?.id)
  const isAdmin = projects.some((p) => (members[p.id] ?? []).some((m) => m.userId === me && m.role === 'admin'))
  const [msg, setMsg] = useState('')
  useEffect(() => { if (!cfg.loaded) cfg.fetch() }, [cfg])
  const errors = useMemo(() => validateWorkflow(cfg.stages.map((s) => ({ key: s.key, terminal: s.isTerminal, start: s.key === 'registered' })), cfg.transitions), [cfg.stages, cfg.transitions])
  const flash = (ok: boolean) => { setMsg(ok ? 'ذخیره شد' : 'ذخیره نشد — دسترسی مدیر لازم است'); setTimeout(() => setMsg(''), 2500) }

  return (
    <div>
      <div className="im-topbar"><div><div className="im-page-title">تنظیمات و قوانین</div><div className="im-page-sub">{isAdmin ? 'شما مدیر هستید؛ تغییرات بلافاصله اعمال می‌شود' : 'فقط مشاهده — ویرایش با مدیر پروژه'}</div></div>{msg && <span className="im-chip">{msg}</span>}</div>

      <div className="im-card" style={{ marginBottom: 14 }}>
        <div className="im-section-title">سطح خدمات (SLA) بر اساس شدت</div>
        <div className="im-table-wrap" style={{ border: 'none' }}><table className="im-table"><thead><tr><th>شدت</th><th>مهلت پاسخ اولیه (ساعت)</th><th>هدف رفع (روز)</th></tr></thead>
          <tbody>{cfg.sla.map((p) => (
            <tr key={p.severity}><td>{IM_PRIORITY_LABEL_FA[p.severity]}</td>
              <td><input style={{ width: 90 }} type="number" min={1} disabled={!isAdmin} defaultValue={p.responseHours} onBlur={async (e) => { const v = Number(e.target.value); if (v > 0 && v !== p.responseHours) flash(await cfg.saveSla({ ...p, responseHours: v })) }} /></td>
              <td><input style={{ width: 90 }} type="number" min={1} disabled={!isAdmin} defaultValue={p.resolveDays} onBlur={async (e) => { const v = Number(e.target.value); if (v > 0 && v !== p.resolveDays) flash(await cfg.saveSla({ ...p, resolveDays: v })) }} /></td></tr>
          ))}</tbody></table></div>
      </div>

      <div className="im-card" style={{ marginBottom: 14 }}>
        <div className="im-section-title">قوانین بستن به تفکیک دسته <span className="im-helper">«رفع واقعی» با این شروط سنجیده می‌شود</span></div>
        <div className="im-table-wrap" style={{ border: 'none' }}><table className="im-table"><thead><tr><th>دسته</th><th>شاهد رفع الزامی</th><th>تأیید علت ریشه‌ای الزامی</th><th>راهنمای معیار پذیرش</th></tr></thead>
          <tbody>{cfg.categories.map((c) => (
            <tr key={c.key}><td style={{ fontWeight: 700 }}>{c.labelFa}</td>
              <td><input type="checkbox" style={{ width: 'auto' }} disabled={!isAdmin} checked={c.requireEvidence} onChange={async (e) => flash(await cfg.saveCategory(c.key, { requireEvidence: e.target.checked }))} /></td>
              <td><input type="checkbox" style={{ width: 'auto' }} disabled={!isAdmin} checked={c.requireRootCause} onChange={async (e) => flash(await cfg.saveCategory(c.key, { requireRootCause: e.target.checked }))} /></td>
              <td><input disabled={!isAdmin} defaultValue={c.acceptanceHint} onBlur={async (e) => { if (e.target.value !== c.acceptanceHint) flash(await cfg.saveCategory(c.key, { acceptanceHint: e.target.value })) }} /></td></tr>
          ))}</tbody></table></div>
        <div className="im-helper" style={{ marginTop: 8 }}>مسائل با شدت «بالا» یا «بحرانی» همیشه نیازمند تأیید علت ریشه‌ای هستند.</div>
      </div>

      <div className="im-card" style={{ marginBottom: 14 }}>
        <div className="im-section-title">گردش‌کار استاندارد {errors.length === 0 ? <span className="im-chip" style={{ color: 'var(--im-mint)' }}>معتبر</span> : <span className="im-chip" style={{ color: 'var(--im-coral)' }}>{errors.length} ایراد</span>}</div>
        {errors.map((e) => <div key={e} className="im-notice bad" style={{ marginBottom: 6 }}>{e}</div>)}
        <div className="im-table-wrap" style={{ border: 'none' }}><table className="im-table"><thead><tr><th>از</th><th>به</th><th>دلیل الزامی</th><th>نقش‌های مجاز</th></tr></thead>
          <tbody>{cfg.transitions.map((t) => <tr key={t.from + t.to}><td>{IM_STAGE_LABEL_FA[t.from as keyof typeof IM_STAGE_LABEL_FA] ?? t.from}</td><td>{IM_STAGE_LABEL_FA[t.to as keyof typeof IM_STAGE_LABEL_FA] ?? t.to}</td><td>{t.requiresReason ? 'بله' : '—'}</td><td style={{ fontSize: 11.5, color: 'var(--im-muted-2)' }}>{t.allowedRoles.join('، ')}</td></tr>)}</tbody></table></div>
      </div>

      <div className="im-card">
        <div className="im-section-title">الگوهای مسئله</div>
        <div className="im-grid" style={{ gap: 8 }}>{cfg.templates.map((t) => <div key={t.key} className="im-check" style={{ justifyContent: 'space-between' }}><span><b>{t.name}</b><div className="im-helper">{t.tasks.length} اقدام پیشنهادی · مهلت {t.defaults.deadline_days ?? '—'} روز</div></span></div>)}</div>
      </div>
    </div>
  )
}
