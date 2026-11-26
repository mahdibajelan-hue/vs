import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { useExecutionStore } from '../store/useExecutionStore'
import { FORM_BY_KEY } from '../lib/formCatalog'
import { DataTable, KpiCard, Section, fmtD, type Col } from '../../finance/components/fn'
import { fa } from '../components/common'
import { fmtClock, fmtDur, median, summarize, timingRow, weekOf, type EntryGroup, type EntryTiming } from '../lib/entryTiming'

const DEVICE_FA: Record<string, string> = { mobile: 'گوشی', tablet: 'تبلت', desktop: 'رایانه' }
const DAYS = [30, 90, 365] as const

/** Entry time of the daily report, measured on real use (056): per person, per form and per device, and the weekly trend. */
export function EntryTimingPage({ projectId }: { projectId: string }) {
  const ex = useExecutionStore()
  const [days, setDays] = useState<(typeof DAYS)[number]>(90)
  const [rows, setRows] = useState<EntryTiming[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let live = true
    setRows(null); setErr('')
    const since = new Date(Date.now() - days * 86_400_000).toISOString()
    void supabase.from('ex_entry_timings').select('*').eq('project_id', projectId).gte('started_at', since).order('started_at', { ascending: false }).limit(5000)
      .then(({ data, error }) => { if (!live) return; if (error) { setErr(error.message); setRows([]) } else setRows((data ?? []).map((x) => timingRow(x as Record<string, unknown>))) })
    return () => { live = false }
  }, [projectId, days])

  const all = rows ?? []
  const whole = useMemo(() => summarize(all, () => 'all')[0], [all])
  const byUser = useMemo(() => summarize(all, (r) => r.userId), [all])
  const byForm = useMemo(() => summarize(all, (r) => r.formKey), [all])
  const byDevice = useMemo(() => summarize(all, (r) => r.device), [all])
  const weeks = useMemo(() => summarize(all, (r) => weekOf(r.startedAt)).sort((a, b) => a.key.localeCompare(b.key)), [all])
  const newOnes = useMemo(() => median(summarize(all.filter((r) => r.newReport), (r) => r.reportId ?? r.id).map((g) => g.medianActiveSec ?? 0)), [all])
  const maxWeek = Math.max(1, ...weeks.map((w) => w.medianActiveSec ?? 0))

  const cols = (label: string, name: (k: string) => string): Col<EntryGroup>[] => [
    { key: 'k', label, render: (g) => <span className="strong" dir="auto">{name(g.key)}</span>, sort: (g) => name(g.key) },
    { key: 'r', label: 'گزارش', num: true, render: (g) => fa(g.reports), sort: (g) => g.reports, hint: 'گزارش‌هایی که در این مدت باز و ویرایش شده‌اند' },
    { key: 's', label: 'ارسال‌شده', num: true, render: (g) => fa(g.submitted), sort: (g) => g.submitted },
    { key: 'm', label: 'میانهٔ زمان فعال', num: true, render: (g) => fmtDur(g.medianActiveSec), sort: (g) => g.medianActiveSec ?? 0, hint: 'زمان فعال هر گزارش (جمع نشست‌های همان گزارش)؛ فاصلهٔ بیش از ۳۰ ثانیه بی‌کاری فقط ۳۰ ثانیه حساب می‌شود' },
    { key: 'p', label: '۹۰٪ گزارش‌ها کمتر از', num: true, render: (g) => fmtDur(g.p90ActiveSec), sort: (g) => g.p90ActiveSec ?? 0 },
    { key: 'l', label: 'هر ردیف کار', num: true, render: (g) => fmtDur(g.secPerLine), sort: (g) => g.secPerLine ?? 0 },
    { key: 'e', label: 'میانهٔ ویرایش‌ها', num: true, render: (g) => fa(g.medianEdits ?? 0, 0), sort: (g) => g.medianEdits ?? 0, hint: 'تعداد تایپ/انتخاب‌ها در هر گزارش' },
    { key: 'd', label: 'سهم گوشی/تبلت', num: true, render: (g) => `${fa(g.mobileShare * 100, 0)}٪`, sort: (g) => g.mobileShare },
  ]

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Section title="زمان ثبت گزارش روزانه (اندازه‌گیری در استفادهٔ واقعی)" hint="هر بار که کسی گزارشی را برای ثبت باز می‌کند، زمانِ فعالِ کار با فرم، تعداد ویرایش‌ها، تعداد ردیف‌ها و نوع دستگاه ثبت می‌شود — نه محتوای گزارش. اگر کسی گوشی را کنار بگذارد، بیش از ۳۰ ثانیه از آن حساب نمی‌شود. هر فرد زمان‌های خودش را می‌بیند؛ ناظر و مدیر اجرا همهٔ افراد پروژه را."
        action={<span style={{ display: 'inline-flex', gap: 4 }} role="group" aria-label="بازهٔ زمانی">{DAYS.map((d) => <button key={d} className={`im-btn im-btn-sm${d === days ? ' im-btn-primary' : ''}`} aria-pressed={d === days} onClick={() => setDays(d)}>{fa(d)} روز</button>)}</span>}>
        {err && <p className="ex-warn" role="alert">خواندن زمان‌ها ممکن نشد: {err}</p>}
        {rows == null ? <p className="im-helper">در حال خواندن…</p> : all.length === 0 ? <p className="im-helper">هنوز زمانی ثبت نشده است. از این پس هر بار که نیروی کارگاه گزارش روزانه را باز، ذخیره یا ارسال کند، زمانش اینجا می‌آید.</p> : <div className="fn-kpis">
          <KpiCard i={0} label="میانهٔ زمان هر گزارش" value={fmtDur(whole?.medianActiveSec ?? null)} sub={`${fa(whole?.submitted ?? 0)} گزارش ارسال‌شده`} />
          <KpiCard i={1} label="گزارش تازه (از صفر)" value={fmtDur(newOnes)} sub="گزارش‌هایی که در همین نشست ساخته شدند" />
          <KpiCard i={2} label="هر ردیف کار" value={fmtDur(whole?.secPerLine ?? null)} sub="میانهٔ زمان به ازای هر ردیف" />
          <KpiCard i={3} label="نشست‌ها" value={fa(all.length)} sub={`${fa((whole?.mobileShare ?? 0) * 100, 0)}٪ با گوشی یا تبلت`} />
        </div>}
      </Section>
      {all.length > 0 && <>
        <Section title="روند هفتگی" hint="میانهٔ زمان فعال هر گزارش در هفته (شروع هفته شنبه). کوتاه‌شدن میله یعنی ثبت سریع‌تر شده است.">
          <div style={{ display: 'grid', gap: 4 }}>{weeks.map((w) => <div key={w.key} style={{ display: 'grid', gridTemplateColumns: '5.5rem 1fr auto', gap: 8, alignItems: 'center' }}>
            <span className="im-helper">{fmtD(w.key)}</span>
            <span style={{ height: 10, borderRadius: 5, background: 'var(--im-line, #e5e7eb)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${((w.medianActiveSec ?? 0) / maxWeek) * 100}%`, background: 'var(--im-accent, #2563eb)', borderRadius: 5 }} /></span>
            <span className="num" style={{ fontSize: 13, whiteSpace: 'nowrap' }} title={fmtDur(w.medianActiveSec)}>{fmtClock(w.medianActiveSec)} دقیقه · {fa(w.reports)} گزارش</span>
          </div>)}</div>
        </Section>
        <Section title="به تفکیک فرد" flush><DataTable cols={cols('فرد', (k) => ex.people.get(k) ?? 'کاربر')} rows={byUser} rowKey={(g) => g.key} /></Section>
        <Section title="به تفکیک فرم" flush><DataTable cols={cols('فرم', (k) => (k === 'work' ? 'گزارش وضعیت کارگاه' : FORM_BY_KEY[k]?.title ?? k))} rows={byForm} rowKey={(g) => g.key} /></Section>
        <Section title="به تفکیک دستگاه" flush><DataTable cols={cols('دستگاه', (k) => DEVICE_FA[k] ?? k)} rows={byDevice} rowKey={(g) => g.key} /></Section>
      </>}
    </div>
  )
}
