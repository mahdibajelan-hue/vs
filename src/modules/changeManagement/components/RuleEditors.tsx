import { useState } from 'react'
import { JalaliDateField } from '../../issues/components/JalaliDateField'
import { Field, MoneyInput } from './cm'
import { Dialog } from './drawer/Dialogs'
import { TYPE_FA, TYPE_ORDER, type ChangeType, type Route, type RouteStep, type Rule, type RuleDimension, type StepKind } from '../types'
import type { ProjectInfo } from '../lib/changeData'

const numOrNull = (v: string): number | null => { const t = v.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).trim(); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? n : null }
const NumField = ({ label, value, onChange, hint }: { label: string; value: number | null; onChange: (n: number | null) => void; hint?: string }) => (
  <Field label={label} hint={hint}><input dir="ltr" inputMode="decimal" value={value ?? ''} onChange={(e) => onChange(numOrNull(e.target.value))} placeholder="بدون حد" /></Field>
)

export const DIM_FA: Record<RuleDimension, string> = { cost: 'هزینه', time: 'زمان', type: 'نوع تغییر' }
const range = (lo: number | null, hi: number | null, unit: string) => (lo != null && hi != null ? `بیش از ${lo}${unit} و تا ${hi}${unit}` : hi != null ? `تا ${hi}${unit}` : lo != null ? `بیش از ${lo}${unit}` : '')
/** Plain-language reading of a rule — shown in tables so nobody has to decode the form. */
export function describeRule(r: Rule): string {
  const parts: string[] = []
  if (r.dimension === 'cost') { const b = r.costBasis === 'cumulative' ? 'تجمعی' : 'جاری'; const p = range(r.pctMin, r.pctMax, '٪'); const a = range(r.amountMin, r.amountMax, ' ریال'); parts.push(`هزینه (${b}): ${[p, a].filter(Boolean).join(' · ') || 'هر مقدار'}`) }
  if (r.dimension === 'time') { const b = r.daysBasis === 'cumulative' ? 'تجمعی' : 'جاری'; const d = range(r.daysMin, r.daysMax, ' روز'); const p = range(r.daysPctMin, r.daysPctMax, '٪ مدت'); parts.push(`زمان (${b}): ${[d, p].filter(Boolean).join(' · ') || 'هر مقدار'}`) }
  if (r.dimension === 'type') parts.push('بر اساس نوع تغییر')
  if (r.changeTypes.length) parts.push('نوع: ' + r.changeTypes.map((t) => TYPE_FA[t]).join('، '))
  if (r.contractTypes.length) parts.push('نوع قرارداد: ' + r.contractTypes.join('، '))
  if (r.orgUnits.length) parts.push('واحد: ' + r.orgUnits.join('، '))
  if (r.projectIds.length) parts.push(`${r.projectIds.length} پروژه`)
  if (r.requiresOpinions.length) parts.push('نظر الزامی: ' + r.requiresOpinions.join('، '))
  return parts.join(' — ')
}

const csv = (s: string) => s.split(/[,،]/).map((x) => x.trim()).filter(Boolean)

