import { Printer } from 'lucide-react'
import { ModalPortal } from '../../../components/common/ModalPortal'
import { fmtD } from '../../finance/components/fn'
import { FORM_BY_KEY, SIGNER_LABEL_FA, STOPPAGE_CATEGORY_FA, type FormDef } from '../lib/formCatalog'
import type { MetricRow } from '../lib/forms'
import { REPORT_STATUS_LABEL_FA, type Activity, type Report, type ReportLine, type ReportResource, type Stoppage } from '../types'
import { fa } from './common'

export interface PaperCtx {
  projectName: string; orgName: string; people: Map<string, string>
  report: Report; form: FormDef | null; lines: ReportLine[]; resources: ReportResource[]; stoppages: Stoppage[]
  acts: Map<string, Activity>
  /** work report: cumulative before the date, per activity */
  prev?: Map<string, number>; baseOf?: (a: Activity) => number
  metrics?: MetricRow[]
}

const WEATHER_FA: Record<string, string> = { sunny: 'آفتابی', cloudy: 'ابری', rainy: 'بارانی', snowy: 'برفی', stormy: 'طوفانی (باد و خاک)' }
const optLabel = (form: FormDef, key: string, v: unknown): string => {
  const f = [...form.header, ...form.columns].find((x) => x.key === key)
  const o = f?.options?.find((x) => x.value === String(v))
  return o ? o.label : v == null ? '' : String(v)
}

