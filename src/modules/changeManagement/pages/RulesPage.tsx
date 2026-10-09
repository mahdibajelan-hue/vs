import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Copy, FlaskConical, Pencil, Plus, Rocket, Trash2 } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { HelpButton } from '../../issues/components/Help'
import { useChangeStore, type RuleBundle } from '../store/useChangeStore'
import { useChangeCtx } from '../lib/useChangeData'
import { computeBasis, resolveRoute, validateRuleSet, type EngineRuleSet } from '../lib/changeRules'
import { friendly } from '../lib/changeFlow'
import { CM_HELP } from '../lib/help'
import { TYPE_FA, TYPE_ORDER, STEP_KIND_FA, type ChangeType, type RuleAudit, type Route, type RouteStep, type Rule, type ValidationIssue } from '../types'
import { RouteDialog, RuleDialog, StepDialog, DIM_FA, describeRule } from '../components/RuleEditors'
import { ResolutionPanel, jd } from '../components/RouteTrack'
import { Field, nf } from '../components/cm'
import { Dialog } from '../components/drawer/Dialogs'
import { Segmented } from '../../issues/components/ui'
import type { PageProps } from '../ChangeApp'

type Sub = 'rules' | 'sim' | 'limits' | 'audit'
const STATUS_FA = { draft: 'پیش‌نویس', active: 'فعال', archived: 'بایگانی' } as const
const STATUS_C = { draft: '#f59e0b', active: '#22c55e', archived: '#94a3b8' } as const

