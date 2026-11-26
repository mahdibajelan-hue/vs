import type { ReactNode } from 'react'
import { DecInput } from '../../material/components/control/DecInput'
import { fmtD } from '../../finance/components/fn'
import { STOPPAGE_CATEGORY_FA, type FieldDef, type FormDef } from '../lib/formCatalog'
import { EQUIP_COLS, MAN_COLS, resUsed } from '../lib/resourceCatalog'
import { RES_COL, fixPath, sameValue, type ReportFix } from '../lib/reviewFixes'
import type { Activity, Report, ReportLine, ReportResource, Stoppage } from '../types'
import { GROUND_OPTS, SITE_OPTS, WEATHER_OPTS } from './WeatherCard'
import { fa } from './common'

type Opt = { value: string; label: string }
export type FixDraft = Record<string, { value: unknown; label: string }>

/** the contractor's figure struck through and the supervision's figure in red beside it */
export function FixMark({ fix, show, children }: { fix?: ReportFix; show: (v: unknown) => ReactNode; children: ReactNode }) {
  if (!fix) return <>{children}</>
  return (
    <span className="ex-fixmark" title={`اصلاح دستگاه نظارت${fix.fixedByName ? ` — ${fix.fixedByName}` : ''} · ${fmtD(fix.fixedAt.slice(0, 10))}${fix.note ? ` · ${fix.note}` : ''}`}>
      <s aria-label="مقدار پیمانکار">{show(fix.was)}</s><b aria-label="مقدار نظارت">{children}</b>
    </span>
  )
}

const optShow = (opts: Opt[] | undefined) => (v: unknown) => { const s = v == null ? '' : String(v); if (!s) return '—'; return opts?.find((o) => o.value === s)?.label ?? s }
const numShow = (d = 3) => (v: unknown) => (v == null || v === '' ? '—' : Number.isFinite(Number(v)) ? fa(Number(v), d) : String(v))

/**
 * The figures of a sent report as the supervision reviews them. Read mode shows every value with the corrections
 * marked; edit mode turns each figure into a field — what the supervision types there becomes its correction.
 */
