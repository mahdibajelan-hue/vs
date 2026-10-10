import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { ACTIONS, DEFAULT_PERMS } from '../../lib/control/perms'
import { weightsSum } from '../../lib/control/progress'
import { Chip, DataTable, Section, fmtD, type Col } from '../../../finance/components/fn'
import { FormModal } from '../../../finance/components/FormModal'
import { fa } from '../../components/control/common'
import { CRITICALITY_LABEL_FA, MTL_ROLES, MTL_ROLE_LABEL_FA, type AuditRow, type Criticality, type MeasureKind, type MtlGroup, type MtlRole, type MtlSettings, type StageDef } from '../../types'

const MEASURE: Record<MeasureKind, string> = { count: 'تعدادی', length: 'طولی', weight: 'وزنی', volume: 'حجمی', consumable: 'مصرفی' }
const REVIEW: Record<StageDef['reviewLevel'], string> = { consultant: 'مشاور', employer: 'کارفرما', both: 'مشاور سپس کارفرما' }

/** Settings for people who configure the module: roles and who may do what, groups and units, supply stages and weight patterns, thresholds and priority weights, and the activity record. */
export function SettingsPage({ projectId, sub }: { projectId: string; sub: string }) {
  const cs = useMaterialControlStore()
  const can = cs.can(projectId, '*')
  if (!can) return <div className="im-card im-empty" style={{ padding: 24 }}>تنظیمات فقط برای مدیر سامانه یا مدیر متریال پروژه در دسترس است.</div>
  if (sub === 'catalog') return <Catalog />
  if (sub === 'stages') return <Stages />
  if (sub === 'rules') return <Rules />
  if (sub === 'audit') return <Audit projectId={projectId} />
  return <Roles projectId={projectId} />
}

function Roles({ projectId }: { projectId: string }) {
  const cs = useMaterialControlStore()
  const [add, setAdd] = useState(false)
  const rows = cs.roles.filter((r) => r.projectId === projectId)
  const perms = useMemo(() => { const out: Record<string, string[]> = {}; for (const r of MTL_ROLES) out[r] = cs.settings.rolePerms?.[r] ?? DEFAULT_PERMS[r]; return out }, [cs.settings.rolePerms])
  const toggle = async (role: MtlRole, action: string) => {
    if (role === 'manager') return
    const cur = perms[role]; const next = cur.includes(action) ? cur.filter((a) => a !== action) : [...cur, action]
    await cs.saveSettings({ ...cs.settings, rolePerms: { ...(cs.settings.rolePerms ?? {}), [role]: next } }, `تغییر دسترسی نقش ${MTL_ROLE_LABEL_FA[role]}`)
  }
  const cols: Col<(typeof rows)[number]>[] = [
    { key: 'u', label: 'کاربر', render: (r) => <span className="strong">{cs.people.get(r.userId) ?? r.userId}</span> }, { key: 'r', label: 'نقش در پروژه', render: (r) => MTL_ROLE_LABEL_FA[r.role] },
    { key: 's', label: 'وضعیت', render: (r) => <Chip tone={r.active ? 'good' : 'neutral'}>{r.active ? 'فعال' : 'غیرفعال'}</Chip> },
    { key: 'a', label: '', render: (r) => <button className="im-btn im-btn-sm" onClick={() => void cs.setRole(projectId, r.userId, r.role, !r.active)}>{r.active ? 'غیرفعال' : 'فعال‌سازی'}</button> },
  ]
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Section title="نقش کاربران در این پروژه" hint="پیمانکار، مشاور، کارفرما، انباردار، کنترل متریال، بازرس و مدیر. یک کاربر می‌تواند چند نقش داشته باشد." flush action={<button className="im-btn im-btn-primary im-btn-sm" onClick={() => setAdd(true)}><Plus size={14} /> افزودن</button>}>
        <DataTable cols={cols} rows={rows} rowKey={(r) => r.id} empty="نقشی تعریف نشده است. مدیر سامانه در همه‌جا دسترسی کامل دارد." />
      </Section>
      <Section title="ماتریس دسترسی نقش‌ها" hint="هر تیک یک اقدام را برای آن نقش مجاز می‌کند. تغییرات با نسخه ذخیره می‌شود. نقش مدیر همهٔ اقدام‌ها را دارد." flush>
        <div className="fn-tbl-wrap"><table className="fn-tbl"><thead><tr><th>اقدام</th>{MTL_ROLES.map((r) => <th key={r} className="num">{MTL_ROLE_LABEL_FA[r]}</th>)}</tr></thead><tbody>
          {ACTIONS.map((a) => <tr key={a.key}><td>{a.label}</td>{MTL_ROLES.map((r) => <td key={r} className="num"><input type="checkbox" style={{ width: 'auto' }} checked={perms[r].includes('*') || perms[r].includes(a.key)} disabled={r === 'manager'} onChange={() => void toggle(r, a.key)} aria-label={`${MTL_ROLE_LABEL_FA[r]} — ${a.label}`} /></td>)}</tr>)}
        </tbody></table></div>
      </Section>
      {add && <FormModal title="افزودن نقش" submitLabel="ثبت" onClose={() => setAdd(false)} fields={[{ key: 'user', label: 'کاربر', kind: 'select', required: true, options: [...cs.people].map(([id, n]) => ({ value: id, label: n })) }, { key: 'role', label: 'نقش', kind: 'select', required: true, options: MTL_ROLES.map((r) => ({ value: r, label: MTL_ROLE_LABEL_FA[r] })) }]} initial={{ user: '', role: 'contractor' }} onSubmit={async (v) => { await cs.setRole(projectId, String(v.user), v.role as MtlRole, true) }} />}
    </div>
  )
}

