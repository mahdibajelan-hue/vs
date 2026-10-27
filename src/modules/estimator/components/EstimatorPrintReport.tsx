import type { ReactNode } from 'react'
import { formatJalali } from '../../../lib/jalali'
import type { EstFullInputs, EstMethod, EstProject, EstResults } from '../types'
import { METHOD_META, type MethodResult } from '../lib/methods'
import { annualCashFlow, buildCashFlowTimeline, computeEstimate, computeSensitivity, estimateKpis, estimateRange, LIFECYCLE_PHASE_LABEL, MATURITY, maturityOf, scopeLabels, SENSITIVITY_PCT } from '../lib/calc'
import { SECTION_COLOR, STATUS, fmtEUR, fmtEURm, fmtPct, fmtRial, fmtRialBn, toFa } from '../lib/theme'
import { RouteSchematic } from './RouteSchematic'

/**
 * The paper report: two A4 pages (794 × 1123 px each, inline styles only) in light colours.
 * It is the single source for both outputs — PDF download slices it page by page (the page size
 * matches A4 exactly, so the cuts land between pages), and «print» copies it into its own
 * window where the browser can also save it as a text PDF. Charts are plain divs and static SVG
 * so nothing renders half-drawn the way a live chart library can.
 *
 * Page 1 is for the decision maker (number, range, indicators, breakdown); page 2 is for the
 * planning side (phases, yearly cash need, S-curve, long-lead items, sensitivity, risks) and ends
 * with the sign-off boxes.
 */

const INK = '#0F2233'
const MUTED = '#5B6B7E'
const LINE = '#E3E8EF'
const NAVY = '#0F2F41'
const STEEL = '#1B4B66'
const AMBER = '#C98A00'
const PAGE: React.CSSProperties = {
  width: 794, height: 1123, boxSizing: 'border-box', padding: '0 0 0 0', background: '#FFFFFF', color: INK, position: 'relative', overflow: 'hidden',
  fontFamily: "'Vazirmatn', Tahoma, Arial, sans-serif",
}
const num: React.CSSProperties = { fontFamily: "'Fira Code', ui-monospace, monospace", fontVariantNumeric: 'tabular-nums' }

function riskBand(score: number) {
  if (score <= 4) return { label: 'کم', color: STATUS.good }
  if (score <= 9) return { label: 'متوسط', color: STATUS.warning }
  if (score <= 15) return { label: 'بالا', color: STATUS.serious }
  return { label: 'بحرانی', color: STATUS.critical }
}