export function ReviewSheet(p: {
  report: Report; form: FormDef | null; lines: ReportLine[]; resources: ReportResource[]; stoppages: Stoppage[]; acts: Map<string, Activity>
  fixes: Map<string, ReportFix>; editing: boolean; draft: FixDraft; onDraft: (path: string, value: unknown, label: string) => void
}) {
  const { report: r, form, fixes, editing, draft } = p
  const cell = (path: string, label: string, current: unknown, kind: 'num' | 'signed' | 'text' | 'select', opts?: Opt[], d = 3) => {
    const show = kind === 'select' ? optShow(opts) : kind === 'text' ? (v: unknown) => (v == null || v === '' ? '—' : String(v)) : numShow(d)
    const fix = fixes.get(path)
    if (!editing) return <FixMark fix={fix} show={show}>{show(current)}</FixMark>
    const v = path in draft ? draft[path].value : current
    const original = fix ? fix.was : current
    const changed = !sameValue(v, original)
    const set = (x: unknown) => p.onDraft(path, x, label)
    return (
      <span className={`ex-fixcell${changed ? ' on' : ''}`}>
        {changed && <s className="ex-fixwas" title="مقدار پیمانکار">{show(original)}</s>}
        {kind === 'select' ? <select value={String(v ?? '')} onChange={(e) => set(e.target.value)} aria-label={label}><option value="">—</option>{opts?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          : kind === 'text' ? <input value={String(v ?? '')} onChange={(e) => set(e.target.value)} aria-label={label} dir="auto" />
          : <DecInput value={Number(v) || 0} onValue={(n) => set(n)} label={label} signed={kind === 'signed'} />}
      </span>
    )
  }
  const D = (key: string) => r.data[key]

  if (form) {
    const fcell = (f: FieldDef, path: string, cur: unknown, label: string) => cell(path, label, cur, f.kind === 'num' || f.kind === 'km' ? 'num' : f.kind === 'select' ? 'select' : 'text', f.options)
    return (
      <div className="im-card ex-rv">
        <h4>اطلاعات ثبت‌شدهٔ پیمانکار</h4>
        {form.header.length > 0 && <div className="ex-rv-grid">{form.header.map((h) => <div key={h.key}><small>{h.label}</small><b>{fcell(h, fixPath.data(h.key), D(h.key), h.label)}</b></div>)}</div>}
        {form.columns.length > 0 && (
          <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}>
            <table className="ex-lines ex-rv-tbl">
              <thead><tr><th>#</th>{form.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
              <tbody>{p.lines.length === 0 ? <tr><td colSpan={form.columns.length + 1} className="fn-empty">ردیفی ثبت نشده است.</td></tr> : p.lines.map((l, i) => (
                <tr key={l.id}><td>{fa(i + 1)}</td>{form.columns.map((c) => <td key={c.key} className={c.kind === 'num' || c.kind === 'km' ? 'num' : undefined}>{c.kind === 'date' ? fmtD(String(l.detail[c.key] ?? '')) : l.status !== 'pending' && editing ? optShow(c.options)(l.detail[c.key]) : fcell(c, fixPath.cell(l.id, c.key), l.detail[c.key], `ردیف ${i + 1} — ${c.label}`)}</td>)}</tr>))}</tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  const res = (kind: 'man' | 'equip') => {
    const list = p.resources.filter((x) => x.kind === kind && resUsed(x))
    if (!list.length) return null
    const cols = kind === 'man' ? MAN_COLS : EQUIP_COLS
    const sections = [...new Set(list.map((x) => x.section))]
    return (
      <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}>
        <table className="ex-lines ex-rv-tbl">
          <thead><tr><th>{kind === 'man' ? 'نیروی انسانی — قسمت / شغل' : 'ماشین‌آلات — قسمت / تجهیز'}</th>{cols.map(([f, l]) => <th key={f} className="num">{l}</th>)}</tr></thead>
          <tbody>{sections.map((sec) => [
            <tr key={`s${sec}`} className="ex-rv-sec"><td colSpan={cols.length + 1}><b>{sec || '—'}</b></td></tr>,
            ...list.filter((x) => x.section === sec).map((x) => <tr key={x.id}><td>{x.name}</td>{cols.map(([f, l]) => <td key={f} className="num">{cell(fixPath.res(x.id, RES_COL[f]), `${x.name} — ${l}`, x[f], 'num', undefined, 0)}</td>)}</tr>),
          ])}</tbody>
        </table>
      </div>
    )
  }
  const texts: [string, string][] = [['hse', 'موارد مهم HSE'], ['qc', 'بازرسی و کنترل کیفیت'], ['problems', 'مشکلات اجرایی']]
  return (
    <div className="im-card ex-rv">
      <h4>وضعیت سایت و هوا</h4>
      <div className="ex-rv-grid">
        <div><small>وضعیت هوا</small><b>{cell(fixPath.data('weather'), 'وضعیت هوا', D('weather'), 'select', WEATHER_OPTS)}</b></div>
        <div><small>کمینهٔ دما (°C)</small><b>{cell(fixPath.data('tempMin'), 'کمینهٔ دما', D('tempMin'), 'signed', undefined, 1)}</b></div>
        <div><small>بیشینهٔ دما (°C)</small><b>{cell(fixPath.data('tempMax'), 'بیشینهٔ دما', D('tempMax'), 'signed', undefined, 1)}</b></div>
        <div><small>رطوبت (٪)</small><b>{cell(fixPath.data('humidity'), 'رطوبت', D('humidity'), 'num', undefined, 0)}</b></div>
        <div><small>ساعت کار مفید</small><b>{cell(fixPath.data('usefulHours'), 'ساعت کار مفید', D('usefulHours'), 'num', undefined, 1)}</b></div>
        <div><small>وضعیت کارگاه</small><b>{cell(fixPath.data('siteStatus'), 'وضعیت کارگاه', D('siteStatus'), 'select', SITE_OPTS)}</b></div>
        <div><small>وضعیت زمین</small><b>{cell(fixPath.data('groundStatus'), 'وضعیت زمین', D('groundStatus'), 'select', GROUND_OPTS)}</b></div>
      </div>
      {res('man')}
      {res('equip')}
      {p.stoppages.length > 0 && (
        <table className="ex-lines ex-rv-tbl">
          <thead><tr><th>توقف / مشکل</th><th className="num">ساعت</th><th>شرح</th></tr></thead>
          <tbody>{p.stoppages.map((s) => <tr key={s.id}><td>{STOPPAGE_CATEGORY_FA[s.category]}</td><td className="num">{cell(fixPath.stop(s.id), `توقف ${STOPPAGE_CATEGORY_FA[s.category]} — ساعت`, s.hours, 'num', undefined, 1)}</td><td>{s.description}</td></tr>)}</tbody>
        </table>
      )}
      {p.lines.length > 0 && (
        <table className="ex-lines ex-rv-tbl">
          <thead><tr><th>فعالیت</th><th className="num">کارکرد</th></tr></thead>
          <tbody>{p.lines.map((l) => { const a = l.activityId ? p.acts.get(l.activityId) : undefined; const t = a?.title ?? String(l.detail.actionTitle ?? '—')
            return <tr key={l.id}><td>{t}{a && <span className="sub fn-code"> {a.itemNo} · {a.unit}</span>}</td><td className="num">{l.status !== 'pending' && editing ? fa(l.qty, 3) : cell(fixPath.qty(l.id), `کارکرد ${t}`, l.qty, 'num')}</td></tr> })}</tbody>
        </table>
      )}
      {texts.some(([k]) => D(k) || editing) && <div className="ex-rv-grid">{texts.map(([k, l]) => (D(k) || editing) && <div key={k} className="wide"><small>{l}</small><b>{cell(fixPath.data(k), l, D(k), 'text')}</b></div>)}</div>}
    </div>
  )
}
