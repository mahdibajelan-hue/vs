import { formatJalali } from '../../../lib/jalali'
import type { EstFullInputs, EstProject, EstResults } from '../types'
import { computeSensitivity, SENSITIVITY_PCT } from '../lib/calc'
import { SECTION_COLOR, STATUS, fmtEUR, fmtRial, toFa } from '../lib/theme'

/**
 * Light-mode, print/PDF-friendly one-page rendering of the results report — a separate component
 * from ResultsPage's on-screen dark dashboard (same convention as CompetencyPrintReport.tsx),
 * because html2canvas captures the dark theme's actual pixel colors verbatim (wasting paper/ink
 * and reading poorly once printed) and because a live Recharts chart sizes itself by measuring
 * its container, so it can land in the PDF half-drawn. Plain divs/CSS bars have neither problem
 * and print crisply — this template is deliberately built to fit one A4 page (exported with
 * fitToOnePage) rather than scrolling across several.
 */

const INK = '#16232E'
const MUTED = '#64748B'
const LINE = '#E2E8F0'
const STEEL = '#1B4B66'
const STEEL_DARK = '#0F2F41'
const SAFETY = '#C98A00'

function riskBand(score: number) {
  if (score <= 4) return { label: 'کم', color: STATUS.good }
  if (score <= 9) return { label: 'متوسط', color: STATUS.warning }
  if (score <= 15) return { label: 'بالا', color: STATUS.serious }
  return { label: 'بحرانی', color: STATUS.critical }
}