export function RuleDialog({ rule, ruleSetId, routes, projects, roles, onSave, onClose }: { rule: Rule | null; ruleSetId: string; routes: Route[]; projects: ProjectInfo[]; roles: string[]; onSave: (d: Partial<Rule>) => Promise<string | null>; onClose: () => void }) {
  const [f, setF] = useState<Partial<Rule>>(rule ?? { ruleSetId, code: '', title: '', dimension: 'cost', changeTypes: [], costBasis: 'cumulative', pctMin: null, pctMax: null, amountMin: null, amountMax: null, daysBasis: 'cumulative', daysMin: null, daysMax: null, daysPctMin: null, daysPctMax: null,
    contractTypes: [], projectIds: [], orgUnits: [], requiresOpinions: [], routeId: routes[0]?.id, priority: 100, active: true, validFrom: null, validTo: null, escalateAfterDays: null, escalationRole: null, notes: '' })
  const set = <K extends keyof Rule>(k: K, v: Rule[K] | null) => setF((x) => ({ ...x, [k]: v }))
  const [err, setErr] = useState('')
  return (
    <Dialog wide title={rule ? `ویرایش قاعده ${rule.code}` : 'قاعدهٔ جدید'} confirm="ذخیرهٔ قاعده" onClose={onClose} onConfirm={async () => {
      if (!f.code?.trim() || !f.title?.trim()) { setErr('کد و عنوان را وارد کنید.'); return 'کد و عنوان را وارد کنید.' }
      if (!f.routeId) return 'مسیر تصویب را انتخاب کنید.'
      return onSave({ ...f, code: f.code.trim(), title: f.title.trim() })
    }}>
      {err && <div className="im-err">{err}</div>}
      <div className="im-row"><Field label="کد"><input dir="ltr" value={f.code ?? ''} onChange={(e) => set('code', e.target.value)} /></Field><Field label="عنوان"><input value={f.title ?? ''} onChange={(e) => set('title', e.target.value)} /></Field></div>
      <div className="im-row">
        <Field label="بُعد قاعده"><select value={f.dimension} onChange={(e) => set('dimension', e.target.value as RuleDimension)}>{(Object.keys(DIM_FA) as RuleDimension[]).map((d) => <option key={d} value={d}>{DIM_FA[d]}</option>)}</select></Field>
        <Field label="مسیر تصویب"><select value={f.routeId ?? ''} onChange={(e) => set('routeId', e.target.value)}>{routes.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.title}</option>)}</select></Field>
        <Field label="اولویت" hint="عدد بزرگ‌تر برنده است"><input type="number" dir="ltr" value={f.priority ?? 100} onChange={(e) => set('priority', Number(e.target.value) || 0)} /></Field>
      </div>
      <Field label="نوع‌های تغییر (خالی = همه)"><div className="im-row" style={{ flexWrap: 'wrap', gap: 6 }}>{TYPE_ORDER.map((t) => <label key={t} className="im-check"><input type="checkbox" checked={(f.changeTypes ?? []).includes(t)} onChange={(e) => set('changeTypes', e.target.checked ? [...(f.changeTypes ?? []), t as ChangeType] : (f.changeTypes ?? []).filter((x) => x !== t))} /> {TYPE_FA[t]}</label>)}</div></Field>
      {f.dimension === 'cost' && (
        <>
          <Field label="مبنای درصد"><select value={f.costBasis} onChange={(e) => set('costBasis', e.target.value as Rule['costBasis'])}><option value="cumulative">تجمعی (با تصویب‌شده‌های قبلی قرارداد) — توصیه‌شده</option><option value="current">فقط همین تغییر</option></select></Field>
          <div className="im-row"><NumField label="بیشتر از (٪)" value={f.pctMin ?? null} onChange={(n) => set('pctMin', n)} hint="کران پایین، خودش شامل نیست" /><NumField label="تا سقف (٪)" value={f.pctMax ?? null} onChange={(n) => set('pctMax', n)} hint="کران بالا، خودش شامل است" /></div>
          <div className="im-row"><Field label="بیشتر از (ریال)"><MoneyInput value={f.amountMin ?? 0} onChange={(n) => set('amountMin', n || null)} /></Field><Field label="تا سقف (ریال)"><MoneyInput value={f.amountMax ?? 0} onChange={(n) => set('amountMax', n || null)} /></Field></div>
        </>
      )}
      {f.dimension === 'time' && (
        <>
          <Field label="مبنای مدت"><select value={f.daysBasis} onChange={(e) => set('daysBasis', e.target.value as Rule['daysBasis'])}><option value="cumulative">تجمعی (با تمدیدهای مصوب قبلی) — توصیه‌شده</option><option value="current">فقط همین تغییر</option></select></Field>
          <div className="im-row"><NumField label="بیشتر از (روز)" value={f.daysMin ?? null} onChange={(n) => set('daysMin', n)} /><NumField label="تا سقف (روز)" value={f.daysMax ?? null} onChange={(n) => set('daysMax', n)} /></div>
          <div className="im-row"><NumField label="بیشتر از (٪ مدت قرارداد)" value={f.daysPctMin ?? null} onChange={(n) => set('daysPctMin', n)} /><NumField label="تا سقف (٪ مدت قرارداد)" value={f.daysPctMax ?? null} onChange={(n) => set('daysPctMax', n)} /></div>
        </>
      )}
      <details><summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>شرایط و الزامات بیشتر</summary>
        <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
          <Field label="نظر الزامی از (نقش‌ها، با ویرگول)" hint="مثلاً مدیر مهندسی، مدیر امور پیمان — به مسیر اضافه می‌شود"><input list="cm-roles" value={(f.requiresOpinions ?? []).join('، ')} onChange={(e) => set('requiresOpinions', csv(e.target.value))} /></Field>
          <div className="im-row"><Field label="نوع قرارداد (خالی = همه)"><input value={(f.contractTypes ?? []).join('، ')} onChange={(e) => set('contractTypes', csv(e.target.value))} /></Field><Field label="واحد سازمانی (خالی = همه)"><input value={(f.orgUnits ?? []).join('، ')} onChange={(e) => set('orgUnits', csv(e.target.value))} /></Field></div>
          <Field label="فقط پروژه‌های (خالی = همه)"><select multiple size={4} value={f.projectIds ?? []} onChange={(e) => set('projectIds', [...e.target.selectedOptions].map((o) => o.value))}>{projects.map((p) => <option key={p.id} value={p.id}>{p.code ? p.code + ' · ' : ''}{p.name}</option>)}</select></Field>
          <div className="im-row"><Field label="شروع اعتبار"><JalaliDateField value={f.validFrom ?? ''} onChange={(v) => set('validFrom', v || null)} /></Field><Field label="پایان اعتبار"><JalaliDateField value={f.validTo ?? ''} onChange={(v) => set('validTo', v || null)} /></Field></div>
          <div className="im-row"><NumField label="تشدید پس از (روز توقف)" value={f.escalateAfterDays ?? null} onChange={(n) => set('escalateAfterDays', n)} /><Field label="تشدید به نقش"><input list="cm-roles" value={f.escalationRole ?? ''} onChange={(e) => set('escalationRole', e.target.value || null)} /></Field></div>
          <Field label="یادداشت"><textarea rows={2} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
        </div>
      </details>
      <label className="im-check"><input type="checkbox" checked={f.active ?? true} onChange={(e) => set('active', e.target.checked)} /> قاعده فعال است</label>
      <datalist id="cm-roles">{roles.map((r) => <option key={r} value={r} />)}</datalist>
    </Dialog>
  )
}

