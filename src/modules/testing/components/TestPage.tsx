import { useMemo, useState, type CSSProperties } from 'react'
import { AlertTriangle, CheckCircle2, Gauge, Plus, Printer, RotateCcw, XCircle } from 'lucide-react'
import { ShamsiDateTime } from '../../../components/common/ShamsiField'
import { useAuthStore } from '../../../store/useAuthStore'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { formatJalali } from '../../../lib/jalali'
import { useTestingStore } from '../store/useTestingStore'
import { advanceBlocker, evaluateHold, HT_FAILED_COLOR, HT_STAGE_COLOR, HT_STAGE_FA, HT_STAGES, overlapKm, type HtStage } from '../lib/htCore'
import type { HtPack, HtReading, HtSection, TargetKind } from '../repo'

const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })
const jd = (d: string | null | undefined) => (d ? formatJalali(d.slice(0, 10)) : '—')
const tm = (d: string) => new Date(d).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
const PHASES: { key: string; label: string }[] = [{ key: 'filling', label: 'آبگیری' }, { key: 'stabilization', label: 'تثبیت' }, { key: 'strength', label: 'آزمون مقاومت' }, { key: 'leak', label: 'آزمون نشتی' }]
const NEXT_LABEL: Partial<Record<HtStage, string>> = { planned: 'شروع پیگ‌رانی و گیجینگ', cleaning: 'شروع آبگیری', filling: 'شروع تثبیت', stabilization: 'شروع آزمون مقاومت', strength: 'پایان مقاومت — شروع نشتی', leak: 'پایان نشتی — تخلیه', dewatering: 'پذیرش نهایی' }
const localNow = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }

