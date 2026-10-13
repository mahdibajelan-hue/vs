import { useEffect, useMemo, useRef, useState } from 'react'
import { AlarmClock, ArrowUpLeft, CheckCircle2, Clock, ExternalLink, Inbox, RefreshCw, Search, X } from 'lucide-react'
import { ModalPortal } from '../../../components/common/ModalPortal'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { DecInput } from '../../material/components/control/DecInput'
import { KINDS } from '../lib/catalog'
import { applyFilter, counts, dueIn } from '../lib/model'
import { openInModule } from '../lib/openIn'
import { selectVisible, useInboxStore } from '../store/useInboxStore'
import { GROUP_LABEL_FA, SOURCE_LABEL_FA, type ActionDef, type InboxGroup, type InboxItem, type InboxSource } from '../types'
import { ExLinesPanel } from './ExLinesPanel'
import '../inbox.css'

const fa = (n: number) => n.toLocaleString('fa-IR')
const SOURCES = Object.keys(SOURCE_LABEL_FA) as InboxSource[]
const GROUPS = Object.keys(GROUP_LABEL_FA) as InboxGroup[]

function dueText(due: string | null): { text: string; tone: 'bad' | 'warn' | 'plain' } | null {
  const d = dueIn(due)
  if (d == null) return null
  if (d < 0) return { text: `${fa(-d)} روز دیرکرد`, tone: 'bad' }
  if (d === 0) return { text: 'مهلت امروز', tone: 'warn' }
  if (d <= 3) return { text: `${fa(d)} روز مانده`, tone: 'warn' }
  return { text: `${fa(d)} روز مانده`, tone: 'plain' }
}
const waited = (since: string): string => {
  const d = Math.floor((Date.now() - Date.parse(since)) / 86400000)
  return d <= 0 ? 'امروز رسیده' : `${fa(d)} روز پیش رسیده`
}

