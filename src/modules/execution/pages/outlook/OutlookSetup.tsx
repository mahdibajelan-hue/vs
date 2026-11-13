import { useMemo, useState, type CSSProperties } from 'react'
import { CheckCheck, CloudSunRain, Link2, Lock, Tractor, Users } from 'lucide-react'
import type { OutlookCtx } from '../../lib/useOutlook'
import type { CrewSection } from '../../lib/outlookData'
import { CLIMATE_FA, type ClimateKey } from '../../lib/engine/outlook'
import { isCivilSection } from '../../lib/engine/civil'
import { fa } from '../../components/common'
import { OlCard, OlHead } from '../../components/outlook/olUi'

type Filter = 'all' | 'suggested' | 'none' | 'set'
const FILTERS: { id: Filter; label: string }[] = [{ id: 'all', label: 'همه' }, { id: 'suggested', label: 'پیشنهادی (تأییدنشده)' }, { id: 'none', label: 'بدون اکیپ' }, { id: 'set', label: 'تعیین‌شده' }]

/** تعاریف و تنظیمات — what the forecast needs from people: crews, the link of every activity to its crew, climate, civil sections. Saved in the project settings, for every user. */
export function OutlookSetup({ ctx }: { ctx: OutlookCtx }) {
  const { m, canCfg, save, climate, inputs, machines, civilSections } = ctx
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async (patch: Parameters<typeof save>[0]) => { setBusy(true); try { await save(patch) } finally { setBusy(false) } }
  const openActs = useMemo(() => inputs.activities.filter((a) => a.baseQty - a.doneQty > 0), [inputs.activities])
  const rows = openActs.filter((a) => (filter === 'all' || inputs.crewSource[a.id] === filter) && (!q.trim() || a.title.includes(q.trim())))
  const count = (f: Filter) => (f === 'all' ? openActs.length : openActs.filter((a) => inputs.crewSource[a.id] === f).length)
  const suggestedShown = rows.filter((a) => inputs.crewSource[a.id] === 'suggested')
  const machineSections = useMemo(() => [...new Set([...machines.values()].flatMap((dm) => [...dm.keys()]))].sort((a, b) => a.localeCompare(b, 'fa')), [machines])
  const crewUse = (name: string) => inputs.activities.filter((a) => a.crew === name).length

  return (
    <div className="olx-grid">
      {!canCfg && <p className="olx-note"><Lock size={15} aria-hidden /> این تعاریف را مدیر یا تنظیم‌کنندهٔ ماژول اجرا تغییر می‌دهد؛ شما وضعیت فعلی را می‌بینید.</p>}

      <div className="olx-two">
        <OlCard i={0}>
          <OlHead icon={CloudSunRain} color="#22c55e" title="اقلیم و ساعت کار" hint="برای همهٔ کاربران پروژه ذخیره می‌شود." />
          <div className="olx-fields">
            <label className="olx-field"><span>اقلیم محل پروژه</span>
              <select className="im-select" value={climate} disabled={!canCfg || busy} onChange={(e) => void run({ climate: e.target.value })}>{(Object.keys(CLIMATE_FA) as ClimateKey[]).map((k) => <option key={k} value={k}>{CLIMATE_FA[k]}</option>)}</select>
              <small>{m.settings.climate ? 'ذخیره‌شده در تنظیمات پروژه' : 'هنوز تعیین نشده؛ پیش‌فرض به کار می‌رود'}</small></label>
            <label className="olx-field"><span>ساعت کار روزانهٔ ماشین‌آلات</span>
              <input type="number" min={1} max={24} step={0.5} className="im-input" disabled={!canCfg || busy} defaultValue={m.settings.workdayHours ?? 8} onBlur={(e) => { const v = +e.target.value; if (v > 0 && v <= 24 && v !== (m.settings.workdayHours ?? 8)) void run({ workdayHours: v }) }} />
              <small>برای ماشینی که ساعت کارش در گزارش ثبت نشده و ساعت کار مفید روز هم نیامده</small></label>
          </div>
        </OlCard>

        <OlCard i={1}>
          <OlHead icon={Tractor} color="#a16207" title="بخش‌های ماشین‌آلات سیویل" hint="بخش‌هایی که بهره‌وری‌شان بر حسب کارکرد در هر ساعت ماشین سنجیده می‌شود (مسیرسازی، حفاری کانال، خاکریزی)." />
          {machineSections.length ? (
            <div className="olx-checks">
              {machineSections.map((s) => { const on = civilSections.includes(s); return (
                <label key={s} className={`olx-check${on ? ' is-on' : ''}`}>
                  <input type="checkbox" checked={on} disabled={!canCfg || busy} onChange={() => void run({ civilSections: on ? civilSections.filter((x) => x !== s) : [...civilSections, s] })} />
                  <span>{s}{isCivilSection(s) && <small>تشخیص خودکار</small>}</span>
                </label>
              ) })}
            </div>
          ) : <p className="im-helper">در گزارش‌ها ماشینی ثبت نشده است.</p>}
          {!m.settings.civilSections?.length && civilSections.length > 0 && <p className="im-helper" style={{ marginTop: 8 }}>فعلاً از روی نام بخش‌ها تشخیص داده شده؛ با یک انتخاب، فهرست در تنظیمات ذخیره می‌شود.</p>}
        </OlCard>
      </div>

      <OlCard i={2}>
        <OlHead icon={Users} color="#f97316" title="ترکیب اکیپ‌ها" hint="یک اکیپ کامل از هر قلم ماشین و نفر چند واحد دارد. تعداد اکیپ کامل هر روز = کمینهٔ (فعال ÷ تعداد در اکیپ)؛ ماشین یا نفر اضافه تا اکیپ کامل نشود اثری ندارد." />
        <div className="olx-sections">
          {inputs.sections.map((s, k) => (
            <div key={s.name} className={`olx-sec${s.support ? ' is-support' : ''}`} style={{ '--i': k } as CSSProperties}>
              <div className="olx-sec-h">
                <b>{s.name}</b>
                <span className={`olx-pill ${s.composition ? 'is-good' : 'is-warn'}`}>{s.composition ? 'ترکیب تعریف شده' : s.support ? 'ستادی' : 'تعریف نشده'}</span>
                <small>{fa(crewUse(s.name))} فعالیت</small>
              </div>
              <p className="olx-sec-comp">{s.composition ? Object.entries(s.composition).map(([k2, v]) => `${fa(v)} ${k2}`).join(' + ') : 'کل نیرو و ماشین این بخش یک اکیپ فرض می‌شود.'}</p>
              {canCfg && !s.support && <button type="button" className="olx-btn" onClick={() => setOpen(open === s.name ? null : s.name)}>{open === s.name ? 'بستن' : s.composition ? 'ویرایش ترکیب' : 'تعریف ترکیب اکیپ'}</button>}
              {open === s.name && <CrewEditor sec={s} busy={busy} onSave={(v) => { void run({ crewComposition: { ...(m.settings.crewComposition ?? {}), [s.name]: v } }); setOpen(null) }} />}
            </div>
          ))}
        </div>
      </OlCard>

      <OlCard i={3}>
        <OlHead icon={Link2} color="#eab308" title="اکیپ هر فعالیت" hint="پیشنهاد اولیه از کلمات عنوان و فصل فهرست‌بهاست. پیشنهادهای درست را یک‌جا تأیید و نادرست‌ها را اصلاح کنید؛ ردیف‌های اضافه‌بها اکیپ ردیف اصلی را می‌گیرند."
          action={canCfg && suggestedShown.length > 0 ? <button type="button" className="olx-btn is-primary" disabled={busy} onClick={() => void run({ activityCrew: { ...(m.settings.activityCrew ?? {}), ...Object.fromEntries(suggestedShown.map((a) => [a.id, a.crew ?? ''])) } })}><CheckCheck size={15} aria-hidden /> تأیید {fa(suggestedShown.length)} پیشنهاد نمایش‌داده</button> : undefined} />
        <div className="olx-filterbar">
          <div className="olx-seg" role="tablist" aria-label="فیلتر فعالیت‌ها">{FILTERS.map((f) => <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}>{f.label} <i>{fa(count(f.id))}</i></button>)}</div>
          <input className="im-input olx-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجوی فعالیت…" aria-label="جست‌وجوی فعالیت" />
        </div>
        <div className="olx-links">
          {rows.slice(0, 300).map((a) => {
            const src = inputs.crewSource[a.id]
            return (
              <div key={a.id} className={`olx-link-row is-${src}`}>
                <span className="olx-link-t"><b>{a.title}</b><small>{a.group || 'کل پروژه'} · باقیمانده {fa(a.baseQty - a.doneQty, 1)} {a.unit}</small></span>
                {canCfg ? (
                  <select className="im-select" value={a.crew ?? ''} disabled={busy} onChange={(e) => void run({ activityCrew: { ...(m.settings.activityCrew ?? {}), [a.id]: e.target.value } })} aria-label={`اکیپ ${a.title}`}>
                    <option value="">— بدون اکیپ —</option>
                    {inputs.sections.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                  </select>
                ) : <span className="olx-crewtag">{a.crew ?? 'بدون اکیپ'}</span>}
                <span className={`olx-pill ${src === 'set' ? 'is-good' : src === 'suggested' ? 'is-warn' : ''}`}>{src === 'set' ? 'تعیین‌شده' : src === 'suggested' ? 'پیشنهادی' : 'بدون اکیپ'}</span>
              </div>
            )
          })}
          {rows.length > 300 && <p className="im-helper">{fa(rows.length - 300)} ردیف دیگر — با جست‌وجو محدود کنید.</p>}
          {!rows.length && <p className="im-helper">ردیفی با این فیلتر نیست.</p>}
        </div>
      </OlCard>
    </div>
  )
}