function Catalog() {
  const cs = useMaterialControlStore()
  const [g, setG] = useState<MtlGroup | 'new' | null>(null)
  const gcols: Col<MtlGroup>[] = [
    { key: 't', label: 'گروه', render: (x) => <><span className="strong">{x.title}</span><span className="sub fn-code">{x.code}</span></> }, { key: 'm', label: 'نوع اندازه‌گیری', render: (x) => MEASURE[x.measureKind] }, { key: 'u', label: 'واحد پیش‌فرض', render: (x) => x.defaultUnit ?? '—' },
    { key: 'p', label: 'الگوی وزن', render: (x) => cs.patterns.find((p) => p.id === x.patternId)?.title ?? 'پیش‌فرض' }, { key: 'l', label: 'زمان تأمین', num: true, render: (x) => `${fa(x.leadTimeDays)} روز` }, { key: 'c', label: 'بحرانی‌بودن', render: (x) => CRITICALITY_LABEL_FA[x.criticality] },
    { key: 's', label: 'وضعیت', render: (x) => <Chip tone={x.active ? 'good' : 'neutral'}>{x.active ? 'فعال' : 'غیرفعال'}</Chip> }, { key: 'a', label: '', render: (x) => <button className="im-btn im-btn-sm" aria-label="ویرایش" onClick={() => setG(x)}><Pencil size={13} /></button> },
  ]
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Section title="گروه‌های کالا" hint="هر گروه نوع اندازه‌گیری، واحد، الگوی وزن مراحل، زمان تأمین و بحرانی‌بودن پیش‌فرض خودش را دارد؛ اقلام مصرفی با گروه مصرفی مشخص می‌شوند." flush action={<button className="im-btn im-btn-primary im-btn-sm" onClick={() => setG('new')}><Plus size={14} /> گروه جدید</button>}>
        <DataTable cols={gcols} rows={cs.groups} rowKey={(x) => x.id} />
      </Section>
      <Section title="واحدهای اندازه‌گیری" hint="ضریب تبدیل به واحد پایه برای مقایسهٔ مقدارها؛ هیچ واحدی به همهٔ اقلام تحمیل نمی‌شود." flush>
        <DataTable rows={cs.units} rowKey={(u) => u.code} cols={[{ key: 'c', label: 'کد', render: (u) => <span className="fn-code">{u.code}</span> }, { key: 'l', label: 'نام', render: (u) => u.label }, { key: 'k', label: 'نوع', render: (u) => u.kind }, { key: 'b', label: 'واحد پایه', render: (u) => u.baseCode ?? '—' }, { key: 't', label: 'ضریب', num: true, render: (u) => fa(u.toBase, 4) }]} />
      </Section>
      {g && <FormModal title={g === 'new' ? 'گروه کالای جدید' : `ویرایش ${g.title}`} submitLabel="ذخیره" onClose={() => setG(null)}
        fields={[{ key: 'code', label: 'کد', kind: 'text', required: true }, { key: 'title', label: 'عنوان', kind: 'text', required: true }, { key: 'measureKind', label: 'نوع اندازه‌گیری', kind: 'select', required: true, options: Object.entries(MEASURE).map(([value, label]) => ({ value, label })) },
          { key: 'defaultUnit', label: 'واحد پیش‌فرض', kind: 'select', options: cs.units.map((u) => ({ value: u.code, label: `${u.label} (${u.code})` })) }, { key: 'patternId', label: 'الگوی وزن مراحل', kind: 'select', options: cs.patterns.map((p) => ({ value: p.id, label: p.title })) },
          { key: 'leadTimeDays', label: 'زمان تأمین (روز)', kind: 'num' }, { key: 'criticality', label: 'بحرانی‌بودن', kind: 'select', options: (['A', 'B', 'C'] as Criticality[]).map((c) => ({ value: c, label: CRITICALITY_LABEL_FA[c] })) },
          { key: 'isConsumable', label: 'نوع', kind: 'select', options: [{ value: '0', label: 'کالای اصلی' }, { value: '1', label: 'مصرفی' }] }, { key: 'active', label: 'وضعیت', kind: 'select', options: [{ value: '1', label: 'فعال' }, { value: '0', label: 'غیرفعال' }] }]}
        initial={{ code: g === 'new' ? '' : g.code, title: g === 'new' ? '' : g.title, measureKind: g === 'new' ? 'count' : g.measureKind, defaultUnit: g === 'new' ? 'EA' : g.defaultUnit ?? '', patternId: g === 'new' ? '' : g.patternId ?? '', leadTimeDays: g === 'new' ? 60 : g.leadTimeDays, criticality: g === 'new' ? 'B' : g.criticality, isConsumable: g !== 'new' && g.isConsumable ? '1' : '0', active: g === 'new' || g.active ? '1' : '0' }}
        onSubmit={async (v) => { await cs.saveGroup({ id: g === 'new' ? undefined : g.id, code: String(v.code), title: String(v.title), measureKind: v.measureKind as MeasureKind, defaultUnit: (v.defaultUnit as string) || null, patternId: (v.patternId as string) || null, leadTimeDays: Number(v.leadTimeDays) || 0, criticality: v.criticality as Criticality, isConsumable: v.isConsumable === '1' || v.measureKind === 'consumable', active: v.active === '1', sort: g === 'new' ? cs.groups.length * 10 + 10 : g.sort }) }} />}
    </div>
  )
}