/** «کارتابل من»: the one inbox of the whole system — everything that waits for the signed-in person, with the decision/opinion made right here. */
export function InboxOverlay() {
  const open = useInboxStore((s) => s.open)
  const setOpen = useInboxStore((s) => s.setOpen)
  const all = useInboxStore((s) => s.items)
  const snoozed = useInboxStore((s) => s.snoozed)
  const loading = useInboxStore((s) => s.loading)
  const loadedOnce = useInboxStore((s) => s.loadedOnce)
  const error = useInboxStore((s) => s.error)
  const filter = useInboxStore((s) => s.filter)
  const setFilter = useInboxStore((s) => s.setFilter)
  const selected = useInboxStore((s) => s.selected)
  const select = useInboxStore((s) => s.select)
  const refresh = useInboxStore((s) => s.refresh)
  const unsnoozeAll = useInboxStore((s) => s.unsnoozeAll)

  const visible = useMemo(() => selectVisible({ items: all, snoozed }), [all, snoozed])
  const c = useMemo(() => counts(visible), [visible])
  const list = useMemo(() => applyFilter(visible, filter), [visible, filter])
  const projects = useMemo(() => [...new Set(visible.map((i) => i.projectName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fa')), [visible])
  const cur = list.find((i) => i.key === selected) ?? null
  const hiddenN = all.length - visible.length
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (e.key === 'Escape') { if (cur) select(null); else setOpen(false); return }
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        const i = list.findIndex((x) => x.key === selected)
        const n = e.key === 'ArrowDown' || e.key === 'j' ? Math.min(list.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1)
        if (list[n]) select(list[n].key)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, list, selected, cur, select, setOpen])
  useEffect(() => { listRef.current?.querySelector('.ib-row.on')?.scrollIntoView({ block: 'nearest' }) }, [selected])

  if (!open) return null
  return (
    <ModalPortal>
      <div className="ib-layer" role="dialog" aria-modal="true" aria-label="کارتابل من" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
        <div className="ib-shell">
          <header className="ib-head">
            <span className="ib-title"><Inbox size={20} /><b>کارتابل من</b><span className="ib-muted">همهٔ کارهای شما در همهٔ ماژول‌ها، یک‌جا</span></span>
            <span className="ib-head-actions">
              <button className="ib-icon" onClick={() => void refresh()} aria-label="تازه‌سازی" title="تازه‌سازی"><RefreshCw size={15} className={loading ? 'ib-spin' : undefined} /></button>
              <button className="ib-icon" onClick={() => setOpen(false)} aria-label="بستن"><X size={16} /></button>
            </span>
          </header>

          <div className="ib-kpis">
            <button className={`ib-kpi${filter.group === 'all' && !filter.urgentOnly ? ' on' : ''}`} onClick={() => setFilter({ group: 'all', urgentOnly: false })}><span>همهٔ کارهای باز</span><b>{fa(c.total)}</b></button>
            <button className={`ib-kpi bad${filter.urgentOnly ? ' on' : ''}`} onClick={() => setFilter({ urgentOnly: !filter.urgentOnly, group: 'all' })}><span>فوری یا دیرکرد</span><b>{fa(c.urgent)}</b></button>
            {GROUPS.map((g) => <button key={g} className={`ib-kpi${filter.group === g ? ' on' : ''}`} onClick={() => setFilter({ group: filter.group === g ? 'all' : g, urgentOnly: false })}><span>{GROUP_LABEL_FA[g]}</span><b>{fa(c.byGroup.get(g) ?? 0)}</b></button>)}
          </div>

          <div className="ib-body">
            <section className="ib-list-pane" aria-label="فهرست کارها">
              <div className="ib-filters">
                <label className="ib-search"><Search size={14} /><input value={filter.q} onChange={(e) => setFilter({ q: e.target.value })} placeholder="جست‌وجو در عنوان، پروژه، نوع…" aria-label="جست‌وجو" /></label>
                <select value={filter.project} onChange={(e) => setFilter({ project: e.target.value })} aria-label="پروژه"><option value="">همهٔ پروژه‌ها</option>{projects.map((p) => <option key={p} value={p}>{p}</option>)}</select>
              </div>
              <div className="ib-chips" role="tablist" aria-label="ماژول">
                <button role="tab" aria-selected={filter.source === 'all'} className={filter.source === 'all' ? 'on' : ''} onClick={() => setFilter({ source: 'all' })}>همه</button>
                {SOURCES.filter((s) => c.bySource.get(s)).map((s) => <button key={s} role="tab" aria-selected={filter.source === s} className={filter.source === s ? 'on' : ''} onClick={() => setFilter({ source: filter.source === s ? 'all' : s })}>{SOURCE_LABEL_FA[s]}<em>{fa(c.bySource.get(s) ?? 0)}</em></button>)}
              </div>
              <div className="ib-list" ref={listRef}>
                {error && <p className="ib-err" role="alert">{error}</p>}
                {!loadedOnce && <p className="ib-muted ib-pad">در حال بارگذاری…</p>}
                {loadedOnce && list.length === 0 && (
                  <div className="ib-empty"><CheckCircle2 size={30} /><b>{visible.length === 0 ? 'کار بازی برای شما نیست' : 'موردی با این فیلتر پیدا نشد'}</b><span>{visible.length === 0 ? 'هر چیزی که منتظر شما باشد، خودکار اینجا می‌آید و با انجام آن از اینجا می‌رود.' : 'فیلترها را تغییر دهید.'}</span></div>
                )}
                {list.map((i) => <Row key={i.key} item={i} on={i.key === selected} onPick={() => select(i.key)} />)}
                {hiddenN > 0 && <button className="ib-link ib-pad" onClick={unsnoozeAll}>{fa(hiddenN)} مورد به‌تعویق‌افتاده — نمایش دوباره</button>}
              </div>
            </section>

            <section className="ib-detail-pane" aria-label="جزئیات و اقدام">
              {cur ? <Detail key={cur.key} item={cur} /> : (
                <div className="ib-empty tall"><Inbox size={34} /><b>یک مورد را انتخاب کنید</b><span>تصمیم، نظر یا پیگیری را همین‌جا ثبت کنید؛ نیازی به رفتن بین ماژول‌ها نیست. با کلیدهای ↑ و ↓ هم می‌شود بین موردها حرکت کرد.</span></div>
              )}
            </section>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

function Row({ item, on, onPick }: { item: InboxItem; on: boolean; onPick: () => void }) {
  const k = KINDS[item.kind]
  const d = dueText(item.due)
  return (
    <button className={`ib-row${on ? ' on' : ''}${item.urgent ? ' urgent' : ''}`} onClick={onPick} aria-current={on}>
      <span className="ib-row-top"><span className={`ib-kind g-${k.group}`}>{k.label}</span><span className="ib-src">{SOURCE_LABEL_FA[item.source]}</span></span>
      <b className="ib-row-title">{item.title}</b>
      <span className="ib-row-sub">{item.sub}</span>
      <span className="ib-row-foot">
        {item.projectName && <span>{item.projectName}</span>}
        {d ? <span className={`ib-due ${d.tone}`}><Clock size={11} /> {d.text}</span> : <span className="ib-muted">{waited(item.since)}</span>}
      </span>
    </button>
  )
}

function Detail({ item }: { item: InboxItem }) {
  const k = KINDS[item.kind]
  const run = useInboxStore((s) => s.run)
  const close = useInboxStore((s) => s.setOpen)
  const snooze = useInboxStore((s) => s.snooze)
  const back = useInboxStore((s) => s.select)
  const actions = k.actions(item)
  const [note, setNote] = useState('')
  const [progress, setProgress] = useState<number>(Number(item.extra.progress) || 0)
  const [refNo, setRefNo] = useState(''), [refDate, setRefDate] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const d = dueText(item.due)
  const needsNote = actions.some((a) => a.note !== 'none')
  const field = actions.find((a) => a.field)?.field

  const go = async (a: ActionDef) => {
    if (a.note === 'req' && note.trim().length < 3) { setErr('برای این اقدام، توضیح (حداقل چند کلمه) لازم است.'); return }
    if (a.field === 'ref' && !refNo.trim() && item.extra.requiresReference) { setErr('شمارهٔ نامه یا مرجع تأیید را وارد کنید.'); return }
    setBusy(a.key); setErr(null)
    const e = await run(item, a, { note: note.trim(), progress, refNo: refNo.trim(), refDate })
    setBusy(null)
    if (e) setErr(e)
  }

  return (
    <article className="ib-detail">
      <button className="ib-back" onClick={() => back(null)}>← بازگشت به فهرست</button>
      <div className="ib-detail-head">
        <span className={`ib-kind g-${k.group}`}>{k.label}</span>
        <span className="ib-src">{SOURCE_LABEL_FA[item.source]}{item.projectName ? ` · ${item.projectName}` : ''}</span>
      </div>
      <h2>{item.title}</h2>
      <p className="ib-ask">{k.ask}</p>
      <dl className="ib-facts">
        {item.sub && <div><dt>شرح</dt><dd>{item.sub}</dd></div>}
        <div><dt>وضعیت زمان</dt><dd>{d ? <span className={`ib-due ${d.tone}`}>{d.text}</span> : '—'} · {waited(item.since)}</dd></div>
      </dl>

      {item.kind === 'review' && <ExLinesPanel reportId={item.refId} />}
      {item.kind === 'discrepancy' && !!(item.extra.cause || item.extra.diff != null) && <p className="ib-ctx">اختلاف: {String(item.extra.diff ?? '—')}{item.extra.cause ? ` · علت احتمالی: ${String(item.extra.cause)}` : ''}</p>}
      {item.kind === 'stage' && !!(item.extra.note || item.extra.evidence) && <p className="ib-ctx">{item.extra.note ? `توضیح مجری: ${String(item.extra.note)}` : ''}{item.extra.evidence ? ` · مدرک: ${String(item.extra.evidence)}` : ''}</p>}

      {actions.length > 0 && (
        <div className="ib-act">
          {needsNote && <label className="ib-note">نظر / توضیح شما<textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="نظر خود را بنویسید (برای رد یا برگشت الزامی است)…" dir="auto" /></label>}
          {field === 'progress' && <label className="ib-note">درصد پیشرفت<DecInput value={progress} onValue={(n) => setProgress(n)} label="درصد پیشرفت" /></label>}
          {field === 'ref' && <div className="ib-ref"><label className="ib-note">شمارهٔ نامه / مرجع{item.extra.requiresReference ? ' *' : ''}<input value={refNo} onChange={(e) => setRefNo(e.target.value)} dir="auto" /></label><label className="ib-note">تاریخ مرجع<JalaliDateInput value={refDate} onChange={setRefDate} /></label></div>}
          <div className="ib-btns">{actions.map((a) => <button key={a.key} className={`ib-btn ${a.tone}`} disabled={busy !== null} onClick={() => void go(a)}>{busy === a.key ? 'در حال ثبت…' : a.label}</button>)}</div>
        </div>
      )}
      {err && <p className="ib-err" role="alert">{err}</p>}

      <div className="ib-more">
        <button className="ib-link" onClick={() => { close(false); openInModule(item) }}><ExternalLink size={13} /> باز کردن در ماژول {SOURCE_LABEL_FA[item.source]}<ArrowUpLeft size={12} /></button>
        <span className="ib-snooze"><AlarmClock size={13} /> بعداً یادآوری کن:
          <button className="ib-link" onClick={() => snooze(item.key, 4)}>۴ ساعت</button>
          <button className="ib-link" onClick={() => snooze(item.key, 24)}>فردا</button>
          <button className="ib-link" onClick={() => snooze(item.key, 72)}>۳ روز</button>
        </span>
      </div>
    </article>
  )
}
