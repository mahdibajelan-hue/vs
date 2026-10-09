import { useState } from 'react'
import { FlaskConical, Trash2 } from 'lucide-react'
import { formatJalali } from '../../../../lib/jalali'
import { JalaliDateField } from '../../../issues/components/JalaliDateField'
import { useRiskStore } from '../../store/useRiskStore'
import { useRiskDirectory } from '../../lib/useRiskData'
import { useRiskPeopleStore } from '../../store/useRiskPeopleStore'
import { todayIso } from '../../lib/riskScore'
import { addDays } from '../../lib/riskState'
import { RM_CONTROL_EFFECT_LABEL_FA, RM_CONTROL_STATUS_LABEL_FA, RM_CONTROL_TYPE_LABEL_FA, type RmControl } from '../../types'
import { Field, PersonSelect } from '../rk'
import type { TabProps } from './common'

const EFF_COLOR = { not_tested: '#94a3b8', effective: '#22c55e', partial: '#eab308', ineffective: '#ef4444' } as const

/** Existing controls and how well they actually work. A critical control that is expired, untested for too long or ineffective is flagged. */
export function ControlsTab({ risk, canEdit }: TabProps) {
  const controls = useRiskStore((s) => s.controls).filter((c) => c.riskId === risk.id)
  const add = useRiskStore((s) => s.addControl)
  const update = useRiskStore((s) => s.updateControl)
  const remove = useRiskStore((s) => s.deleteControl)
  const people = useRiskPeopleStore((s) => s.byProject[risk.projectId]) ?? []
  const dir = useRiskDirectory()
  const today = todayIso()
  const [open, setOpen] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [f, setF] = useState({ name: '', description: '', controlType: 'preventive' as RmControl['controlType'], ownerId: null as string | null, isCritical: false, testIntervalDays: '' as string, expiresOn: null as string | null })
  const [t, setT] = useState({ date: today, effectiveness: 'effective' as RmControl['effectiveness'], note: '' })
  const [err, setErr] = useState('')

  const problem = (c: RmControl): string | null => {
    if (!c.isCritical) return null
    if (c.status === 'expired' || (c.expiresOn && c.expiresOn < today)) return 'منقضی‌شده'
    if (c.effectiveness === 'ineffective') return 'بی‌اثر'
    if (c.testIntervalDays && addDays(c.lastTestedAt ?? risk.identifiedDate, c.testIntervalDays) < today) return 'آزمون دوره‌ای عقب‌افتاده'
    return null
  }
  const submit = async () => {
    if (f.name.trim().length < 3) { setErr('نام کنترل را بنویسید'); return }
    const r = await add(risk.id, { name: f.name.trim(), description: f.description, controlType: f.controlType, ownerId: f.ownerId, isCritical: f.isCritical, testIntervalDays: f.testIntervalDays ? Number(f.testIntervalDays) : null, expiresOn: f.expiresOn })
    if (!r.ok) { setErr(r.error ?? ''); return }
    setErr(''); setOpen(false); setF({ name: '', description: '', controlType: 'preventive', ownerId: null, isCritical: false, testIntervalDays: '', expiresOn: null })
  }
  const saveTest = async (c: RmControl) => {
    if (t.effectiveness !== 'effective' && t.note.trim().length < 3) { setErr('برای نتیجهٔ «نسبی/بی‌اثر» علت را بنویسید'); return }
    const r = await update(c.id, { lastTestedAt: t.date, effectiveness: t.effectiveness, evidenceNote: t.note.trim() || c.evidenceNote })
    if (!r.ok) { setErr(r.error ?? ''); return }
    setErr(''); setTesting(null)
  }

  return (
    <div>
      <div className="im-actions" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="im-helper">کنترل = اقدام/سازوکاری که هم‌اکنون ریسک را کاهش می‌دهد (با اقدام کاهشی آینده فرق دارد).</span>
        {canEdit && <button className="im-btn im-btn-primary im-btn-sm" onClick={() => setOpen((v) => !v)}>{open ? 'بستن فرم' : 'کنترل جدید'}</button>}
      </div>
      {open && (
        <div className="im-card-flat" style={{ marginBottom: 14 }}>
          <div className="rk-grid3">
            <Field label="نام کنترل *"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="نوع"><select value={f.controlType} onChange={(e) => setF({ ...f, controlType: e.target.value as RmControl['controlType'] })}>{Object.entries(RM_CONTROL_TYPE_LABEL_FA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="مسئول"><PersonSelect value={f.ownerId} onChange={(v) => setF({ ...f, ownerId: v })} people={people.map((p) => ({ userId: p.userId, name: p.name }))} /></Field>
            <Field label="فاصلهٔ آزمون (روز)"><input type="number" min={1} value={f.testIntervalDays} onChange={(e) => setF({ ...f, testIntervalDays: e.target.value })} /></Field>
            <Field label="تاریخ انقضا"><div style={{ display: 'flex', gap: 6 }}><div style={{ flex: 1 }}><JalaliDateField value={f.expiresOn ?? addDays(today, 365)} onChange={(v) => setF({ ...f, expiresOn: v })} /></div>{f.expiresOn && <button className="im-ghostlink" onClick={() => setF({ ...f, expiresOn: null })}>حذف</button>}</div></Field>
            <label className="im-chip" style={{ cursor: 'pointer', alignSelf: 'end', margin: 0, padding: '9px 12px' }}><input type="checkbox" style={{ width: 'auto', marginInlineEnd: 6 }} checked={f.isCritical} onChange={(e) => setF({ ...f, isCritical: e.target.checked })} /> کنترل حیاتی</label>
          </div>
          <Field label="توضیح"><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          {err && <div className="im-err">{err}</div>}
          <button className="im-btn im-btn-primary im-btn-sm" onClick={submit}>ثبت کنترل</button>
        </div>
      )}
      {controls.length === 0 ? <div className="im-empty">کنترلی ثبت نشده است. بدون کنترل ثبت‌شده، ریسک باقیمانده نمی‌تواند به‌طور مستند از ریسک فعلی کمتر باشد.</div> : (
        <div className="im-grid" style={{ gap: 10 }}>
          {controls.map((c) => {
            const p = problem(c)
            return (
              <div key={c.id} className="im-task" style={{ borderInlineStart: `4px solid ${EFF_COLOR[c.effectiveness]}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div><b>{c.name}</b> {c.isCritical && <span className="rk-flag" style={{ ['--c' as string]: '#ef4444' }}>حیاتی</span>}{p && <span className="rk-flag" style={{ ['--c' as string]: '#f59e0b' }}>{p}</span>}
                    <div className="im-helper">{RM_CONTROL_TYPE_LABEL_FA[c.controlType]} · {RM_CONTROL_STATUS_LABEL_FA[c.status]} · {c.ownerId ? dir.name(c.ownerId) : 'بدون مسئول'}{c.testIntervalDays ? ` · آزمون هر ${c.testIntervalDays} روز` : ''}{c.expiresOn ? ` · انقضا ${formatJalali(c.expiresOn)}` : ''}</div></div>
                  <span className="rk-flag" style={{ ['--c' as string]: EFF_COLOR[c.effectiveness] }}>{RM_CONTROL_EFFECT_LABEL_FA[c.effectiveness]}{c.lastTestedAt ? ` · ${formatJalali(c.lastTestedAt)}` : ''}</span>
                </div>
                {c.description && <div className="im-helper">{c.description}</div>}
                {c.evidenceNote && <div className="im-helper">شاهد: {c.evidenceNote}</div>}
                {canEdit && (
                  <div className="im-actions" style={{ marginTop: 6 }}>
                    <button className="im-ghostlink" onClick={() => { setTesting(testing === c.id ? null : c.id); setErr('') }}><FlaskConical size={12} /> ثبت آزمون / ارزیابی اثربخشی</button>
                    <button className="im-ghostlink" onClick={() => update(c.id, { status: c.status === 'inactive' ? 'active' : 'inactive' })}>{c.status === 'inactive' ? 'فعال‌سازی' : 'غیرفعال‌سازی'}</button>
                    <button className="im-ghostlink" style={{ color: 'var(--im-coral)' }} onClick={() => { if (window.confirm('این کنترل حذف شود؟')) remove(c.id) }}><Trash2 size={12} /> حذف</button>
                  </div>
                )}
                {testing === c.id && (
                  <div className="im-card-flat" style={{ marginTop: 8 }}>
                    <div className="rk-grid3">
                      <Field label="تاریخ آزمون"><JalaliDateField value={t.date} onChange={(v) => setT({ ...t, date: v })} max={today} /></Field>
                      <Field label="نتیجه"><select value={t.effectiveness} onChange={(e) => setT({ ...t, effectiveness: e.target.value as RmControl['effectiveness'] })}><option value="effective">مؤثر</option><option value="partial">نسبی</option><option value="ineffective">بی‌اثر</option></select></Field>
                      <Field label="شاهد / یادداشت"><input value={t.note} onChange={(e) => setT({ ...t, note: e.target.value })} /></Field>
                    </div>
                    {err && <div className="im-err">{err}</div>}
                    <button className="im-btn im-btn-primary im-btn-sm" onClick={() => saveTest(c)}>ذخیرهٔ نتیجه</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