/** Units of each resource of a work section in ONE complete crew; 0 = not part of the crew. */
function CrewEditor({ sec, busy, onSave }: { sec: CrewSection; busy: boolean; onSave: (v: Record<string, number>) => void }) {
  const [v, setV] = useState<Record<string, number>>(() => sec.composition ?? {})
  return (
    <div className="ex-ol-comp">
      <p className="im-helper" style={{ margin: 0 }}>برای هر قلم بنویسید یک اکیپ کامل چند واحد از آن دارد (۰ = جزو اکیپ نیست). «معمول روزانه» میانهٔ تعداد فعال در گزارش‌هاست؛ اگر معمولاً ۴ سایدبوم و ۸ جوشکار فعال است و هر اکیپ ۱ سایدبوم و ۲ جوشکار دارد، کارگاه ۴ اکیپ دارد.</p>
      <div className="ex-ol-comp-grid">
        {sec.items.map((it) => (
          <label key={it.name}><span>{it.name}<small>{it.kind === 'equip' ? 'ماشین' : 'نفر'} · معمول روزانه {fa(it.usual, 1)}</small></span>
            <input type="number" min={0} step={1} className="im-input" value={v[it.name] ?? 0} onChange={(e) => setV((x) => ({ ...x, [it.name]: Math.max(0, Math.round(+e.target.value || 0)) }))} aria-label={`تعداد ${it.name} در یک اکیپ`} />
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="olx-btn is-primary" disabled={busy} onClick={() => onSave(Object.fromEntries(Object.entries(v).filter(([, n]) => n > 0)))}>ذخیره در تنظیمات پروژه</button>
        <button type="button" className="olx-btn" disabled={busy} onClick={() => onSave({})}>حذف ترکیب (کل بخش = یک اکیپ)</button>
      </div>
    </div>
  )
}
