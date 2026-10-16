import { suggestExRole } from '../lib/roleSuggest'
import { TEAM_POSITION_LABEL } from '../../masterdata/types'
import { SigningRoles, useSignRoles } from '../components/SigningRoles'
import { ActionsSettings } from './ActionsSettings'
import { FrontsEditor } from './FrontsEditor'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useLookupOptions } from '../../material/lib/control/lookups'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { useExecutionModel } from '../lib/useExecutionModel'
import { ACTIONS, DEFAULT_PERMS } from '../lib/perms'
import { NumInput, Section } from '../../finance/components/fn'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { Empty, fa } from '../components/common'
import { EpcSettingsView } from './EpcSettingsView'
import { TemplateLibrary } from './TemplateLibrary'
import { ActivitiesPage } from './ActivitiesPage'
import { EX_ROLE_LABEL_FA, WEEKDAY_FA, type ExRole } from '../types'

export function SettingsPage({ projectId, sub }: { projectId: string; sub: string }) {
  if (sub === 'rules') return <RulesView projectId={projectId} />
  if (sub === 'actions') return <ActionsSettings projectId={projectId} />
  if (sub === 'tpl') return <TemplateLibrary projectId={projectId} />
  return <RolesView projectId={projectId} />
}

function RolesView({ projectId }: { projectId: string }) {
  const ex = useExecutionStore()
  const orgs = useMasterDataStore((s) => s.organizations)
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId))
  const team = useMasterDataStore((s) => s.team).filter((t) => t.projectId === projectId).sort((a, b) => a.sort - b.sort)
  const epc = useEpcStore()
  const signRoles = useSignRoles(projectId)
  const roles = ex.roles.filter((r) => r.projectId === projectId)
  const canCfg = ex.can(projectId, '*') || ex.can(projectId, 'configure')
  const orgName = (id: string | null) => orgs.find((o) => o.id === id)?.name ?? '—'
  const positionOf = (t: (typeof team)[number]) => t.positionTitle || TEAM_POSITION_LABEL[t.positionKey] || t.positionKey
  const inTeam = new Set(team.map((t) => t.userId).filter(Boolean) as string[])
  const outside = roles.filter((r) => !inTeam.has(r.userId))
  const missingSuggest = team.filter((t) => t.userId && !roles.some((r) => r.userId === t.userId) && suggestExRole(t.positionKey, t.organizationId, project))
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Section title="افراد پروژه" hint="افراد، سمت و سازمان از «اطلاعات پایه ← ساختار پروژه» (مدیریت کاربران و داده‌های پایه) می‌آید و همهٔ ماژول‌ها از همان استفاده می‌کنند؛ برای افزودن یا تغییر فرد، سمت یا سازمان همان‌جا اقدام کنید. اینجا فقط «نقش این فرد در ماژول اجرا» تعیین می‌شود.">
        {canCfg && missingSuggest.length > 0 && <div style={{ marginBottom: 8 }}><button className="im-btn im-btn-primary im-btn-sm" onClick={async () => { for (const t of missingSuggest) { const r = suggestExRole(t.positionKey, t.organizationId, project); if (r && t.userId) await ex.addRole(projectId, t.userId, r, t.organizationId) } }}>تخصیص نقش پیشنهادی به {fa(missingSuggest.length)} نفر بدون نقش</button> <span className="im-helper">بر اساس سازمان (کارفرما/مشاور/پیمانکار) و سمت؛ بعداً قابل تغییر است.</span></div>}
        {team.length === 0 ? <Empty>ساختار منابع انسانی این پروژه در اطلاعات پایه هنوز تعریف نشده است.</Empty> : (
          <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>فرد</th><th>سمت</th><th>سازمان</th><th>نقش در ماژول اجرا</th><th>نقش امضا</th></tr></thead><tbody>
            {team.map((t) => { const mine = t.userId ? roles.filter((r) => r.userId === t.userId) : [], sug = t.userId ? suggestExRole(t.positionKey, t.organizationId, project) : null
              return <tr key={t.id}><td><b>{t.personName || (t.userId ? ex.people.get(t.userId) : '') || '—'}</b>{!t.userId && <small className="sub">بدون حساب کاربری</small>}</td><td>{positionOf(t)}</td><td>{orgName(t.organizationId)}</td>
                <td style={{ minWidth: 280 }}>{!t.userId ? <span className="im-helper">برای تعیین نقش، فرد باید حساب کاربری داشته باشد</span> : <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {mine.map((r) => <span key={r.id} className="im-chip" style={{ display: 'inline-flex', gap: 4, alignItems: 'center', opacity: r.active ? 1 : 0.5 }}>{EX_ROLE_LABEL_FA[r.role]}{canCfg && <input type="checkbox" checked={r.active} onChange={(e) => void ex.setRoleActive(r.id, e.target.checked)} aria-label={`فعال بودن نقش ${EX_ROLE_LABEL_FA[r.role]}`} />}</span>)}
                  {canCfg && <select value="" onChange={(e) => e.target.value && void ex.addRole(projectId, t.userId!, e.target.value as ExRole, t.organizationId)} aria-label="افزودن نقش"><option value="">{mine.length ? '+ نقش دیگر' : 'تعیین نقش…'}</option>{(Object.keys(EX_ROLE_LABEL_FA) as ExRole[]).filter((k) => !mine.some((r) => r.role === k)).map((k) => <option key={k} value={k}>{EX_ROLE_LABEL_FA[k]}{k === sug ? ' (پیشنهادی)' : ''}</option>)}</select>}
                </div>}</td>
                <td style={{ minWidth: 220 }}>{!t.userId ? '—' : <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>{signRoles.filter((x) => x.userId === t.userId).map((x) => <span key={x.key} className="im-chip" dir="auto">{x.label}</span>)}{canCfg && signRoles.length > 0 && <select value="" onChange={(e) => { const k = e.target.value; if (k) void (async () => { const next = signRoles.map((x) => (x.key === k ? { ...x, userId: t.userId } : x)); if (await ex.saveSettings(projectId, { signRoles: next } as never)) await epc.applySignRoles(projectId, next) })() }} aria-label="تعیین نقش امضا"><option value="">+ نقش امضا</option>{signRoles.filter((x) => x.userId !== t.userId).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>}</div>}</td></tr> })}
          </tbody></table></div>
        )}
        {outside.length > 0 && <div style={{ marginTop: 10 }}><b>دارای نقش، ولی در ساختار پروژه نیستند</b> <span className="im-helper">(در اطلاعات پایه به ساختار پروژه اضافه‌شان کنید)</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>{outside.map((r) => <span key={r.id} className="im-chip" style={{ opacity: r.active ? 1 : 0.5 }}>{ex.people.get(r.userId) ?? 'کاربر'} — {EX_ROLE_LABEL_FA[r.role]}{r.organizationId ? ` — ${orgName(r.organizationId)}` : ''}{canCfg && <input type="checkbox" style={{ marginInlineStart: 6 }} checked={r.active} onChange={(e) => void ex.setRoleActive(r.id, e.target.checked)} aria-label="فعال" />}</span>)}</div></div>}
      </Section>
      <SigningRoles projectId={projectId} can={canCfg} people={team.filter((t) => t.userId).map((t) => ({ id: t.userId!, name: t.personName || ex.people.get(t.userId!) || '—' }))} />
      <Section title="ماتریس دسترسی هر نقش در ماژول اجرا" hint="نقش‌ها و جابه‌جایی افراد از اطلاعات پایه می‌آید؛ اینکه هر نقش در این ماژول چه اقداماتی می‌تواند انجام دهد اینجاست. مدیر سامانه و «مدیر اجرا» به همهٔ بخش‌ها دسترسی دارند." flush>
        <div className="fn-tbl-wrap"><table className="ex-lines"><thead><tr><th>اقدام</th>{(Object.keys(EX_ROLE_LABEL_FA) as ExRole[]).map((r) => <th key={r} className="num">{EX_ROLE_LABEL_FA[r]}</th>)}</tr></thead>
          <tbody>{ACTIONS.map((a) => <tr key={a.key}><td>{a.label}</td>{(Object.keys(EX_ROLE_LABEL_FA) as ExRole[]).map((r) => <td key={r} className="num">{DEFAULT_PERMS[r].includes('*') || DEFAULT_PERMS[r].includes(a.key) ? '●' : '—'}</td>)}</tr>)}</tbody></table></div>
      </Section>
      <h3 style={{ margin: '8px 0 0', fontSize: 15 }}>تنظیمات پایهٔ پروژه برای ماژول اجرا</h3>
      <p className="im-helper" style={{ margin: 0 }}>لوگوی طرف‌ها (نام آن‌ها از اطلاعات پایه می‌آید)، مرحلهٔ کارفرما، مشخصات فنی مشترک فرم‌ها، متن تحفظ قراردادی، پارامترهای موتور بهره‌وری و آستانهٔ هشدارها.</p>
      <EpcSettingsView projectId={projectId} />
    </div>
  )
}