function Stages() {
  const cs = useMaterialControlStore()
  const [edit, setEdit] = useState<StageDef | 'new' | null>(null)
  const active = cs.stageDefs.filter((d) => d.active)
  const [draft, setDraft] = useState<Record<string, Record<string, number>>>({})
  const [msg, setMsg] = useState('')
  useEffect(() => { const d: Record<string, Record<string, number>> = {}; for (const p of cs.patterns) { d[p.id] = {}; for (const s of cs.stageDefs) d[p.id][s.key] = cs.patternWeights.find((w) => w.patternId === p.id && w.stageKey === s.key)?.weight ?? 0 } setDraft(d) }, [cs.patterns, cs.patternWeights, cs.stageDefs])
  const sum = (pid: string) => weightsSum(draft[pid] ?? {}, active.map((s) => s.key))
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Section title="مراحل تأمین" hint="ترتیب، سطح تأیید و لزوم مدرک هر مرحله. مرحلهٔ غیرفعال در قلم‌های جدید نمی‌آید." flush action={<button className="im-btn im-btn-primary im-btn-sm" onClick={() => setEdit('new')}><Plus size={14} /> مرحلهٔ جدید</button>}>
        <DataTable rows={cs.stageDefs} rowKey={(s) => s.key} cols={[{ key: 'o', label: 'ردیف', num: true, render: (s) => fa(s.sort / 10) }, { key: 't', label: 'مرحله', render: (s) => <span className="strong">{s.title}</span> }, { key: 'r', label: 'تأییدکننده', render: (s) => REVIEW[s.reviewLevel] }, { key: 'e', label: 'مدرک', render: (s) => (s.needsEvidence ? 'لازم' : 'اختیاری') }, { key: 'a', label: 'وضعیت', render: (s) => <Chip tone={s.active ? 'good' : 'neutral'}>{s.active ? 'فعال' : 'غیرفعال'}</Chip> }, { key: 'x', label: '', render: (s) => <button className="im-btn im-btn-sm" aria-label="ویرایش" onClick={() => setEdit(s)}><Pencil size={13} /></button> }]} />
      </Section>
      <Section title="الگوهای وزنی" hint="مجموع وزن مراحل فعال هر الگو باید ۱۰۰ باشد. تغییر الگو روی اقلامی که قبلاً ساخته شده اثر نمی‌گذارد مگر با «اعمال دوبارهٔ الگو» در بسته، و فقط برای قلم‌هایی که مرحلهٔ ارسال‌شده یا تأییدشده ندارند." flush>
        <div className="fn-tbl-wrap"><table className="fn-tbl"><thead><tr><th>مرحله</th>{cs.patterns.map((p) => <th key={p.id} className="num">{p.title}{p.isDefault ? ' ★' : ''}</th>)}</tr></thead><tbody>
          {active.map((s) => <tr key={s.key}><td>{s.title}</td>{cs.patterns.map((p) => <td key={p.id} className="num"><input className="fn-cell-input" inputMode="decimal" dir="ltr" value={draft[p.id]?.[s.key] ?? 0} onChange={(e) => setDraft({ ...draft, [p.id]: { ...(draft[p.id] ?? {}), [s.key]: Number(e.target.value) || 0 } })} aria-label={`${p.title} — ${s.title}`} /></td>)}</tr>)}
        </tbody><tfoot><tr><td><b>جمع</b></td>{cs.patterns.map((p) => <td key={p.id} className="num"><b style={{ color: Math.abs(sum(p.id) - 100) < 0.001 ? 'var(--im-mint)' : 'var(--im-coral)' }}>{fa(sum(p.id), 1)}</b></td>)}</tr><tr><td />{cs.patterns.map((p) => <td key={p.id} className="num"><button className="im-btn im-btn-primary im-btn-sm" disabled={Math.abs(sum(p.id) - 100) > 0.001} onClick={async () => setMsg((await cs.savePattern(p.id, p.code, p.title, Object.fromEntries(active.map((s) => [s.key, draft[p.id]?.[s.key] ?? 0])), p.isDefault)) ? `الگوی «${p.title}» ذخیره شد.` : '')}>ذخیره</button></td>)}</tr></tfoot></table></div>
        {msg && <p className="im-helper" style={{ margin: 12 }}>{msg}</p>}
      </Section>
      {edit && <FormModal title={edit === 'new' ? 'مرحلهٔ جدید' : `ویرایش ${edit.title}`} submitLabel="ذخیره" onClose={() => setEdit(null)}
        fields={[{ key: 'key', label: 'شناسه (انگلیسی)', kind: 'text', required: true, disabled: edit !== 'new' }, { key: 'title', label: 'عنوان', kind: 'text', required: true, span: 2 }, { key: 'sort', label: 'ترتیب', kind: 'num' },
          { key: 'level', label: 'تأییدکننده', kind: 'select', required: true, options: Object.entries(REVIEW).map(([value, label]) => ({ value, label })) }, { key: 'ev', label: 'مدرک', kind: 'select', options: [{ value: '1', label: 'لازم' }, { value: '0', label: 'اختیاری' }] }, { key: 'act', label: 'وضعیت', kind: 'select', options: [{ value: '1', label: 'فعال' }, { value: '0', label: 'غیرفعال' }] }]}
        initial={{ key: edit === 'new' ? '' : edit.key, title: edit === 'new' ? '' : edit.title, sort: edit === 'new' ? (cs.stageDefs.at(-1)?.sort ?? 0) + 10 : edit.sort, level: edit === 'new' ? 'consultant' : edit.reviewLevel, ev: edit === 'new' || edit.needsEvidence ? '1' : '0', act: edit === 'new' || edit.active ? '1' : '0' }}
        onSubmit={async (v) => { await cs.saveStageDef({ key: String(v.key), title: String(v.title), sort: Number(v.sort) || 0, reviewLevel: v.level as StageDef['reviewLevel'], needsEvidence: v.ev === '1', active: v.act === '1' }) }} />}
    </div>
  )
}

