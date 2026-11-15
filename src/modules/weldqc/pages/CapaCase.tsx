import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { AlarmClock, ArrowRight, Ban, Check, CheckCircle2, CircleDashed, FileSignature, GitBranch, History, ListChecks, PenLine, Plus, Printer, Save, ShieldAlert, Siren, Target, Trash2, TrendingDown, Undo2, Users, X } from 'lucide-react'
import { useWqStore } from '../store/useWqStore'
import { useEpcStore } from '../../execution/store/useEpcStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { EMPTY_MEMBERS, useIssuesMembersStore } from '../../issues/store/useIssuesMembersStore'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { todayTehran } from '../../../lib/today'
import * as repo from '../repo'
import { fa, faDate, useQc, weldLabel } from '../lib/useQc'
import { ESCALATE_FA, STEPS, measure, readiness, type ActionKind, type CauseCat, type Party, type Severity } from '../lib/capa'
import type { useCapa } from '../lib/useCapa'
import { useCapaInput } from '../lib/useCapa'
import { CAT_COLOR, CAT_FA, KIND_COLOR, KIND_FA, PARTY_FA, RULE_FA, SEV_COLOR, SEV_FA, STATUS_COLOR, STATUS_FA, faTime, openMinutes } from '../lib/capaSheet'

type Item = ReturnType<typeof useCapa>['cases'][number]
const toLocal = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso), p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }
const EVENT_FA: Record<string, string> = { opened: 'پرونده باز شد', signed: 'امضای صورتجلسه', action_done: 'اقدام انجام شد', deadline: 'تغییر مهلت جلسه', 'status:rca': 'شروع ریشه‌یابی', 'status:agreed': 'توافق نهایی ثبت شد', 'status:verifying': 'ارسال برای سنجش اثربخشی', 'status:void': 'ابطال پرونده', 'verified:effective': 'اقدام‌ها اثربخش بود — پرونده بسته شد', 'verified:ineffective': 'اقدام‌ها اثربخش نبود — بازگشت به ریشه‌یابی' }
const WHY_PH = ['چرا این مشکل رخ داد؟', 'چرا آن علت پیش آمد؟', 'و چرا آن؟', 'چرا؟', 'ریشه: چرا سیستم جلوی آن را نگرفت؟']

function Sec({ n, icon, title, on, done, children, extra }: { n: number; icon: ReactNode; title: string; on: boolean; done: boolean; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className={`wq-card cp-sec ${on ? 'is-on' : ''} ${done ? 'is-done' : ''}`}>
      <header className="wq-card-head"><span className="cp-num">{done ? <Check size={13} aria-hidden /> : fa(n)}</span>{icon}<h3>{title}</h3>{extra}</header>
      {children}
    </section>
  )
}

