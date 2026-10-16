import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useEpcModel } from '../lib/useEpcModel'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { EpcGate } from '../components/epc/EpcBanner'
import { ActivityPicker } from '../components/ActivityPicker'
import { Chip, Section } from '../../finance/components/fn'
import { fa } from '../components/common'
import type { ActionField, WorkAction } from '../lib/workActions'

const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(36) }
/** one field per line: «عنوان | num / text / select | گزینه۱، گزینه۲» */
export const fieldsToText = (f: ActionField[]) => f.map((x) => `${x.label} | ${x.kind}${x.kind === 'select' ? ` | ${(x.options ?? []).join('، ')}` : ''}`).join('\n')
export function textToFields(t: string): ActionField[] {
  return t.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [label, kind = 'text', opts = ''] = l.split('|').map((x) => x.trim()), k = kind === 'num' || kind === 'select' ? kind : 'text'
    return { key: `f${hash(label)}`, label, kind: k, ...(k === 'select' ? { options: opts.split(/[،,]/).map((o) => o.trim()).filter(Boolean) } : {}) } as ActionField
  })
}

/** Quick mapping of an entered action to a price-book item: used under the statement and in the settings. */
export function UnmappedActions({ projectId, can }: { projectId: string; can: boolean }) {
  const m = useEpcModel(projectId)
  const epc = useEpcStore()
  const [pick, setPick] = useState<Record<string, { act: string; factor: number }>>({})
  if (m.ex.unmappedActions.length === 0) return null
  return (
    <Section title="اقدام‌های بدون تطبیق با فهرست‌بها" hint="این مقدارها هنوز در پیشرفت و صورت‌وضعیت وارد نمی‌شوند. هر اقدام را با نزدیک‌ترین ردیف فهرست‌بهای پیمان تطبیق دهید (ضریب تبدیل واحد اقدام به واحد ردیف).">
      <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>اقدام</th><th className="num">جمع ثبت‌شده</th><th>ردیف فهرست‌بها</th><th>ضریب</th><th /></tr></thead><tbody>
        {m.ex.unmappedActions.map((u) => { const p = pick[u.actionKey] ?? { act: '', factor: 1 }; return <tr key={`${u.actionKey}|${u.reason ?? ''}`}>
          <td><b>{u.title}</b>{u.reason && <small className="ex-warn" style={{ display: 'block' }}>{u.reason}</small>}</td><td className="num">{fa(u.qty, 2)} {u.unit} ({fa(u.lines)} ردیف)</td>
          <td style={{ minWidth: 260 }}>{can ? <ActivityPicker activities={m.ex.activities.filter((a) => a.active)} value={p.act} onChange={(v) => setPick({ ...pick, [u.actionKey]: { ...p, act: v } })} emptyLabel="ردیف فهرست‌بها…" title="تطبیق اقدام با فهرست‌بها" width={420} /> : '—'}</td>
          <td><input type="number" step="any" min="0" value={p.factor} onChange={(e) => setPick({ ...pick, [u.actionKey]: { ...p, factor: Number(e.target.value) || 1 } })} style={{ width: 80 }} aria-label="ضریب" /></td>
          <td>{can && <button className="im-btn im-btn-primary im-btn-sm" disabled={!p.act} onClick={() => void epc.saveRule(projectId, { actionKey: u.actionKey, activityId: p.act, factor: p.factor })}>ثبت تطبیق</button>}</td></tr> })}
      </tbody></table></div>
    </Section>
  )
}

