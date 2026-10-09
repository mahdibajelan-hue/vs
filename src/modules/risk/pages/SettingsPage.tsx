import { useEffect, useMemo, useState } from 'react'
import { Check, Plus, Save, Settings2, UserPlus } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../store/useAuthStore'
import { HelpButton } from '../../issues/components/Help'
import { useRiskData, useRiskDirectory } from '../lib/useRiskData'
import { useRiskStore } from '../store/useRiskStore'
import { useRiskPeopleStore } from '../store/useRiskPeopleStore'
import { RK_HELP } from '../lib/help'
import { DEFAULT_POLICY, IMPACT_ANCHORS_FA, IMPACT_LABELS_FA, PROBABILITY_LABELS_FA, effectivePolicy, levelOf, validatePolicy, zoneOf, ZONE_COLOR, ZONE_LABEL_FA } from '../lib/riskPolicy'
import { RM_IMPACT_DIMS, RM_IMPACT_DIM_LABEL_FA, RM_ROLE_DESCRIPTION_FA, RM_ROLE_LABEL_FA, RM_ROLES, type RmPolicy, type RmUserRole } from '../types'
import { Field } from '../components/rk'
import type { PageProps } from '../RiskApp'

type Tab = 'policy' | 'categories' | 'members' | 'scales' | 'audit'
const LV_COLOR = { low: '#22c55e', medium: '#eab308', high: '#f97316', critical: '#ef4444' } as const
interface Audit { id: number; entity: string; entity_id: string; actor: string | null; at: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null }

