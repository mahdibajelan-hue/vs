import { useEffect, useState, type CSSProperties } from 'react'
import { ArrowRight, Ban, CheckCircle2, Landmark, Loader2, Printer, RefreshCw, Send, Undo2 } from 'lucide-react'
import { usePstStore, type Line, type Statement } from './store/usePstStore'
import { PART_META, STATUS_COLOR, periodOf, type StStatus, type Totals } from './lib/stmtCore'
import { Deductions, Figures, LinesTable, Warnings } from './Sheet'
import { fa, jd, Ledger, PartChip, StatusChip } from './ui'
import { printStatement } from './print'

const FLOW: { key: StStatus; label: string }[] = [{ key: 'draft', label: 'پیش‌نویس' }, { key: 'submitted', label: 'بررسی کارفرما/مشاور' }, { key: 'approved', label: 'تأیید' }, { key: 'posted', label: 'ثبت در مالی' }]

export function StatementPage({ id, onBack }: { id: string; onBack: () => void }) {
  const st = usePstStore()
  const s = st.statements.find((x) => x.id === id)
  const [busy, setBusy] = useState<string | null>(null)
  const [warn, setWarn] = useState<string[]>([])
  useEffect(() => { if (s) void st.loadLines(s) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [s?.id, s?.gen])
  if (!s) return <div className="pst-empty"><b>صورت‌وضعیت پیدا نشد.</b><button type="button" className="ps-btn" onClick={onBack}>بازگشت</button></div>
  const c = st.contracts.find((x) => x.id === s.contractId)
  const cfg = st.cfgOf(s.contractId)
  const lines: Line[] = st.lines.get(s.id) ?? []
  const color = PART_META[s.part].color
  const t: Totals = { cumSys: s.cumSys, cumAmount: s.cumAmount, prevAmount: s.prevAmount, thisAmount: s.thisAmount, cap: s.cap, capLeft: s.cap == null ? null : s.cap - s.cumAmount, overCap: s.cap == null ? 0 : Math.max(0, s.cumAmount - s.cap), deductions: s.deductions, payable: s.payable }
  const editable = s.status === 'draft' || s.status === 'submitted'
  const idx = s.status === 'rejected' ? 1 : FLOW.findIndex((f) => f.key === s.status)
  const act = async (k: string, f: () => Promise<unknown>) => { setBusy(k); await f(); setBusy(null) }
  const regen = () => act('regen', async () => { const p = await st.preview(s.contractId, s.part, periodOf(s.periodKey)); if (!p) return; setWarn(p.built.warnings); const kept = new Map(lines.filter((l) => l.edited).map((l) => [`${l.sourceKind}:${l.sourceId}`, l])); p.lines = p.lines.map((l) => { const k = kept.get(`${l.sourceKind}:${l.sourceId}`); return k ? { ...l, cumAmount: k.cumAmount, edited: true, note: k.note } : l }); await st.save(p, s) })
  const reject = () => { const r = window.prompt('علت برگشت برای اصلاح:'); if (r && r.trim()) void act('reject', () => st.setStatus(s, 'rejected', r.trim())) }

  return (
    <div className="ps-stack" style={{ '--pc': color } as CSSProperties}>
      <section className="ps-card">
        <div className="pst-sheet-head">
          <button type="button" className="ps-btn" onClick={onBack}><ArrowRight size={14} /> فهرست</button>
          <div>
            <h2>صورت‌وضعیت شمارهٔ {fa(s.no)} — {PART_META[s.part].long}</h2>
            <p><PartChip part={s.part} /> · {c?.no} — {c?.title} · دورهٔ {periodOf(s.periodKey).label} ({jd(s.from)} تا {jd(s.to)})</p>
          </div>
          <StatusChip status={s.status} />
        </div>
        <ol className="pst-flow" aria-label="گردش تأیید" style={{ '--sc': STATUS_COLOR[s.status] } as CSSProperties}>
          {FLOW.map((f, i) => <li key={f.key} className={i < idx ? 'is-done' : i === idx ? 'is-on' : ''}>{i < idx ? '✓' : fa(i + 1)} {f.label}</li>)}
        </ol>
        {s.status === 'rejected' && <p className="ps-hint is-warn">برگشت داده شد: {s.rejectReason} — داده‌ها را اصلاح کنید و «بازسازی از داده‌های تازه» بزنید یا به پیش‌نویس برگردانید.</p>}
        {s.status === 'posted' && <p className="ps-hint"><Landmark size={13} aria-hidden /> در {jd(s.postedAt)} در دفتر صورت‌وضعیت‌های ماژول «قراردادها و مالی» با شمارهٔ {s.part}-{String(s.no).padStart(2, '0')} ({s.periodKey}) ثبت شد؛ تأیید نهایی و پرداخت از همان‌جا پیگیری می‌شود.</p>}
        <div className="pst-bar-actions">
          {(s.status === 'draft' || s.status === 'rejected') && <button type="button" className="ps-btn" disabled={!!busy} onClick={() => void regen()} title="مبالغ سیستمی دوباره از ماژول منبع خوانده می‌شود؛ اصلاحات دستی ردیف‌ها حفظ می‌شود">{busy === 'regen' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} بازسازی از داده‌های تازه</button>}
          {s.status === 'draft' && <button type="button" className="ps-btn is-primary" disabled={!!busy || !lines.length} onClick={() => void act('submit', () => st.setStatus(s, 'submitted'))}><Send size={14} /> ارسال برای بررسی</button>}
          {s.status === 'submitted' && <>
            <button type="button" className="ps-btn is-ok" disabled={!!busy} onClick={() => { if (t.overCap > 0 && !window.confirm('مبلغ تجمعی از سقف بیشتر است. با این وجود تأیید شود؟')) return; void act('approve', () => st.setStatus(s, 'approved')) }}><CheckCircle2 size={14} /> تأیید صورت‌وضعیت</button>
            <button type="button" className="ps-btn is-bad" disabled={!!busy} onClick={reject}><Undo2 size={14} /> برگشت برای اصلاح</button>
          </>}
          {s.status === 'approved' && <button type="button" className="ps-btn is-primary" disabled={!!busy} onClick={() => { if (window.confirm('صورت‌وضعیت در دفتر ماژول «قراردادها و مالی» ثبت شود؟ پس از ثبت، قفل می‌شود.')) void act('post', () => st.post(s)) }}>{busy === 'post' ? <Loader2 size={14} className="animate-spin" /> : <Landmark size={14} />} ثبت در قراردادها و مالی</button>}
          <span className="sp" />
          <button type="button" className="ps-btn" onClick={() => c && printStatement(s, c, lines, cfg)}><Printer size={14} /> چاپ</button>
          {(s.status === 'draft' || s.status === 'rejected' || s.status === 'submitted') && <button type="button" className="ps-btn is-ghost" disabled={!!busy} onClick={() => { if (window.confirm('این صورت‌وضعیت باطل شود؟ ماه و شمارهٔ آن آزاد می‌شود و سابقه‌اش می‌ماند.')) void act('void', async () => { if (await st.voidStmt(s)) onBack() }) }}><Ban size={14} /> باطل کردن</button>}
        </div>
      </section>

      <section className="ps-card">
        <Warnings list={warn} t={t} />
        <Ledger prev={t.prevAmount} now={t.thisAmount} cap={t.cap} color={color} />
        <Figures t={t} part={s.part} />
        <div style={{ display: 'grid', gap: '.8rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 22rem), 1fr))' }}>
          <Deductions t={t} rates={cfg} />
          <Timeline s={s} />
        </div>
      </section>

      <section className="ps-card">
        <header className="ps-card-head"><b>ردیف‌های صورت‌وضعیت</b>{editable && <small style={{ color: 'var(--text-muted)' }}>{s.status === 'draft' ? 'تهیه‌کننده' : 'بررسی‌کننده'} می‌تواند «تجمعی تا پایان ماه» هر ردیف را اصلاح کند (کمتر از تأیید قبل = اصلاح منفی)؛ ردیف اصلاح‌شده علامت می‌خورد.</small>}</header>
        {lines.length ? <LinesTable part={s.part} lines={lines} editable={editable} onEdit={(l, v) => void st.setLine(s, (l as Line).id, v)} /> : <div className="pst-empty"><Loader2 className="animate-spin" /></div>}
      </section>
    </div>
  )
}

function Timeline({ s }: { s: Statement }) {
  const rows: [string, string | null][] = [['ساخته شد', s.createdAt], ['ارسال برای بررسی', s.submittedAt], ['تأیید', s.approvedAt], ['ثبت در مالی', s.postedAt]]
  return (
    <ul className="ps-hint" style={{ display: 'grid', gap: '.35rem', listStyle: 'none', padding: 0 }}>
      {rows.map(([l, d]) => <li key={l} style={{ display: 'flex', justifyContent: 'space-between', opacity: d ? 1 : 0.5 }}><span>{d ? '●' : '○'} {l}</span><span>{d ? jd(d) : '—'}</span></li>)}
    </ul>
  )
}