export function EstimatorPrintReport({
  project, inputs, results, versionLabel, methods = [], chosen = 'parametric',
}: {
  project: EstProject
  inputs: EstFullInputs
  results: EstResults
  versionLabel?: string
  methods?: MethodResult[]
  chosen?: EstMethod
}) {
  const eurRate = inputs.overhead.fxEurPerUsd
  const rialRate = inputs.overhead.fxRialPerUsd
  const eur = (usd: number) => usd * eurRate
  const cf = buildCashFlowTimeline(inputs, results)
  const k = estimateKpis(project, inputs, results, cf)
  const m = maturityOf(inputs)
  const ch = methods.find((x) => x.method === chosen)
  const rg = ch ? { low: ch.low / eurRate, high: ch.high / eurRate, lowPct: ch.low / ch.eur - 1, highPct: ch.high / ch.eur - 1 } : estimateRange(results.grand, m)
  const years = annualCashFlow(cf)
  const maxYear = Math.max(1, ...years.map((y) => y.usd))
  const pg = computeEstimate(project, inputs).grand
  const sk = pg ? results.grand / pg : 1
  const sens = computeSensitivity(project, inputs).slice(0, 5).map((x) => ({ ...x, swingUsd: x.swingUsd * sk }))
  const maxSwing = Math.max(1, ...sens.map((s) => s.swingUsd))
  const shares = [...results.sections].sort((a, b) => b.totalUsd - a.totalUsd)
  const designWindow = inputs.lifecycle.consultantSelectionMonths + inputs.lifecycle.basicDesignMonths
  const longLead = [...inputs.longLeadItems].sort((a, b) => b.leadTimeMonths - a.leadTimeMonths).slice(0, 6)
  const risks = [...inputs.risks].sort((a, b) => b.likelihood * b.impact - a.likelihood * a.impact).slice(0, 6)
  const today = formatJalali(new Date().toISOString())
  const phases = [
    { key: 'consultant', months: inputs.lifecycle.consultantSelectionMonths, color: '#94A3B8' },
    { key: 'design', months: inputs.lifecycle.basicDesignMonths, color: STEEL },
    { key: 'contractor', months: inputs.lifecycle.epcContractorSelectionMonths, color: '#7C6FCE' },
    { key: 'execution', months: inputs.lifecycle.executionMonths, color: AMBER },
  ]

  // cumulative S-curve as a static polyline
  const W = 330, H = 120
  const pts = cf.map((p, i) => `${(i / Math.max(1, cf.length - 1)) * W},${H - (p.cumulativeUsd / (results.grand || 1)) * H}`).join(' ')

  const summary =
    `برآورد هزینهٔ سرمایه‌ای پروژهٔ «${project.name}» شامل ${scopeLabels(project).join('، ')} به روش ${METHOD_META[chosen].short} در مرحلهٔ ${MATURITY[m].label} ` +
    `${fmtEUR(eur(results.grand))} (معادل ${fmtRialBn(results.grand * rialRate)}) برآورد می‌شود و با توجه به سطح تعریف پروژه، ` +
    `هزینهٔ نهایی به احتمال زیاد بین ${fmtEURm(eur(rg.low))} و ${fmtEURm(eur(rg.high))} یورو خواهد بود. ` +
    `از شروع انتخاب مشاور تا راه‌اندازی حدود ${toFa(k.totalMonths)} ماه زمان لازم است و بیشترین نیاز نقدینگی در ماه ${toFa(k.peakMonth)} رخ می‌دهد.` +
    (k.lateLongLead ? ` ${toFa(k.lateLongLead)} قلم تدارکاتی باید پیش از پایان طراحی پایه سفارش داده شود.` : '')

  return (
    <div dir="rtl" lang="fa">
      {/* ─────────────── page 1: decision ─────────────── */}
      <div className="est-page" style={PAGE}>
        <Header project={project} page={1} today={today} versionLabel={versionLabel} maturity={MATURITY[m].label} rate={inputs.overhead.fxRialPerEur ?? rialRate * eurRate} />
        <div style={{ padding: '14px 40px 0' }}>
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: '4px 10px 6px', background: '#F7F9FC' }}>
            <RouteSchematic project={project} lengthKm={k.lengthKm} height={66} animated={false} light />
          </div>

          <div style={{ display: 'flex', gap: 18, marginTop: 12, alignItems: 'stretch' }}>
            <div style={{ flex: 1.15, background: NAVY, color: '#fff', borderRadius: 14, padding: '16px 20px' }}>
              <div style={{ fontSize: 11, opacity: 0.75 }}>برآورد کل هزینهٔ سرمایه‌ای</div>
              <div style={{ ...num, fontSize: 32, fontWeight: 700, color: '#FFD15C', marginTop: 2 }}>{fmtEUR(eur(results.grand))}</div>
              <div style={{ ...num, fontSize: 13, opacity: 0.9 }}>{fmtRial(results.grand * rialRate)}</div>
              <div style={{ marginTop: 12, fontSize: 10, opacity: 0.8 }}>بازهٔ برآورد ({fmtPct(rg.lowPct)} تا +{fmtPct(rg.highPct)})</div>
              <div style={{ position: 'relative', height: 7, borderRadius: 9, marginTop: 5, background: 'linear-gradient(270deg,#5B9BE8,#FFD15C 40%,#F08A8A)' }}>
                <span style={{ position: 'absolute', top: -4, right: `${(-rg.lowPct / ((rg.highPct - rg.lowPct) || 1)) * 100}%`, width: 4, height: 15, background: '#fff', borderRadius: 2 }} />
              </div>
              <div style={{ ...num, display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}>
                <span>{fmtEURm(eur(rg.low))}</span><span>{fmtEURm(eur(rg.high))}</span>
              </div>
            </div>
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Tile label="مدت تا راه‌اندازی" value={`${toFa(k.totalMonths)} ماه`} />
              <Tile label="هزینهٔ هر کیلومتر" value={k.usdPerKm ? fmtEURm(eur(k.usdPerKm)) : '—'} />
              <Tile label="اوج نیاز ماهانه" value={fmtEURm(eur(k.peakMonthlyUsd))} sub={`ماه ${toFa(k.peakMonth)}`} />
              <Tile label="سهم ذخایر از کل" value={fmtPct(k.reserveShare)} />
            </div>
          </div>

          <SectionHead>خلاصهٔ مدیریتی</SectionHead>
          <p style={{ fontSize: 11.5, lineHeight: 1.9, color: '#2B3A4A', margin: 0, textAlign: 'justify' }}>{summary}</p>

          {methods.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 12 }}>
              {methods.map((x) => (
                <div key={x.method} style={{ borderRadius: 10, padding: '7px 10px', border: `1.5px solid ${x.method === chosen ? METHOD_META[x.method].color : LINE}`, background: x.method === chosen ? '#FFF8E6' : '#F7F9FC' }}>
                  <div style={{ fontSize: 9.5, color: MUTED, display: 'flex', alignItems: 'center', gap: 4 }}><i style={{ width: 7, height: 7, borderRadius: 2, background: METHOD_META[x.method].color, display: 'inline-block' }} />{METHOD_META[x.method].short}{x.method === chosen ? ' · مبنا' : ''}</div>
                  <div style={{ ...num, fontSize: 13, fontWeight: 700, color: x.available ? NAVY : MUTED }}>{x.available ? fmtEURm(x.eur) : 'بدون داده'}</div>
                </div>
              ))}
            </div>
          )}

          <SectionHead>ساختار شکست هزینه</SectionHead>
          <div style={{ display: 'flex', gap: 22 }}>
            <table style={{ flex: 1.35, borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ color: MUTED, borderBottom: `1.5px solid ${INK}` }}>
                  <th style={{ textAlign: 'right', padding: '4px', fontWeight: 600 }}>سرفصل</th>
                  <th style={{ textAlign: 'left', padding: '4px', fontWeight: 600 }}>یورو</th>
                  <th style={{ textAlign: 'left', padding: '4px', fontWeight: 600, width: 52 }}>سهم</th>
                </tr>
              </thead>
              <tbody>
                {shares.map((s) => <Row key={s.key} label={s.label} v={eur(s.totalUsd)} share={s.totalUsd / results.grand} mark={SECTION_COLOR[s.key]} />)}
                <Row label="جمع هزینه‌های مستقیم" v={eur(results.direct)} share={results.direct / results.grand} strong />
                <Row label={`مهندسی و طراحی (${fmtPct(inputs.overhead.eng)})`} v={eur(results.eng)} share={results.eng / results.grand} />
                <Row label={`مدیریت پروژه (${fmtPct(inputs.overhead.pm)})`} v={eur(results.pm)} share={results.pm / results.grand} />
                <Row label={`بیمه و ضمانت‌نامه (${fmtPct(inputs.overhead.ins)})`} v={eur(results.ins)} share={results.ins / results.grand} />
                <Row label={`پیش‌بینی‌نشده (${fmtPct(inputs.overhead.contingency)})`} v={eur(results.contingency)} share={results.contingency / results.grand} />
                <Row label={`ذخیرهٔ نوسان ارزی/تورمی (${fmtPct(inputs.overhead.escalation)})`} v={eur(results.escalation)} share={results.escalation / results.grand} />
                <tr style={{ background: NAVY, color: '#fff', fontWeight: 800 }}>
                  <td style={{ padding: '6px 6px', borderRadius: '0 6px 6px 0' }}>جمع کل برآورد</td>
                  <td style={{ ...num, textAlign: 'left', padding: '6px 4px' }}>{fmtEUR(eur(results.grand))}</td>
                  <td style={{ ...num, textAlign: 'left', padding: '6px 6px', borderRadius: '6px 0 0 6px' }}>۱۰۰٪</td>
                </tr>
              </tbody>
            </table>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10.5, color: MUTED, marginBottom: 8 }}>سهم هر بخش از هزینهٔ مستقیم</div>
              {shares.map((s) => (
                <div key={s.key} style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#3B4A5A', marginBottom: 2 }}>
                    <span>{s.chartLabel}</span><span style={num}>{fmtPct(s.totalUsd / (results.direct || 1))}</span>
                  </div>
                  <div style={{ height: 8, background: '#EEF2F6', borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(s.totalUsd / (shares[0]?.totalUsd || 1)) * 100}%`, background: SECTION_COLOR[s.key], borderRadius: 5 }} />
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: '#F7F9FC', border: `1px solid ${LINE}`, fontSize: 10, lineHeight: 1.9, color: '#3B4A5A' }}>
                <b>مبنای ارزی:</b> هر دلار = <span style={num}>{eurRate}</span> یورو = <span style={num}>{Math.round(rialRate).toLocaleString('en-US')}</span> ریال.
                {k.lengthKm > 0 && <> طول کل خط <span style={num}>{toFa(k.lengthKm)}</span> کیلومتر.</>}
              </div>
            </div>
          </div>
        </div>
        <Footer page={1} />
      </div>

      {/* ─────────────── page 2: plan ─────────────── */}
      <div className="est-page" style={PAGE}>
        <Header project={project} page={2} today={today} versionLabel={versionLabel} maturity={MATURITY[m].label} rate={inputs.overhead.fxRialPerEur ?? rialRate * eurRate} />
        <div style={{ padding: '6px 40px 0' }}>
          <SectionHead>چرخهٔ عمر و نیاز نقدینگی</SectionHead>
          <div style={{ display: 'flex', height: 22, borderRadius: 7, overflow: 'hidden' }} dir="ltr">
            {phases.map((p) => (
              <div key={p.key} style={{ width: `${(p.months / Math.max(1, k.totalMonths)) * 100}%`, background: p.color, color: p.key === 'execution' ? '#1A1400' : '#fff', fontSize: 9.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {p.months > 0 ? `${toFa(p.months)} ماه` : ''}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 6, fontSize: 9.5, color: '#3B4A5A' }}>
            {phases.map((p) => <span key={p.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ width: 8, height: 8, borderRadius: 9, background: p.color, display: 'inline-block' }} />{LIFECYCLE_PHASE_LABEL[p.key]}</span>)}
          </div>

          <div style={{ display: 'flex', gap: 22, marginTop: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10.5, color: MUTED, marginBottom: 6 }}>نیاز نقدینگی سال‌به‌سال (یورو)</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
                <tbody>
                  {years.map((y) => (
                    <tr key={y.year} style={{ borderBottom: `1px solid ${LINE}` }}>
                      <td style={{ padding: '4px 2px', width: 46, color: MUTED }}>سال {toFa(y.year)}</td>
                      <td style={{ padding: '4px 4px' }}>
                        <div style={{ height: 9, background: '#EEF2F6', borderRadius: 5 }}>
                          <div style={{ height: '100%', width: `${(y.usd / maxYear) * 100}%`, background: y.usd ? AMBER : 'transparent', borderRadius: 5 }} />
                        </div>
                      </td>
                      <td style={{ ...num, textAlign: 'left', padding: '4px 2px', width: 72 }}>{y.usd ? fmtEURm(eur(y.usd)) : '—'}</td>
                      <td style={{ ...num, textAlign: 'left', padding: '4px 2px', width: 52, color: MUTED }}>{fmtPct(y.cumulativeUsd / (results.grand || 1))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10.5, color: MUTED, marginBottom: 6 }}>منحنی تجمعی هزینه (S)</div>
              <svg viewBox={`-4 -4 ${W + 8} ${H + 22}`} width="100%" height={H + 26} style={{ direction: 'ltr' }}>
                {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1="0" x2={W} y1={H - f * H} y2={H - f * H} stroke={LINE} strokeWidth="1" />)}
                <polygon points={`0,${H} ${pts} ${W},${H}`} fill="rgba(201,138,0,.12)" />
                <polyline points={pts} fill="none" stroke={AMBER} strokeWidth="2.2" />
                <line x1="0" x2={W} y1={H} y2={H} stroke="#94A3B8" />
                <text x="0" y={H + 15} fontSize="9" fill={MUTED}>ماه ۱</text>
                <text x={W} y={H + 15} fontSize="9" fill={MUTED} textAnchor="end">ماه {toFa(cf.length)}</text>
                <text x={W} y={10} fontSize="9" fill={MUTED} textAnchor="end">۱۰۰٪</text>
              </svg>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 22 }}>
            <div style={{ flex: 1 }}>
              <SectionHead>اقلام بلندمدت‌تأمین</SectionHead>
              {longLead.length === 0 ? <p style={{ fontSize: 10, color: MUTED }}>قلمی ثبت نشده است.</p> : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
                  <tbody>
                    {longLead.map((it) => {
                      const late = it.leadTimeMonths > designWindow
                      return (
                        <tr key={it.id} style={{ borderBottom: `1px solid ${LINE}` }}>
                          <td style={{ padding: '4px 2px' }}>{it.title || '—'}</td>
                          <td style={{ textAlign: 'left', padding: '4px 2px', whiteSpace: 'nowrap' }}>
                            <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 9.5, fontWeight: 700, color: '#fff', background: late ? STATUS.critical : STATUS.good }}>{toFa(it.leadTimeMonths)} ماه</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
              <p style={{ fontSize: 9, color: MUTED, lineHeight: 1.7, margin: '6px 0 0' }}>قرمز: مدت تأمین از دورهٔ انتخاب مشاور و طراحی پایه ({toFa(designWindow)} ماه) بیشتر است و سفارش باید زودتر آغاز شود.</p>
            </div>
            <div style={{ flex: 1 }}>
              <SectionHead>حساسیت برآورد</SectionHead>
              <p style={{ fontSize: 9, color: MUTED, lineHeight: 1.7, margin: '0 0 6px' }}>دامنهٔ تغییر جمع کل اگر هر فرضیه به‌تنهایی {toFa(Math.round(SENSITIVITY_PCT * 100))}٪ کم یا زیاد شود.</p>
              {sens.map((s) => (
                <div key={s.key} style={{ marginBottom: 7 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#3B4A5A', marginBottom: 2 }}>
                    <span>{s.label}</span><span style={num}>±{fmtEURm(eur(s.swingUsd / 2))}</span>
                  </div>
                  <div style={{ height: 7, background: '#EEF2F6', borderRadius: 4 }}>
                    <div style={{ height: '100%', width: `${(s.swingUsd / maxSwing) * 100}%`, background: '#3987e5', borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <SectionHead>ریسک‌های اصلی</SectionHead>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
            <thead>
              <tr style={{ color: MUTED, borderBottom: `1.5px solid ${INK}` }}>
                <th style={{ textAlign: 'right', padding: 4, fontWeight: 600 }}>ریسک</th>
                <th style={{ textAlign: 'center', padding: 4, fontWeight: 600, width: 74 }}>سطح</th>
                <th style={{ textAlign: 'right', padding: 4, fontWeight: 600 }}>اقدام کاهش</th>
              </tr>
            </thead>
            <tbody>
              {risks.map((r) => {
                const b = riskBand(r.likelihood * r.impact)
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${LINE}` }}>
                    <td style={{ padding: '4px' }}>{r.title || '—'}</td>
                    <td style={{ textAlign: 'center', padding: 4 }}><span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 9, fontSize: 9.5, fontWeight: 700, color: '#fff', background: b.color }}>{b.label} ({toFa(r.likelihood * r.impact)})</span></td>
                    <td style={{ padding: '4px', color: '#3B4A5A' }}>{r.mitigation || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 22 }}>
            {['تهیه‌کننده (برآورد)', 'مدیر پروژه', 'برنامه‌ریزی و کنترل پروژه', 'مجری طرح'].map((t) => (
              <div key={t} style={{ border: `1px solid ${LINE}`, borderRadius: 10, height: 78, padding: '7px 9px', fontSize: 10, color: MUTED }}>{t}<div style={{ marginTop: 34, borderTop: `1px dashed ${LINE}`, paddingTop: 3, fontSize: 9 }}>نام، تاریخ و امضا</div></div>
            ))}
          </div>
        </div>
        <Footer page={2} />
      </div>
    </div>
  )
}