export function RulesPage(_: PageProps) {
  const ctx = useChangeCtx()
  const st = useChangeStore()
  const [b, setB] = useState<RuleBundle | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [sub, setSub] = useState<Sub>('rules')
  const [roles, setRoles] = useState<string[]>([])
  const [issues, setIssues] = useState<ValidationIssue[]>([])
  const [audit, setAudit] = useState<RuleAudit[]>([])
  const [msg, setMsg] = useState('')
  const [dlg, setDlg] = useState<null | { k: 'rule'; rule: Rule | null } | { k: 'route'; route: Route | null } | { k: 'step'; route: Route; step: RouteStep | null } | { k: 'clone' } | { k: 'activate' } | { k: 'limit'; id: string | null }>(null)
  const canManage = ctx.perms(null).isAdmin || Object.values(st.myRoles).some((r) => r.includes('نماینده PMO'))
  const reload = useCallback(async () => { const x = await st.loadRuleBundle(); setB(x); setSel((s) => s ?? x.sets.find((y) => y.status === 'active')?.id ?? x.sets[0]?.id ?? null) }, [st])
  useEffect(() => { reload(); supabase.from('rasta_project_roles').select('name').order('name').then(({ data }) => setRoles(((data ?? []) as { name: string }[]).map((r) => r.name))) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])
  const set = b?.sets.find((s) => s.id === sel) ?? null
  const routes = useMemo(() => (b && set ? b.routes.filter((r) => r.ruleSetId === set.id).sort((x, y) => x.level - y.level || x.code.localeCompare(y.code)) : []), [b, set])
  const rules = useMemo(() => (b && set ? b.rules.filter((r) => r.ruleSetId === set.id).sort((x, y) => x.dimension.localeCompare(y.dimension) || y.priority - x.priority || x.code.localeCompare(y.code)) : []), [b, set])
  const steps = (rid: string) => (b ? b.steps.filter((s) => s.routeId === rid).sort((x, y) => x.seq - y.seq) : [])
  const engine: EngineRuleSet | null = useMemo(() => (b && set ? { set: { id: set.id, version: set.version, name: set.name }, routes, steps: b.steps.filter((s) => routes.some((r) => r.id === s.routeId)), rules } : null), [b, set, routes, rules])
  const draft = set?.status === 'draft'
  const editable = draft && canManage
  const localIssues = useMemo(() => (engine ? validateRuleSet(engine, roles) : []), [engine, roles])
  useEffect(() => { if (set) st.validateSet(set.id).then(setIssues) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [set?.id, b])
  useEffect(() => { if (sub === 'audit') st.loadAudit().then(setAudit) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sub, b])
  const done = async (r: { ok: boolean; error?: string }) => { setMsg(r.ok ? '' : r.error ?? ''); if (r.ok) await reload(); return r.ok ? null : r.error ?? 'ثبت نشد' }
  const issueList = issues.length ? issues : localIssues

  return (
    <div className="im-page" style={{ display: 'grid', gap: 14 }}>
      <datalist id="cm-roles-g">{roles.map((r) => <option key={r} value={r} />)}</datalist>
      <div className="im-row" style={{ justifyContent: 'space-between' }}>
        <div><div className="im-page-title">قواعد و مسیرهای تصویب</div><div className="im-page-sub">ماتریس اختیارات به‌صورت داده؛ هر درخواست با نسخه‌ای که بر اساس آن بررسی شده ثبت می‌شود</div></div>
        <div className="im-actions"><HelpButton content={CM_HELP.rules} />
          {canManage && set && <button className="im-btn" onClick={() => setDlg({ k: 'clone' })}><Copy size={14} /> نسخهٔ جدید (کپی از این)</button>}
          {editable && <button className="im-btn im-btn-primary" onClick={() => setDlg({ k: 'activate' })}><Rocket size={14} /> اعتبارسنجی و فعال‌سازی</button>}</div>
      </div>
      {!canManage && <div className="cm-note"><div>شما فقط مجاز به مشاهدهٔ قواعد هستید. ویرایش برای مدیر سامانه و «نمایندهٔ PMO» است.</div></div>}
      {msg && <div className="im-err" role="alert">{msg}</div>}

      <div className="im-card">
        <div className="im-section-title">نسخه‌های مجموعهٔ قواعد</div>
        <div className="im-row" style={{ flexWrap: 'wrap', gap: 8 }}>{(b?.sets ?? []).map((s) => (
          <button key={s.id} type="button" onClick={() => setSel(s.id)} className="im-card-flat" style={{ textAlign: 'start', borderColor: sel === s.id ? 'var(--im-accent)' : undefined, minWidth: 190 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><b>نسخهٔ {s.version}</b><span className="cm-chip" style={{ ['--c' as string]: STATUS_C[s.status] }}><i />{STATUS_FA[s.status]}</span>{s.isSample && <span className="cm-chip" style={{ ['--c' as string]: '#38bdf8' }}>نمونه</span>}</div>
            <div className="im-helper">{s.name}</div><div className="im-helper">{s.effectiveFrom ? 'از ' + jd(s.effectiveFrom) : ''}{s.effectiveTo ? ' تا ' + jd(s.effectiveTo) : ''}</div>
          </button>))}
        </div>
        {set?.note && <div className="cm-warn" style={{ marginTop: 10 }}><div>{set.note}</div></div>}
        {set && !draft && <div className="im-helper" style={{ marginTop: 8 }}>این نسخه {set.status === 'active' ? 'فعال' : 'بایگانی‌شده'} است و ویرایش نمی‌شود؛ برای تغییر، «نسخهٔ جدید» بسازید. درخواست‌های قبلی با نسخهٔ خودشان باقی می‌مانند.</div>}
      </div>

      {set && issueList.length > 0 && (
        <div className="im-card"><div className="im-section-title">اعتبارسنجی نسخهٔ {set.version}</div>
          <div className="im-grid" style={{ gap: 6 }}>{issueList.map((i, k) => <div key={k} className={i.level === 'error' ? 'cm-warn' : 'cm-note'}>{i.level === 'error' ? <AlertTriangle size={16} aria-hidden style={{ flex: 'none', marginTop: 3 }} /> : <CheckCircle2 size={16} aria-hidden style={{ flex: 'none', marginTop: 3 }} />}<div>{i.level === 'error' ? 'خطا: ' : 'هشدار: '}{i.message}</div></div>)}</div>
        </div>
      )}

      <Segmented value={sub} onChange={setSub} options={[{ id: 'rules', label: 'مسیرها و قواعد' }, { id: 'sim', label: <><FlaskConical size={13} /> آزمون قاعده</> }, { id: 'limits', label: 'سقف اختیار نقش‌ها' }, { id: 'audit', label: 'سابقهٔ تغییر' }]} />

      {sub === 'rules' && set && (
        <>
          <div>
            <div className="im-section-title">مسیرهای تصویب {editable && <button className="im-btn" onClick={() => setDlg({ k: 'route', route: null })}><Plus size={14} /> مسیر</button>}</div>
            <div className="cm-rule-grid">{routes.map((r) => (
              <div key={r.id} className="cm-route-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}><div><b>{r.title}</b><div className="im-helper">{r.code} · سطح {r.level} · {r.mode === 'sequential' ? 'متوالی' : 'موازی'}</div></div>
                  {editable && <div className="im-actions" style={{ flexWrap: 'nowrap' }}><button className="im-btn im-btn-ghost" aria-label="ویرایش مسیر" onClick={() => setDlg({ k: 'route', route: r })}><Pencil size={13} /></button><button className="im-btn im-btn-ghost" aria-label="حذف مسیر" onClick={async () => { await done(await st.deleteRow('cm_routes', r.id)) }}><Trash2 size={13} /></button></div>}</div>
                <ol>{steps(r.id).map((s) => <li key={s.id}><span className="n">{s.seq}</span><span style={{ flex: 1 }}><b>{s.roleName}</b> <span className="im-helper">· {STEP_KIND_FA[s.kind]} · {s.slaDays} روز{s.requiresReference ? ' · شمارهٔ مصوبه' : ''}{s.parallelGroup != null ? ` · گروه ${s.parallelGroup}` : ''}</span></span>
                  {editable && <span className="im-actions" style={{ flexWrap: 'nowrap' }}><button className="im-btn im-btn-ghost" aria-label="ویرایش مرحله" onClick={() => setDlg({ k: 'step', route: r, step: s })}><Pencil size={12} /></button><button className="im-btn im-btn-ghost" aria-label="حذف مرحله" onClick={async () => { await done(await st.deleteRow('cm_route_steps', s.id)) }}><Trash2 size={12} /></button></span>}</li>)}</ol>
                {editable && <button className="im-btn im-btn-ghost" style={{ marginTop: 6 }} onClick={() => setDlg({ k: 'step', route: r, step: null })}><Plus size={13} /> مرحله</button>}
              </div>))}</div>
          </div>
          <div>
            <div className="im-section-title">قواعد {editable && <button className="im-btn" disabled={!routes.length} onClick={() => setDlg({ k: 'rule', rule: null })}><Plus size={14} /> قاعده</button>}</div>
            {rules.length === 0 ? <div className="im-empty">قاعده‌ای تعریف نشده است.</div> : (
              <div className="im-table-wrap"><table className="im-table"><thead><tr><th>کد</th><th>عنوان</th><th>بُعد</th><th>شرط اعمال</th><th>اولویت</th><th>مسیر</th><th>فعال</th>{editable && <th />}</tr></thead><tbody>
                {rules.map((r) => <tr key={r.id}><td><span className="im-code">{r.code}</span></td><td>{r.title}</td><td>{DIM_FA[r.dimension]}</td><td style={{ fontSize: 12, maxWidth: 320 }}>{describeRule(r)}{r.validFrom || r.validTo ? <div className="im-helper">اعتبار: {jd(r.validFrom) || '…'} تا {jd(r.validTo) || '…'}</div> : null}</td><td className="cm-mono">{r.priority}</td><td style={{ fontSize: 12 }}>{routes.find((x) => x.id === r.routeId)?.code}</td><td>{r.active ? 'بله' : 'خیر'}</td>
                  {editable && <td><div className="im-actions" style={{ flexWrap: 'nowrap' }}><button className="im-btn im-btn-ghost" aria-label="ویرایش" onClick={() => setDlg({ k: 'rule', rule: r })}><Pencil size={13} /></button><button className="im-btn im-btn-ghost" aria-label="حذف" onClick={async () => { await done(await st.deleteRow('cm_rules', r.id)) }}><Trash2 size={13} /></button></div></td>}</tr>)}
              </tbody></table></div>
            )}
            <div className="im-helper" style={{ marginTop: 6 }}>قاعدهٔ «تجمعی» درصد را با احتساب تغییرات مصوب قبلی همان قرارداد می‌سنجد؛ کران پایین «بیشتر از» و کران بالا «تا سقف» است.</div>
          </div>
        </>
      )}

      {sub === 'sim' && engine && <Simulator engine={engine} />}
      {sub === 'limits' && b && <Limits b={b} canManage={canManage} roles={roles} onChange={async (r) => { await done(r) }} />}
      {sub === 'audit' && (
        <div className="im-table-wrap"><table className="im-table"><thead><tr><th>زمان</th><th>کاربر</th><th>جدول</th><th>عملیات</th><th>مورد</th></tr></thead><tbody>
          {audit.map((a) => { const row = (a.newData ?? a.oldData) as Record<string, unknown> | null; return <tr key={a.id}><td className="im-helper">{jd(a.at)} {new Date(a.at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</td><td>{ctx.userName(a.userId)}</td><td>{a.tableName.replace('cm_', '')}</td><td>{a.action === 'INSERT' ? 'افزودن' : a.action === 'UPDATE' ? 'ویرایش' : 'حذف'}</td><td style={{ fontSize: 12 }}>{String(row?.code ?? row?.title ?? row?.name ?? row?.role_name ?? '')}</td></tr> })}
          {audit.length === 0 && <tr><td colSpan={5} className="im-helper">سابقه‌ای ثبت نشده است.</td></tr>}
        </tbody></table></div>
      )}

      {dlg?.k === 'rule' && set && <RuleDialog rule={dlg.rule} ruleSetId={set.id} routes={routes} projects={ctx.projects} roles={roles} onClose={() => setDlg(null)} onSave={async (d) => done(await st.saveRule(dlg.rule?.id ?? null, d))} />}
      {dlg?.k === 'route' && set && <RouteDialog route={dlg.route} onClose={() => setDlg(null)} onSave={async (d) => done(dlg.route ? await st.updateRow('cm_routes', dlg.route.id, d) : await st.insertRow('cm_routes', { ...d, rule_set_id: set.id }))} />}
      {dlg?.k === 'step' && <StepDialog step={dlg.step} nextSeq={steps(dlg.route.id).length + 1} roles={roles} onClose={() => setDlg(null)} onSave={async (d) => done(dlg.step ? await st.updateRow('cm_route_steps', dlg.step.id, d) : await st.insertRow('cm_route_steps', { ...d, route_id: dlg.route.id }))} />}
      {dlg?.k === 'clone' && set && <Dialog title="ساخت نسخهٔ جدید" confirm="ساخت پیش‌نویس" onClose={() => setDlg(null)} onConfirm={async () => { const { data, error } = await supabase.rpc('cm_clone_rule_set', { p_set: set.id, p_name: null }); if (error) return friendly(error); await reload(); setSel(data as string); return null }}><div className="cm-note"><div>یک پیش‌نویس با همهٔ مسیرها و قواعد نسخهٔ {set.version} ساخته می‌شود. پس از ویرایش و اعتبارسنجی می‌توانید آن را فعال کنید؛ نسخهٔ فعلی تا آن زمان در کار می‌ماند.</div></div></Dialog>}
      {dlg?.k === 'activate' && set && <Dialog title={`فعال‌سازی نسخهٔ ${set.version}`} confirm="فعال‌سازی" onClose={() => setDlg(null)} onConfirm={async () => { const { error } = await supabase.rpc('cm_activate_rule_set', { p_set: set.id, p_effective_from: new Date().toISOString().slice(0, 10) }); if (error) return friendly(error); await reload(); await st.fetchActiveRules(); return null }}>
        <div className="cm-warn"><div>با فعال‌سازی، نسخهٔ فعلی بایگانی می‌شود و درخواست‌های جدید (و درخواست‌هایی که ارزیابی‌شان هنوز تکمیل نشده) با این نسخه بررسی می‌شوند. درخواست‌های در انتظار تصویب با مسیر و نسخهٔ قبلی ادامه می‌دهند.</div></div>
        {issueList.filter((i) => i.level === 'warn').map((i, k) => <div key={k} className="im-helper">هشدار: {i.message}</div>)}</Dialog>}
    </div>
  )
}

function Simulator({ engine }: { engine: EngineRuleSet }) {
  const [type, setType] = useState<ChangeType>('additional_work')
  const [cost, setCost] = useState(8)
  const [days, setDays] = useState(0)
  const [prev, setPrev] = useState(0)
  const [prevDays, setPrevDays] = useState(0)
  const [unit, setUnit] = useState('')
  const BASE = 100_000_000_000, DUR = 500
  const req = { masterProjectId: 'sim', changeType: type, proposedCost: BASE * cost / 100, proposedDays: days, orgUnit: unit }
  const basis = computeBasis(req, { baseAmount: BASE, baseSource: 'manual', durationDays: DUR, durationSource: 'manual', cumPrevAmount: BASE * prev / 100, cumPrevDays: prevDays })
  const res = resolveRoute(req, engine, basis, new Date().toISOString().slice(0, 10))
  return (
    <div className="im-card" style={{ display: 'grid', gap: 10 }}>
      <div className="im-helper">با مبنای فرضی (مبلغ اولیه ۱۰۰ واحد، مدت ۵۰۰ روز) مسیر را با همین نسخهٔ قواعد بیازمایید؛ چیزی ثبت نمی‌شود.</div>
      <div className="im-row">
        <Field label="نوع تغییر"><select value={type} onChange={(e) => setType(e.target.value as ChangeType)}>{TYPE_ORDER.map((t) => <option key={t} value={t}>{TYPE_FA[t]}</option>)}</select></Field>
        <Field label="هزینهٔ این تغییر (٪ مبلغ اولیه)"><input type="number" dir="ltr" value={cost} onChange={(e) => setCost(Number(e.target.value) || 0)} /></Field>
        <Field label="تمدید این تغییر (روز)"><input type="number" dir="ltr" value={days} onChange={(e) => setDays(Number(e.target.value) || 0)} /></Field>
      </div>
      <div className="im-row">
        <Field label="تغییرات مصوب قبلی (٪)"><input type="number" dir="ltr" value={prev} onChange={(e) => setPrev(Number(e.target.value) || 0)} /></Field>
        <Field label="تمدیدهای مصوب قبلی (روز)"><input type="number" dir="ltr" value={prevDays} onChange={(e) => setPrevDays(Number(e.target.value) || 0)} /></Field>
        <Field label="واحد سازمانی (اختیاری)"><input value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
      </div>
      <ResolutionPanel res={res} thresholds={[...new Set(engine.rules.filter((r) => r.dimension === 'cost' && r.active).flatMap((r) => [r.pctMin, r.pctMax]).filter((x): x is number => x != null))]} />
      <div className="im-helper">درصد جاری {nf(res.basis.current_pct)}٪ — درصد تجمعی {nf(res.basis.cum_pct)}٪ — تمدید تجمعی {nf(res.basis.cum_days)} روز.</div>
    </div>
  )
}

function Limits({ b, canManage, roles, onChange }: { b: RuleBundle; canManage: boolean; roles: string[]; onChange: (r: { ok: boolean; error?: string }) => Promise<void> }) {
  const st = useChangeStore()
  const [f, setF] = useState({ role: '', pct: '', amount: '', days: '' })
  const num = (v: string) => (v.trim() === '' ? null : Number(v))
  return (
    <div className="im-card" style={{ display: 'grid', gap: 10 }}>
      <div className="im-helper">سقف اختیار شخصی هر نقش: اگر تغییر (به‌صورت تجمعی) از سقف بیشتر باشد، دارندهٔ آن نقش نمی‌تواند «تصویب» کند و باید عودت دهد یا مرجع بالاتر تصمیم بگیرد. مراحل «نظر» محدود نمی‌شوند.</div>
      <div className="im-table-wrap"><table className="im-table"><thead><tr><th>نقش</th><th>سقف درصد تجمعی</th><th>سقف مبلغ تجمعی</th><th>سقف تمدید تجمعی</th><th>فعال</th>{canManage && <th />}</tr></thead><tbody>
        {b.limits.map((l) => <tr key={l.id}><td>{l.roleName}</td><td className="cm-mono">{l.maxCostPct ?? '—'}</td><td className="cm-mono">{l.maxCostAmount == null ? '—' : nf(l.maxCostAmount)}</td><td className="cm-mono">{l.maxDays ?? '—'}</td><td>{l.active ? 'بله' : 'خیر'}</td>
          {canManage && <td><button className="im-btn im-btn-ghost" aria-label="حذف" onClick={async () => onChange(await st.deleteRow('cm_authority_limits', l.id))}><Trash2 size={13} /></button></td>}</tr>)}
        {b.limits.length === 0 && <tr><td colSpan={6} className="im-helper">سقفی تعریف نشده؛ نقش‌ها محدودیت شخصی ندارند.</td></tr>}
      </tbody></table></div>
      {canManage && (
        <div className="im-row" style={{ alignItems: 'flex-end' }}>
          <Field label="نقش"><input list="cm-roles-g" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} /></Field>
          <Field label="سقف ٪"><input dir="ltr" value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} /></Field>
          <Field label="سقف مبلغ"><input dir="ltr" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="سقف روز"><input dir="ltr" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} /></Field>
          <button className="im-btn im-btn-primary" style={{ marginBottom: 12 }} disabled={!f.role.trim() || !roles.includes(f.role.trim())} onClick={async () => { await onChange(await st.insertRow('cm_authority_limits', { role_name: f.role.trim(), max_cost_pct: num(f.pct), max_cost_amount: num(f.amount), max_days: num(f.days) })); setF({ role: '', pct: '', amount: '', days: '' }) }}>افزودن</button>
        </div>
      )}
    </div>
  )
}