/** One test — a line section or a station test package: its stage, its numbers, its pressure record and its verdict. */
export function TestPage({ kind, id, onBack }: { kind: TargetKind; id: string; onBack: () => void }) {
  const st = useTestingStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === st.projectId))
  const t = (kind === 'section' ? st.sections : st.packs).find((x) => x.id === id) as (HtSection | HtPack) | undefined
  const readings = useMemo(() => st.readings.filter((r) => r.targetId === id), [st.readings, id])
  const events = st.events.filter((e) => e.targetId === id)
  const [failNote, setFailNote] = useState('')
  const [f, setF] = useState({ phase: 'strength', at: localNow(), p: '', temp: '', note: '' })
  if (!t) return <p className="ps-hint">یافت نشد.</p>
  const sec = kind === 'section' ? (t as HtSection) : null
  const pack = kind === 'pack' ? (t as HtPack) : null
  const stages = kind === 'pack' ? HT_STAGES.filter((s) => s !== 'cleaning') : HT_STAGES
  const idx = stages.indexOf(t.stage)
  const next = stages[idx + 1] as HtStage | undefined
  const minTest = sec ? sec.pHigh : pack!.testPressureBar
  const cfg = { strengthHoldH: st.settings.strengthHoldH, leakHoldH: st.settings.leakHoldH, allowedDropBar: st.settings.allowedDropBar, minStrengthBar: sec ? undefined : minTest }
  const blocker = t.failed ? 'آزمون مردود است؛ پس از تعمیر «آزمون مجدد» را بزنید.' : advanceBlocker(t.stage, readings, cfg)
  const bfKm = sec ? overlapKm(sec.kmFrom, sec.kmTo, st.backfilled) : 0
  const notBackfilled = sec ? sec.kmTo - sec.kmFrom - bfKm : 0
  const color = t.failed ? HT_FAILED_COLOR : HT_STAGE_COLOR[t.stage]
  const strength = evaluateHold(readings, 'strength', cfg.strengthHoldH, cfg.allowedDropBar)
  const leak = evaluateHold(readings, 'leak', cfg.leakHoldH, cfg.allowedDropBar)
  const title = sec ? `قطعهٔ ${sec.code} — کیلومتر ${fa(sec.kmFrom, 3)} تا ${fa(sec.kmTo, 3)}` : `${pack!.code} — ${pack!.title || pack!.station}`

  const addReading = async () => {
    const p = Number(f.p)
    if (!(p > 0)) return
    if (await st.addReading(kind, id, { phase: f.phase, at: new Date(f.at).toISOString(), pressureBar: p, tempC: f.temp === '' ? null : Number(f.temp), note: f.note }, email)) setF({ ...f, at: localNow(), p: '', note: '' })
  }

  return (
    <div className="ps-stack" style={{ '--acc': color } as CSSProperties}>
      <nav className="ps-sysnav">
        <button type="button" className="ps-btn is-primary" onClick={onBack}>→ بازگشت</button>
        <ol className="ps-stepper" aria-label="مراحل آزمون">
          {stages.map((s, i) => <li key={s} className={i < idx ? 'is-done' : i === idx ? 'is-on' : ''} style={{ '--c': t.failed && i === idx ? HT_FAILED_COLOR : HT_STAGE_COLOR[s] } as CSSProperties}><span>{fa(i + 1)}</span>{HT_STAGE_FA[s]}</li>)}
        </ol>
      </nav>

      <header className="ps-card ht-head" style={{ borderTop: `4px solid ${color}` }}>
        <div className="ps-card-head"><b><Gauge size={16} /> {title}</b><span className="ps-chip" style={{ '--c': color } as CSSProperties}><i />{t.failed ? 'مردود — نیاز به تعمیر' : HT_STAGE_FA[t.stage]}</span></div>
        <div className="ht-figs">
          {sec ? <>
            <Fig k="حداقل فشار آزمون (نقطهٔ بالا)" v={`${fa(sec.pHigh, 1)} bar`} sub={`کیلومتر ${fa(sec.elevMaxKm, 2)} · ارتفاع ${fa(sec.elevMax)} m`} />
            <Fig k="فشار نقطهٔ پایین" v={`${fa(sec.pLow, 1)} bar`} sub={`${fa(sec.hoopLowPct, 1)}٪ SMYS · کیلومتر ${fa(sec.elevMinKm, 2)}`} />
            <Fig k="فشار روی سر آزمون (گیج)" v={`${fa(sec.pHead, 1)} bar`} sub={`سر آزمون در کیلومتر ${fa(sec.headKm, 3)}`} />
            <Fig k="اختلاف ارتفاع / حجم آب" v={`${fa(sec.elevMax - sec.elevMin)} m`} sub={`${fa(sec.volumeM3)} m³ آب`} />
          </> : <>
            <Fig k="فشار طراحی" v={`${fa(pack!.designPressureBar, 1)} bar`} sub={pack!.station} />
            <Fig k="فشار آزمون" v={`${fa(pack!.testPressureBar, 1)} bar`} sub={`${fa(pack!.testPressureBar / pack!.designPressureBar, 2)} × فشار طراحی`} />
            <Fig k="سیال آزمون" v={pack!.medium === 'water' ? 'آب' : pack!.medium === 'air' ? 'هوا' : 'نیتروژن'} sub={jd(pack!.plannedDate)} />
          </>}
        </div>
        {sec && notBackfilled > 0.01 && t.stage !== 'accepted' && <p className="ps-hint is-warn"><AlertTriangle size={14} /> {fa(notBackfilled, 2)} کیلومتر از این قطعه طبق دوقلوی دیجیتال هنوز خاک‌ریزی نشده است؛ آزمون هیدرو پس از خاک‌ریزی کامل انجام می‌شود.</p>}
        {t.failed && <p className="ps-hint is-warn"><XCircle size={14} /> مردود: {t.failedNote}</p>}
      </header>

      <section className="ps-card">
        <header className="ps-card-head"><b>اقدام بعدی</b></header>
        {t.stage === 'accepted' ? (
          <div className="ps-rfsu-ok"><CheckCircle2 size={18} /> <b>آزمون پذیرفته شد.</b>
            <button type="button" className="ps-btn" onClick={() => printCert(kind, t, readings, st.settings, project?.officialName ?? '')}><Printer size={14} /> چاپ گواهی آزمون</button></div>
        ) : (
          <div className="ps-actions">
            {next && <button type="button" className="ps-btn is-ok" disabled={!!blocker} onClick={() => st.setStage(kind, id, next, false, '', email)}><CheckCircle2 size={14} /> {NEXT_LABEL[t.stage]}</button>}
            {t.failed
              ? <button type="button" className="ps-btn is-primary" onClick={() => st.setStage(kind, id, 'filling', false, 'تعمیر انجام شد — آزمون مجدد', email)}><RotateCcw size={14} /> تعمیر انجام شد — آزمون مجدد</button>
              : t.stage !== 'planned' && <span className="ht-fail"><input value={failNote} onChange={(e) => setFailNote(e.target.value)} placeholder="علت مردودی (نشتی در کیلومتر …، پارگی، …)" /><button type="button" className="ps-btn is-bad" disabled={!failNote.trim()} onClick={async () => { if (await st.setStage(kind, id, t.stage, true, failNote.trim(), email)) setFailNote('') }}><XCircle size={14} /> ثبت مردودی</button></span>}
          </div>
        )}
        {blocker && t.stage !== 'accepted' && <p className="ps-hint is-warn">{blocker}</p>}
        {(t.stage === 'strength' || t.stage === 'leak' || strength.readings > 0) && (
          <div className="ht-holds">
            <Hold label="آزمون مقاومت" need={cfg.strengthHoldH} h={strength} allowed={cfg.allowedDropBar} />
            <Hold label="آزمون نشتی" need={cfg.leakHoldH} h={leak} allowed={cfg.allowedDropBar} />
          </div>
        )}
      </section>

      <section className="ps-card">
        <header className="ps-card-head"><b>ثبت فشار و دما</b><small className="ps-meta">{fa(readings.length)} قرائت</small></header>
        {t.stage !== 'planned' && t.stage !== 'accepted' && !t.failed && (
          <div className="ps-inline-form">
            <label className="ps-field"><span>مرحله</span><select value={f.phase} onChange={(e) => setF({ ...f, phase: e.target.value })}>{PHASES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
            <div className="ps-field"><span>زمان</span><ShamsiDateTime value={f.at} onChange={(v) => setF({ ...f, at: v })} label="زمان قرائت" /></div>
            <label className="ps-field"><span>فشار (bar) *</span><input type="number" inputMode="decimal" step="0.1" value={f.p} onChange={(e) => setF({ ...f, p: e.target.value })} dir="ltr" /></label>
            <label className="ps-field"><span>دما (°C)</span><input type="number" inputMode="decimal" step="0.1" value={f.temp} onChange={(e) => setF({ ...f, temp: e.target.value })} dir="ltr" /></label>
            <label className="ps-field is-wide"><span>توضیح</span><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
            <button type="button" className="ps-btn is-primary" disabled={!(Number(f.p) > 0)} onClick={addReading}><Plus size={14} /> ثبت قرائت</button>
          </div>
        )}
        {readings.length >= 2 && <PressureChart readings={readings} minTest={minTest} />}
        {readings.length > 0 ? (
          <div className="ps-table-wrap"><table className="ps-table"><thead><tr><th>زمان</th><th>مرحله</th><th>فشار (bar)</th><th>دما (°C)</th><th>توضیح</th><th>ثبت‌کننده</th></tr></thead>
            <tbody>{[...readings].reverse().map((r) => <tr key={r.id}><td className="ps-nowrap">{jd(r.at)} {tm(r.at)}</td><td>{PHASES.find((p) => p.key === r.phase)?.label ?? r.phase}</td><td className={r.phase === 'strength' && r.pressureBar < minTest ? 'is-late' : ''}>{fa(r.pressureBar, 2)}</td><td>{r.tempC == null ? '—' : fa(r.tempC, 1)}</td><td>{r.note}</td><td>{r.by}</td></tr>)}</tbody></table></div>
        ) : <p className="ps-hint">هنوز قرائتی ثبت نشده است.</p>}
      </section>

      {events.length > 0 && (
        <section className="ps-card">
          <header className="ps-card-head"><b>سوابق مراحل</b></header>
          <ul className="ps-chain">{events.map((e) => <li key={e.id} className={e.failed ? 'is-rejected' : 'is-signed'}><span className="ps-chain-n">{e.failed ? '✕' : '✓'}</span><div><b>{e.failed ? `مردود در ${HT_STAGE_FA[e.stage]}` : HT_STAGE_FA[e.stage]}</b><small>{e.by} · {jd(e.at)} {tm(e.at)}{e.note ? ` — ${e.note}` : ''}</small></div></li>)}</ul>
        </section>
      )}
    </div>
  )
}