function Header({ project, page, today, versionLabel, maturity, rate }: { project: EstProject; page: number; today: string; versionLabel?: string; maturity: string; rate: number }) {
  return (
    <div style={{ background: NAVY, color: '#fff', padding: page === 1 ? '20px 40px 16px' : '14px 40px', position: 'relative' }}>
      <div style={{ position: 'absolute', insetInlineStart: 0, top: 0, bottom: 0, width: 8, background: AMBER }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10.5, letterSpacing: 0.4, opacity: 0.7 }}>گزارش برآورد هزینهٔ سرمایه‌ای</div>
          <div style={{ fontSize: page === 1 ? 24 : 15, fontWeight: 900, marginTop: 3, lineHeight: 1.4 }}>{project.name}</div>
          {page === 1 && <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>{scopeLabels(project).join(' · ')}</div>}
        </div>
        <div style={{ textAlign: 'left', fontSize: 10.5, lineHeight: 1.8, opacity: 0.9, flexShrink: 0 }}>
          <div>تاریخ: <span style={num}>{today}</span></div>
          <div>مرحله: {maturity}</div>
          <div>نرخ یورو: <span style={num}>{Math.round(rate).toLocaleString('en-US')}</span> ریال</div>
          {versionLabel && <div>نسخه: {versionLabel}</div>}
        </div>
      </div>
    </div>
  )
}

