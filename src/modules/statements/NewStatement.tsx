import { useMemo, useState, type CSSProperties } from 'react'
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from 'lucide-react'
import { usePstStore, type Preview } from './store/usePstStore'
import { PART_META, PARTS, recentPeriods, type Part, type Period } from './lib/stmtCore'
import { Deductions, Figures, LinesTable, Warnings } from './Sheet'
import { fa, Ledger, short } from './ui'

/**
 * صورت‌وضعیت جدید — four short steps: contract → part → month → preview. Nothing is typed: the preview is computed from
 * the source module of the part at the end of the month, against the previous statement; «ساخت» saves it as a draft.
 */
export function NewStatement({ initial, onDone }: { initial?: { contractId?: string; part?: Part }; onDone: (id: string | null) => void }) {
  const st = usePstStore()
  const [contractId, setContractId] = useState(initial?.contractId ?? (st.contracts.length === 1 ? st.contracts[0].id : ''))
  const [part, setPart] = useState<Part | null>(initial?.part ?? null)
  const [period, setPeriod] = useState<Period | null>(null)
  const [pv, setPv] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const months = useMemo(() => recentPeriods(new Date().toISOString().slice(0, 10), 18), [])
  const step = !contractId ? 1 : !part ? 2 : !pv ? 3 : 4
  const mine = st.statements.filter((s) => s.contractId === contractId && s.part === part)
  const lastTo = mine.map((s) => s.to).sort().at(-1) ?? ''
  const open = mine.find((s) => s.status === 'draft' || s.status === 'submitted' || s.status === 'rejected')
  const run = async (p: Period) => { setPeriod(p); setPv(null); setBusy(true); setPv(await st.preview(contractId, part!, p)); setBusy(false) }
  const create = async () => { if (!pv) return; setBusy(true); const id = await st.save(pv); setBusy(false); if (id) onDone(id) }

  return (
    <div className="ps-stack">
      <ol className="pst-steps" aria-label="مراحل">
        {['قرارداد', 'بخش صورت‌وضعیت', 'ماه', 'پیش‌نمایش و ساخت'].map((t, i) => <li key={t} className={i + 1 === step ? 'is-on' : i + 1 < step ? 'is-done' : ''}><span>{fa(i + 1)}</span>{t}</li>)}
      </ol>

      <section className="ps-card">
        <header className="ps-card-head"><b>۱. کدام قرارداد؟</b></header>
        <div className="pst-choices">
          {st.contracts.map((c) => (
            <button key={c.id} type="button" className="pst-choice" aria-pressed={c.id === contractId} onClick={() => { setContractId(c.id); setPv(null); setPeriod(null) }}>
              <small dir="ltr" style={{ textAlign: 'right' }}>{c.no}</small><b>{c.title}</b><small>سقف (مبلغ + الحاقیه‌ها): {short(c.cap)} ریال</small>
            </button>
          ))}
        </div>
      </section>

      {contractId && (
        <section className="ps-card">
          <header className="ps-card-head"><b>۲. صورت‌وضعیت کدام بخش؟</b></header>
          <div className="pst-choices">
            {PARTS.map((p) => (
              <button key={p} type="button" className="pst-choice" aria-pressed={p === part} style={{ '--pc': PART_META[p].color } as CSSProperties} onClick={() => { setPart(p); setPv(null); setPeriod(null) }}>
                <span className="pst-big">{p}</span><b>{PART_META[p].long}</b><small>منبع: {PART_META[p].source}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {contractId && part && (
        <section className="ps-card">
          <header className="ps-card-head"><b>۳. صورت‌وضعیت کدام ماه؟</b>{lastTo && <small style={{ color: 'var(--text-muted)' }}>{fa(mine.length)} صورت‌وضعیت قبلی؛ فقط ماه‌های بعد از آن قابل انتخاب است</small>}</header>
          {open ? <p className="ps-hint is-warn">صورت‌وضعیت شمارهٔ {fa(open.no)} این بخش هنوز باز است ({open.status === 'draft' ? 'پیش‌نویس' : open.status === 'submitted' ? 'در بررسی' : 'برگشتی'})؛ ابتدا آن را به تأیید برسانید یا باطل کنید.</p> : (
            <div className="pst-months">
              {months.map((m) => { const taken = !!lastTo && m.from <= lastTo; return <button key={m.key} type="button" className="pst-month" aria-pressed={period?.key === m.key} disabled={taken || busy} title={taken ? 'این ماه پیش از آخرین صورت‌وضعیت است' : undefined} onClick={() => void run(m)}>{m.label}</button> })}
            </div>
          )}
        </section>
      )}

      {busy && !pv && <div className="pst-empty"><Loader2 className="animate-spin" /> در حال خواندن {part && PART_META[part].source}…</div>}

      {pv && period && part && (
        <section className="ps-card" style={{ '--pc': PART_META[part].color } as CSSProperties}>
          <header className="ps-card-head"><b><Sparkles size={15} /> ۴. پیش‌نمایش صورت‌وضعیت {PART_META[part].title} — {period.label}</b><small style={{ color: 'var(--text-muted)' }}>{pv.prev ? `قبلی: شمارهٔ ${fa(pv.prev.no)} (${pv.prev.periodKey})` : 'اولین صورت‌وضعیت این بخش'}</small></header>
          <Warnings list={pv.built.warnings} t={pv.totals} />
          <Ledger prev={pv.totals.prevAmount} now={pv.totals.thisAmount} cap={pv.totals.cap} color={PART_META[part].color} />
          <Figures t={pv.totals} part={part} />
          <div style={{ display: 'grid', gap: '.8rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 22rem), 1fr))' }}>
            <Deductions t={pv.totals} rates={pv.rates} />
            <p className="ps-hint" style={{ lineHeight: 2 }}>مبلغ هر ردیف از داده‌های ماژول منبع تا پایان {period.label} حساب شده و هرگز از مبلغ پذیرفته‌شدهٔ صورت‌وضعیت قبلی کمتر نمی‌شود. پس از ساخت، پیش‌نویس را بررسی کنید؛ مبلغ تجمعی هر ردیف را می‌توان (با ثبت سابقه) اصلاح کرد و سپس برای بررسی فرستاد.</p>
          </div>
          <LinesTable part={part} lines={pv.lines} />
          <div className="pst-bar-actions">
            <button type="button" className="ps-btn" onClick={() => { setPv(null); setPeriod(null) }}><ArrowRight size={14} /> انتخاب ماه دیگر</button>
            <span className="sp" />
            <button type="button" className="ps-btn is-primary" disabled={busy || !pv.lines.length} onClick={() => void create()}>{busy ? <Loader2 size={14} className="animate-spin" /> : null} ساخت صورت‌وضعیت ({fa(pv.lines.length)} ردیف) <ArrowLeft size={14} /></button>
          </div>
        </section>
      )}
    </div>
  )
}
