import { FrontsEditor } from './FrontsEditor'
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useLookupOptions } from '../../material/lib/control/lookups'
import { useExecutionStore } from '../store/useExecutionStore'
import { useExecutionModel } from '../lib/useExecutionModel'
import { ACTIONS, DEFAULT_PERMS } from '../lib/perms'
import { COMMON_FIELDS, FORMS, FORM_BY_KEY, FORM_GROUP_LABEL_FA } from '../lib/formCatalog'
import { Chip, DataTable, NumInput, Section, type Col } from '../../finance/components/fn'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { Empty, fa } from '../components/common'
import { EpcSettingsView } from './EpcSettingsView'
import { FormTemplatePilot } from './FormTemplatePilot'
import { ActivityPicker } from '../components/ActivityPicker'
import { TemplateLibrary } from './TemplateLibrary'
import { EX_ROLE_LABEL_FA, WEEKDAY_FA, type ExProjectRole, type ExRole } from '../types'

export function SettingsPage({ projectId, sub }: { projectId: string; sub: string }) {
  if (sub === 'rules') return <RulesView projectId={projectId} />
  if (sub === 'forms') return <FormsView projectId={projectId} />
  if (sub === 'map') return <MapView projectId={projectId} />
  if (sub === 'epc') return <EpcSettingsView projectId={projectId} />
  if (sub === 'tpl') return <TemplateLibrary projectId={projectId} />
  if (sub === 'tplpilot') return <FormTemplatePilot projectId={projectId} />
  return <RolesView projectId={projectId} />
}

