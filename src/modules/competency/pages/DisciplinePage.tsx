import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Ban, Check, Gavel, Plus, Undo2, X } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { useInServiceStore, type DisciplineRow } from '../store/useInServiceStore'
import { CompetencySidebarShell, type CompetencySection } from '../components/CompetencySidebarShell'
import { disciplineState, KIND_LABEL_FA, STATUS_LABEL_FA, type DecisionKind } from '../lib/discipline'
import { useAuthStore } from '../../../store/useAuthStore'
import { formatJalali } from '../../../lib/jalali'

const fa = (n: number) => n.toLocaleString('fa-IR')
const STATUS_COLOR = { proposed: '#fbbf24', approved: '#f87171', rejected: '#94a3b8', revoked: '#38bdf8' } as const

/** Disciplinary decisions for people on projects: a score deduction, a temporary suspension or a work ban. A proposal changes nothing until someone other than its author approves it (a module admin); an approved decision can be revoked with a reason. */
export function DisciplinePage({ onExitToHub, nav }: { onExitToHub: () => void; nav: Partial<Record<CompetencySection, () => void>> }) {
  const st = useInServiceStore()
  const assessments = useCompetencyStore((s) => s.assessments)
  const profiles = useCompetencyStore((s) => s.profiles)
  const fetchProfiles = useCompetencyStore((s) => s.fetchProfiles)
  const moduleAdmins = useCompetencyStore((s) => s.moduleAdmins)
  const designers = useCompetencyStore((s) => s.assessmentDesigners)
  const me = useAuthStore((s) => s.profile)
  const isAdmin = Boolean(me?.isAdmin) || moduleAdmins.some((m) => m.userId === me?.id)
  const isManager = isAdmin || designers.some((d) => d.userId === me?.id)
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState<'all' | 'proposed' | 'approved'>('all')
  const [note, setNote] = useState<{ id: string; kind: 'reject' | 'revoke' } | null>(null)
  const [noteText, setNoteText] = useState('')
  useEffect(() => { void st.fetchAll(); void fetchProfiles() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const today = new Date().toISOString().slice(0, 10)
  const nameOf = (uid: string | null) => (uid ? profiles.find((p) => p.id === uid)?.fullName || 'کاربر' : '—')
  const person = (id: string) => assessments.find((a) => a.id === id)
  const rows = useMemo(() => st.decisions.filter((d) => filter === 'all' || d.status === filter), [st.decisions, filter])
  const states = useMemo(() => {
    const ids = [...new Set(st.decisions.map((d) => d.assessmentId))]
    return ids.map((id) => ({ id, state: disciplineState(st.decisions.filter((d) => d.assessmentId === id), today) })).filter((x) => x.state.deducted > 0 || !x.state.eligible || x.state.pending > 0)
  }, [st.decisions, today])

  if (!isManager) return <CompetencySidebarShell active="discipline" nav={nav} title="تصمیمات انضباطی" onExitToHub={onExitToHub}><div className="im-card im-empty" style={{ padding: 26 }}>این بخش فقط برای مدیر ماژول و طراحان ارزیابی است.</div></CompetencySidebarShell>

  const act = async (d: DisciplineRow, decision: 'approve' | 'reject' | 'revoke') => {
    if (decision === 'approve') return void st.decide(d.id, 'approve', '')
    setNote({ id: d.id, kind: decision }); setNoteText('')
  }
  return (
    <CompetencySidebarShell active="discipline" nav={nav} title="تصمیمات انضباطی" onExitToHub={onExitToHub} headerRight={<button className="im-btn im-btn-primary" onClick={() => setAdding(true)}><Plus size={14} /> پیشنهاد تصمیم</button>}>
      {st.error && <div className="im-card" role="alert" style={{ padding: '10px 14px', borderColor: 'var(--im-coral)' }}>{st.error}</div>}
      <p className="im-helper" style={{ margin: 0 }}>پیشنهاد تصمیم (کاهش امتیاز، تعلیق موقت یا ممنوع‌الکاری) تا زمانی که شخصی غیر از پیشنهاددهنده — از مدیران ماژول — آن را تصویب نکند اثری ندارد. تصمیم تصویب‌شده را می‌توان با ذکر دلیل لغو کرد. همهٔ مراحل در گزارش رویدادها ثبت می‌شود.</p>

      {states.length > 0 && (
        <section className="im-card comp-box">
          <header><h3><AlertTriangle size={15} aria-hidden /> وضعیت انضباطی افراد</h3></header>
          <ul className="comp-rows">
            {states.map(({ id, state }) => (
              <li key={id}><div className="comp-row-static"><span className="who"><b>{person(id)?.candidateName ?? '—'}</b><small>{person(id)?.candidatePosition}</small></span>
                <span className="step" style={{ color: state.eligible ? undefined : '#f87171' }}>{state.label}{state.suspendedUntil ? ` تا ${formatJalali(state.suspendedUntil)}` : ''}</span>
                <span className="step num">امتیاز رفتاری: {fa(state.conductScore)}</span>{state.pending > 0 && <span className="step" style={{ color: '#fbbf24' }}>{fa(state.pending)} پیشنهاد در انتظار</span>}</div></li>
            ))}
          </ul>
        </section>
      )}

      <div className="comp-pills" role="group" aria-label="فیلتر وضعیت">{(['all', 'proposed', 'approved'] as const).map((f) => <button key={f} className={`comp-pill${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? 'همه' : f === 'proposed' ? 'در انتظار تصمیم' : 'تصویب‌شده'}</button>)}</div>

      {rows.length === 0 ? <div className="im-card im-empty" style={{ padding: 26 }}>تصمیمی ثبت نشده است.</div> : (
        <section className="im-card comp-box">
          <ul className="comp-rows">
            {rows.map((d) => { const p = person(d.assessmentId); const mine = d.proposedBy === me?.id; return (
              <li key={d.id}><div className="comp-disc">
                <div className="head"><b>{p?.candidateName ?? '—'}</b><span className="comp-ready" style={{ ['--c' as string]: STATUS_COLOR[d.status] }}>{STATUS_LABEL_FA[d.status]}</span><span className="kind">{d.kind === 'work_ban' ? <Ban size={13} /> : <Gavel size={13} />} {KIND_LABEL_FA[d.kind]}{d.kind === 'score_deduction' ? ` (${fa(d.points ?? 0)} امتیاز)` : ''}</span></div>
                <p>{d.reason}</p>
                <small>پیشنهاد: {nameOf(d.proposedBy)} · {formatJalali(d.proposedAt.slice(0, 10))}{d.kind !== 'score_deduction' ? ` · از ${formatJalali(d.startDate)}${d.endDate ? ` تا ${formatJalali(d.endDate)}` : ' (بدون پایان)'}` : ''}{d.decidedBy ? ` · تصمیم: ${nameOf(d.decidedBy)}` : ''}{d.decisionNote ? ` — ${d.decisionNote}` : ''}{d.revokeReason ? ` · دلیل لغو: ${d.revokeReason}` : ''}</small>
                {isAdmin && d.status === 'proposed' && (mine ? <small style={{ color: 'var(--im-amber)' }}>پیشنهاددهنده نمی‌تواند خودش تصویب کند.</small> : <div className="acts"><button className="im-btn im-btn-primary im-btn-sm" onClick={() => void act(d, 'approve')}><Check size={13} /> تصویب</button><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => void act(d, 'reject')}><X size={13} /> رد</button></div>)}
                {isAdmin && d.status === 'approved' && <div className="acts"><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => void act(d, 'revoke')}><Undo2 size={13} /> لغو</button></div>}
              </div></li>
            ) })}
          </ul>
        </section>
      )}

      {note && (
        <div className="comp-drawer-bg" onClick={() => setNote(null)}>
          <div className="im-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', top: '20%', insetInline: 0, margin: 'auto', width: 'min(440px, 94vw)', padding: 18, display: 'grid', gap: 10, zIndex: 62 }}>
            <h3 style={{ margin: 0 }}>{note.kind === 'reject' ? 'دلیل رد پیشنهاد' : 'دلیل لغو تصمیم'}</h3>
            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="دلیل را بنویسید" />
            <div className="comp-talent-row"><button className="im-btn im-btn-primary" disabled={!noteText.trim()} onClick={async () => { if (await st.decide(note.id, note.kind, noteText.trim())) setNote(null) }}>ثبت</button><button className="im-btn im-btn-ghost" onClick={() => setNote(null)}>انصراف</button></div>
          </div>
        </div>
      )}
      {adding && <Propose people={assessments} onClose={() => setAdding(false)} onSave={async (a) => { if (await st.propose(a)) setAdding(false) }} />}
    </CompetencySidebarShell>
  )
}

function Propose({ people, onSave, onClose }: { people: { id: string; candidateName: string }[]; onSave: (a: { assessmentId: string; kind: DecisionKind; points: number | null; startDate: string; endDate: string | null; reason: string; evidenceNote: string }) => void; onClose: () => void }) {
  const [id, setId] = useState(''); const [kind, setKind] = useState<DecisionKind>('score_deduction'); const [points, setPoints] = useState(5)
  const today = new Date().toISOString().slice(0, 10); const [start, setStart] = useState(today); const [end, setEnd] = useState(''); const [reason, setReason] = useState(''); const [ev, setEv] = useState('')
  const ok = id && reason.trim() && (kind !== 'suspension' || end) && (kind !== 'score_deduction' || points > 0)
  return (
    <div className="comp-drawer-bg" onClick={onClose}>
      <div className="im-card" role="dialog" aria-modal="true" aria-label="پیشنهاد تصمیم انضباطی" onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', top: '8%', insetInline: 0, margin: 'auto', width: 'min(520px, 94vw)', maxHeight: '84vh', overflowY: 'auto', padding: 18, display: 'grid', gap: 12, zIndex: 62 }}>
        <h3 style={{ margin: 0 }}>پیشنهاد تصمیم انضباطی</h3>
        <label>فرد<select value={id} onChange={(e) => setId(e.target.value)}><option value="">انتخاب…</option>{people.map((x) => <option key={x.id} value={x.id}>{x.candidateName}</option>)}</select></label>
        <label>نوع تصمیم<select value={kind} onChange={(e) => setKind(e.target.value as DecisionKind)}>{(Object.keys(KIND_LABEL_FA) as DecisionKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL_FA[k]}</option>)}</select></label>
        {kind === 'score_deduction' && <label>مقدار کسر (از ۱۰۰ امتیاز رفتاری)<input type="number" min={1} max={100} value={points} onChange={(e) => setPoints(+e.target.value)} /></label>}
        {kind !== 'score_deduction' && <div className="comp-talent-row"><label className="comp-talent-f"><span>از تاریخ (میلادی)</span><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label><label className="comp-talent-f"><span>{kind === 'suspension' ? 'تا تاریخ (الزامی)' : 'تا تاریخ (خالی = بدون پایان)'}</span><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label></div>}
        <label>دلیل و مستند تصمیم<textarea value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <label>شواهد (شمارهٔ گزارش، نامه، گواهی…)<input value={ev} onChange={(e) => setEv(e.target.value)} /></label>
        <div className="comp-talent-row"><button className="im-btn im-btn-primary" disabled={!ok} onClick={() => onSave({ assessmentId: id, kind, points: kind === 'score_deduction' ? points : null, startDate: start, endDate: kind === 'score_deduction' ? null : end || null, reason: reason.trim(), evidenceNote: ev })}>ثبت پیشنهاد</button><button className="im-btn im-btn-ghost" onClick={onClose}>انصراف</button></div>
      </div>
    </div>
  )
}