/** One CAPA case, from containment to the effectiveness check. The database holds the gates; this page shows what each gate still needs. */
export function CapaCase({ item, onBack, onOpenWeld }: { item: Item; onBack: () => void; onOpenWeld: (id: string) => void }) {
  const { c, late } = item
  const today = todayTehran()
  const st = useWqStore(), q = useQc(), input = useCapaInput()
  const me = useAuthStore((s) => s.profile?.id ?? '')
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === c.projectId) ?? null)
  const members = useIssuesMembersStore((s) => s.membersByProject[c.projectId] ?? EMPTY_MEMBERS)
  const ncr = useEpcStore((s) => (c.ncrId ? s.ncrs.find((n) => n.id === c.ncrId) : undefined))
  useEffect(() => { void useIssuesMembersStore.getState().fetchForProject(c.projectId) }, [c.projectId])

  const can = st.caps.edit || st.caps.submit || st.caps.approve || st.caps.configure
  const editable = can && (c.status === 'open' || c.status === 'rca')
  const blank = () => ({ title: c.title, problem: c.problem, severity: c.severity, containment: c.containment, ownerId: c.ownerId ?? '', ownerName: c.ownerName, meetingAt: toLocal(c.meetingAt), meetingPlace: c.meetingPlace, minutes: c.minutes, whys: [...c.whys, '', '', '', '', ''].slice(0, 5), causes: c.causes, rootCause: c.rootCause })
  const [d, setD] = useState(blank)
  // a reload after a write brings the saved row: follow it
  useEffect(() => { setD(blank()) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [c.id, c.status, c.round, c.containment, c.minutes, c.rootCause, c.meetingAt, c.ownerName, c.title, c.problem, c.severity, c.meetingPlace, JSON.stringify(c.whys), JSON.stringify(c.causes)])
  const patch = useMemo(() => {
    const p: Record<string, unknown> = {}
    if (d.title.trim() !== c.title) p.title = d.title
    if (d.problem !== c.problem) p.problem = d.problem
    if (d.severity !== c.severity) p.severity = d.severity
    if (d.containment !== c.containment) p.containment = d.containment
    if (d.ownerName !== c.ownerName || d.ownerId !== (c.ownerId ?? '')) { p.owner_id = d.ownerId || null; p.owner_name = d.ownerName }
    if (d.meetingAt !== toLocal(c.meetingAt)) p.meeting_at = d.meetingAt ? new Date(d.meetingAt).toISOString() : null
    if (d.meetingPlace !== c.meetingPlace) p.meeting_place = d.meetingPlace
    if (d.minutes !== c.minutes) p.minutes = d.minutes
    const whys = d.whys.map((w) => w.trim()).filter(Boolean)
    if (JSON.stringify(whys) !== JSON.stringify(c.whys)) p.whys = whys
    if (JSON.stringify(d.causes) !== JSON.stringify(c.causes)) p.causes = d.causes
    if (d.rootCause !== c.rootCause) p.root_cause = d.rootCause
    return p
  }, [d, c])
  const dirty = Object.keys(patch).length > 0
  const touchesMinutes = ['minutes', 'whys', 'causes', 'root_cause', 'meeting_at'].some((k) => k in patch)

  const attendees = item.attendees.filter((a) => a.round === c.round)
  const present = attendees.filter((a) => a.present), signed = present.filter((a) => a.signedAt)
  const actions = item.actions
  const roundActions = actions.filter((a) => a.round === c.round)
  const checks = readiness({ status: c.status, mandatory: c.mandatory, round: c.round, containment: c.containment, ownerName: c.ownerName, meetingAt: c.meetingAt, minutes: c.minutes, rootCause: c.rootCause }, attendees.map((a) => ({ round: a.round, present: a.present, party: a.party, signedAt: a.signedAt })), actions.map((a) => ({ round: a.round, kind: a.kind, status: a.status, removed: false })), new Date().toISOString())
  const signReady = checks.filter((k) => k.key !== 'signed' && k.key !== 'containment' && k.key !== 'owner').every((k) => k.ok)
  const allReady = checks.every((k) => k.ok)
  const step = STEPS.findIndex((s) => s.key === c.status)
  const run = (ok: string, fn: () => Promise<unknown>) => st.run(ok, fn)
  const save = () => run(touchesMinutes && signed.length ? 'ذخیره شد — امضاهای قبلی باطل شدند و باید دوباره گرفته شوند' : 'ذخیره شد', () => repo.capaSave(c.id, patch))

  // forms of the page
  const [att, setAtt] = useState({ userId: '', name: '', party: 'qc' as Party, role: '' })
  const [act, setAct] = useState<{ kind: ActionKind; title: string; ownerId: string; ownerName: string; due: string }>({ kind: 'corrective', title: '', ownerId: '', ownerName: '', due: '' })
  const [cause, setCause] = useState<{ cat: CauseCat; text: string; root: boolean }>({ cat: c.causes.length ? c.causes[0].cat : 'method', text: '', root: false })
  const [doneOf, setDoneOf] = useState<string | null>(null), [doneNote, setDoneNote] = useState('')
  const [verdict, setVerdict] = useState(''), [voiding, setVoiding] = useState<string | null>(null), [verifyDays, setVerifyDays] = useState(st.capaCfg.verifyDays)
  const pickMember = (id: string) => members.find((m) => m.userId === id)
  const addAtt = () => void run('عضو جلسه اضافه شد', () => repo.capaAttendee(c.id, 'add', { user_id: att.userId || null, name: att.userId ? pickMember(att.userId)?.fullName || pickMember(att.userId)?.email || att.name : att.name, party: att.party, role: att.role || (att.userId ? pickMember(att.userId)?.position ?? '' : '') })).then((ok) => { if (ok) setAtt({ userId: '', name: '', party: att.party, role: '' }) })
  const addAct = () => void run('اقدام ثبت شد', () => repo.capaAction(c.id, 'add', { kind: act.kind, title: act.title, owner_id: act.ownerId || null, owner_name: act.ownerId ? pickMember(act.ownerId)?.fullName || pickMember(act.ownerId)?.email || act.ownerName : act.ownerName, due_date: act.due })).then((ok) => { if (ok) setAct({ ...act, title: '' }) })
  const after = c.agreedAt ? measure(c.rule, c.scope, input, c.agreedAt) : null
  const base = c.baseline
  const enough = !!after && after.n >= st.capaCfg.verifyMinN
  const better = !!after && base.value != null && (after.unit === '٪' ? after.value < (base.limit ?? base.value) : after.value === 0)
  const canVerify = (st.caps.approve || st.caps.configure) && c.ownerId !== me
  const welds = (c.scope.weldIds ?? []).map((id) => q.byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r)

  const actionRows = (kinds: ActionKind[], withDone: boolean) => {
    const rows = (withDone ? actions : roundActions).filter((a) => kinds.includes(a.kind))
    if (!rows.length) return null
    return (
      <div className="wq-tbl-wrap"><table className="wq-tbl cp-acts"><thead><tr><th>نوع</th><th>اقدام</th><th>مسئول</th><th>مهلت</th><th>وضعیت</th><th aria-label="عملیات" /></tr></thead>
        <tbody>{rows.map((a) => {
          const overdue = a.status === 'open' && a.dueDate < today
          const mayDo = (can || a.ownerId === me) && a.status === 'open' && (a.kind === 'containment' ? ['open', 'rca', 'agreed'].includes(c.status) : c.status === 'agreed')
          return (
            <tr key={a.id} className={a.status === 'done' ? 'is-done' : ''}>
              <td><span className="wq-state" style={{ '--c': KIND_COLOR[a.kind] } as CSSProperties}>{KIND_FA[a.kind]}</span></td>
              <td>{a.title}{a.status === 'done' && a.doneNote ? <><br /><small className="ps-meta">نتیجه: {a.doneNote}</small></> : null}{a.round !== c.round ? <small className="ps-meta"> · دور {fa(a.round)}</small> : null}</td>
              <td>{a.ownerName}</td>
              <td className={overdue ? 'cp-bad' : ''}>{faDate(a.dueDate)}{overdue ? ' · مهلت گذشته' : ''}</td>
              <td>{a.status === 'done' ? <span className="wq-state" style={{ '--c': '#22c55e' } as CSSProperties}><CheckCircle2 size={12} aria-hidden /> انجام شد · {faDate(a.doneAt)}</span> : <span className="wq-state" style={{ '--c': '#64748b' } as CSSProperties}>باز</span>}</td>
              <td className="cp-row-act">
                {mayDo && doneOf !== a.id && <button type="button" className="ps-btn is-ok" onClick={() => { setDoneOf(a.id); setDoneNote('') }}><Check size={13} aria-hidden /> انجام شد</button>}
                {can && a.status === 'done' && c.status === 'agreed' && <button type="button" className="ps-btn is-ghost" aria-label="برگرداندن به باز" title="برگرداندن به باز" onClick={() => void run('اقدام دوباره باز شد', () => repo.capaAction(c.id, 'undo', { id: a.id }))}><Undo2 size={13} aria-hidden /></button>}
                {editable && a.status === 'open' && a.round === c.round && <button type="button" className="ps-btn is-ghost" aria-label="حذف اقدام" title="حذف اقدام" onClick={() => void run('اقدام حذف شد', () => repo.capaAction(c.id, 'remove', { id: a.id }))}><Trash2 size={13} aria-hidden /></button>}
              </td>
            </tr>
          )
        })}</tbody></table>
        {doneOf && rows.some((a) => a.id === doneOf) && (
          <form className="wq-form is-row cp-done" onSubmit={(e) => { e.preventDefault(); void run('انجام اقدام ثبت شد', () => repo.capaAction(c.id, 'done', { id: doneOf, note: doneNote })).then((ok) => { if (ok) setDoneOf(null) }) }}>
            <label className="is-grow"><span>چه کاری انجام شد و مدرک آن چیست؟ *</span><input autoFocus value={doneNote} onChange={(e) => setDoneNote(e.target.value)} placeholder="مثلاً: خشک‌کن الکترود در جبهه نصب شد — صورتجلسهٔ تحویل شمارهٔ …" /></label>
            <button type="submit" className="ps-btn is-ok" disabled={doneNote.trim().length < 5}><Check size={14} aria-hidden /> ثبت</button><button type="button" className="ps-btn is-ghost" onClick={() => setDoneOf(null)}><X size={14} aria-hidden /></button>
          </form>
        )}
      </div>
    )
  }

  return (
    <div className="cp cp-case">
      <header className="cp-case-head">
        <button type="button" className="ps-btn is-ghost" onClick={onBack}><ArrowRight size={15} aria-hidden /> پرونده‌ها</button>
        <div className="cp-case-title">
          <span><b className="ps-code" dir="ltr">{c.code}</b>{c.mandatory && <em className="cp-must">الزامی</em>}<span className="wq-state" style={{ '--c': SEV_COLOR[c.severity] } as CSSProperties}>{SEV_FA[c.severity]}</span><span className="wq-state" style={{ '--c': STATUS_COLOR[c.status] } as CSSProperties}>{STATUS_FA[c.status]}</span>{c.round > 1 && <span className="wq-state" style={{ '--c': '#a855f7' } as CSSProperties}>دور {fa(c.round)}</span>}</span>
          <h2>{c.title}</h2>
          <small>{RULE_FA[c.rule] ?? c.rule} · باز شده توسط {c.openedName || '—'} در {faDate(c.openedAt)}</small>
        </div>
        <div className="cp-case-tools">
          <button type="button" className="ps-btn" onClick={() => { if (!openMinutes(c, item.attendees, actions, project?.officialName ?? '')) useWqStore.setState({ flash: { tone: 'bad', text: 'مرورگر پنجرهٔ چاپ را مسدود کرد' } }) }}><Printer size={14} aria-hidden /> چاپ صورتجلسه</button>
          {st.caps.configure && c.status !== 'closed' && c.status !== 'void' && voiding == null && <button type="button" className="ps-btn is-ghost" onClick={() => setVoiding('')}><Ban size={14} aria-hidden /> ابطال</button>}
        </div>
      </header>
      {c.status !== 'void' && (
        <ol className="cp-stepper" aria-label="مراحل پرونده">{STEPS.map((s, n) => <li key={s.key} className={n < step ? 'is-done' : n === step ? 'is-now' : ''}><i>{n < step ? <Check size={12} aria-hidden /> : fa(n + 1)}</i><span>{s.label}</span></li>)}</ol>
      )}
      {late.late && <p className="cp-alarm" role="alert"><Siren size={16} aria-hidden /><span><b>{fa(late.days)} روز تأخیر در {late.what}.</b> این پرونده به {ESCALATE_FA[late.level]} ارجاع شده است و در نوار موضوعات مهم و میز کیفیت نمایش داده می‌شود.</span></p>}
      {c.status === 'void' && <p className="ps-hint is-warn">این پرونده ابطال شده است: {c.voidReason}</p>}
      {c.verifyResult === 'ineffective' && c.status !== 'closed' && <p className="cp-alarm"><TrendingDown size={16} aria-hidden /><span><b>اقدام‌های دور قبل اثربخش نبود.</b> {c.verifyNote} — علت ریشه‌ای باید دوباره بررسی و اقدام‌های تازه توافق شود.</span></p>}
      {voiding != null && (
        <form className="wq-card wq-form is-row" onSubmit={(e) => { e.preventDefault(); void run('پرونده ابطال شد', () => repo.capaAdvance(c.id, 'void', voiding)).then((ok) => { if (ok) setVoiding(null) }) }}>
          <label className="is-grow"><span>دلیل ابطال (در سابقه می‌ماند؛ همین الگو در این دوره دوباره پرونده نمی‌شود) *</span><input autoFocus value={voiding} onChange={(e) => setVoiding(e.target.value)} /></label>
          <button type="submit" className="ps-btn is-bad" disabled={voiding.trim().length < 10}><Ban size={14} aria-hidden /> ابطال پرونده</button><button type="button" className="ps-btn is-ghost" onClick={() => setVoiding(null)}>انصراف</button>
        </form>
      )}

      <div className="cp-cols">
        <div className="cp-col">
          <Sec n={1} icon={<ShieldAlert size={16} aria-hidden />} title="مسئله، شواهد و مهار فوری" on={c.status === 'open'} done={step > 0}>
            {editable ? <div className="wq-form"><label className="is-wide"><span>عنوان</span><input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></label><label className="is-wide"><span>شرح مسئله</span><textarea rows={3} value={d.problem} onChange={(e) => setD({ ...d, problem: e.target.value })} /></label>
              <label><span>شدت</span><select value={d.severity} onChange={(e) => setD({ ...d, severity: e.target.value as Severity })}>{(Object.keys(SEV_FA) as Severity[]).map((s) => <option key={s} value={s}>{SEV_FA[s]}</option>)}</select></label></div>
              : <p className="cp-text">{c.problem || '—'}</p>}
            {(c.evidence || base.value != null) && <div className="cp-evi">
              {base.value != null && <span className="cp-metric"><small>{base.label}</small><b>{fa(base.value, 1)} {base.unit}</b>{base.limit != null && <em>حد مجاز {fa(base.limit, 1)} {base.unit}</em>}</span>}
              {c.evidence && <span><small>شواهد</small>{c.evidence}</span>}
            </div>}
            {welds.length > 0 && <div className="cp-welds"><small>سرجوش‌های مرتبط:</small>{welds.slice(0, 24).map((r) => <button key={r.weld.id} type="button" className="ps-code" dir="ltr" onClick={() => onOpenWeld(r.weld.id)}>{weldLabel(r.weld)}</button>)}{welds.length > 24 && <small>و {fa(welds.length - 24)} مورد دیگر</small>}</div>}
            {c.scope.welder && <p className="ps-meta">جوشکار: {q.nameOf(c.scope.welder)} ({c.scope.welder})</p>}
            {ncr && <p className="ps-meta">NCR مرتبط: <b dir="ltr">{ncr.code}</b> — تا بسته‌شدن این پرونده، آن NCR بسته نمی‌شود.</p>}
            <div className="wq-form">
              <label className="is-wide"><span>اقدام فوری مهار (چه کاری همین حالا برای جلوگیری از گسترش انجام شد؟) *</span>{editable ? <textarea rows={2} value={d.containment} onChange={(e) => setD({ ...d, containment: e.target.value })} placeholder="مثلاً: جوشکار تا آزمون مجدد از خط خارج شد؛ سرجوش‌های همان شیفت ۱۰۰٪ رادیوگرافی می‌شوند." /> : <p className="cp-text">{c.containment || '—'}</p>}</label>
              <label><span>مسئول پرونده *</span>{editable ? <select value={d.ownerId} onChange={(e) => { const m = pickMember(e.target.value); setD({ ...d, ownerId: e.target.value, ownerName: m ? m.fullName || m.email : '' }) }}><option value="">— انتخاب از اعضای پروژه —</option>{members.map((m) => <option key={m.userId} value={m.userId}>{m.fullName || m.email}{m.position ? ` · ${m.position}` : ''}</option>)}</select> : <p className="cp-text">{c.ownerName || '—'}</p>}</label>
              {editable && !d.ownerId && <label><span>یا نام مسئول (بدون حساب کاربری)</span><input value={d.ownerName} onChange={(e) => setD({ ...d, ownerName: e.target.value })} /></label>}
            </div>
            {actionRows(['containment'], true)}
            {c.status === 'open' && can && <div className="wq-form-actions"><button type="button" className="ps-btn is-primary" disabled={dirty || d.containment.trim().length < 10 || d.ownerName.trim().length < 2} onClick={() => void run('ریشه‌یابی آغاز شد', () => repo.capaAdvance(c.id, 'rca'))}><GitBranch size={14} aria-hidden /> شروع ریشه‌یابی</button>{dirty && <small className="ps-meta">ابتدا تغییرها را ذخیره کنید.</small>}<small className="ps-meta">مهلت برگزاری جلسه: {faDate(c.meetingDue)}</small></div>}
          </Sec>

          <Sec n={2} icon={<Users size={16} aria-hidden />} title="جلسهٔ ریشه‌یابی و حاضران" on={c.status === 'rca'} done={step > 1} extra={<small className="ps-meta wq-head-link">مهلت: {faDate(c.meetingDue)}</small>}>
            <div className="wq-form">
              <label><span>زمان برگزاری *</span>{editable ? <input type="datetime-local" value={d.meetingAt} max={toLocal(new Date().toISOString())} onChange={(e) => setD({ ...d, meetingAt: e.target.value })} /> : <p className="cp-text">{faTime(c.meetingAt)}</p>}</label>
              <label><span>محل</span>{editable ? <input value={d.meetingPlace} onChange={(e) => setD({ ...d, meetingPlace: e.target.value })} placeholder="دفتر کارگاه / جبههٔ ۲" /> : <p className="cp-text">{c.meetingPlace || '—'}</p>}</label>
            </div>
            <p className="ps-meta">{c.mandatory ? 'حد نصاب پروندهٔ الزامی: دست‌کم سه نفر، شامل نماینده‌ای از پیمانکار یا کنترل کیفیت و نماینده‌ای از نظارت، مشاور یا کارفرما.' : 'حد نصاب: دست‌کم دو نفر.'} هر عضو دارای حساب کاربری فقط خودش می‌تواند امضا کند.</p>
            {attendees.length > 0 && <ul className="cp-people">{attendees.map((a) => (
              <li key={a.id} className={!a.present ? 'is-out' : a.signedAt ? 'is-signed' : ''}>
                <span><b>{a.name}</b><small>{PARTY_FA[a.party]}{a.role ? ` · ${a.role}` : ''}{!a.userId ? ' · بدون حساب کاربری' : ''}</small></span>
                {!a.present ? <em>غایب</em> : a.signedAt ? <em className="is-ok"><FileSignature size={12} aria-hidden /> {a.paper ? 'امضای کاغذی' : 'امضا شد'} · {faTime(a.signedAt)}</em>
                  : c.status === 'rca' && (a.userId ? a.userId === me : can) ? <button type="button" className="ps-btn is-ok" disabled={!signReady || dirty} title={!signReady ? 'ابتدا صورتجلسه کامل شود' : undefined} onClick={() => void run('امضا ثبت شد', () => repo.capaSign(a.id))}><PenLine size={13} aria-hidden /> {a.userId ? 'امضا می‌کنم' : 'ثبت امضای کاغذی'}</button>
                  : <em>منتظر امضا</em>}
                {editable && (a.present ? <button type="button" className="ps-btn is-ghost" aria-label={`حذف ${a.name} از حاضران`} title="غایب / حذف" onClick={() => void run('از حاضران حذف شد', () => repo.capaAttendee(c.id, 'remove', { id: a.id }))}><X size={13} aria-hidden /></button>
                  : <button type="button" className="ps-btn is-ghost" title="حاضر" aria-label={`${a.name} حاضر بود`} onClick={() => void run('حاضر ثبت شد', () => repo.capaAttendee(c.id, 'present', { id: a.id }))}><Undo2 size={13} aria-hidden /></button>)}
              </li>
            ))}</ul>}
            {editable && (
              <form className="wq-form is-row cp-add" onSubmit={(e) => { e.preventDefault(); addAtt() }}>
                <label><span>عضو پروژه</span><select value={att.userId} onChange={(e) => setAtt({ ...att, userId: e.target.value })}><option value="">— بدون حساب کاربری —</option>{members.filter((m) => !attendees.some((a) => a.userId === m.userId)).map((m) => <option key={m.userId} value={m.userId}>{m.fullName || m.email}</option>)}</select></label>
                {!att.userId && <label><span>نام</span><input value={att.name} onChange={(e) => setAtt({ ...att, name: e.target.value })} /></label>}
                <label><span>طرف</span><select value={att.party} onChange={(e) => setAtt({ ...att, party: e.target.value as Party })}>{(Object.keys(PARTY_FA) as Party[]).map((p) => <option key={p} value={p}>{PARTY_FA[p]}</option>)}</select></label>
                <label><span>سمت</span><input value={att.role} onChange={(e) => setAtt({ ...att, role: e.target.value })} placeholder="ناظر جوش، سرپرست کارگاه…" /></label>
                <button type="submit" className="ps-btn" disabled={!att.userId && att.name.trim().length < 2}><Plus size={14} aria-hidden /> افزودن</button>
              </form>
            )}
          </Sec>

          <Sec n={3} icon={<GitBranch size={16} aria-hidden />} title="تحلیل علت ریشه‌ای" on={c.status === 'rca'} done={step > 1}>
            <div className="cp-why">
              <b>پنج چرا</b>
              {editable ? d.whys.map((w, i) => <label key={i}><span>{fa(i + 1)}</span><input value={w} placeholder={WHY_PH[i]} onChange={(e) => setD({ ...d, whys: d.whys.map((x, k) => (k === i ? e.target.value : x)) })} /></label>)
                : c.whys.length ? <ol>{c.whys.map((w, i) => <li key={i}>{w}</li>)}</ol> : <p className="ps-meta">ثبت نشده است.</p>}
            </div>
            <div className="cp-fish">
              <b>علت‌های احتمالی (نمودار استخوان ماهی — ۶ دسته)</b>
              <div className="cp-fish-grid">{(Object.keys(CAT_FA) as CauseCat[]).map((k) => {
                const list = d.causes.map((x, i) => ({ x, i })).filter(({ x }) => x.cat === k)
                return (
                  <div key={k} style={{ '--c': CAT_COLOR[k] } as CSSProperties}><span>{CAT_FA[k]}</span>
                    {list.length ? <ul>{list.map(({ x, i }) => <li key={i} className={x.root ? 'is-root' : ''}>{editable ? <button type="button" title={x.root ? 'علت ریشه‌ای — برای برداشتن علامت کلیک کنید' : 'علامت‌گذاری به‌عنوان علت ریشه‌ای'} onClick={() => setD({ ...d, causes: d.causes.map((y, n) => (n === i ? { ...y, root: !y.root } : y)) })}><Target size={11} aria-hidden /></button> : x.root ? <Target size={11} aria-hidden /> : null}<i>{x.text}</i>{editable && <button type="button" aria-label="حذف علت" onClick={() => setD({ ...d, causes: d.causes.filter((_, n) => n !== i) })}><X size={11} aria-hidden /></button>}</li>)}</ul> : <small>—</small>}
                  </div>
                )
              })}</div>
              {editable && (
                <form className="wq-form is-row cp-add" onSubmit={(e) => { e.preventDefault(); if (cause.text.trim().length < 3) return; setD({ ...d, causes: [...d.causes, { ...cause, text: cause.text.trim() }] }); setCause({ ...cause, text: '', root: false }) }}>
                  <label><span>دسته</span><select value={cause.cat} onChange={(e) => setCause({ ...cause, cat: e.target.value as CauseCat })}>{(Object.keys(CAT_FA) as CauseCat[]).map((k) => <option key={k} value={k}>{CAT_FA[k]}</option>)}</select></label>
                  <label className="is-grow"><span>علت</span><input value={cause.text} onChange={(e) => setCause({ ...cause, text: e.target.value })} placeholder="مثلاً: الکترودها بیرون از خشک‌کن نگهداری می‌شوند" /></label>
                  <button type="submit" className="ps-btn" disabled={cause.text.trim().length < 3}><Plus size={14} aria-hidden /> افزودن علت</button>
                </form>
              )}
            </div>
            <label className="cp-root"><span>علت ریشه‌ای توافق‌شده *</span>{editable ? <textarea rows={2} value={d.rootCause} onChange={(e) => setD({ ...d, rootCause: e.target.value })} placeholder="آنچه اگر برطرف شود، مشکل تکرار نمی‌شود." /> : <p className="cp-text">{c.rootCause || '—'}</p>}</label>
          </Sec>
        </div>

        <div className="cp-col">
          <Sec n={4} icon={<ListChecks size={16} aria-hidden />} title="اقدام‌های اصلاحی و پیشگیرانه" on={c.status === 'rca' || c.status === 'agreed'} done={step > 2}>
            <p className="ps-meta">اقدام اصلاحی علتِ مشکلِ رخ‌داده را برمی‌دارد؛ اقدام پیشگیرانه جلوی رخ‌دادن همان مشکل را در جبهه‌ها، اکیپ‌ها و سرجوش‌های دیگر می‌گیرد. هر دو لازم است.</p>
            {actionRows(['corrective', 'preventive'], c.status !== 'open' && c.status !== 'rca') ?? <p className="ps-hint">هنوز اقدامی ثبت نشده است.</p>}
            {editable && (
              <form className="wq-form cp-add" onSubmit={(e) => { e.preventDefault(); addAct() }}>
                <label><span>نوع</span><select value={act.kind} onChange={(e) => setAct({ ...act, kind: e.target.value as ActionKind })}>{(Object.keys(KIND_FA) as ActionKind[]).map((k) => <option key={k} value={k}>{KIND_FA[k]}</option>)}</select></label>
                <label className="is-wide"><span>اقدام</span><input value={act.title} onChange={(e) => setAct({ ...act, title: e.target.value })} placeholder="مثلاً: آموزش و آزمون مجدد جوشکاران پاس ریشه" /></label>
                <label><span>مسئول</span><select value={act.ownerId} onChange={(e) => setAct({ ...act, ownerId: e.target.value })}><option value="">— بدون حساب کاربری —</option>{members.map((m) => <option key={m.userId} value={m.userId}>{m.fullName || m.email}</option>)}</select></label>
                {!act.ownerId && <label><span>نام مسئول</span><input value={act.ownerName} onChange={(e) => setAct({ ...act, ownerName: e.target.value })} /></label>}
                <label><span>مهلت</span><JalaliDateInput value={act.due} onChange={(v) => setAct({ ...act, due: v })} /></label>
                <div className="is-wide wq-form-actions"><button type="submit" className="ps-btn" disabled={act.title.trim().length < 5 || !act.due || (!act.ownerId && act.ownerName.trim().length < 2)}><Plus size={14} aria-hidden /> افزودن اقدام</button></div>
              </form>
            )}
            {c.status === 'agreed' && can && <div className="wq-form-actions"><button type="button" className="ps-btn is-primary" disabled={actions.some((a) => a.status !== 'done')} onClick={() => void run('برای سنجش اثربخشی ارسال شد', () => repo.capaAdvance(c.id, 'verifying'))}><Target size={14} aria-hidden /> همهٔ اقدام‌ها انجام شد — ارسال برای سنجش اثربخشی</button>{actions.some((a) => a.status !== 'done') && <small className="ps-meta">{fa(actions.filter((a) => a.status !== 'done').length)} اقدام هنوز باز است.</small>}</div>}
          </Sec>

          <Sec n={5} icon={<FileSignature size={16} aria-hidden />} title="صورتجلسه، توافق و امضا" on={c.status === 'rca'} done={step > 1}>
            <label className="cp-root"><span>شرح مذاکرات *</span>{editable ? <textarea rows={5} value={d.minutes} onChange={(e) => setD({ ...d, minutes: e.target.value })} placeholder="خلاصهٔ بحث، نظر هر طرف، نکته‌های توافق‌شده و موارد اختلاف." /> : <p className="cp-text">{c.minutes || '—'}</p>}</label>
            {(c.status === 'open' || c.status === 'rca') && (
              <ul className="cp-checks" aria-label="شرط‌های ثبت توافق">{checks.map((k) => <li key={k.key} className={k.ok ? 'is-ok' : ''}>{k.ok ? <CheckCircle2 size={14} aria-hidden /> : <CircleDashed size={14} aria-hidden />}{k.label}{k.key === 'signed' && present.length > 0 ? ` (${fa(signed.length)} از ${fa(present.length)})` : ''}</li>)}</ul>
            )}
            {c.status === 'rca' && can && (
              <div className="wq-form is-row">
                <label><span>سنجش اثربخشی چند روز پس از آخرین مهلت؟</span><input inputMode="numeric" dir="ltr" value={verifyDays} onChange={(e) => setVerifyDays(Math.max(0, Number(e.target.value) || 0))} /></label>
                <button type="button" className="ps-btn is-primary" disabled={!allReady || dirty} onClick={() => void run('توافق ثبت و اجرای اقدام‌ها آغاز شد', () => repo.capaAdvance(c.id, 'agreed', '', verifyDays))}><FileSignature size={14} aria-hidden /> ثبت توافق نهایی و شروع اجرا</button>
              </div>
            )}
            {c.agreedAt && <p className="ps-meta">توافق نهایی در {faTime(c.agreedAt)} ثبت شد؛ متن صورتجلسه و اقدام‌ها از آن پس قابل تغییر نیست.</p>}
          </Sec>

          <Sec n={6} icon={<Target size={16} aria-hidden />} title="سنجش اثربخشی" on={c.status === 'verifying'} done={c.status === 'closed'}>
            {c.status === 'closed' ? <p className="cp-text"><b>اثربخش ارزیابی شد</b> توسط {c.verifiedName} در {faDate(c.verifiedAt)}: {c.verifyNote}</p>
              : !c.agreedAt ? <p className="ps-meta">پس از اجرای اقدام‌ها، همان شاخصی که پرونده را باز کرد دوباره فقط روی نتایج بعد از توافق اندازه گرفته می‌شود. تأیید اثربخشی با فردی غیر از مسئول پرونده و دارای دسترسی «تأیید» است.</p> : null}
            {c.agreedAt && (after || base.value != null) && (
              <div className="cp-compare">
                {base.value != null && <span><small>هنگام باز شدن پرونده</small><b>{fa(base.value, 1)} {base.unit}</b><em>{base.n != null ? `${fa(base.n)} نمونه` : ''}</em></span>}
                {after && <span className={enough ? (better ? 'is-good' : 'is-bad') : ''}><small>{after.label}</small><b>{after.n ? `${fa(after.value, 1)} ${after.unit}` : '—'}</b><em>{fa(after.n)} نتیجهٔ تازه{!enough ? ` — کمتر از ${fa(st.capaCfg.verifyMinN)}؛ هنوز برای قضاوت کافی نیست` : ''}</em></span>}
                {c.verifyDue && c.status !== 'closed' && <span><small>زمان سنجش</small><b>{faDate(c.verifyDue)}</b></span>}
              </div>
            )}
            {c.status === 'verifying' && (canVerify ? (
              <form className="wq-form" onSubmit={(e) => e.preventDefault()}>
                <label className="is-wide"><span>نتیجهٔ بررسی و مبنای آن *</span><textarea rows={2} value={verdict} onChange={(e) => setVerdict(e.target.value)} placeholder="مثلاً: در ۲۵ سرجوش پس از اقدام‌ها نرخ تعمیر به ۴٪ رسید و عیب IF تکرار نشد." /></label>
                <div className="is-wide wq-form-actions">
                  <button type="button" className="ps-btn is-ok" disabled={verdict.trim().length < 10} onClick={() => void run('پرونده بسته شد', () => repo.capaVerify(c.id, 'effective', verdict, after))}><CheckCircle2 size={14} aria-hidden /> اثربخش بود — بستن پرونده</button>
                  <button type="button" className="ps-btn is-bad" disabled={verdict.trim().length < 10} onClick={() => void run('پرونده به ریشه‌یابی برگشت', () => repo.capaVerify(c.id, 'ineffective', verdict, after)).then((ok) => { if (ok) setVerdict('') })}><TrendingDown size={14} aria-hidden /> اثربخش نبود — جلسهٔ دوباره</button>
                  {after && !enough && <small className="ps-meta">نمونهٔ تازه کم است؛ بستن پرونده با مسئولیت تأییدکننده است.</small>}
                </div>
              </form>
            ) : <p className="ps-hint">{c.ownerId === me ? 'مسئول پرونده نمی‌تواند اثربخشی اقدام‌های خودش را تأیید کند؛ فرد دیگری با دسترسی «تأیید» این کار را انجام می‌دهد.' : 'سنجش اثربخشی با دسترسی «تأیید» (نظارت / مدیر کیفیت) است.'}</p>)}
          </Sec>

          {st.capaEvents.some((e) => e.caseId === c.id) && (
            <section className="wq-card cp-hist"><header className="wq-card-head"><History size={16} aria-hidden /><h3>سابقه</h3></header>
              <ol>{st.capaEvents.filter((e) => e.caseId === c.id).map((e) => <li key={e.id}><time>{faTime(e.at)}</time><b>{EVENT_FA[e.kind] ?? e.kind}</b><span>{e.byName}{e.note && e.kind !== 'opened' ? ` — ${e.note}` : ''}</span></li>)}</ol>
            </section>
          )}
        </div>
      </div>

      {editable && dirty && (
        <div className="cp-save" role="status">
          <span>{touchesMinutes && signed.length > 0 ? <><AlarmClock size={14} aria-hidden /> با ذخیرهٔ این تغییر، {fa(signed.length)} امضای ثبت‌شده باطل می‌شود.</> : 'تغییرهای ذخیره‌نشده'}</span>
          <button type="button" className="ps-btn is-ghost" onClick={() => setD(blank())}>بازگردانی</button>
          <button type="button" className="ps-btn is-primary" onClick={() => void save()}><Save size={14} aria-hidden /> ذخیره</button>
        </div>
      )}
    </div>
  )
}
