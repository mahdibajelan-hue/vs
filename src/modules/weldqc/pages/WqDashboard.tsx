import { useMemo, type CSSProperties } from 'react'
import { ArrowLeft, ClipboardCheck, FileImage, Flame, Gauge, ScanSearch, ShieldCheck, Signature, Wrench } from 'lucide-react'
import { useWqStore } from '../store/useWqStore'
import { fa, monthKey, monthLabel, useQc, weldLabel } from '../lib/useQc'
import { QC_STATE_COLOR, QC_STATE_FA, repairAnalysis, welderReport, type QcState } from '../lib/analytics'
import { DEFECT_COLOR, DEFECT_FA, DEFECT_TYPES } from '../lib/rules'
import type { WqTab } from '../WeldQcApp'

const STATES: QcState[] = ['no_film', 'quality', 'interpret', 'to_sign', 'repair_due', 'reshoot', 'accepted', 'cut_out']

export function WqDashboard({ onOpen, onGo }: { onOpen: (id: string) => void; onGo: (t: WqTab, filter?: string) => void }) {
  const st = useWqStore()
  const q = useQc()
  const counts = useMemo(() => { const c = Object.fromEntries(STATES.map((s) => [s, 0])) as Record<QcState, number>; for (const r of q.rows) c[r.state]++; return c }, [q.rows])
  const ra = useMemo(() => repairAnalysis({ evals: q.qEvals, defects: q.qDefects, repairs: st.repairs.map((r) => ({ weldId: r.weldId, round: r.round, performedBy: r.performedBy, method: r.method, at: r.createdAt })), monthOf: monthKey }), [q, st.repairs])
  const welders = useMemo(() => welderReport({ welds: q.qWelds, evals: q.qEvals, defects: q.qDefects, monthOf: monthKey }).filter((w) => w.evaluated > 0), [q])
  const types = useMemo(() => { const m = new Map<string, number>(); for (const d of st.defects) if (!d.removed) m.set(d.type, (m.get(d.type) ?? 0) + 1); return DEFECT_TYPES.map((t) => ({ t, n: m.get(t) ?? 0 })).filter((x) => x.n) .sort((a, b) => b.n - a.n) }, [st.defects])
  const maxType = Math.max(1, ...types.map((x) => x.n))
  const welded = q.rows.filter((r) => r.weld.welding).length
  const total = q.rows.length

  // the work waiting for the signed-in person, by what they may do here
  const inbox = [
    st.caps.submit && { k: 'quality', icon: FileImage, label: 'فیلم منتظر بررسی کیفیت', n: counts.quality },
    st.caps.submit && { k: 'interpret', icon: ScanSearch, label: 'منتظر تفسیر و ارزیابی', n: counts.interpret },
    st.caps.approve && { k: 'to_sign', icon: Signature, label: 'منتظر تأیید بازرس NDT', n: counts.to_sign },
    st.caps.edit && { k: 'repair_due', icon: Wrench, label: 'منتظر ثبت تعمیر', n: counts.repair_due },
    st.caps.submit && { k: 'reshoot', icon: FileImage, label: 'منتظر فیلم پس از تعمیر', n: counts.reshoot },
  ].filter(Boolean) as { k: QcState; icon: typeof Flame; label: string; n: number }[]

  if (!total) return (
    <div className="ps-hero-empty wq-rise"><ScanSearch size={34} aria-hidden /><b>هنوز سرجوشی در فهرست مرکزی جوش‌ها نیست</b>
      <p>سرجوش‌ها از گزارش‌های جوشکاری «مدیریت اجرا» ساخته می‌شوند (فرم جوشکاری یا تای‌این با شماره مقطع و سرجوش و مهر جوشکار هر پاس). پس از ثبت اولین گزارش، سرجوش‌ها اینجا آمادهٔ رادیوگرافی و تفسیر هستند.</p>
      <button type="button" className="ps-btn is-primary" onClick={() => onGo('guide')}>راهنمای گام‌به‌گام <ArrowLeft size={14} aria-hidden /></button></div>
  )

  return (
    <div className="wq-dash">
      <section className="wq-hero wq-rise">
        <div className="wq-hero-txt">
          <span className="wq-kicker"><ShieldCheck size={14} aria-hidden /> وضعیت کیفی جوش‌های پروژه</span>
          <h2>{fa(ra.firstRepairPct, 1)}٪ <small>نرخ تعمیر در اولین رادیوگرافی</small></h2>
          <p>{fa(ra.evaluated)} سرجوش از {fa(total)} سرجوش فهرست مرکزی رادیوگرافی و ارزیابی شده{welded < total ? ` (${fa(welded)} سرجوش گزارش جوشکاری دارند)` : ''}. {ra.repairs ? `${fa(ra.repairs)} تعمیر ثبت شده و ${fa(ra.successPct, 0)}٪ تعمیرهای بررسی‌شده در رادیوگرافی بعدی پذیرفته شده‌اند.` : 'هنوز تعمیری ثبت نشده است.'}</p>
        </div>
        <div className="wq-ring" role="img" aria-label={`${fa(counts.accepted)} پذیرفته، ${fa(counts.cut_out)} برش از ${fa(total)} سرجوش`}>
          <svg viewBox="0 0 120 120" aria-hidden>
            {(() => { let off = 0; const C = 2 * Math.PI * 50; return STATES.map((s) => { const f = counts[s] / Math.max(1, total); const el = f > 0 ? <circle key={s} cx="60" cy="60" r="50" fill="none" stroke={QC_STATE_COLOR[s]} strokeWidth="14" strokeDasharray={`${C * f} ${C}`} strokeDashoffset={-C * off} transform="rotate(-90 60 60)" /> : null; off += f; return el }) })()}
          </svg>
          <b>{fa(Math.round(((counts.accepted + counts.cut_out) / Math.max(1, total)) * 100))}٪<small>پرونده بسته</small></b>
        </div>
      </section>

      {inbox.length > 0 && (
        <section className="wq-inbox wq-rise" style={{ '--i': 1 } as CSSProperties} aria-label="کارهای منتظر شما">
          {inbox.map(({ k, icon: I, label, n }) => (
            <button key={k} type="button" className={`wq-inbox-item ${n ? '' : 'is-zero'}`} style={{ '--c': QC_STATE_COLOR[k] } as CSSProperties} onClick={() => onGo('joints', k)}>
              <span className="wq-inbox-ico"><I size={17} aria-hidden /></span><span><b>{fa(n)}</b><small>{label}</small></span><ArrowLeft size={14} aria-hidden />
            </button>
          ))}
        </section>
      )}

      <section className="wq-card wq-rise" style={{ '--i': 2 } as CSSProperties}>
        <header className="wq-card-head"><ClipboardCheck size={16} aria-hidden /><h3>مسیر پرونده‌ها</h3><span className="ps-meta">روی هر مرحله بزنید تا سرجوش‌هایش را ببینید</span></header>
        <div className="wq-flow">
          {STATES.map((s) => (
            <button key={s} type="button" className="wq-flow-step" style={{ '--c': QC_STATE_COLOR[s] } as CSSProperties} onClick={() => onGo('joints', s)}>
              <b>{fa(counts[s])}</b><span>{QC_STATE_FA[s]}</span><i style={{ '--w': `${(counts[s] / Math.max(1, total)) * 100}%` } as CSSProperties} />
            </button>
          ))}
        </div>
      </section>

      <div className="wq-grid2">
        <section className="wq-card wq-rise" style={{ '--i': 3 } as CSSProperties}>
          <header className="wq-card-head"><Gauge size={16} aria-hidden /><h3>عیوب ثبت‌شده به تفکیک نوع</h3></header>
          {types.length ? <ul className="wq-bars">{types.map(({ t, n }) => (
            <li key={t}><span>{DEFECT_FA[t]}</span><i style={{ '--w': `${(n / maxType) * 100}%`, '--c': DEFECT_COLOR[t] } as CSSProperties} /><b>{fa(n)}</b></li>
          ))}</ul> : <p className="ps-hint">هنوز عیبی ثبت نشده است.</p>}
        </section>
        <section className="wq-card wq-rise" style={{ '--i': 4 } as CSSProperties}>
          <header className="wq-card-head"><Flame size={16} aria-hidden /><h3>جوشکاران با بیشترین نرخ تعمیر</h3><button type="button" className="ps-link wq-head-link" onClick={() => onGo('welders')}>گزارش کامل</button></header>
          {welders.length ? <ul className="wq-bars is-welders">{welders.slice(0, 6).map((w) => (
            <li key={w.key}><span><b className="ps-code">{w.key}</b> {q.nameOf(w.key) !== w.key ? q.nameOf(w.key) : ''}</span><i style={{ '--w': `${Math.min(100, w.repairPct)}%`, '--c': w.repairPct > 10 ? '#ef4444' : w.repairPct > 5 ? '#f59e0b' : '#22c55e' } as CSSProperties} /><b>{fa(w.repairPct, 1)}٪</b></li>
          ))}</ul> : <p className="ps-hint">پس از اولین ارزیابی، نرخ تعمیر هر جوشکار اینجا می‌آید.</p>}
        </section>
      </div>

      {ra.months.length > 0 && (
        <section className="wq-card wq-rise" style={{ '--i': 5 } as CSSProperties}>
          <header className="wq-card-head"><Wrench size={16} aria-hidden /><h3>روند ماهانهٔ نرخ تعمیر</h3></header>
          <div className="wq-cols" role="img" aria-label="نرخ تعمیر هر ماه">
            {ra.months.map((m) => (
              <div key={m.key} className="wq-col" title={`${monthLabel(m.key)}: ${fa(m.repaired)} از ${fa(m.evaluated)}`}>
                <b>{fa(m.rate, 0)}٪</b><i style={{ '--h': `${Math.max(4, m.rate)}%`, '--c': m.rate > 10 ? '#ef4444' : m.rate > 5 ? '#f59e0b' : '#22c55e' } as CSSProperties} /><span>{monthLabel(m.key)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {q.rows.some((r) => r.state === 'to_sign' || r.state === 'repair_due') && (
        <section className="wq-card wq-rise" style={{ '--i': 6 } as CSSProperties}>
          <header className="wq-card-head"><Signature size={16} aria-hidden /><h3>آخرین ارزیابی‌های باز</h3></header>
          <ul className="wq-list">{q.rows.filter((r) => r.state === 'to_sign' || r.state === 'repair_due').slice(0, 8).map((r) => (
            <li key={r.weld.id}><button type="button" onClick={() => onOpen(r.weld.id)}><b>{weldLabel(r.weld)}</b><span className="wq-state" style={{ '--c': QC_STATE_COLOR[r.state] } as CSSProperties}>{QC_STATE_FA[r.state]}</span><ArrowLeft size={14} aria-hidden /></button></li>
          ))}</ul>
        </section>
      )}
    </div>
  )
}