export function RouteDialog({ route, onSave, onClose }: { route: Route | null; onSave: (d: { code: string; title: string; mode: 'sequential' | 'parallel'; level: number }) => Promise<string | null>; onClose: () => void }) {
  const [f, setF] = useState({ code: route?.code ?? '', title: route?.title ?? '', mode: route?.mode ?? ('sequential' as const), level: route?.level ?? 1 })
  return (
    <Dialog title={route ? `ویرایش مسیر ${route.code}` : 'مسیر جدید'} confirm="ذخیره" onClose={onClose} onConfirm={async () => (f.code.trim() && f.title.trim() ? onSave({ ...f, code: f.code.trim(), title: f.title.trim() }) : 'کد و عنوان را وارد کنید.')}>
      <div className="im-row"><Field label="کد"><input dir="ltr" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field><Field label="عنوان"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field></div>
      <div className="im-row"><Field label="سطح اختیار (بزرگ‌تر = بالاتر)" hint="هنگام ادغام مسیرها ترتیب مراحل را تعیین می‌کند"><input type="number" dir="ltr" value={f.level} onChange={(e) => setF({ ...f, level: Number(e.target.value) || 1 })} /></Field>
        <Field label="نحوهٔ ارجاع"><select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as 'sequential' | 'parallel' })}><option value="sequential">متوالی (یکی‌یکی)</option><option value="parallel">موازی (مراحل هم‌گروه با هم)</option></select></Field></div>
    </Dialog>
  )
}

export function StepDialog({ step, nextSeq, roles, onSave, onClose }: { step: RouteStep | null; nextSeq: number; roles: string[]; onSave: (d: { seq: number; kind: StepKind; role_name: string; label: string; parallel_group: number | null; sla_days: number; requires_reference: boolean }) => Promise<string | null>; onClose: () => void }) {
  const [f, setF] = useState({ seq: step?.seq ?? nextSeq, kind: (step?.kind ?? 'approval') as StepKind, role: step?.roleName ?? '', label: step?.label ?? '', pg: step?.parallelGroup ?? null as number | null, sla: step?.slaDays ?? 5, ref: step?.requiresReference ?? false })
  return (
    <Dialog title={step ? 'ویرایش مرحله' : 'مرحلهٔ جدید'} confirm="ذخیره" onClose={onClose} onConfirm={async () => (f.role.trim() ? onSave({ seq: f.seq, kind: f.kind, role_name: f.role.trim(), label: f.label.trim() || f.role.trim(), parallel_group: f.pg, sla_days: f.sla, requires_reference: f.ref }) : 'مرجع (نقش) را وارد کنید.')}>
      <div className="im-row"><Field label="ترتیب"><input type="number" dir="ltr" value={f.seq} onChange={(e) => setF({ ...f, seq: Number(e.target.value) || 1 })} /></Field>
        <Field label="نوع مرحله"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as StepKind })}><option value="opinion">نظر (بررسی تخصصی)</option><option value="approval">تصویب</option><option value="body">مصوبهٔ مرجع (هیئت‌مدیره/کمیته؛ ثبت شمارهٔ مصوبه)</option></select></Field></div>
      <Field label="مرجع (نقش در مدیریت کاربران)" hint="فقط کسی که این نقش را در پروژه دارد می‌تواند تصمیم بگیرد"><input list="cm-roles2" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} /></Field>
      <Field label="عنوان مرحله"><input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
      <div className="im-row"><Field label="مهلت (روز)"><input type="number" dir="ltr" value={f.sla} onChange={(e) => setF({ ...f, sla: Number(e.target.value) || 1 })} /></Field><Field label="شمارهٔ گروه موازی (اختیاری)"><input type="number" dir="ltr" value={f.pg ?? ''} onChange={(e) => setF({ ...f, pg: e.target.value === '' ? null : Number(e.target.value) })} /></Field></div>
      <label className="im-check"><input type="checkbox" checked={f.ref} onChange={(e) => setF({ ...f, ref: e.target.checked })} /> ثبت شمارهٔ مصوبه الزامی است</label>
      <datalist id="cm-roles2">{roles.map((r) => <option key={r} value={r} />)}</datalist>
    </Dialog>
  )
}