function Rules() {
  const cs = useMaterialControlStore()
  const s = cs.settings
  const [v, setV] = useState<MtlSettings>(s)
  const [saved, setSaved] = useState(false)
  useEffect(() => setV(s), [s])
  const num = (k: keyof Omit<MtlSettings, 'priority' | 'rolePerms'>, label: string, hint?: string) => (
    <div className="im-field"><label>{label}</label><input inputMode="decimal" dir="ltr" style={{ textAlign: 'right' }} value={v[k] as number} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) || 0 })} />{hint && <p className="im-helper">{hint}</p>}</div>
  )
  const pr = (k: keyof MtlSettings['priority'], label: string) => <div className="im-field"><label>{label}</label><input inputMode="decimal" dir="ltr" style={{ textAlign: 'right' }} value={v.priority[k]} onChange={(e) => setV({ ...v, priority: { ...v.priority, [k]: Number(e.target.value) || 0 } })} /></div>
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Section title="آستانه‌ها" hint="در تشخیص مغایرت، تأخیر، مصرف و ضایعات به‌کار می‌رود. هر ذخیره یک نسخهٔ جدید است و سوابق نگه داشته می‌شود.">
        <div className="fn-form-grid">
          {num('longLeadDays', 'کالای با زمان تأمین طولانی (روز)', 'ریسک «زمان تأمین طولانی» برای اقلام بدون سفارش')}
          {num('delayBufferDays', 'حاشیهٔ ایمنی تأخیر (روز)', 'به زمان تحویل افزوده می‌شود')}
          {num('stagnantDays', 'کالای راکد (روز بدون مصرف)')}
          {num('qtyTolerancePct', 'تلورانس اختلاف مقدار پیمان و طراحی (٪)')}
          {num('scrapWarnPct', 'هشدار ضایعات (٪ از دریافتی)')}
          {num('consumptionTolerancePct', 'حد مجاز انحراف مصرف از مبنا (٪)')}
        </div>
      </Section>
      <Section title="وزن‌های اولویت‌بندی" hint="امتیاز اولویت ترکیبی از چهار عامل است. وزن‌ها نسبی‌اند و جمعشان لازم نیست ۱۰۰ باشد؛ امتیاز فقط ترتیب کار را نشان می‌دهد و تصمیم مدیریتی را جایگزین نمی‌کند.">
        <div className="fn-form-grid">{pr('criticality', 'بحرانی‌بودن کالا')}{pr('urgency', 'فشار زمانی (تاریخ نیاز در برابر زمان تأمین)')}{pr('gap', 'سهم پوشش‌داده‌نشده از نیاز')}{pr('risk', 'ریسک و مسئلهٔ باز مرتبط')}</div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}><button className="im-btn im-btn-primary" onClick={async () => setSaved(await cs.saveSettings(v, 'ویرایش آستانه‌ها و وزن‌ها'))}>ذخیرهٔ نسخهٔ جدید</button>{saved && <span className="im-helper" style={{ margin: 0 }}>ذخیره شد (نسخهٔ {fa(cs.settingsVersion)})</span>}</div>
      </Section>
      <p className="im-helper" style={{ margin: 0 }}>نسخهٔ فعلی تنظیمات: {fa(cs.settingsVersion)}</p>
    </div>
  )
}

