import { TEAM_POSITION_LABEL } from '../../masterdata/types'
import { SigningRoles, useSignRoles } from '../components/SigningRoles'
import { ActionsSettings } from './ActionsSettings'
import { FrontsEditor } from './FrontsEditor'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useLookupOptions } from '../../material/lib/control/lookups'
import { useExecutionStore } from '../store/useExecutionStore'
import { useExecutionModel } from '../lib/useExecutionModel'
import { ACTIONS, DEFAULT_PERMS } from '../lib/perms'
import { NumInput, Section } from '../../finance/components/fn'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { Empty } from '../components/common'
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
  const team = useMasterDataStore((s) => s.team).filter((t) => t.projectId === projectId).sort((a, b) => a.sort - b.sort)
  const signRoles = useSignRoles(projectId)
  const roles = ex.roles.filter((r) => r.projectId === projectId)
  const canCfg = ex.can(projectId, '*') || ex.can(projectId, 'configure')
  const orgName = (id: string | null) => orgs.find((o) => o.id === id)?.name ?? '—'
  const positionOf = (t: (typeof team)[number]) => t.positionTitle || TEAM_POSITION_LABEL[t.positionKey] || t.positionKey
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Section title="دسترسی سایر افراد پروژه" hint="افراد از «اطلاعات پایه ← ساختار پروژه» می‌آیند. امضاکنندگان فرم‌ها در «نقش‌های امضا» تعریف می‌شوند و گردش کار از همان ساخته می‌شود؛ اینجا فقط برای افراد دیگر، «مشاهده‌گر» (فقط دیدن) یا «تصویب‌کننده» (بررسی و تصویب) تعیین می‌شود.">
        {team.filter((t) => t.userId).length === 0 ? <Empty>فردی با حساب کاربری در ساختار این پروژه نیست.</Empty> : (
          <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>فرد</th><th>سمت</th><th>سازمان</th><th>دسترسی</th></tr></thead><tbody>
            {team.filter((t) => t.userId).map((t) => { const mine = roles.filter((r) => r.userId === t.userId), light = mine.find((r) => r.role === 'viewer' || r.role === 'approver'), sign = signRoles.filter((x) => x.userId === t.userId)
              const pick = async (v: string) => { for (const r of mine) if ((r.role === 'viewer' || r.role === 'approver') && r.role !== v && r.active) await ex.setRoleActive(r.id, false); if (v === 'viewer' || v === 'approver') { const ex2 = mine.find((r) => r.role === v); if (ex2) await ex.setRoleActive(ex2.id, true); else await ex.addRole(projectId, t.userId!, v, t.organizationId) } }
              return <tr key={t.id}><td><b>{t.personName || ex.people.get(t.userId!) || '—'}</b></td><td>{positionOf(t)}</td><td>{orgName(t.organizationId)}</td>
                <td style={{ minWidth: 260 }}><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {sign.map((x) => <span key={x.key} className="im-chip" dir="auto" title="امضاکننده">{x.label}</span>)}
                  {mine.filter((r) => r.role !== 'viewer' && r.role !== 'approver' && r.active).map((r) => <span key={r.id} className="im-chip">{EX_ROLE_LABEL_FA[r.role]}</span>)}
                  {canCfg && <select value={light?.active ? light.role : ''} onChange={(e) => void pick(e.target.value)} aria-label="مشاهده‌گر یا تصویب‌کننده"><option value="">{sign.length || mine.length ? '+ دسترسی' : 'بدون دسترسی'}</option><option value="viewer">مشاهده‌گر</option><option value="approver">تصویب‌کننده</option></select>}
                </div></td></tr> })}
          </tbody></table></div>
        )}
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
      <h3 style={{ margin: '10px 0 0', fontSize: 15 }}>مقادیر پیمان</h3>
      <ActivitiesPage projectId={projectId} sub="" />
      <h3 style={{ margin: '10px 0 0', fontSize: 15 }}>نسخه‌های مبنا</h3>
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
          <label>ساعت کار هر روز کارگاه (برای تبدیل ساعت توقف به روز)<NumInput value={s.workdayHours ?? 10} label="ساعت کار روزانه" decimals={1} onCommit={(n) => can && n > 0 && save({ workdayHours: n })} /></label>
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

