import { useState, type CSSProperties } from 'react'
import { BadgeCheck, FileText, Pencil, Plus, Save, Trash2, Users, X } from 'lucide-react'
import { useWqStore } from '../store/useWqStore'
import * as repo from '../repo'
import { fa, faDate } from '../lib/useQc'
import { CREW_MIN_DEFAULT, type CrewMin } from '../lib/filmplan'
import { PASS_FA } from '../lib/rules'

const KIND_FA = { main: 'جوش اصلی خط', repair: 'تعمیر', tie_in: 'تای‌این و اتصال' } as const
const STATUS_FA = { draft: 'پیش‌نویس', approved: 'تأییدشده', withdrawn: 'ابطال‌شده' } as const
const STATUS_COLOR = { draft: '#64748b', approved: '#22c55e', withdrawn: '#ef4444' } as const
type Draft = Partial<repo.Wps> & { wpsNo: string }
const blank = (): Draft => ({ wpsNo: '', rev: '0', kind: 'main', process: 'SMAW', filler: '', positions: '5G', direction: 'downhill', material: 'API 5L X70', pqrNos: '', status: 'draft', approvedBy: '', approvedAt: null, note: '', diaMinIn: null, diaMaxIn: null, thkMinMm: null, thkMaxMm: null })
const num = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/**
 * روش جوشکاری — the project's welding procedures (WPS) with the PQRs that qualify them. Only an approved WPS can be
 * chosen for a weld in the weld log or for a repair. Below it, the least number of welders per pass by diameter.
 */