export function ActionsSettings({ projectId }: { projectId: string }) { return <EpcGate><Inner projectId={projectId} /></EpcGate> }
function Inner({ projectId }: { projectId: string }) {
  const m = useEpcModel(projectId)
  const epc = useEpcStore(), ex = useExecutionStore()
  const can = ex.can(projectId, '*') || ex.can(projectId, 'configure') || ex.can(projectId, 'edit_activities')
  const flags = ((ex.settings(projectId) as unknown as { flags?: Record<string, boolean> }).flags ?? {})
  const actions = useMemo(() => epc.workActions.filter((a) => a.projectId === projectId).sort((a, b) => a.sort - b.sort), [epc.workActions, projectId])
  const rules = epc.actionRules.filter((r) => r.projectId === projectId)
  const [edit, setEdit] = useState<{ key: string; title: string; unit: string; group: string; fields: string; billable: boolean } | null>(null)
  const [rule, setRule] = useState<Record<string, { act: string; factor: number; wf: string; wv: string; mf: string[] }>>({})
  const title = (id: string) => m.ex.actById.get(id)?.title ?? '—'
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Section title="ثبت گزارش روزانه بر اساس اقدام" hint="با روشن‌کردن این گزینه، نیروی کارگاه در گزارش روزانه فقط «اقدام» (جوشکاری، رادیوگرافی، حفاری کانال …) را انتخاب و فیلدهای همان اقدام را پر می‌کند؛ تطبیق با فهرست‌بها بعداً انجام می‌شود. ردیف‌های قبلی که با ردیف فهرست‌بها ثبت شده‌اند همان‌طور کار می‌کنند.">
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" disabled={!can} checked={!!flags.actionEntry} onChange={(e) => void ex.saveSettings(projectId, { flags: { ...flags, actionEntry: e.target.checked } } as never)} /> ثبت بر اساس اقدام (به‌جای انتخاب ردیف فهرست‌بها)</label>
      </Section>
      <Section title="اقدام‌های کارگاهی" hint="هر اقدام: عنوان، واحد خودش و فیلدهای اختصاصی. این فهرست مال پروژه است و هر زمان قابل ویرایش است."
        action={can ? <span style={{ display: 'inline-flex', gap: 6 }}><button className="im-btn im-btn-sm" onClick={() => void epc.seedActions(projectId)}>افزودن اقدام‌های پیش‌فرض خط لوله</button><button className="im-btn im-btn-primary im-btn-sm" onClick={() => setEdit({ key: '', title: '', unit: '', group: '', fields: '', billable: true })}><Plus size={13} /> اقدام جدید</button></span> : undefined}>
        {edit && <div className="im-card" style={{ padding: 10, display: 'grid', gap: 6, marginBottom: 8, maxWidth: 560 }}>
          <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="عنوان اقدام (مثلاً حفاری کانال)" aria-label="عنوان" />
          <span style={{ display: 'flex', gap: 6 }}><input value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} placeholder="واحد (m، عدد، سرجوش …)" aria-label="واحد" /><input value={edit.group} onChange={(e) => setEdit({ ...edit, group: e.target.value })} placeholder="گروه (جوش، عملیات خاکی …)" aria-label="گروه" /></span>
          <textarea rows={4} value={edit.fields} onChange={(e) => setEdit({ ...edit, fields: e.target.value })} placeholder={'هر فیلد یک خط: عنوان | num یا text یا select | گزینه‌ها\nنوع زمین | select | خاکی، سنگی\nعمق (m) | num'} aria-label="فیلدها" dir="auto" />
          <label className="im-helper" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={edit.billable} onChange={(e) => setEdit({ ...edit, billable: e.target.checked })} /> قابل تبدیل به ردیف فهرست‌بها (اگر خاموش باشد، فقط اطلاع‌رسانی است؛ مثل فیت‌آپ که داخل ردیف جوشکاری حساب می‌شود)</label>
          <span style={{ display: 'flex', gap: 6 }}><button className="im-btn im-btn-primary im-btn-sm" disabled={!edit.title.trim() || !edit.unit.trim()} onClick={async () => { const key = edit.key || `a${hash(edit.title + Date.now())}`; if (await epc.saveAction(projectId, { key, title: edit.title.trim(), unit: edit.unit.trim(), group: edit.group.trim(), fields: textToFields(edit.fields), sort: actions.find((a) => a.key === key)?.sort ?? (actions.length + 1) * 10, billable: edit.billable })) setEdit(null) }}>ذخیره</button><button className="im-btn im-btn-sm" onClick={() => setEdit(null)}>انصراف</button></span>
        </div>}
        {actions.length === 0 ? <p className="im-helper">هنوز اقدامی تعریف نشده است.{can ? ' «افزودن اقدام‌های پیش‌فرض» را بزنید یا اقدام جدید بسازید.' : ''}</p> : <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>اقدام</th><th>واحد</th><th>گروه</th><th>فیلدها</th><th>تطبیق‌ها</th><th /></tr></thead><tbody>
          {actions.map((a) => <tr key={a.key} style={{ opacity: a.active ? 1 : 0.5 }}><td><b>{a.title}</b></td><td>{a.unit}{a.billable === false && <Chip tone="neutral">اطلاع‌رسانی</Chip>}</td><td>{a.group}</td><td dir="auto">{a.fields.map((f) => f.label).join('، ') || '—'}</td><td className="num">{fa(rules.filter((r) => r.actionKey === a.key).length)}</td>
            <td style={{ whiteSpace: 'nowrap' }}>{can && <><button className="im-btn im-btn-sm" onClick={() => setEdit({ key: a.key, title: a.title, unit: a.unit, group: a.group, fields: fieldsToText(a.fields), billable: a.billable !== false })}>ویرایش</button> <button className="im-btn im-btn-sm" onClick={() => void epc.saveAction(projectId, { key: a.key, title: a.title, unit: a.unit, group: a.group, fields: a.fields, sort: a.sort, active: !a.active, billable: a.billable !== false })}>{a.active ? 'غیرفعال' : 'فعال'}</button></>}</td></tr>)}
        </tbody></table></div>}
      </Section>
      <UnmappedActions projectId={projectId} can={can} />
      <Section title="تطبیق اقدام‌ها با فهرست‌بهای پیمان" hint="هر اقدام را به یک یا چند ردیف فهرست‌بها وصل کنید: مقدار ردیف = مقدار اقدام × ضریب. با «شرط» می‌توان بر اساس یکی از فیلدهای اقدام ردیف دیگری را انتخاب کرد (مثلاً نوع زمین سنگی ← ردیف حفاری در سنگ). ردیف بدون شرط، پیش‌فرض است.">
        {actions.map((a: WorkAction & { projectId: string }) => { const mine = rules.filter((r) => r.actionKey === a.key), d = rule[a.key] ?? { act: '', factor: 1, wf: '', wv: '', mf: [] }; const sel = a.fields.find((f) => f.key === d.wf); return (
          <div key={a.key} className="im-card" style={{ padding: 10, marginBottom: 8 }}>
            <b>{a.title}</b> <span className="im-helper">({a.unit})</span>
            {mine.map((r) => <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0' }}><Chip tone="good">× {fa(r.factor, 4)}</Chip><span dir="auto">{title(r.activityId)}</span>{r.multFields && <Chip tone="neutral">× {r.multFields.split(',').map((k) => a.fields.find((f) => f.key === k)?.label ?? k).join(' × ')}</Chip>}{r.whenField && <Chip tone="neutral">اگر {a.fields.find((f) => f.key === r.whenField)?.label ?? r.whenField} = {r.whenValue}</Chip>}{can && <button className="im-btn im-btn-sm" aria-label="حذف تطبیق" onClick={() => void epc.removeRule(r.id)}><Trash2 size={12} /></button>}</div>)}
            {mine.length === 0 && <div className="im-helper">تطبیقی ندارد.</div>}
            {can && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
              <ActivityPicker activities={m.ex.activities.filter((x) => x.active)} value={d.act} onChange={(v) => setRule({ ...rule, [a.key]: { ...d, act: v } })} emptyLabel="ردیف فهرست‌بها…" title={`تطبیق «${a.title}»`} width={420} />
              <label className="im-helper">ضریب <input type="number" step="any" min="0" value={d.factor} onChange={(e) => setRule({ ...rule, [a.key]: { ...d, factor: Number(e.target.value) || 1 } })} style={{ width: 80 }} /></label>
              <select value={d.wf} onChange={(e) => setRule({ ...rule, [a.key]: { ...d, wf: e.target.value, wv: '' } })} aria-label="شرط"><option value="">بدون شرط (پیش‌فرض)</option>{a.fields.filter((f) => f.kind === 'select').map((f) => <option key={f.key} value={f.key}>اگر {f.label} …</option>)}</select>
              {a.fields.some((f) => f.kind === 'num') && <span className="im-helper" style={{ display: 'inline-flex', gap: 6 }}>ضرب در: {a.fields.filter((f) => f.kind === 'num').map((f) => <label key={f.key} style={{ display: 'inline-flex', gap: 3 }}><input type="checkbox" checked={d.mf.includes(f.key)} onChange={(e) => setRule({ ...rule, [a.key]: { ...d, mf: e.target.checked ? [...d.mf, f.key] : d.mf.filter((x) => x !== f.key) } })} />{f.label}</label>)}</span>}
              {sel && <select value={d.wv} onChange={(e) => setRule({ ...rule, [a.key]: { ...d, wv: e.target.value } })} aria-label="مقدار شرط"><option value="">مقدار…</option>{sel.options?.map((o) => <option key={o} value={o}>{o}</option>)}</select>}
              <button className="im-btn im-btn-primary im-btn-sm" disabled={!d.act || (!!d.wf && !d.wv)} onClick={async () => { if (await epc.saveRule(projectId, { actionKey: a.key, activityId: d.act, factor: d.factor, whenField: d.wf, whenValue: d.wv, multFields: d.mf.join(',') })) setRule({ ...rule, [a.key]: { act: '', factor: 1, wf: '', wv: '', mf: [] } }) }}>افزودن تطبیق</button>
            </div>}
          </div>) })}
        {actions.length === 0 && <p className="im-helper">ابتدا اقدام‌ها را تعریف کنید.</p>}
      </Section>
    </div>
  )
}