function Fig({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return <div className="ht-fig"><small>{k}</small><b>{v}</b>{sub && <span>{sub}</span>}</div>
}
function Hold({ label, need, h, allowed }: { label: string; need: number; h: ReturnType<typeof evaluateHold>; allowed: number }) {
  const tone = h.readings < 2 ? '#64748b' : h.ok ? '#22c55e' : h.longEnough ? '#ef4444' : '#f59e0b'
  return (
    <div className="ht-hold" style={{ '--c': tone } as CSSProperties}>
      <b>{label}</b>
      <span>مدت: {fa(h.hours, 1)} از {fa(need)} ساعت</span>
      <span>افت فشار: {fa(h.drop, 2)} bar (مجاز {fa(allowed, 2)})</span>
      {h.tempChange != null && <span>تغییر دما: {fa(h.tempChange, 1)} °C</span>}
      <em>{h.readings < 2 ? 'قرائت کافی ثبت نشده' : h.ok ? 'قابل قبول' : h.longEnough ? 'افت بیش از حد مجاز' : 'هنوز کامل نشده'}</em>
    </div>
  )
}

/** pressure (and temperature) against time, with the minimum test pressure as a reference */
function PressureChart({ readings, minTest }: { readings: HtReading[]; minTest: number }) {
  const W = 900, H = 200, L = 50, R = 46, T = 14, B = 26
  const ts = readings.map((r) => Date.parse(r.at)), t0 = Math.min(...ts), t1 = Math.max(...ts)
  const ps = readings.map((r) => r.pressureBar).concat(minTest)
  const p0 = Math.min(...ps) * 0.98, p1 = Math.max(...ps) * 1.02
  const temps = readings.filter((r) => r.tempC != null).map((r) => r.tempC!)
  const q0 = temps.length ? Math.min(...temps) - 1 : 0, q1 = temps.length ? Math.max(...temps) + 1 : 1
  const x = (t: number) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R)
  const y = (p: number) => T + (1 - (p - p0) / (p1 - p0 || 1)) * (H - T - B)
  const yt = (q: number) => T + (1 - (q - q0) / (q1 - q0 || 1)) * (H - T - B)
  const line = readings.map((r, i) => `${i ? 'L' : 'M'}${x(Date.parse(r.at)).toFixed(1)},${y(r.pressureBar).toFixed(1)}`).join('')
  const tline = readings.filter((r) => r.tempC != null).map((r, i) => `${i ? 'L' : 'M'}${x(Date.parse(r.at)).toFixed(1)},${yt(r.tempC!).toFixed(1)}`).join('')
  return (
    <div className="ht-chart-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} className="ht-chart" style={{ direction: 'ltr' }} role="img" aria-label="نمودار فشار و دما در طول آزمون">
        <line x1={L} x2={W - R} y1={y(minTest)} y2={y(minTest)} className="ht-min" />
        <text x={L + 4} y={y(minTest) - 4} className="ht-ax">min {minTest.toFixed(1)} bar</text>
        {[p0, (p0 + p1) / 2, p1].map((p) => <text key={p} x={L - 6} y={y(p) + 4} textAnchor="end" className="ht-ax">{p.toFixed(1)}</text>)}
        {temps.length > 0 && [q0, q1].map((q) => <text key={q} x={W - R + 6} y={yt(q) + 4} className="ht-ax is-temp">{q.toFixed(0)}°</text>)}
        {tline && <path d={tline} className="ht-tline" />}
        <path d={line} className="ht-pline" />
        {readings.map((r) => <circle key={r.id} cx={x(Date.parse(r.at))} cy={y(r.pressureBar)} r={3} className="ht-pt" />)}
        <text x={L} y={H - 6} className="ht-ax">{new Date(t0).toLocaleString('fa-IR-u-ca-persian', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</text>
        <text x={W - R} y={H - 6} textAnchor="end" className="ht-ax">{new Date(t1).toLocaleString('fa-IR-u-ca-persian', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</text>
      </svg>
    </div>
  )
}

function printCert(kind: TargetKind, t: HtSection | HtPack, readings: HtReading[], s: { strengthHoldH: number; leakHoldH: number; allowedDropBar: number }, projectName: string) {
  const w = window.open('', '_blank', 'width=900,height=1100')
  if (!w) return
  const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  const sec = kind === 'section' ? (t as HtSection) : null, pack = kind === 'pack' ? (t as HtPack) : null
  const st = evaluateHold(readings, 'strength', s.strengthHoldH, s.allowedDropBar), lk = evaluateHold(readings, 'leak', s.leakHoldH, s.allowedDropBar)
  const rows = sec
    ? `<tr><th>قطعه</th><td>${esc(sec.code)} — کیلومتر ${sec.kmFrom.toFixed(3)} تا ${sec.kmTo.toFixed(3)} (${(sec.kmTo - sec.kmFrom).toFixed(3)} km)</td></tr>
       <tr><th>ارتفاع کمینه / بیشینه</th><td>${sec.elevMin.toFixed(0)} m / ${sec.elevMax.toFixed(0)} m</td></tr>
       <tr><th>فشار آزمون نقطهٔ بالا / پایین</th><td>${sec.pHigh.toFixed(1)} / ${sec.pLow.toFixed(1)} bar (${sec.hoopLowPct.toFixed(1)}% SMYS)</td></tr>
       <tr><th>فشار روی سر آزمون</th><td>${sec.pHead.toFixed(1)} bar در کیلومتر ${sec.headKm.toFixed(3)}</td></tr>`
    : `<tr><th>بستهٔ آزمون</th><td>${esc(pack!.code)} — ${esc(pack!.title)} (${esc(pack!.station)})</td></tr><tr><th>فشار طراحی / آزمون</th><td>${pack!.designPressureBar} / ${pack!.testPressureBar} bar</td></tr>`
  w.document.write(`<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>Hydrotest ${esc(sec?.code ?? pack!.code)}</title>
  <style>body{font-family:Vazirmatn,Tahoma,sans-serif;margin:32px;color:#0f172a}h1{font-size:19px;margin:0}h2{font-size:13px;color:#475569;margin:4px 0 16px}table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:10px}td,th{border:1px solid #cbd5e1;padding:7px;text-align:right}th{background:#f1f5f9;width:34%}.box{border:2px solid #0f172a;padding:20px;border-radius:8px}</style></head><body><div class="box">
  <h1>گواهی آزمون هیدرواستاتیک</h1><h2>${esc(projectName)}</h2><table>${rows}
  <tr><th>آزمون مقاومت</th><td>${st.hours.toFixed(1)} ساعت · افت ${st.drop.toFixed(2)} bar</td></tr>
  <tr><th>آزمون نشتی</th><td>${lk.hours.toFixed(1)} ساعت · افت ${lk.drop.toFixed(2)} bar</td></tr>
  <tr><th>تعداد قرائت</th><td>${readings.length}</td></tr></table>
  <p style="font-size:13px;line-height:2">آزمون فوق طبق مشخصات پروژه انجام و پذیرفته شد.</p>
  <table><tr><th>پیمانکار</th><td></td></tr><tr><th>مشاور / ناظر</th><td></td></tr><tr><th>کارفرما</th><td></td></tr></table>
  </div><script>window.onload=()=>window.print()</script></body></html>`)
  w.document.close()
}
