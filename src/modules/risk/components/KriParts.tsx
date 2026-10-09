import { useMemo, useState } from 'react'
import { Activity, Pencil, Trash2 } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { useRiskStore } from '../store/useRiskStore'
import { useRiskDirectory } from '../lib/useRiskData'
import { kriInsight, validateKri } from '../lib/riskKri'
import { dayDiff } from '../lib/riskState'
import { todayIso } from '../lib/riskScore'
import { RM_KRI_DOMAINS, RM_KRI_STATE_COLOR, RM_KRI_STATE_LABEL_FA, type RmKri } from '../types'
import { Field, PersonSelect, Sparkline } from './rk'
import { useRiskPeopleStore } from '../store/useRiskPeopleStore'

/** One early-warning indicator: value, band (normal / warning / critical), trend, early-warning message and a one-line manual reading. */
export function KriCard({ kri, canEdit, onEdit }: { kri: RmKri; canEdit: boolean; onEdit?: (k: RmKri) => void }) {
  const readings = useRiskStore((s) => s.kriReadings)
  const events = useRiskStore((s) => s.kriEvents)
  const risks = useRiskStore((s) => s.risks)
  const record = useRiskStore((s) => s.recordReading)
  const del = useRiskStore((s) => s.deleteKri)
  const dir = useRiskDirectory()
  const [val, setVal] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [showEv, setShowEv] = useState(false)
  const mine = useMemo(() => readings.filter((r) => r.kriId === kri.id).sort((a, b) => (a.readAt < b.readAt ? -1 : 1)), [readings, kri.id])
  const myEv = events.filter((e) => e.kriId === kri.id).slice(0, 8)
  const ins = useMemo(() => kriInsight(kri, mine), [kri, mine])
  const color = RM_KRI_STATE_COLOR[kri.state]
  const lo = Math.min(kri.warnThreshold, kri.criticalThreshold, kri.currentValue ?? Infinity, kri.baseline ?? Infinity)
  const hi = Math.max(kri.warnThreshold, kri.criticalThreshold, kri.currentValue ?? -Infinity, kri.baseline ?? -Infinity)
  const span = hi - lo || 1
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - lo) / span) * 100))
  const w = kri.direction === 'higher_worse' ? pos(kri.warnThreshold) : pos(kri.criticalThreshold)
  const c2 = kri.direction === 'higher_worse' ? pos(kri.criticalThreshold) : pos(kri.warnThreshold)
  const risk = risks.find((r) => r.id === kri.riskId)
  const submit = async () => {
    setErr('')
    const n = Number(val.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))))
    if (val.trim() === '' || !Number.isFinite(n)) { setErr('مقدار عددی وارد کنید'); return }
    setBusy(true)
    const r = await record(kri.id, n, note.trim())
    setBusy(false)
    if (!r.ok) { setErr(r.error ?? ''); return }
    setVal(''); setNote('')
  }
  return (
    <div className="rk-kri" style={{ ['--c' as string]: color }}>
      <div className="rk-kri-head">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 13.5 }}>{kri.name}</div>
          <div className="im-helper">{RM_KRI_DOMAINS.find((d) => d.key === kri.domain)?.label ?? kri.domain}{risk ? ` · ${risk.code}` : ''} · هر {kri.frequencyDays} روز{kri.ownerId ? ` · ${dir.name(kri.ownerId)}` : ''}</div>
        </div>
        <span className="rk-flag" style={{ ['--c' as string]: color }}>{RM_KRI_STATE_LABEL_FA[kri.state]}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <div className="rk-kri-val">{kri.currentValue ?? '—'}<small>{kri.unit}</small></div>
        <div style={{ flex: 1, maxWidth: 170 }}><Sparkline values={mine.slice(-14).map((r) => r.value)} color={color} height={38} thresholds={[kri.warnThreshold, kri.criticalThreshold]} /></div>
      </div>
      <div className="rk-band" style={{ ['--w' as string]: `${w}%`, ['--c2' as string]: `${c2}%`, direction: kri.direction === 'higher_worse' ? 'ltr' : 'rtl' }} aria-hidden>
        {kri.currentValue !== null && <i style={{ [kri.direction === 'higher_worse' ? 'left' : 'right']: `${pos(kri.currentValue)}%` }} />}
      </div>
      <div className="im-helper">هشدار {kri.direction === 'higher_worse' ? '≥' : '≤'} {kri.warnThreshold} · بحرانی {kri.direction === 'higher_worse' ? '≥' : '≤'} {kri.criticalThreshold}{kri.baseline !== null ? ` · پایه ${kri.baseline}` : ''}</div>
      {ins.message && <div className="rk-flag" style={{ ['--c' as string]: ins.exposureRising || kri.state !== 'normal' ? '#f59e0b' : '#94a3b8', width: 'fit-content' }}><Activity size={11} aria-hidden />{ins.message}</div>}
      <div className="im-helper">{kri.lastReadingAt ? `آخرین قرائت ${formatJalali(kri.lastReadingAt.slice(0, 10))} (${dayDiff(kri.lastReadingAt.slice(0, 10), todayIso())} روز پیش)` : 'هنوز قرائتی ثبت نشده'}{kri.dataSource === 'external' ? ' · منبع: سامانهٔ خارجی' : ''}</div>
      {canEdit && kri.active && (
        <div style={{ display: 'grid', gap: 6 }}>
          <div className="im-actions" style={{ flexWrap: 'nowrap' }}>
            <input inputMode="decimal" dir="ltr" style={{ width: 96, textAlign: 'right' }} placeholder="مقدار جدید" value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} aria-label={`مقدار جدید ${kri.name}`} />
            <input style={{ flex: 1 }} placeholder="یادداشت (اختیاری)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="im-btn im-btn-primary im-btn-sm" disabled={busy} onClick={submit}>ثبت</button>
          </div>
          {err && <div className="im-err">{err}</div>}
        </div>
      )}
      <div className="im-actions">
        {myEv.length > 0 && <button className="im-ghostlink" onClick={() => setShowEv((v) => !v)}>{showEv ? 'پنهان' : `سابقهٔ عبور از آستانه (${myEv.length})`}</button>}
        {canEdit && onEdit && <button className="im-ghostlink" onClick={() => onEdit(kri)}><Pencil size={11} /> ویرایش</button>}
        {canEdit && <button className="im-ghostlink" style={{ color: 'var(--im-coral)' }} onClick={() => { if (window.confirm(`شاخص «${kri.name}» و قرائت‌هایش حذف شود؟`)) del(kri.id) }}><Trash2 size={11} /> حذف</button>}
      </div>
      {showEv && <div className="rk-timeline">{myEv.map((e) => <div key={e.id} className="rk-tl" style={{ ['--c' as string]: RM_KRI_STATE_COLOR[e.toState] }}><b>{RM_KRI_STATE_LABEL_FA[e.fromState]} ← {RM_KRI_STATE_LABEL_FA[e.toState]}</b> · مقدار {e.value ?? '—'} <time>{formatJalali(e.at.slice(0, 10))}</time></div>)}</div>}
    </div>
  )
}

