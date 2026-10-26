import { makeId } from '../../../../lib/id'
import { Plus, Trash2, Users } from 'lucide-react'
import { ActivityPicker } from '../ActivityPicker'
import { DecInput } from '../../../material/components/control/DecInput'
import type { Activity } from '../../types'
import type { CrewLogRow } from '../../epcTypes'

export type CrewDraft = Omit<CrewLogRow, 'id' | 'reportId'> & { key: string }
export const COMPOSITION_SUGGESTIONS = [['sideboom', 'سایدبوم'], ['weld_machine', 'موتور جوش'], ['welder', 'جوشکار'], ['fitter', 'فیتر'], ['grinder', 'سنگ‌زن'], ['helper', 'کمکی'], ['excavator', 'بیل مکانیکی'], ['loader', 'لودر'], ['truck', 'کامیون'], ['operator', 'اپراتور'], ['worker', 'کارگر']] as const
const LIMITS = [['', 'بدون محدودیت ثبت‌شده'], ['inspection', 'ظرفیت بازرسی'], ['material', 'مصالح'], ['front', 'جبهه/زمین'], ['permit', 'مجوز'], ['weather', 'آب‌وهوا'], ['equipment', 'تجهیز'], ['manpower', 'نیرو']] as const
export const newCrew = (): CrewDraft => ({ key: makeId('crew'), activityId: null, crewName: '', composition: {}, usefulHours: 0, idleHours: 0, outputQty: 0, conditions: {}, note: '' })

/** Productivity input: one row per crew per activity — the composition of its resources, useful and idle hours and the output. Feeds the productivity engine once the report is approved. */
export function CrewLogsPanel({ rows, editable, activities, onChange }: { rows: CrewDraft[]; editable: boolean; activities: Activity[]; onChange: (n: CrewDraft[]) => void }) {
  const patch = (key: string, p: Partial<CrewDraft>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...p } : r)))
  const setComp = (key: string, k: string, v: number) => { const r = rows.find((x) => x.key === key); if (!r) return; const c = { ...r.composition }; if (v > 0) c[k] = v; else delete c[k]; patch(key, { composition: c }) }
  return (
    <div className="im-card" style={{ padding: 0 }}>
      <div className="mt-filters no-print" style={{ padding: '10px 14px' }}>
        <b style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Users size={15} /> اکیپ‌ها و بهره‌وری</b>
        <span className="im-helper" style={{ margin: 0 }}>ترکیب منابع هر اکیپ، ساعت مفید/توقف و خروجی؛ فقط گزارش‌های تأییدشده در محاسبهٔ بهره‌وری و پیش‌بینی به‌کار می‌روند.</span>
        {editable && <button className="im-btn im-btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => onChange([...rows, newCrew()])}><Plus size={13} /> اکیپ</button>}
      </div>
      {rows.length === 0 ? <p className="im-helper" style={{ margin: '0 14px 12px' }}>اکیپی ثبت نشده است.</p> : (
        <div style={{ display: 'grid', gap: 10, padding: '0 14px 12px' }}>
          {rows.map((r) => (
            <div key={r.key} className="im-card" style={{ padding: 10, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <ActivityPicker activities={activities} value={r.activityId ?? ''} onChange={(id) => editable && patch(r.key, { activityId: id || null })} allowEmpty emptyLabel="فعالیت…" width={420} />
                <input disabled={!editable} placeholder="نام اکیپ" value={r.crewName} onChange={(e) => patch(r.key, { crewName: e.target.value })} style={{ width: 130 }} dir="auto" aria-label="نام اکیپ" />
                <label className="ex-lab">ساعت مفید<DecInput value={r.usefulHours} onValue={(n) => patch(r.key, { usefulHours: n })} label="ساعت مفید" /></label>
                <label className="ex-lab">ساعت توقف<DecInput value={r.idleHours} onValue={(n) => patch(r.key, { idleHours: n })} label="ساعت توقف" /></label>
                <label className="ex-lab">خروجی<DecInput value={r.outputQty} onValue={(n) => patch(r.key, { outputQty: n })} label="خروجی" /></label>
                <select disabled={!editable} value={String(r.conditions.limit ?? '')} onChange={(e) => patch(r.key, { conditions: { ...r.conditions, limit: e.target.value } })} aria-label="عامل محدودکننده">{LIMITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                {editable && <button className="im-btn im-btn-sm im-btn-danger" aria-label="حذف اکیپ" onClick={() => onChange(rows.filter((x) => x.key !== r.key))}><Trash2 size={13} /></button>}
              </div>
              <div className="ex-chiprow">
                {COMPOSITION_SUGGESTIONS.map(([k, l]) => (
                  <label key={k} className="ex-lab" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>{l}
                    <DecInput value={r.composition[k] ?? 0} onValue={(n) => editable && setComp(r.key, k, n)} label={l} />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
