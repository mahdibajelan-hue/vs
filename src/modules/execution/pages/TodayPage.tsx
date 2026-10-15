import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useEpcModel } from '../lib/useEpcModel'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { EpcGate } from '../components/epc/EpcBanner'
import { ActivityPicker } from '../components/ActivityPicker'
import { FORMS, FORM_BY_KEY } from '../lib/formCatalog'
import { todayOnSite, type FormState } from '../lib/todayOnSite'
import { jalaliText } from '../lib/periods'
import { Chip, Section } from '../../finance/components/fn'
import { fa } from '../components/common'

const ST: Record<FormState, { t: string; tone: 'bad' | 'warn' | 'neutral' | 'good' }> = { missing: { t: 'ثبت نشده', tone: 'bad' }, draft: { t: 'پیش‌نویس / برگشتی', tone: 'warn' }, submitted: { t: 'ارسال‌شده، در انتظار تأیید', tone: 'neutral' }, approved: { t: 'تأییدشده', tone: 'good' } }

/** «Today on site»: per active activity, the technical forms required by the project and whether each one is in. The required-forms list is the project's own decision (ex_required_forms); with none defined the page says so and shows nothing else. Behind the `flags.today` setting. */
export function TodayPage({ projectId }: { projectId: string }) { return <EpcGate><Inner projectId={projectId} /></EpcGate> }
function Inner({ projectId }: { projectId: string }) {
  const m = useEpcModel(projectId)
  const epc = useEpcStore()
  const can = useExecutionStore((s) => s.can(projectId, '*') || s.can(projectId, 'configure') || s.can(projectId, 'edit_activities'))
  const [day, setDay] = useState(m.today)
  const [add, setAdd] = useState({ act: '', form: '' })
  const e = m.ex
  const req = useMemo(() => epc.requiredForms.filter((r) => r.projectId === projectId), [epc.requiredForms, projectId])
  const items = useMemo(() => {
    const worked = new Set(e.lines.filter((l) => e.reports.some((r) => r.id === l.reportId && r.formKey === 'work' && r.reportDate === day)).map((l) => l.activityId).filter(Boolean) as string[])
    return todayOnSite(e.activities, req, e.reports.filter((r) => r.projectId === projectId), day, worked)
  }, [e.activities, e.lines, e.reports, req, day, projectId])
  const title = (id: string) => e.actById.get(id)?.title ?? '—'
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Section title={`امروز در کارگاه — ${jalaliText(day)}`} hint="فعالیت‌هایی که امروز در بازهٔ برنامه‌ای‌اند یا کارکرد دارند، با فرم‌های فنیِ لازم برای آن‌ها. فقط نمایش است؛ در پیشرفت و صورت‌وضعیت دخالتی ندارد."
        action={<input type="date" value={day} onChange={(x) => setDay(x.target.value || m.today)} aria-label="تاریخ" />}>
        {req.length === 0 ? <p className="im-helper">برای این پروژه هنوز «فرم لازم» هیچ فعالیتی تعریف نشده است؛ از بخش زیر تعریف کنید.</p>
          : items.length === 0 ? <p className="im-helper">امروز فعالیتی با فرم لازم در برنامه یا کارکرد نیست.</p>
          : <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>فعالیت</th><th>فرم لازم</th><th>وضعیت امروز</th></tr></thead><tbody>
            {items.flatMap((it) => it.forms.map((f, i) => <tr key={`${it.activityId}:${f.formKey}`}>{i === 0 && <td rowSpan={it.forms.length}>{it.title}</td>}<td>{FORM_BY_KEY[f.formKey]?.title ?? f.formKey}</td><td><Chip tone={ST[f.state].tone}>{ST[f.state].t}</Chip></td></tr>))}
          </tbody></table></div>}
      </Section>
      <Section title="فرم‌های لازم هر فعالیت" hint="تعریف پروژه است، نه پیش‌فرض سامانه. هر ردیف فقط یک یادآور است و ارسال گزارش را مسدود نمی‌کند.">
        {can && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
          <ActivityPicker activities={e.activities.filter((a) => a.active)} value={add.act} onChange={(v) => setAdd({ ...add, act: v })} title="انتخاب فعالیت" />
          <select value={add.form} onChange={(x) => setAdd({ ...add, form: x.target.value })} aria-label="فرم"><option value="">فرم فنی…</option>{FORMS.map((f) => <option key={f.key} value={f.key}>{f.title}</option>)}</select>
          <button className="im-btn im-btn-primary im-btn-sm" disabled={!add.act || !add.form} onClick={async () => { if (await epc.addRequiredForm(projectId, add.act, add.form)) setAdd({ act: add.act, form: '' }) }}><Plus size={13} /> افزودن</button>
        </div>}
        {req.length === 0 ? <span className="im-helper">موردی تعریف نشده است.</span> : <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {req.map((r) => <span key={r.id} className="im-chip" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>{title(r.activityId)} ← {FORM_BY_KEY[r.formKey]?.title ?? r.formKey}{can && <button aria-label="حذف" className="im-btn im-btn-sm" onClick={() => void epc.removeRequiredForm(r.id)}><X size={12} /></button>}</span>)}
          <span className="im-helper">{fa(req.length)} مورد</span>
        </div>}
      </Section>
    </div>
  )
}