export function KriFormModal({ projectId, riskId, kri, onClose }: { projectId: string; riskId?: string | null; kri?: RmKri; onClose: () => void }) {
  const add = useRiskStore((s) => s.addKri)
  const update = useRiskStore((s) => s.updateKri)
  const risks = useRiskStore((s) => s.risks)
  const people = useRiskPeopleStore((s) => s.byProject[projectId]) ?? useRiskPeopleStore.getState().all
  const [f, setF] = useState({
    name: kri?.name ?? '', definition: kri?.definition ?? '', unit: kri?.unit ?? '', domain: kri?.domain ?? 'general', direction: kri?.direction ?? ('higher_worse' as RmKri['direction']), baseline: kri?.baseline ?? null as number | null,
    warn: kri ? String(kri.warnThreshold) : '', crit: kri ? String(kri.criticalThreshold) : '', frequencyDays: kri?.frequencyDays ?? 7, ownerId: kri?.ownerId ?? null as string | null,
    dataSource: kri?.dataSource ?? ('manual' as RmKri['dataSource']), externalSystem: kri?.externalSystem ?? '', externalKey: kri?.externalKey ?? '', riskId: kri?.riskId ?? riskId ?? null as string | null,
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((o) => ({ ...o, [k]: v }))
  const submit = async () => {
    const w = Number(f.warn), c = Number(f.crit)
    const v = validateKri({ name: f.name, direction: f.direction, warnThreshold: w, criticalThreshold: c, frequencyDays: f.frequencyDays })
    if (v) { setErr(v); return }
    setBusy(true)
    const payload = { projectId, riskId: f.riskId, name: f.name.trim(), definition: f.definition, unit: f.unit, domain: f.domain, direction: f.direction, baseline: f.baseline, warnThreshold: w, criticalThreshold: c, frequencyDays: f.frequencyDays, ownerId: f.ownerId, dataSource: f.dataSource, externalSystem: f.dataSource === 'external' ? f.externalSystem || null : null, externalKey: f.dataSource === 'external' ? f.externalKey || null : null, active: kri?.active ?? true }
    const r = kri ? await update(kri.id, payload) : await add(payload)
    setBusy(false)
    if (!r.ok) { setErr(r.error ?? ''); return }
    onClose()
  }
  return (
    <div className="im-overlay">
      <div className="im-modal" style={{ maxWidth: 640 }} role="dialog" aria-modal="true" aria-label="شاخص هشدار">
        <div className="im-modal-head"><div className="im-modal-title">{kri ? 'ویرایش شاخص هشدار' : 'شاخص هشدار زودهنگام (KRI) جدید'}</div><button className="im-modal-close" onClick={onClose} aria-label="بستن">✕</button></div>
        {err && <div className="im-notice bad" role="alert" style={{ marginBottom: 10 }}>{err}</div>}
        <Field label="نام شاخص *"><input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="مثلاً: روز تأخیر تحویل لوله نسبت به برنامه" autoFocus /></Field>
        <Field label="تعریف و روش اندازه‌گیری"><textarea style={{ minHeight: 48 }} value={f.definition} onChange={(e) => set('definition', e.target.value)} /></Field>
        <div className="rk-grid3">
          <Field label="واحد"><input value={f.unit} onChange={(e) => set('unit', e.target.value)} placeholder="روز، ٪، تن…" /></Field>
          <Field label="حوزه"><select value={f.domain} onChange={(e) => set('domain', e.target.value)}>{RM_KRI_DOMAINS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</select></Field>
          <Field label="جهت"><select value={f.direction} onChange={(e) => set('direction', e.target.value as RmKri['direction'])}><option value="higher_worse">بزرگ‌تر = بدتر</option><option value="lower_worse">کوچک‌تر = بدتر</option></select></Field>
          <Field label="مقدار پایه"><input type="number" value={f.baseline ?? ''} onChange={(e) => set('baseline', e.target.value === '' ? null : Number(e.target.value))} /></Field>
          <Field label="آستانهٔ هشدار *"><input type="number" value={f.warn} onChange={(e) => setF((o) => ({ ...o, warn: e.target.value }))} /></Field>
          <Field label="آستانهٔ بحرانی *"><input type="number" value={f.crit} onChange={(e) => setF((o) => ({ ...o, crit: e.target.value }))} /></Field>
          <Field label="تناوب پایش (روز)"><input type="number" min={1} max={365} value={f.frequencyDays} onChange={(e) => set('frequencyDays', Number(e.target.value))} /></Field>
          <Field label="مسئول پایش"><PersonSelect value={f.ownerId} onChange={(v) => set('ownerId', v)} people={people.map((p) => ({ userId: p.userId, name: p.name }))} /></Field>
          <Field label="ریسک مرتبط"><select value={f.riskId ?? ''} onChange={(e) => set('riskId', e.target.value || null)}><option value="">— شاخص عمومی پروژه —</option>{risks.filter((r) => r.projectId === projectId && r.status !== 'closed').map((r) => <option key={r.id} value={r.id}>{r.code} · {r.title.slice(0, 40)}</option>)}</select></Field>
        </div>
        <div className="rk-grid3">
          <Field label="منبع داده"><select value={f.dataSource} onChange={(e) => set('dataSource', e.target.value as RmKri['dataSource'])}><option value="manual">ثبت دستی</option><option value="external">سامانهٔ خارجی</option></select></Field>
          {f.dataSource === 'external' && <><Field label="سامانهٔ مبدأ"><input value={f.externalSystem} onChange={(e) => set('externalSystem', e.target.value)} placeholder="planning, procurement…" /></Field><Field label="کلید شاخص در مبدأ"><input dir="ltr" value={f.externalKey} onChange={(e) => set('externalKey', e.target.value)} /></Field></>}
        </div>
        {f.dataSource === 'external' && <div className="im-notice info">دریافت خودکار مقدار نیازمند اتصال سامانهٔ مبدأ است؛ تا آن زمان مقدار را می‌توان دستی ثبت کرد. مقدارهای رسیده از API با شناسهٔ یکتا تکراری ثبت نمی‌شوند.</div>}
        <div className="im-actions" style={{ marginTop: 12 }}>
          <button className="im-btn im-btn-primary im-btn-lg" style={{ flex: 1 }} disabled={busy} onClick={submit}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</button>
          <button className="im-btn im-btn-ghost im-btn-lg" onClick={onClose}>بستن</button>
        </div>
      </div>
    </div>
  )
}