/** The printable, archive-ready paper of a report: title, number/date/status, info grid, table, counters, resources, signatures. */
export function ReportPaper({ c }: { c: PaperCtx }) {
  const { report: r, form } = c
  const title = form ? form.title : 'گزارش کارکرد روزانه'
  const signers = form ? form.signers : (['contractor', 'supervision'] as const)
  const who = (u: string | null) => (u ? c.people.get(u) ?? 'کاربر' : '')
  const when = (iso: string | null) => (iso ? `${fmtD(iso.slice(0, 10))} ${new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}` : '')
  const info: [string, string][] = [
    ['تاریخ گزارش', fmtD(r.reportDate)], ['پیمانکار', c.orgName || '—'], ['جبهه کاری', r.front || '—'], ['ایستگاه / محدوده', r.station || '—'],
    ['شیفت', r.shift === 'night' ? 'شب' : 'روز'], ['آب‌وهوا', WEATHER_FA[String(r.data.weather ?? '')] ?? '—'],
    ...(form ? form.header.filter((h) => r.data[h.key] != null && r.data[h.key] !== '').map((h) => [h.label, optLabel(form, h.key, r.data[h.key])] as [string, string]) : []),
  ]
  return (
    <div className="ex-paper mt-printable">
      <header className="ex-paper-head">
        <div><small style={{ color: '#4b5563' }}>{c.projectName}</small><h2>{title}</h2>{form && <small style={{ color: '#6b7280' }}>{form.en}</small>}</div>
        <div style={{ textAlign: 'end', display: 'grid', gap: 2 }}><span>شمارهٔ گزارش: <b>{r.reportNo}</b></span><span>وضعیت: <b>{REPORT_STATUS_LABEL_FA[r.status]}</b></span>{r.completionOf && <span style={{ color: '#9a3412' }}>گزارش تکمیلی</span>}</div>
      </header>
      <div className="ex-paper-info">{info.map(([k, v]) => <div key={k}><small>{k}</small><b>{v}</b></div>)}</div>

      {!form ? (
        <table>
          <thead><tr><th>ردیف</th><th>ردیف فهرست‌بها</th><th>شرح فعالیت</th><th>واحد</th><th>محل / کیلومتر</th><th className="num">امروز</th><th className="num">تا روز قبل</th><th className="num">تجمعی جدید</th><th className="num">باقی‌مانده</th><th>وضعیت</th></tr></thead>
          <tbody>{c.lines.map((l, i) => { const a = l.activityId ? c.acts.get(l.activityId) : undefined; const prev = c.prev?.get(l.activityId ?? '') ?? 0; const base = a && c.baseOf ? c.baseOf(a) : 0
            return <tr key={l.id}><td className="num">{fa(i + 1)}</td><td>{a?.itemNo}</td><td>{a?.title}{l.note ? <small style={{ display: 'block', color: '#6b7280' }}>{l.note}</small> : null}</td><td>{a?.unit}</td><td>{[l.location, l.kmFrom != null ? `km ${l.kmFrom}${l.kmTo != null ? `–${l.kmTo}` : ''}` : ''].filter(Boolean).join(' · ') || '—'}</td>
              <td className="num"><b>{fa(l.qty, 2)}</b></td><td className="num">{fa(prev, 2)}</td><td className="num">{fa(prev + l.qty, 2)}</td><td className="num">{base ? fa(Math.max(0, base - prev - l.qty), 2) : '—'}</td><td>{l.status === 'approved' ? `تأیید ${fa(l.approvedQty ?? l.qty, 2)}` : l.status === 'pending' ? 'در انتظار' : l.status === 'rejected' ? 'رد' : 'برگشت'}</td></tr> })}</tbody>
        </table>
      ) : form.columns.length > 0 && (
        <table>
          <thead><tr><th>ردیف</th>{form.columns.map((col) => <th key={col.key}>{col.label}</th>)}</tr></thead>
          <tbody>{c.lines.map((l, i) => <tr key={l.id}><td className="num">{fa(i + 1)}</td>{form.columns.map((col) => <td key={col.key} className={col.kind === 'num' || col.kind === 'km' ? 'num' : undefined}>{col.kind === 'date' ? fmtD(String(l.detail[col.key] ?? '')) : (col.kind === 'num' || col.kind === 'km') && l.detail[col.key] !== '' && l.detail[col.key] != null ? fa(Number(l.detail[col.key]), 3) : optLabel(form, col.key, l.detail[col.key])}</td>)}</tr>)}</tbody>
        </table>
      )}

      {c.metrics && c.metrics.length > 0 && (
        <table>
          <thead><tr><th>شاخص</th><th>گروه</th><th className="num">تا روز قبل</th><th className="num">امروز</th><th className="num">تا امروز</th></tr></thead>
          <tbody>{c.metrics.map((m, i) => <tr key={i}><td>{m.metric.label} ({m.metric.unit})</td><td>{m.group || '—'}</td><td className="num">{fa(m.prior, 2)}</td><td className="num"><b>{fa(m.today, 2)}</b></td><td className="num">{fa(m.total, 2)}</td></tr>)}</tbody>
        </table>
      )}

      {c.resources.length > 0 && (
        <table>
          <thead><tr><th>نفرات و ماشین‌آلات</th><th className="num">فعال</th><th className="num">غیرفعال</th><th className="num">ساعت کار</th></tr></thead>
          <tbody>{c.resources.map((x) => <tr key={x.id}><td>{x.kind === 'man' ? 'نیرو' : 'ماشین'} — {x.name}</td><td className="num">{fa(x.activeQty)}</td><td className="num">{fa(x.idleQty)}</td><td className="num">{fa(x.hours, 1)}</td></tr>)}</tbody>
        </table>
      )}
      {c.stoppages.length > 0 && (
        <table>
          <thead><tr><th>عامل توقف / مشکل</th><th className="num">ساعت</th><th>شرح</th></tr></thead>
          <tbody>{c.stoppages.map((x) => <tr key={x.id}><td>{STOPPAGE_CATEGORY_FA[x.category]}</td><td className="num">{fa(x.hours, 1)}</td><td>{x.description}</td></tr>)}</tbody>
        </table>
      )}
      {!!(r.notes || r.data.hse || r.data.problems) && <p style={{ margin: 0, padding: '6px 9px', border: '1px dashed #9ca3af' }}>{r.notes && <><b>توضیحات: </b>{r.notes} </>}{r.data.hse ? <><b>HSE: </b>{String(r.data.hse)} </> : null}{r.data.problems ? <><b>مشکلات اجرایی: </b>{String(r.data.problems)}</> : null}</p>}
      {r.reviewNote && <p style={{ margin: 0 }}><b>نظر دستگاه نظارت: </b>{r.reviewNote}</p>}

      <div className="ex-paper-sign">
        {signers.map((s) => (
          <div key={s}>
            <small>{SIGNER_LABEL_FA[s]}</small>
            {s === 'contractor' ? <span>{who(r.submittedBy ?? r.createdBy)}<br /><small>{when(r.submittedAt)}</small></span>
              : s === 'supervision' ? <span>{r.reviewedAt && (r.status === 'approved' || r.status === 'partially_approved') ? <>{who(r.reviewedBy)}<br /><small>{when(r.reviewedAt)}</small></> : <small>— امضا و تأیید پس از بررسی —</small>}</span>
              : <span />}
          </div>
        ))}
      </div>
      <footer className="ex-paper-foot"><span>نسخهٔ بایگانی — سامانهٔ فرین</span><span>{r.reportNo}{form ? ` · ${FORM_BY_KEY[form.key]?.sheet}` : ''}</span><span>چاپ: {new Date().toLocaleDateString('fa-IR')}</span></footer>
    </div>
  )
}

export function PaperModal({ c, onClose }: { c: PaperCtx; onClose: () => void }) {
  const print = () => { document.body.classList.add('mt-printing'); const off = () => { document.body.classList.remove('mt-printing'); window.removeEventListener('afterprint', off) }; window.addEventListener('afterprint', off); window.print() }
  return (
    <ModalPortal>
      <div className="im-overlay">
        <div className="im-modal" style={{ maxWidth: 1000 }} role="dialog" aria-modal="true" aria-label="پیش‌نمایش چاپ">
          <div className="im-modal-head"><div><h3 className="im-modal-title">پیش‌نمایش چاپ — {c.report.reportNo}</h3></div><button className="im-modal-close" onClick={onClose} aria-label="بستن">✕</button></div>
          <div style={{ padding: '0 18px 8px', overflow: 'auto', maxHeight: '72vh' }}><ReportPaper c={c} /></div>
          <div className="fn-form-foot no-print"><button className="im-btn im-btn-primary" onClick={print}><Printer size={14} /> چاپ</button><button className="im-btn" onClick={onClose}>بستن</button></div>
        </div>
      </div>
    </ModalPortal>
  )
}