export function WqWps() {
  const st = useWqStore()
  const can = st.caps.edit || st.caps.configure
  const [d, setD] = useState<Draft | null>(null)
  const used = (id: string) => st.joints.filter((j) => j.wpsId === id).length
  const save = async () => { if (!d) return; const ok = await st.run(`WPS «${d.wpsNo}» ذخیره شد`, () => repo.saveWps(st.projectId!, d, st.me())); if (ok) setD(null) }
  const F = (k: keyof Draft, label: string, extra: { ph?: string; wide?: boolean; ltr?: boolean } = {}) => <label className={extra.wide ? 'is-wide' : ''}><span>{label}</span><input value={String(d?.[k] ?? '')} dir={extra.ltr ? 'ltr' : undefined} placeholder={extra.ph} onChange={(e) => setD({ ...d!, [k]: e.target.value })} /></label>
  const N = (k: 'diaMinIn' | 'diaMaxIn' | 'thkMinMm' | 'thkMaxMm', label: string) => <label><span>{label}</span><input inputMode="decimal" dir="ltr" value={d?.[k] ?? ''} onChange={(e) => setD({ ...d!, [k]: num(e.target.value) })} /></label>

  return (
    <div className="wq-assist">
      <section className="wq-card">
        <header className="wq-card-head"><FileText size={16} aria-hidden /><h3>روش‌های جوشکاری (WPS) و PQR مرتبط</h3>{can && !d && <button type="button" className="ps-btn is-primary wq-head-link" onClick={() => setD(blank())}><Plus size={14} aria-hidden /> WPS جدید</button>}</header>
        <p className="ps-meta">هر WPS با شمارهٔ PQRهایی که آن را تأیید کرده‌اند ثبت می‌شود. فقط WPS «تأییدشده» در دفتر جوش و فرم تعمیر قابل انتخاب است؛ محدودهٔ قطر و ضخامت هنگام انتخاب با مشخصات سرجوش سنجیده می‌شود.</p>
        {d && (
          <form className="wq-form wq-repair" onSubmit={(e) => { e.preventDefault(); void save() }}>
            <b className="is-wide">{d.id ? `ویرایش ${d.wpsNo}` : 'WPS جدید'}</b>
            {F('wpsNo', 'شمارهٔ WPS *', { ltr: true, ph: 'WPS-ML-01' })}{F('rev', 'بازنگری', { ltr: true })}
            <label><span>کاربرد</span><select value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as repo.Wps['kind'] })}>{Object.entries(KIND_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            {F('process', 'فرایند', { ltr: true, ph: 'SMAW / GMAW / FCAW' })}{F('filler', 'الکترود / سیم جوش', { ltr: true, ph: 'E6010 root, E8010-P1 fill' })}{F('positions', 'وضعیت', { ltr: true })}
            <label><span>جهت پیشروی</span><select value={d.direction} onChange={(e) => setD({ ...d, direction: e.target.value })}><option value="downhill">سرپایین</option><option value="uphill">سربالا</option><option value="">—</option></select></label>
            {F('material', 'فلز پایه / گرید', { ltr: true })}
            {N('diaMinIn', 'قطر از (in)')}{N('diaMaxIn', 'قطر تا (in)')}{N('thkMinMm', 'ضخامت از (mm)')}{N('thkMaxMm', 'ضخامت تا (mm)')}
            {F('pqrNos', 'شمارهٔ PQRهای مرتبط', { wide: true, ltr: true, ph: 'PQR-01, PQR-02' })}
            <label><span>وضعیت</span><select value={d.status} onChange={(e) => setD({ ...d, status: e.target.value as repo.Wps['status'] })}>{Object.entries(STATUS_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            {F('approvedBy', 'تأییدکننده (کارفرما / مشاور)')}
            <label><span>تاریخ تأیید</span><input type="date" value={d.approvedAt ?? ''} onChange={(e) => setD({ ...d, approvedAt: e.target.value || null })} /></label>
            {F('note', 'توضیح', { wide: true })}
            {d.status === 'approved' && !d.pqrNos?.trim() && <p className="is-wide ps-hint is-warn">WPS تأییدشده باید دست‌کم یک PQR مرتبط داشته باشد (API 1104 بند 5).</p>}
            <div className="is-wide wq-form-actions"><button type="submit" className="ps-btn is-primary" disabled={!d.wpsNo.trim()}><Save size={14} aria-hidden /> ذخیره</button><button type="button" className="ps-btn is-ghost" onClick={() => setD(null)}><X size={14} aria-hidden /> انصراف</button></div>
          </form>
        )}
        {st.wps.length ? (
          <div className="wq-tbl-wrap"><table className="wq-tbl"><thead><tr><th>WPS</th><th>کاربرد</th><th>فرایند و مصرفی</th><th>محدوده</th><th>PQR</th><th>وضعیت</th><th>سرجوش</th><th aria-label="عملیات" /></tr></thead>
            <tbody>{st.wps.map((w) => (
              <tr key={w.id}>
                <td><b className="ps-code">{w.wpsNo}</b>{w.rev ? <small className="ps-meta"> Rev.{w.rev}</small> : null}</td><td>{KIND_FA[w.kind]}</td>
                <td>{w.process || '—'}{w.filler ? <><br /><small className="ps-meta" dir="ltr">{w.filler}</small></> : null}</td>
                <td>{w.diaMinIn != null || w.diaMaxIn != null ? `${fa(w.diaMinIn ?? 0)}–${w.diaMaxIn != null ? fa(w.diaMaxIn) : '∞'}″` : 'همهٔ قطرها'}<br /><small className="ps-meta">{w.thkMinMm != null || w.thkMaxMm != null ? `${fa(w.thkMinMm ?? 0, 1)}–${w.thkMaxMm != null ? fa(w.thkMaxMm, 1) : '∞'} mm` : 'همهٔ ضخامت‌ها'}{w.positions ? ` · ${w.positions}` : ''}</small></td>
                <td dir="ltr">{w.pqrNos || <small className="ps-meta">ثبت نشده</small>}</td>
                <td><span className="wq-state" style={{ '--c': STATUS_COLOR[w.status] } as CSSProperties}>{w.status === 'approved' && <BadgeCheck size={12} aria-hidden />}{STATUS_FA[w.status]}</span>{w.approvedAt ? <><br /><small className="ps-meta">{w.approvedBy} · {faDate(w.approvedAt)}</small></> : null}</td>
                <td>{fa(used(w.id))}</td>
                <td>{can && <span className="wq-inline"><button type="button" className="ps-x" aria-label={`ویرایش ${w.wpsNo}`} onClick={() => setD({ ...w })}><Pencil size={14} aria-hidden /></button>{used(w.id) === 0 && <button type="button" className="ps-x" aria-label={`حذف ${w.wpsNo}`} onClick={() => { if (window.confirm(`«${w.wpsNo}» از فهرست برداشته شود؟`)) void st.run('WPS برداشته شد', () => repo.removeWps(w.id)) }}><Trash2 size={14} aria-hidden /></button>}</span>}</td>
              </tr>
            ))}</tbody></table></div>
        ) : !d && <p className="ps-hint">هنوز WPS ثبت نشده است. برای انتخاب روش جوشکاری هر سرجوش در دفتر جوش، ابتدا WPSهای تأییدشدهٔ پروژه را این‌جا وارد کنید.</p>}
      </section>
      <CrewMinCard />
    </div>
  )
}

function CrewMinCard() {
  const st = useWqStore()
  const [t, setT] = useState<CrewMin[]>(st.crewMin)
  const can = st.caps.configure
  const dirty = JSON.stringify(t) !== JSON.stringify(st.crewMin)
  const set = (i: number, k: keyof CrewMin, v: string) => setT(t.map((r, j) => (j === i ? { ...r, [k]: Math.max(1, Number(v) || 1) } : r)))
  return (
    <section className="wq-card">
      <header className="wq-card-head"><Users size={16} aria-hidden /><h3>حداقل تعداد جوشکار هر پاس بر حسب قطر</h3></header>
      <p className="ps-meta">پیش‌فرض: تا ۱۰ اینچ یک جوشکار، ۱۲ تا ۳۰ اینچ دو جوشکار و از ۳۶ اینچ به بالا چهار جوشکار برای پاس ریشه و پاس گرم؛ در پاس‌های بعدی تعداد می‌تواند کمتر باشد. دفتر جوش و شناسنامه، سرجوشی را که جوشکار ثبت‌شده‌اش کمتر از این جدول است نشان می‌دهند.</p>
      <div className="wq-tbl-wrap"><table className="wq-tbl"><thead><tr><th>قطر تا (اینچ)</th>{(['root', 'hot', 'fill', 'cap'] as const).map((p) => <th key={p}>{PASS_FA[p]}</th>)}</tr></thead>
        <tbody>{t.map((r, i) => <tr key={i}><td><input className="wq-num" type="number" min={1} disabled={!can || i === t.length - 1} value={i === t.length - 1 ? '' : r.maxIn} placeholder={i === t.length - 1 ? 'بالاتر' : ''} onChange={(e) => set(i, 'maxIn', e.target.value)} aria-label="قطر تا" /></td>{(['root', 'hot', 'fill', 'cap'] as const).map((p) => <td key={p}><input className="wq-num" type="number" min={1} max={8} disabled={!can} value={r[p]} onChange={(e) => set(i, p, e.target.value)} aria-label={`${PASS_FA[p]} — حداقل جوشکار`} /></td>)}</tr>)}</tbody></table></div>
      {can ? <div className="wq-form-actions"><button type="button" className="ps-btn is-primary" disabled={!dirty} onClick={() => void st.run('جدول حداقل جوشکار ذخیره شد', () => repo.saveCriteria(st.projectId!, { ...((st.criteria as object | null) ?? {}), crewMin: t }))}><Save size={14} aria-hidden /> ذخیره</button><button type="button" className="ps-btn is-ghost" onClick={() => setT(CREW_MIN_DEFAULT)}>بازگشت به پیش‌فرض</button></div> : <p className="ps-hint">تغییر این جدول با سطح دسترسی «مدیریت» است.</p>}
    </section>
  )
}