function RulesView({ projectId }: { projectId: string }) {
  const m = useExecutionModel(projectId)
  const ex = useExecutionStore()
  const fronts = useLookupOptions(projectId, 'front')
  const s = m.settings
  const can = ex.can(projectId, '*') || ex.can(projectId, 'configure')
  const groups = [...new Set(m.activities.map((a) => a.weightGroup))]
  const save = (p: Parameters<typeof ex.saveSettings>[1]) => void ex.saveSettings(projectId, p)
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h3 style={{ margin: 0, fontSize: 15 }}>فهرست‌های بها (پیمان و پایه)</h3>
      <ActivitiesPage projectId={projectId} sub="books" />
      <h3 style={{ margin: '10px 0 0', fontSize: 15 }}>مقادیر پیمان و نسخه‌های مبنا</h3>
      <ActivitiesPage projectId={projectId} sub="baselines" />
      <h3 style={{ margin: '10px 0 0', fontSize: 15 }}>تقویم، قواعد کنترل و فهرست‌ها</h3>
      {!can && <p className="im-helper" style={{ margin: 0 }}>فقط مدیر اجرا یا مدیر سامانه می‌تواند قواعد را تغییر دهد.</p>}
      <Section title="تقویم گزارش‌دهی">
        <div className="ex-sheet-grid">
          <label>شروع هفته<select disabled={!can} value={s.weekStart} onChange={(e) => save({ weekStart: Number(e.target.value) })}>{WEEKDAY_FA.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
          <label>تاریخ شروع اجرای پروژه<JalaliDateInput value={s.projectStart} onChange={(x) => can && save({ projectStart: x })} /></label>
          <label className="wide">روزهای کاری<span style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{WEEKDAY_FA.map((d, i) => <label key={d} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} disabled={!can} checked={s.workDays.includes(i)} onChange={(e) => save({ workDays: e.target.checked ? [...s.workDays, i].sort() : s.workDays.filter((x) => x !== i) })} />{d}</label>)}</span></label>
        </div>
      </Section>
      <Section title="قواعد کنترل">
        <div className="ex-sheet-grid">
          <label>حد مجاز کارکرد بیش از مبنا (٪)<NumInput value={s.overBasePct} label="حد مجاز" decimals={2} onCommit={(n) => can && save({ overBasePct: n })} /></label>
          <label>ارسال گزارش با کارکرد بیش از مبنا<select disabled={!can} value={s.blockOverBase ? 'block' : 'allow'} onChange={(e) => save({ blockOverBase: e.target.value === 'block' })}><option value="block">مسدود شود (پیشنهادی)</option><option value="allow">فقط هشدار</option></select></label>
          <label>مهلت بررسی نظارت (روز)<NumInput value={s.reviewDays} label="مهلت بررسی" decimals={0} onCommit={(n) => can && save({ reviewDays: n })} /></label>
          <label>مهلت تکمیل کسری (روز)<NumInput value={s.gapDueDays} label="مهلت کسری" decimals={0} onCommit={(n) => can && save({ gapDueDays: n })} /></label>
          <label>مهلت اخطار کتبی تأخیر (روز)<NumInput value={s.delayNoticeDays ?? 14} label="مهلت اخطار تأخیر" decimals={0} onCommit={(n) => can && save({ delayNoticeDays: n })} /></label>
        </div>
      </Section>
      <FrontsEditor projectId={projectId} can={can} />
      <Section title="جبهه‌های موردانتظار گزارش روزانه" hint="برای هر روز کاری از این جبهه‌ها گزارش کارکرد انتظار می‌رود؛ نبودن آن «گزارش دریافت‌نشده» ثبت می‌شود. فهرست جبهه‌ها از «ماژول تأمین ← تنظیمات ← فهرست‌های پایه» می‌آید (مشترک، بدون تکرار).">
        {fronts.length === 0 ? <p className="im-helper" style={{ margin: 0 }}>هنوز جبهه‌ای تعریف نشده است.</p> : <span style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{fronts.map((f) => <label key={f.value} style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} disabled={!can} checked={s.expectedFronts.includes(f.value)} onChange={(e) => save({ expectedFronts: e.target.checked ? [...s.expectedFronts, f.value] : s.expectedFronts.filter((x) => x !== f.value) })} />{f.label}</label>)}</span>}
      </Section>
      {groups.length > 1 && (
        <Section title="وزن مبناهای وزن‌دهی در پیشرفت کل" hint="اگر خالی باشد همهٔ مبناها وزن برابر دارند.">
          <div className="ex-sheet-grid">{groups.map((g) => <label key={g}>{g || 'کل پروژه'}<NumInput value={s.groupWeights?.[g] ?? 0} label={`وزن ${g}`} decimals={2} onCommit={(n) => can && save({ groupWeights: { ...(s.groupWeights ?? {}), [g]: n } })} /></label>)}</div>
        </Section>
      )}
    </div>
  )
}