function Footer({ page }: { page: number }) {
  return (
    <div style={{ position: 'absolute', left: 40, right: 40, bottom: 18, display: 'flex', justifyContent: 'space-between', fontSize: 9, color: MUTED, borderTop: `1px solid ${LINE}`, paddingTop: 7 }}>
      <span>برآورد پارامتریک بر پایهٔ مبانی محاسباتی سازمان؛ پیش از تصمیم سرمایه‌گذاری با استعلام بازار و فهرست‌بهای روز راستی‌آزمایی شود.</span>
      <span style={num}>{toFa(page)} / ۲</span>
    </div>
  )
}

function SectionHead({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 8px' }}>
      <span style={{ width: 4, height: 15, borderRadius: 2, background: AMBER }} />
      <span style={{ fontSize: 13, fontWeight: 800, color: INK }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: LINE }} />
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: '10px 12px', background: '#F7F9FC' }}>
      <div style={{ fontSize: 10, color: MUTED }}>{label}</div>
      <div style={{ ...num, fontSize: 17, fontWeight: 700, color: NAVY, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 9.5, color: MUTED }}>{sub}</div>}
    </div>
  )
}

function Row({ label, v, share, mark, strong }: { label: string; v: number; share: number; mark?: string; strong?: boolean }) {
  return (
    <tr style={{ borderBottom: `1px solid ${LINE}`, background: strong ? '#EEF2F6' : undefined, fontWeight: strong ? 800 : 400 }}>
      <td style={{ padding: '3px 6px', borderRight: mark ? `3px solid ${mark}` : undefined }}>{label}</td>
      <td style={{ ...num, textAlign: 'left', padding: '3px 4px' }}>{fmtEUR(v)}</td>
      <td style={{ ...num, textAlign: 'left', padding: '3px 4px', color: MUTED }}>{fmtPct(share)}</td>
    </tr>
  )
}