function Audit({ projectId }: { projectId: string }) {
  const cs = useMaterialControlStore()
  const [rows, setRows] = useState<AuditRow[] | null>(null)
  const [tbl, setTbl] = useState('')
  useEffect(() => { void cs.loadAudit(projectId, 300).then(setRows) }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps
  const names: Record<string, string> = { mtl_materials: 'اقلام', mtl_packages: 'بسته‌ها', mtl_package_items: 'اقلام بسته', mtl_item_stages: 'مراحل تأمین', mtl_changes: 'تغییرات', mtl_txns: 'تراکنش‌ها', mtl_discrepancies: 'مغایرت‌ها', mtl_baselines: 'مبنا', mtl_links: 'اتصال ریسک/مسئله', mtl_project_roles: 'نقش‌ها', mtl_warehouse_lines: 'رسید انبار', mtl_purchase_orders: 'سفارش‌ها' }
  const shown = (rows ?? []).filter((r) => !tbl || r.tableName === tbl)
  return (
    <Section title="سابقهٔ فعالیت" hint="هر ثبت، ویرایش، تأیید، رد و ارجاع با زمان و کاربر نگه داشته می‌شود." flush action={<select value={tbl} onChange={(e) => setTbl(e.target.value)} aria-label="نوع رکورد" style={{ width: 'auto' }}><option value="">همه</option>{Object.entries(names).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}>
      {rows == null ? <div className="im-skeleton" style={{ height: 160, margin: 12 }} /> : (
        <DataTable rows={shown} rowKey={(a) => String(a.id)} empty="سابقه‌ای نیست." cols={[
          { key: 't', label: 'زمان', render: (a) => fmtD(a.at) }, { key: 'u', label: 'کاربر', render: (a) => (a.actor ? cs.people.get(a.actor) ?? 'کاربر' : '—') }, { key: 'k', label: 'رکورد', render: (a) => names[a.tableName] ?? a.tableName },
          { key: 'a', label: 'اقدام', render: (a) => (a.action === 'INSERT' ? 'ثبت' : a.action === 'UPDATE' ? 'ویرایش' : 'حذف') },
          { key: 'c', label: 'تغییر', render: (a) => { const o = a.oldRow ?? {}, n = a.newRow ?? {}; const keys = Object.keys(n).filter((k) => JSON.stringify(o[k]) !== JSON.stringify(n[k]) && !['updated_at', 'updated_by', 'created_at'].includes(k)); return <span style={{ fontSize: 12 }}>{keys.slice(0, 4).map((k) => `${k}: ${String(o[k] ?? '—').slice(0, 24)} ← ${String(n[k] ?? '—').slice(0, 24)}`).join(' · ') || '—'}</span> } }]} />
      )}
    </Section>
  )
}