function RolesView({ projectId }: { projectId: string }) {
  const ex = useExecutionStore()
  const orgs = useMasterDataStore((s) => s.organizations)
  const roles = ex.roles.filter((r) => r.projectId === projectId)
  const [user, setUser] = useState(''), [role, setRole] = useState<ExRole>('contractor'), [org, setOrg] = useState('')
  const canCfg = ex.can(projectId, '*') || ex.can(projectId, 'configure')
  const cols: Col<ExProjectRole>[] = [
    { key: 'u', label: 'کاربر', render: (r) => <span className="strong">{ex.people.get(r.userId) ?? 'کاربر'}</span> },
    { key: 'r', label: 'نقش', render: (r) => EX_ROLE_LABEL_FA[r.role] },
    { key: 'o', label: 'سازمان', render: (r) => orgs.find((o) => o.id === r.organizationId)?.name ?? '—' },
    { key: 'a', label: 'فعال', render: (r) => (canCfg ? <input type="checkbox" checked={r.active} onChange={(e) => void ex.setRoleActive(r.id, e.target.checked)} aria-label="فعال" /> : r.active ? 'بله' : 'خیر') },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p className="im-helper" style={{ margin: 0 }}>نقش‌ها در همین ماژول تعریف می‌شوند و دسترسی را مشخص می‌کنند. مدیر سامانه و «مدیر اجرا» به همهٔ بخش‌ها دسترسی دارند؛ تأیید کارکرد روزانه به‌معنای تأیید کیفیت نهایی یا صورت‌وضعیت مالی نیست.</p>
      {canCfg && (
        <div className="mt-filters"><select value={user} onChange={(e) => setUser(e.target.value)} aria-label="کاربر"><option value="">کاربر…</option>{[...ex.people].map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
          <select value={role} onChange={(e) => setRole(e.target.value as ExRole)} aria-label="نقش">{(Object.keys(EX_ROLE_LABEL_FA) as ExRole[]).map((k) => <option key={k} value={k}>{EX_ROLE_LABEL_FA[k]}</option>)}</select>
          <select value={org} onChange={(e) => setOrg(e.target.value)} aria-label="سازمان"><option value="">سازمان (اختیاری)…</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
          <button className="im-btn im-btn-primary im-btn-sm" disabled={!user} onClick={async () => { if (await ex.addRole(projectId, user, role, org || null)) setUser('') }}>افزودن نقش</button></div>
      )}
      {roles.length === 0 ? <Empty>هنوز نقشی تعریف نشده است.</Empty> : <DataTable cols={cols} rows={roles} rowKey={(r) => r.id} />}
      <Section title="ماتریس دسترسی هر نقش" flush>
        <div className="fn-tbl-wrap"><table className="ex-lines"><thead><tr><th>اقدام</th>{(Object.keys(EX_ROLE_LABEL_FA) as ExRole[]).map((r) => <th key={r} className="num">{EX_ROLE_LABEL_FA[r]}</th>)}</tr></thead>
          <tbody>{ACTIONS.map((a) => <tr key={a.key}><td>{a.label}</td>{(Object.keys(EX_ROLE_LABEL_FA) as ExRole[]).map((r) => <td key={r} className="num">{DEFAULT_PERMS[r].includes('*') || DEFAULT_PERMS[r].includes(a.key) ? '●' : '—'}</td>)}</tr>)}</tbody></table></div>
      </Section>
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

function FormsView({ projectId }: { projectId: string }) {
  const m = useExecutionModel(projectId)
  const ex = useExecutionStore()
  const can = ex.can(projectId, '*') || ex.can(projectId, 'configure')
  const enabled = m.settings.enabledForms
  const on = (k: string) => !enabled.length || enabled.includes(k)
  const toggle = (k: string, v: boolean) => {
    const all = FORMS.map((f) => f.key)
    const cur = enabled.length ? enabled : all
    void ex.saveSettings(projectId, { enabledForms: v ? [...new Set([...cur, k])] : cur.filter((x) => x !== k) })
  }
  const built = (f: (typeof FORMS)[number]) => f.header.length + f.columns.length
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p className="im-helper" style={{ margin: 0 }}>فرم‌ها از دو فایل QC_FORM (۲۲ برگه) استخراج شده‌اند. فرم‌های بی‌ربط به نوع پروژه را خاموش کنید تا به کاربر تحمیل نشوند. جدول زیر ماتریس تطبیق فرم‌های کاغذی با صفحهٔ دیجیتال است.</p>
      <Section title="ماتریس تطبیق فرم‌ها" hint="هر برگهٔ اکسل ← کجا پیاده شده، چه بخش‌هایی هنوز پیاده نشده" flush>
        <div className="fn-tbl-wrap"><table className="ex-lines"><thead><tr><th>فعال</th><th>فرم</th><th>برگهٔ اکسل</th><th>گروه</th><th>پیاده‌سازی دیجیتال</th><th className="num">فیلد</th><th>شمارنده‌ها (پایین فرم)</th><th>پیاده‌نشده / نیازمند تصمیم</th></tr></thead>
          <tbody>{FORMS.map((f) => <tr key={f.key}>
            <td><input type="checkbox" style={{ width: 'auto' }} disabled={!can} checked={on(f.key)} onChange={(e) => toggle(f.key, e.target.checked)} aria-label={`فعال بودن ${f.title}`} /></td>
            <td><b>{f.title}</b><span className="sub">{f.en}</span></td><td className="fn-code">{f.sheet}</td><td>{FORM_GROUP_LABEL_FA[f.group]}</td>
            <td>گزارش روزانه ← {f.kind === 'record' ? 'سابقهٔ کیفیت' : 'فرم‌های فنی'} ← «{f.title}»{f.resources ? ' + جدول نفرات و ماشین‌آلات' : ''}</td>
            <td className="num">{fa(built(f))}</td><td>{f.metrics.map((x) => x.label).join('، ') || '—'}</td>
            <td>{f.notBuilt?.length ? <ul style={{ margin: 0, paddingInlineStart: 14 }}>{f.notBuilt.map((x) => <li key={x} className="ex-warn">{x}</li>)}</ul> : <Chip tone="good">کامل</Chip>}</td></tr>)}</tbody></table></div>
      </Section>
      <Section title="فیلدهای مشترک همهٔ فرم‌ها" hint="یک‌بار ثبت و در همهٔ فرم‌ها پیش‌پر می‌شوند"><ul style={{ margin: 0, paddingInlineStart: 18, columns: 2, fontSize: 12.5 }}>{COMMON_FIELDS.map((x) => <li key={x}>{x}</li>)}</ul></Section>
      <Section title="موارد نیازمند تصمیم" hint="تصمیم‌هایی که در طراحی فرض شده‌اند و باید تأیید شوند">
        <ul style={{ margin: 0, paddingInlineStart: 18, display: 'grid', gap: 4, fontSize: 12.5 }}>
          <li>کارکرد روزانه فقط از «گزارش کارکرد» می‌آید؛ شمارنده‌های فرم‌های فنی با «اتصال فرم فنی به فعالیت» و دکمهٔ «پیش‌پر از فرم‌های فنی» به آن منتقل می‌شوند تا مقدار دوبار ثبت نشود.</li>
          <li>مهر جوشکار در فرم جوشکاری متن آزاد است؛ ثبت جوشکاران و صلاحیت‌ها (WQT / کارت) فعلاً جدا و بدون اتصال خودکار به مهرها است.</li>
          <li>برای ردیف‌های متراژ در فرم‌های خاکی (از Km تا Km) طول عملیات دستی وارد می‌شود، نه محاسبهٔ خودکار.</li>
          <li>امضای دست‌نویس و تصویر کروکی در فرم‌ها پیاده نشده؛ ثبت نام، تاریخ و ساعت ارسال/تأیید جای آن را می‌گیرد.</li>
        </ul>
      </Section>
    </div>
  )
}

function MapView({ projectId }: { projectId: string }) {
  const m = useExecutionModel(projectId)
  const ex = useExecutionStore()
  const can = ex.can(projectId, 'edit_activities')
  const [fk, setFk] = useState(''), [mk, setMk] = useState(''), [gv, setGv] = useState(''), [act, setAct] = useState('')
  const form = fk ? FORM_BY_KEY[fk] : null
  const metric = form?.metrics.find((x) => x.key === mk)
  const acts = m.activities.filter((a) => a.approval === 'approved' && a.active)
  const cols: Col<(typeof m.maps)[number]>[] = [
    { key: 'f', label: 'فرم', render: (x) => FORM_BY_KEY[x.formKey]?.title ?? x.formKey },
    { key: 'm', label: 'شمارنده', render: (x) => FORM_BY_KEY[x.formKey]?.metrics.find((y) => y.key === x.metricKey)?.label ?? x.metricKey },
    { key: 'g', label: 'گروه (مثلاً ضخامت)', render: (x) => x.groupValue || 'همه' },
    { key: 'a', label: 'فعالیت', render: (x) => { const a = m.actById.get(x.activityId); return a ? <span style={{ display: 'block', maxWidth: 480, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{`${a.itemNo} — ${a.title} (${a.unit})`}</span> : '—' } },
    { key: 'd', label: '', render: (x) => can ? <button className="im-btn im-btn-sm" aria-label="حذف" onClick={() => void ex.saveMap(projectId, x.formKey, x.metricKey, x.groupValue, null)}><Trash2 size={12} /></button> : null },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p className="im-helper" style={{ margin: 0 }}>اگر شمارنده‌ای از یک فرم فنی (مثلاً «تعداد سرجوش» فرم جوشکاری یا «متراژ» فرم ریسه) کارکرد یک ردیف فهرست‌بها است، آن را اینجا وصل کنید. در گزارش کارکرد روزانه، دکمهٔ «پیش‌پر از فرم‌های فنی» مقدار همان روز را وارد می‌کند و هر فرم فنی فقط یک‌بار به یک فعالیت منتقل می‌شود.</p>
      {can && (
        <div className="mt-filters">
          <select value={fk} onChange={(e) => { setFk(e.target.value); setMk('') }} aria-label="فرم"><option value="">فرم…</option>{FORMS.filter((f) => f.metrics.length).map((f) => <option key={f.key} value={f.key}>{f.title}</option>)}</select>
          <select value={mk} onChange={(e) => setMk(e.target.value)} aria-label="شمارنده" disabled={!form}><option value="">شمارنده…</option>{form?.metrics.map((x) => <option key={x.key} value={x.key}>{x.label} ({x.unit})</option>)}</select>
          {metric?.groupBy && <input placeholder={`مقدار ${form?.columns.find((c) => c.key === metric.groupBy)?.label ?? 'گروه'} (خالی = همه)`} value={gv} onChange={(e) => setGv(e.target.value)} dir="auto" style={{ width: 190 }} />}
          <ActivityPicker activities={acts} value={act} onChange={setAct} emptyLabel="انتخاب فعالیت…" title="اتصال به کدام فعالیت؟" width={320} />
          <button className="im-btn im-btn-primary im-btn-sm" disabled={!fk || !mk || !act} onClick={async () => { if (await ex.saveMap(projectId, fk, mk, gv.trim(), act)) { setGv(''); setAct('') } }}>افزودن اتصال</button>
        </div>
      )}
      {m.maps.length === 0 ? <Empty>اتصالی تعریف نشده است.</Empty> : <DataTable cols={cols} rows={m.maps} rowKey={(x) => x.id} />}
    </div>
  )
}