export function EstimatorPrintReport({
  project, inputs, results, totalMonths,
}: {
  project: EstProject
  inputs: EstFullInputs
  results: EstResults
  totalMonths: number
}) {
  const eurRate = inputs.overhead.fxEurPerUsd
  const rialRate = inputs.overhead.fxRialPerUsd
  const toEur = (usd: number) => usd * eurRate
  const toRial = (usd: number) => usd * rialRate

  const shareData = [...results.sections].sort((a, b) => b.totalUsd - a.totalUsd)
  const maxShare = Math.max(1, ...shareData.map((s) => s.totalUsd))

  const riskCounts = { good: 0, warning: 0, serious: 0, critical: 0 }
  for (const r of inputs.risks) {
    const band = riskBand(r.likelihood * r.impact)
    const k = (Object.keys(STATUS) as (keyof typeof STATUS)[]).find((key) => STATUS[key] === band.color)!
    riskCounts[k]++
  }

  const sensitivity = computeSensitivity(project, inputs).slice(0, 4)
  const maxSwing = Math.max(1, ...sensitivity.map((s) => s.swingUsd))
  const longLeadTop = [...inputs.longLeadItems].sort((a, b) => b.leadTimeMonths - a.leadTimeMonths).slice(0, 4)
  const designWindow = inputs.lifecycle.consultantSelectionMonths + inputs.lifecycle.basicDesignMonths

  const lifecyclePhases = [
    { label: 'انتخاب مشاور طراح', months: inputs.lifecycle.consultantSelectionMonths, color: '#94A3B8' },
    { label: 'طراحی پایه', months: inputs.lifecycle.basicDesignMonths, color: STEEL },
    { label: 'انتخاب پیمانکار EPC', months: inputs.lifecycle.epcContractorSelectionMonths, color: '#7C6FCE' },
    { label: 'اجرا و راه‌اندازی', months: inputs.lifecycle.executionMonths, color: SAFETY },
  ]

  return (
    <div
      dir="rtl" lang="fa"
      style={{
        width: 780, minHeight: 1080, padding: '36px 40px', background: '#FFFFFF', color: INK,
        fontFamily: "'Vazirmatn', Tahoma, Arial, sans-serif", boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `3px solid ${STEEL_DARK}`, paddingBottom: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1, color: MUTED, textTransform: 'uppercase' }}>RASTA · گزارش مدیریتی برآورد هزینه پروژه</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{project.name}</div>
        </div>
        <div style={{ fontSize: 11, color: MUTED, textAlign: 'left' }} dir="ltr">{formatJalali(new Date().toISOString())}</div>
      </div>

      <p style={{ fontSize: 12.5, lineHeight: 1.9, color: '#334155', marginBottom: 18 }}>
        این گزارش برآورد هزینهٔ پروژهٔ «{project.name}» را در {toFa(results.sections.length)} بخش
        ({shareData.map((s) => s.label).join('، ')}) ارائه می‌دهد و بر مبنای ساختار هزینهٔ راهنمای برآورد وزارت نفت
        و برآوردهای مهندسی-پارامتریک برای اقلام خارج از محدودهٔ راهنما تهیه شده است.
        چرخهٔ عمر پروژه تا پایان راه‌اندازی حدود {toFa(totalMonths)} ماه برآورد می‌شود.
      </p>

      <div style={{ display: 'flex', gap: 24, background: '#F3F5F7', borderRadius: 12, padding: '16px 20px', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 10.5, color: MUTED }}>برآورد کل (یورو)</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: STEEL_DARK }}>{fmtEUR(toEur(results.grand))}</div>
        </div>
        <div style={{ width: 1, background: LINE }} />
        <div>
          <div style={{ fontSize: 10.5, color: MUTED }}>برآورد کل (ریال)</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: STEEL_DARK }}>{fmtRial(toRial(results.grand))}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        <div style={{ flex: 1.3 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>ریز برآورد به تفکیک بخش</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${LINE}`, color: MUTED }}>
                <th style={{ textAlign: 'right', padding: '3px 4px', fontWeight: 500 }}>بخش</th>
                <th style={{ textAlign: 'left', padding: '3px 4px', fontWeight: 500 }}>یورو</th>
              </tr>
            </thead>
            <tbody>
              {shareData.map((s) => (
                <tr key={s.key} style={{ borderBottom: `1px solid ${LINE}` }}>
                  <td style={{ padding: '3px 4px', borderRight: `2px solid ${SECTION_COLOR[s.key]}` }}>{s.label}</td>
                  <td style={{ textAlign: 'left', padding: '3px 4px', fontVariantNumeric: 'tabular-nums' }}>{fmtEUR(toEur(s.totalUsd))}</td>
                </tr>
              ))}
              <tr style={{ background: '#F3F5F7', fontWeight: 700 }}>
                <td style={{ padding: '4px' }}>مستقیم</td>
                <td style={{ textAlign: 'left', padding: '4px', fontVariantNumeric: 'tabular-nums' }}>{fmtEUR(toEur(results.direct))}</td>
              </tr>
              <tr>
                <td style={{ padding: '3px 4px', color: '#475569' }}>سربار (مهندسی، مدیریت، بیمه)</td>
                <td style={{ textAlign: 'left', padding: '3px 4px', fontVariantNumeric: 'tabular-nums' }}>{fmtEUR(toEur(results.indirect))}</td>
              </tr>
              <tr>
                <td style={{ padding: '3px 4px', color: '#475569' }}>پیش‌بینی‌نشده و ذخیره نوسان ارزی</td>
                <td style={{ textAlign: 'left', padding: '3px 4px', fontVariantNumeric: 'tabular-nums' }}>{fmtEUR(toEur(results.contingency + results.escalation))}</td>
              </tr>
              <tr style={{ background: STEEL_DARK, color: '#fff', fontWeight: 800 }}>
                <td style={{ padding: '6px 4px', borderRadius: '0 6px 6px 0' }}>جمع کل</td>
                <td style={{ textAlign: 'left', padding: '6px 4px', borderRadius: '6px 0 0 6px', fontVariantNumeric: 'tabular-nums' }}>{fmtEUR(toEur(results.grand))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>سهم هزینه هر بخش</div>
          {shareData.map((s) => (
            <div key={s.key} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: '#475569', marginBottom: 2 }}>
                <span>{s.chartLabel}</span>
              </div>
              <div style={{ height: 8, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(s.totalUsd / maxShare) * 100}%`, background: SECTION_COLOR[s.key], borderRadius: 4 }} />
              </div>
            </div>
          ))}

          <div style={{ fontSize: 12, fontWeight: 700, margin: '16px 0 8px' }}>سطح ریسک‌های پروژه</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {([['critical', 'بحرانی'], ['serious', 'بالا'], ['warning', 'متوسط'], ['good', 'کم']] as const).map(([k, label]) => (
              <div key={k} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: STATUS[k] }}>{toFa(riskCounts[k])}</div>
                <div style={{ fontSize: 9, color: MUTED }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
          <span>چرخه عمر پروژه</span>
          <span style={{ color: MUTED, fontWeight: 400 }}>جمع: {toFa(totalMonths)} ماه</span>
        </div>
        <div style={{ display: 'flex', height: 20, borderRadius: 6, overflow: 'hidden' }} dir="ltr">
          {lifecyclePhases.map((p) => (
            <div key={p.label} style={{
              width: `${(p.months / totalMonths) * 100}%`, background: p.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 700, color: p.color === SAFETY ? '#1A1400' : '#fff',
            }}>
              {toFa(p.months)}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
          {lifecyclePhases.map((p) => (
            <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9.5, color: '#475569' }}>
              <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 99, background: p.color }} />
              {p.label}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, marginTop: 18 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>اقلام بلندمدت‌تأمین (Long Lead Items)</div>
          <p style={{ fontSize: 9, color: MUTED, lineHeight: 1.6, marginBottom: 6 }}>
            اقلامی که تحویل آن‌ها آن‌قدر طول می‌کشد که خودشان زمان کل پروژه را تعیین می‌کنند و باید هم‌زمان با طراحی سفارش داده شوند.
          </p>
          {longLeadTop.length === 0 ? (
            <p style={{ fontSize: 9.5, color: MUTED }}>قلمی ثبت نشده است.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <tbody>
                {longLeadTop.map((it) => {
                  const atRisk = it.leadTimeMonths > designWindow
                  return (
                    <tr key={it.id} style={{ borderBottom: `1px solid ${LINE}` }}>
                      <td style={{ padding: '2.5px 4px' }}>{it.title || '—'}</td>
                      <td style={{ textAlign: 'left', padding: '2.5px 4px', fontWeight: 700, color: atRisk ? STATUS.critical : STATUS.good, fontVariantNumeric: 'tabular-nums' }}>
                        {toFa(it.leadTimeMonths)} ماه
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>تحلیل حساسیت (Sensitivity)</div>
          <p style={{ fontSize: 9, color: MUTED, lineHeight: 1.6, marginBottom: 6 }}>
            اثر تغییر {toFa(Math.round(SENSITIVITY_PCT * 100))}٪ هر فرضیه (به‌تنهایی) بر جمع کل — هر چه میله بلندتر، آن فرضیه حساس‌تر است.
          </p>
          {sensitivity.map((s) => (
            <div key={s.key} style={{ marginBottom: 5 }}>
              <div style={{ fontSize: 9.5, color: '#475569', marginBottom: 2 }}>{s.label}</div>
              <div style={{ height: 7, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(s.swingUsd / maxSwing) * 100}%`, background: '#3987e5', borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 20, paddingTop: 10, borderTop: `1px solid ${LINE}`, fontSize: 9, lineHeight: 1.7, color: MUTED }}>
        نرخ‌های واحد خطوط لوله بر مبنای ساختار هزینه راهنمای برآورد وزارت نفت است؛ برای ایستگاه‌های فرستنده/گیرنده توپک، انشعاب، شیر بین‌راهی، پوشش لوله و مخابرات/اسکادا
        — که خارج از محدوده راهنمای رسمی هستند — از برآورد مهندسی-پارامتریک استفاده شده است. پیش از تصمیم‌گیری سرمایه‌گذاری با فهرست‌بهای مصوب و استعلام بازار روز راستی‌آزمایی شود.
        نرخ ارز مبنا: هر دلار = {toFa(Math.round(rialRate).toLocaleString('en-US'))} ریال.
      </div>
    </div>
  )
}
