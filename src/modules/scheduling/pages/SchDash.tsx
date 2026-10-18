import { useMemo } from 'react'
import { AlertTriangle, BookOpen, ChartGantt, GitCompare, Siren, Upload } from 'lucide-react'
import { jalaliText } from '../../execution/lib/periods'
import { KpiCard, Section, Chip } from '../../finance/components/fn'
import { Ring, Tile, PB } from '../../finance/components/charts'
import { fa, pct } from '../../execution/components/common'
import { compareVersions } from '../lib/compare'
import { pickCalendar } from '../lib/schedule'
import { KIND_LABEL_FA, SOURCE_LABEL_FA } from '../lib/types'
import type { LiveModel } from '../store/useScheduleModel'
import { Hint } from '../components/Hint'
import type { SchTab } from '../SchedulingApp'

const d = (x: string | null) => (x ? jalaliText(x) : '—')
const p1 = (x: number | null) => (x == null ? null : x / 100)

/** Summary of the project's schedule: active version, data date, planned vs actual progress, critical and overdue work, blockers from the other modules and the changes since the baseline. */
export function SchDash({ m, go }: { projectId: string; m: LiveModel; go: (t: SchTab) => void }) {
  const v = m.currentV!, b = m.baselineV
  const slip = m.finish.slipDays
  const diff = useMemo(() => (b && b.id !== v.id && m.base && m.cur ? compareVersions({ activities: m.base.activities, relations: m.base.relations, calendar: pickCalendar(m.base.calendars) }, { activities: m.cur.activities, relations: m.cur.relations, calendar: m.calendar }) : null), [m.base, m.cur, b, v, m.calendar])
  const critical = m.forecast.criticalPath.length, near = [...m.forecast.byId.values()].filter((x) => x.nearCritical).length
  const warnings: string[] = []
  if (m.forecast.cycle) warnings.push(`شبکه چرخهٔ منطقی دارد (${m.forecast.cycle.slice(0, 5).join('، ')}) و محاسبهٔ مسیر بحرانی ممکن نیست.`)
  if (!b) warnings.push('هنوز خط مبنای مصوب تعیین نشده؛ انحراف بر پایهٔ همین نسخه سنجیده می‌شود.')
  if (m.cur && m.cur.relations.length === 0 && m.cur.activities.length > 1) warnings.push('برنامه رابطهٔ منطقی ندارد؛ مسیر بحرانی و شناوری قابل‌اتکا نیست.')
  const mism = [...m.plan.byId.values()].filter((x) => x.fileMismatch).length
  if (mism > 0) warnings.push(`${fa(mism)} فعالیت تاریخ‌هایی در فایل دارند که با محاسبهٔ منطق شبکه فرق می‌کند (ممکن است قید یا تقویم اختصاصی در برنامهٔ مبدأ باشد).`)
  warnings.push(...m.forecast.warnings.slice(0, 2))
  if (m.progress.settledShare < 0.6 && m.progress.planned != null) warnings.push(`پیشرفت واقعی فقط برای ${pct(m.progress.settledShare, 0)} از وزن فعالیت‌ها از منبع قطعی (اجرا یا فایل) می‌آید؛ SPI کم‌برآورد است. فعالیت‌ها را به ماژول اجرا وصل کنید.`)
  if (!m.ready) warnings.push('اطلاعات ماژول‌های دیگر هنوز در حال بارگذاری است؛ آمادگی پیش‌نیازها ممکن است ناقص نمایش داده شود.')
  const tone = (x: number | null, good: number, warn: number) => (x == null ? 'neutral' : x >= good ? 'good' : x >= warn ? 'warn' : 'bad')

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="im-card" style={{ padding: '12px 16px', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 260px' }}>
          <b style={{ fontSize: 15 }}>{v.label}</b> <Chip tone="neutral">{KIND_LABEL_FA[v.kind]}</Chip> <Chip tone={v.status === 'draft' ? 'warn' : 'good'}>{v.status === 'draft' ? 'پیش‌نویس' : 'تأییدشده'}</Chip>
          <div className="sub">منبع: {SOURCE_LABEL_FA[v.source]} · ثبت‌شده {new Date(v.createdAt).toLocaleDateString('fa-IR')} · تاریخ وضعیت <b>{d(m.dataDate)}</b> <Hint id="data-date" />{b && <> · خط مبنا: <b>{b.label}</b></>}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="im-btn im-btn-sm" onClick={() => go('import')}><Upload size={13} /> ورود برنامه</button>
          <button className="im-btn im-btn-sm" onClick={() => go('gantt')}><ChartGantt size={13} /> گانت</button>
          <button className="im-btn im-btn-sm" onClick={() => go('analysis')}><Siren size={13} /> تحلیل انحراف</button>
          <button className="im-btn im-btn-sm" onClick={() => go('help')}><BookOpen size={13} /> راهنمای ماژول</button>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="im-card" style={{ padding: '10px 14px', borderInlineStart: '3px solid #d97706', display: 'grid', gap: 4 }}>
          {warnings.map((w) => <div key={w} style={{ fontSize: 12.5 }}><AlertTriangle size={13} color="#d97706" style={{ verticalAlign: -2 }} /> {w}</div>)}
        </div>
      )}

      <div className="fn-kpis">
        <KpiCard i={0} label={<span>پیشرفت واقعی <Hint id="pct-planned-actual" /></span>} value={m.progress.actual == null ? '—' : pct(p1(m.progress.actual), 1)} sub={`برنامه‌ای: ${m.progress.planned == null ? '—' : pct(p1(m.progress.planned), 1)}`} tone={tone(m.progress.spi, 0.97, 0.9)} />
        <KpiCard i={1} label={<span>شاخص عملکرد زمانی (SPI) <Hint id="spi" /></span>} value={m.progress.spi == null ? '—' : fa(m.progress.spi, 2)} sub={m.progress.reportedOverall != null && m.progress.actual != null && m.progress.reportedOverall > m.progress.actual + 0.5 ? `با پیشرفت گزارش‌شده (تأییدنشده): ${pct(p1(m.progress.reportedOverall), 1)}` : undefined} tone={tone(m.progress.spi, 0.97, 0.9)} />
        <KpiCard i={2} label={<span>پیش‌بینی تکمیل <Hint id="forecast" /></span>} value={d(m.forecast.projectFinish)} sub={slip == null ? 'خط مبنا ندارد' : slip > 0 ? `${fa(slip)} روز دیرتر از خط مبنا` : slip < 0 ? `${fa(-slip)} روز زودتر از خط مبنا` : 'مطابق خط مبنا'} tone={slip == null ? 'neutral' : slip > 14 ? 'bad' : slip > 0 ? 'warn' : 'good'} />
        <KpiCard i={3} label={<span>فعالیت بحرانی <Hint id="float-cp" /></span>} value={fa(critical)} sub={`${fa(near)} نزدیک به بحرانی`} tone={critical ? 'warn' : 'neutral'} />
        <KpiCard i={4} label="عقب‌افتاده از خط مبنا" value={fa(m.overdue.length)} sub={`${fa(m.overdue.filter((o) => o.critical).length)} بحرانی`} tone={m.overdue.length ? 'bad' : 'good'} />
        <KpiCard i={5} label={<span>مانع پیش‌نیاز <Hint id="readiness" /></span>} value={fa(m.blocked)} sub="فعالیت دارای مانع (مدرک/تأمین)" tone={m.blocked ? 'bad' : 'good'} />
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <Tile title="پیشرفت در تاریخ وضعیت" hint="برنامه‌ای در برابر واقعی">
          <div style={{ display: 'flex', gap: 18, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Ring pct={m.progress.planned} color={PB.slate} label="برنامه‌ای" />
            <Ring pct={m.progress.actual} color={PB.teal} label="واقعی (قطعی)" />
          </div>
        </Tile>
        <Tile title="تغییر نسبت به خط مبنا" hint={b ? `«${v.label}» در برابر «${b.label}»` : 'خط مبنا تعیین نشده'} action={diff ? <button className="im-btn im-btn-sm" onClick={() => go('versions')}><GitCompare size={12} /> جزئیات</button> : undefined}>
          {!diff ? <p className="im-helper" style={{ margin: 0 }}>{b && b.id === v.id ? 'نسخهٔ جاری همان خط مبناست.' : 'برای مقایسه خط مبنا و برنامهٔ جاری لازم است.'}</p> : (
            <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
              <div>فعالیت جدید: <b>{fa(diff.counts.added)}</b> · حذف‌شده: <b>{fa(diff.counts.removed)}</b></div>
              <div>فعالیت با تغییر تاریخ: <b>{fa(diff.counts.datesMoved)}</b> · تغییر مدت: <b>{fa(diff.counts.durationsChanged)}</b></div>
              <div>روابط افزوده/حذف/تغییر‌یافته: <b>{fa(diff.counts.relationsAdded)}</b> / <b>{fa(diff.counts.relationsRemoved)}</b> / <b>{fa(diff.counts.relationsChanged)}</b></div>
              {diff.calendarChanges.length > 0 && <div>تقویم: {diff.calendarChanges.join('؛ ')}</div>}
            </div>
          )}
        </Tile>
        <Tile title="موانع پیش‌نیاز" hint="مدرک مهندسی و تأمین کالا" span={undefined}>
          {m.blocked === 0 && m.links.length === 0 ? <p className="im-helper" style={{ margin: 0 }}>هنوز فعالیتی به مدرک یا بستهٔ تأمین وصل نشده است.</p> : (
            <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 12.5, lineHeight: 1.9, listStyle: 'disc' }}>
              {[...m.integration.values()].filter((i) => i.blockers.some((x) => x.severity === 'high')).slice(0, 6).map((i) => <li key={i.uid}><b className="fn-code">{m.codeOf.get(m.idOfUid.get(i.uid) ?? '') ?? ''}</b> — {i.blockers.find((x) => x.severity === 'high')!.text}</li>)}
              {m.blocked === 0 && <li>مانع شدیدی ثبت نشده است.</li>}
            </ul>
          )}
        </Tile>
      </div>

      {m.impact.overall != null && m.impact.overall > 0 && (
        <Section title={<span>اثر تأخیر تأمین بر پایان پروژه <Hint id="delay-impact" /></span>} hint="با تکیه بر منطق شبکه، نه جمع ساده تأخیرها">
          <p style={{ margin: 0 }}>اگر بسته‌های تأمین‌شده طبق تاریخ پیش‌بینی‌شده تحویل شوند، پایان پروژه <b>{fa(m.impact.overall)} روز</b> به تأخیر می‌افتد؛ {fa(m.impact.items.filter((x) => x.absorbed).length)} مورد توسط شناوری جذب می‌شود.</p>
        </Section>
      )}
    </div>
  )
}