export function SettingsPage({ onOpenRisk }: PageProps) {
  void onOpenRisk
  const d = useRiskData()
  const dir = useRiskDirectory()
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin) ?? false
  const policies = useRiskStore((s) => s.policies)
  const categories = useRiskStore((s) => s.categories)
  const risks = useRiskStore((s) => s.risks)
  const projects = useRiskStore((s) => s.projects)
  const { savePolicy, saveCategory } = useRiskStore.getState()
  const [tab, setTab] = useState<Tab>('policy')
  const [scope, setScope] = useState<string>('global')
  const [msg, setMsg] = useState('')
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 3500) }

  // ---- policy
  const base = useMemo(() => (scope === 'global' ? policies.find((p) => p.projectId === null) ?? DEFAULT_POLICY : effectivePolicy(policies, scope)), [policies, scope])
  const [p, setP] = useState<RmPolicy>(base)
  useEffect(() => setP(base), [base])
  const err = validatePolicy(p)
  const dirty = JSON.stringify(p) !== JSON.stringify(base)
  const doSave = async () => {
    const r = await savePolicy({ ...p, projectId: scope === 'global' ? null : scope })
    flash(r.ok ? 'سیاست ذخیره شد' : r.error ?? 'ذخیره نشد')
  }
  const hasOverride = scope !== 'global' && policies.some((x) => x.projectId === scope)

  // ---- categories
  const [newCat, setNewCat] = useState<{ label: string; parent: string }>({ label: '', parent: '' })
  const used = (k: string) => risks.filter((r) => r.category === k || r.subcategory === k).length
  const addCat = async () => {
    if (newCat.label.trim().length < 2) { flash('نام دسته را بنویسید'); return }
    const key = 'c_' + Date.now().toString(36)
    const r = await saveCategory({ key, labelFa: newCat.label.trim(), parentKey: newCat.parent || null, active: true, sort: 500 })
    if (r.ok) setNewCat({ label: '', parent: '' }); else flash(r.error ?? 'ثبت نشد (فقط مدیر سامانه)')
  }

  // ---- members (module roles); people themselves come from User Management
  const [mp, setMp] = useState(d.scope !== 'all' ? d.scope : projects[0]?.id ?? '')
  const [members, setMembers] = useState<{ user_id: string; role: RmUserRole }[]>([])
  const people = useRiskPeopleStore((s) => s.byProject[mp])
  const fetchProject = useRiskPeopleStore((s) => s.fetchProject)
  const loadMembers = async () => { if (!mp) return; const { data } = await supabase.from('rm_project_members').select('user_id, role').eq('project_id', mp); setMembers((data ?? []) as { user_id: string; role: RmUserRole }[]) }
  useEffect(() => { if (tab === 'members' && mp) { fetchProject(mp); loadMembers() } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab, mp])
  const [add, setAdd] = useState<{ user: string; role: RmUserRole }>({ user: '', role: 'team_member' })
  const setRole = async (userId: string, role: RmUserRole) => { const { error } = await supabase.from('rm_project_members').update({ role }).eq('project_id', mp).eq('user_id', userId); flash(error ? 'فقط مدیر پروژه یا مدیر سامانه می‌تواند نقش را تغییر دهد' : 'نقش ذخیره شد'); loadMembers() }
  const addMember = async () => { if (!add.user) return; const { error } = await supabase.from('rm_project_members').insert({ project_id: mp, user_id: add.user, role: add.role }); flash(error ? 'افزودن ممکن نشد (فقط مدیر پروژه یا مدیر سامانه)' : 'عضو افزوده شد'); setAdd({ user: '', role: 'team_member' }); loadMembers() }
  const removeMember = async (userId: string) => { if (!window.confirm('این نقش حذف شود؟ (دسترسی مرکزی کاربر تغییر نمی‌کند)')) return; const { error } = await supabase.from('rm_project_members').delete().eq('project_id', mp).eq('user_id', userId); flash(error ? 'حذف ممکن نشد' : 'حذف شد'); loadMembers() }

  // ---- audit
  const [audit, setAudit] = useState<Audit[] | null>(null)
  useEffect(() => { if (tab === 'audit') supabase.from('rm_config_audit').select('*').order('id', { ascending: false }).limit(80).then(({ data }) => setAudit((data ?? []) as Audit[])) }, [tab])
  const diff = (a: Audit): string => {
    const b = a.before ?? {}, n = a.after ?? {}
    const keys = [...new Set([...Object.keys(b), ...Object.keys(n)])].filter((k) => !['updated_at', 'updated_by'].includes(k) && JSON.stringify(b[k]) !== JSON.stringify(n[k]))
    if (!a.before) return 'ایجاد'
    if (!a.after) return 'حذف'
    return keys.slice(0, 6).map((k) => `${k}: ${JSON.stringify(b[k])} ← ${JSON.stringify(n[k])}`).join(' · ')
  }

  const TABS: [Tab, string][] = [['policy', 'سیاست و آستانه‌ها'], ['categories', 'دسته‌بندی‌ها'], ['members', 'نقش‌ها'], ['scales', 'مقیاس‌ها'], ['audit', 'سابقهٔ تغییر']]
  return (
    <div className="im-page">
      <div className="im-topbar"><div><div className="im-page-title"><Settings2 size={22} style={{ color: 'var(--im-muted-2)' }} />سیاست و تنظیمات</div><div className="im-page-sub">آستانه‌های پذیرش، تحمل و ارجاع، دسته‌بندی‌ها و نقش‌ها</div></div><div className="im-actions"><HelpButton content={RK_HELP.settings} /><div className="im-seg" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div></div></div>
      {msg && <div className="im-notice ok" role="status" style={{ marginBottom: 10 }}>{msg}</div>}

      {tab === 'policy' && (
        <div className="im-card">
          <div className="im-actions" style={{ marginBottom: 12 }}>
            <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="دامنهٔ سیاست" style={{ width: 'auto' }}><option value="global">سیاست پیش‌فرض سازمان</option>{projects.map((x) => <option key={x.id} value={x.id}>پروژه: {x.name}{policies.some((y) => y.projectId === x.id) ? ' ✓' : ''}</option>)}</select>
            {scope !== 'global' && !hasOverride && <span className="im-helper">این پروژه سیاست جداگانه ندارد و از پیش‌فرض سازمان پیروی می‌کند؛ با ذخیره، سیاست اختصاصی ساخته می‌شود.</span>}
          </div>
          <div className="rk-grid3">
            <Field label="آستانهٔ پذیرش (امتیاز ≤)" hint="تا این امتیاز بدون تصمیم ویژه قابل‌پذیرش است"><input type="number" min={1} max={25} value={p.appetiteMax} onChange={(e) => setP({ ...p, appetiteMax: Number(e.target.value) })} /></Field>
            <Field label="آستانهٔ تحمل (امتیاز ≤)" hint="تا این امتیاز با پایش قابل‌تحمل است"><input type="number" min={1} max={25} value={p.toleranceMax} onChange={(e) => setP({ ...p, toleranceMax: Number(e.target.value) })} /></Field>
            <Field label="آستانهٔ ارجاع به مدیریت (امتیاز ≥)" hint="از این امتیاز به بالا نیازمند تصمیم مدیریت ارشد است"><input type="number" min={1} max={25} value={p.escalationMin} onChange={(e) => setP({ ...p, escalationMin: Number(e.target.value) })} /></Field>
          </div>
          <div className="rk-grid3">
            {(['متوسط از', 'زیاد از', 'بحرانی از'] as const).map((l, i) => <Field key={l} label={`سطح ${l} امتیاز`}><input type="number" min={1} max={25} value={p.levelBounds[i]} onChange={(e) => { const lb = [...p.levelBounds] as RmPolicy['levelBounds']; lb[i] = Number(e.target.value); setP({ ...p, levelBounds: lb }) }} /></Field>)}
          </div>
          <div className="im-section-title" style={{ marginTop: 6 }}>فاصلهٔ بازنگری (روز) به تفکیک سطح</div>
          <div className="rk-quad">{(['critical', 'high', 'medium', 'low'] as const).map((l) => <Field key={l} label={{ critical: 'بحرانی', high: 'زیاد', medium: 'متوسط', low: 'کم' }[l]}><input type="number" min={1} max={730} value={p.reviewDays[l]} onChange={(e) => setP({ ...p, reviewDays: { ...p.reviewDays, [l]: Number(e.target.value) } })} /></Field>)}</div>
          <div className="rk-grid2">
            <Field label="سقف سن ارزیابی (روز) — بیشتر = «قدیمی»"><input type="number" min={7} max={730} value={p.staleAssessmentDays} onChange={(e) => setP({ ...p, staleAssessmentDays: Number(e.target.value) })} /></Field>
            <Field label="ثبت خودکار ریسک از گزارش بازدید" hint="فقط یافتهٔ تأییدشدهٔ مدیر با اطمینان کافی؛ «خاموش» = همیشه با تأیید کاربر"><select value={p.autoAcceptConfidence ?? ''} onChange={(e) => setP({ ...p, autoAcceptConfidence: e.target.value === '' ? null : Number(e.target.value) })}><option value="">خاموش (تأیید کاربر)</option><option value="0.9">اطمینان ≥ ۹۰٪</option><option value="0.8">اطمینان ≥ ۸۰٪</option><option value="0.7">اطمینان ≥ ۷۰٪</option></select></Field>
          </div>
          <div className="im-section-title">پیش‌نمایش نوار امتیاز ۱ تا ۲۵</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(25, 1fr)', gap: 2, direction: 'ltr' }} aria-hidden>{Array.from({ length: 25 }, (_, i) => i + 1).map((s) => <div key={s} title={`${s}: ${ZONE_LABEL_FA[zoneOf(s, p)]}`} style={{ height: 26, borderRadius: 5, background: LV_COLOR[levelOf(s, p)], display: 'grid', placeItems: 'center', fontSize: 9, color: '#fff', fontWeight: 800, boxShadow: `inset 0 -4px 0 ${ZONE_COLOR[zoneOf(s, p)]}` }}>{s}</div>)}</div>
          <div className="im-legend" style={{ marginTop: 8 }}>{(['acceptable', 'tolerable', 'above_tolerance', 'escalate'] as const).map((z) => <span key={z} style={{ ['--c' as string]: ZONE_COLOR[z] }}><i />{ZONE_LABEL_FA[z]}</span>)}<span>رنگ بالا = سطح · نوار پایین = ناحیه</span></div>
          {err && <div className="im-notice bad" role="alert" style={{ marginTop: 10 }}>{err}</div>}
          <div className="im-actions" style={{ marginTop: 12 }}><button className="im-btn im-btn-primary" disabled={!!err || !dirty} onClick={doSave}><Save size={14} /> ذخیرهٔ سیاست</button><button className="im-btn im-btn-ghost" disabled={!dirty} onClick={() => setP(base)}>بازگردانی</button><span className="im-helper">تغییر سیاست روی همهٔ ریسک‌های دامنه‌اش (سطح، ناحیه و موعد بازنگری) اثر می‌گذارد و در سابقه ثبت می‌شود. ارزیابی‌های قبلی تغییر نمی‌کنند.</span></div>
        </div>
      )}

      {tab === 'categories' && (
        <div className="im-card">
          <div className="im-section-title">دسته‌ها و زیردسته‌های ریسک {!isAdmin && <span className="im-helper">(ویرایش با مدیر سامانه)</span>}</div>
          <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
            {categories.filter((c) => !c.parentKey).map((c) => (
              <div key={c.key}>
                <CatRow c={c} n={used(c.key)} canEdit={isAdmin} onSave={(label, active) => saveCategory({ key: c.key, labelFa: label, parentKey: null, active, sort: c.sort })} />
                {categories.filter((s) => s.parentKey === c.key).map((s) => <div key={s.key} style={{ marginInlineStart: 26 }}><CatRow c={s} n={used(s.key)} canEdit={isAdmin} onSave={(label, active) => saveCategory({ key: s.key, labelFa: label, parentKey: c.key, active, sort: s.sort })} /></div>)}
              </div>
            ))}
          </div>
          {isAdmin && (
            <div className="im-actions" style={{ alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 240px' }}><Field label="نام دسته یا زیردستهٔ جدید"><input value={newCat.label} onChange={(e) => setNewCat({ ...newCat, label: e.target.value })} /></Field></div>
              <div style={{ flex: '0 1 240px' }}><Field label="زیرمجموعهٔ"><select value={newCat.parent} onChange={(e) => setNewCat({ ...newCat, parent: e.target.value })}><option value="">— دستهٔ اصلی —</option>{categories.filter((c) => !c.parentKey).map((c) => <option key={c.key} value={c.key}>{c.labelFa}</option>)}</select></Field></div>
              <button className="im-btn im-btn-primary" style={{ marginBottom: 12 }} onClick={addCat}><Plus size={14} /> افزودن</button>
            </div>
          )}
          <div className="im-helper">دستهٔ دارای ریسک حذف نمی‌شود؛ فقط غیرفعال می‌شود (ریسک‌های موجود حفظ می‌مانند).</div>
        </div>
      )}

      {tab === 'members' && (
        <div className="im-card">
          <div className="im-notice info" style={{ marginBottom: 12 }}>کاربران و دسترسی پروژه‌ها از «مدیریت کاربران» سامانه می‌آید؛ هر کاربر دارای دسترسی مرکزی خودکار با نقش «عضو تیم» کار می‌کند. در اینجا فقط نقش‌های ویژهٔ ریسک (مدیر ریسک، مالک، مدیریت ارشد…) تعیین می‌شود.</div>
          <Field label="پروژه"><select value={mp} onChange={(e) => setMp(e.target.value)}>{projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          <div className="im-table-wrap"><table className="im-table"><thead><tr><th>کاربر</th><th>نقش در مدیریت ریسک</th><th /></tr></thead><tbody>
            {members.map((m) => <tr key={m.user_id}><td><b>{dir.name(m.user_id)}</b><div className="im-helper">{dir.get(m.user_id)?.position}</div></td><td><select value={m.role} onChange={(e) => setRole(m.user_id, e.target.value as RmUserRole)}>{RM_ROLES.map((r) => <option key={r} value={r}>{RM_ROLE_LABEL_FA[r]}</option>)}</select><div className="im-helper">{RM_ROLE_DESCRIPTION_FA[m.role]}</div></td><td><button className="im-ghostlink" style={{ color: 'var(--im-coral)' }} onClick={() => removeMember(m.user_id)}>حذف نقش</button></td></tr>)}
            {members.length === 0 && <tr><td colSpan={3} className="im-helper">نقش ویژه‌ای تعریف نشده؛ کاربران مرکزی با نقش «عضو تیم» کار می‌کنند.</td></tr>}
          </tbody></table></div>
          <div className="im-actions" style={{ marginTop: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 240px' }}><Field label="کاربر (از مدیریت کاربران)"><select value={add.user} onChange={(e) => setAdd({ ...add, user: e.target.value })}><option value="">— انتخاب کنید —</option>{(people ?? []).filter((x) => !members.some((m) => m.user_id === x.userId)).map((x) => <option key={x.userId} value={x.userId}>{x.name}{x.position ? ' · ' + x.position : ''}</option>)}</select></Field></div>
            <div style={{ flex: '0 1 200px' }}><Field label="نقش"><select value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value as RmUserRole })}>{RM_ROLES.map((r) => <option key={r} value={r}>{RM_ROLE_LABEL_FA[r]}</option>)}</select></Field></div>
            <button className="im-btn im-btn-primary" style={{ marginBottom: 12 }} disabled={!add.user} onClick={addMember}><UserPlus size={14} /> افزودن</button>
          </div>
        </div>
      )}

      {tab === 'scales' && (
        <div className="im-card">
          <div className="im-section-title">مقیاس‌های ارزیابی</div>
          <div className="im-table-wrap"><table className="rk-compare"><thead><tr><th>سطح</th><th>احتمال</th><th>اثر کلی</th>{RM_IMPACT_DIMS.map((x) => <th key={x}>{RM_IMPACT_DIM_LABEL_FA[x]}</th>)}</tr></thead><tbody>
            {[1, 2, 3, 4, 5].map((v) => <tr key={v}><td><b>{v}</b></td><td>{PROBABILITY_LABELS_FA[v - 1]}</td><td>{IMPACT_LABELS_FA[v - 1]}</td>{RM_IMPACT_DIMS.map((x) => <td key={x} className="im-helper">{IMPACT_ANCHORS_FA[x][v - 1]}</td>)}</tr>)}
          </tbody></table></div>
          <div className="im-helper" style={{ marginTop: 8 }}>اثر کلی یک ریسک برابر بدترین بُعد است. روش‌های ارزیابی: کیفی (۱–۵)، نیمه‌کمی (با مبنای الزامی) و کمی (احتمال ٪ × برآورد مالی — فقط برای زیان مورد انتظار همان ریسک).</div>
        </div>
      )}

      {tab === 'audit' && (
        <div className="im-card">
          <div className="im-section-title">سابقهٔ تغییر سیاست، دسته‌ها، شاخص‌ها و قاعده‌های هشدار</div>
          {audit === null ? <div className="im-skeleton" style={{ height: 80 }} /> : audit.length === 0 ? <div className="im-empty">تغییری ثبت نشده است (فقط مدیران ریسک این بخش را می‌بینند).</div> : (
            <div className="rk-timeline">{audit.map((a) => <div key={a.id} className="rk-tl"><b>{({ rm_policy: 'سیاست', rm_categories: 'دسته‌بندی', rm_kris: 'شاخص هشدار', im_notif_rules: 'قاعدهٔ هشدار' } as Record<string, string>)[a.entity] ?? a.entity}</b> — {diff(a)}<br /><time>{formatJalali(a.at.slice(0, 10))} · {a.at.slice(11, 16)} · {dir.name(a.actor)}</time></div>)}</div>
          )}
        </div>
      )}
    </div>
  )
}

function CatRow({ c, n, canEdit, onSave }: { c: { key: string; labelFa: string; active: boolean }; n: number; canEdit: boolean; onSave: (label: string, active: boolean) => void }) {
  const [label, setLabel] = useState(c.labelFa)
  useEffect(() => setLabel(c.labelFa), [c.labelFa])
  return (
    <div className="im-task" style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: c.active ? 1 : 0.55 }}>
      {canEdit ? <input style={{ flex: 1 }} value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => label.trim() && label !== c.labelFa && onSave(label.trim(), c.active)} aria-label="نام دسته" /> : <span style={{ flex: 1 }}>{c.labelFa}</span>}
      <span className="im-helper">{n} ریسک</span>
      {canEdit && <label className="im-chip" style={{ cursor: 'pointer', margin: 0 }}><input type="checkbox" style={{ width: 'auto', marginInlineEnd: 4 }} checked={c.active} onChange={(e) => onSave(label.trim() || c.labelFa, e.target.checked)} />فعال</label>}
      {c.active && <Check size={13} style={{ color: 'var(--im-mint)' }} aria-hidden />}
    </div>
  )
}
