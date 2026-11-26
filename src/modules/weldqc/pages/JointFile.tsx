import { useMemo, useState, type CSSProperties } from 'react'
import { ArrowRight, BadgeCheck, CalendarClock, Cpu, Eye, Flame, Gavel, Lock, PaintRoller, Plus, Printer, Radiation, ScanSearch, ShieldCheck, Users, Waves, Wrench } from 'lucide-react'
import { useWqStore } from '../store/useWqStore'
import * as repo from '../repo'
import { DEFECT_COLOR, PASS_FA, VERDICT_FA } from '../lib/rules'
import { PASSES } from '../lib/crew'
import { QC_STATE_COLOR, QC_STATE_FA } from '../lib/analytics'
import { adviceFor, CODE_FA, CODE_TYPE, evaluate, type Code } from '../lib/api1104'
import { GRADE_COLOR } from '../lib/health'
import { codeOf, fa, faDate, useQc, weldLabel } from '../lib/useQc'
import { FilmViewer } from '../components/FilmViewer'
import { DefectForm, defectRow, newDraft } from '../components/DefectForm'
import { CrewTable, HealthRing, StageRail, WeldClock, type Stage } from '../components/PassportParts'
import { CoatingPanel, CrewEditor } from '../components/CrewCoating'
import { coveredHours } from '../lib/coverage'
import { openPassport, SIGN_ROLES } from '../lib/passportSheet'
import { pipeEnds, timeline } from '../lib/passport'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { circOf, clockOfMm, covered, crewShort, defaultFilmCount, mmOfClock, repairZone, uncovered } from '../lib/filmplan'
import { DefectTable, EvalCard, FilmQuality, FilmUpload, History, Opinions, QUALITY_COLOR, QUALITY_FA, RepairForm, roundName, Thumb, ThkEdit, VERDICT_COLOR, VtBlock } from '../components/FileParts'

type Sec = 'overview' | 'welding' | 'vt' | 'rt' | 'ai' | 'interp' | 'repair' | 'coating' | 'final'
const ACT_FA = { accepted: 'تأیید شد', modified: 'اصلاح شد', dismissed: 'رد شد', '': 'بررسی نشده' } as const

/**
 * شناسنامهٔ دیجیتال سرجوش — the passport of one weld: where it stands in its life (welding, VT, radiography, image
 * assistant, interpretation, repair, coating, coating inspection, final test, closure), each stage opening its own part
 * of the file; who welded which pass in which quadrant; and the Joint Health Index with every deduction explained.
 */
export function JointFile({ weld, onBack }: { weld: repo.QcWeld; onBack: () => void }) {
  const st = useWqStore()
  const q = useQc()
  const row = q.byId.get(weld.id)!
  const joint = row.joint, round = row.round, closed = !!joint?.closed
  const films = st.films.filter((f) => f.weldId === weld.id)
  const defects = st.defects.filter((d) => d.weldId === weld.id && !d.removed)
  const evals = st.evaluations.filter((e) => e.weldId === weld.id)
  const repairs = st.repairs.filter((r) => r.weldId === weld.id)
  const vts = st.vts.filter((v) => v.weldId === weld.id)
  const opinions = st.opinions.filter((o) => o.weldId === weld.id)
  const [viewer, setViewer] = useState<string | null>(null)
  const [addDefect, setAddDefect] = useState(false)
  const [preview, setPreview] = useState(false)
  const [crewOpen, setCrewOpen] = useState(false)
  const thk = row.thk, od = row.odMm, can = st.caps
  const rFilms = films.filter((f) => f.round === round), rDefects = defects.filter((d) => d.round === round)
  const rEval = [...evals].reverse().find((e) => e.round === round)
  const firstEval = [...evals].reverse().find((e) => e.round === 0)
  const uncoded = rDefects.filter((d) => !codeOf(d))
  const calc = useMemo(() => (thk && od ? evaluate({ odMm: od, thkMm: thk }, rDefects.filter((d) => codeOf(d) && (!d.filmId || rFilms.some((f) => f.id === d.filmId && f.quality === 'accepted'))).map((d) => ({ id: d.id, code: codeOf(d) as Code, lengthMm: d.lengthMm, widthMm: d.widthMm, depthMm: d.depthMm, positionMm: d.positionMm, densityOver: d.densityOver })), st.crit) : null), [thk, od, rDefects, rFilms, st.crit])
  const pendingFilms = rFilms.filter((f) => f.quality === 'pending').length
  const accFilms = rFilms.filter((f) => f.quality === 'accepted')
  const circ = od ? circOf(od) : null
  const placed = accFilms.some((f) => f.startMm != null)
  // round 0: the films together cover the whole girth; after a repair: they cover the repaired zone
  const prevRepair = round > 0 ? repairs.find((r) => r.round === round - 1) : undefined
  const prevRej = defects.filter((d) => d.round === round - 1 && d.verdict === 'repair')
  const zone = round > 0 ? (prevRepair?.clockFrom != null && prevRepair.clockTo != null ? { from: prevRepair.clockFrom, to: prevRepair.clockTo } : circ ? repairZone(prevRej.map((d) => ({ clock: d.clock, lengthMm: d.lengthMm })), circ) : null) : null
  const filmN = joint?.filmCount ?? (od ? defaultFilmCount(od) : null)
  const cov = circ && placed ? covered(accFilms, circ) : null
  const missSeq = round === 0 && filmN ? Array.from({ length: filmN }, (_, i) => i + 1).filter((k) => !accFilms.some((f) => f.seq === k)) : []
  const zoneMiss = round > 0 && zone && circ && placed ? uncovered(accFilms, mmOfClock(zone.from, circ), mmOfClock(zone.to, circ), circ) : null
  const cover = !placed && round === 0 ? coveredHours(accFilms.map((f) => f.segment)) : null
  const crewLack = crewShort(od ? od / 25.4 : null, Object.fromEntries(PASSES.map((p) => [p, [...new Set([...weld.stampsBy[p], ...row.crew.filter((c) => !c.removed && c.pass === p).map((c) => c.welderKey)])]])) as Record<'root' | 'hot' | 'fill' | 'cap', string[]>, st.crewMin)
  const ht = st.sections ?? []
  const matchingSections = weld.tieKm != null ? ht.filter((s) => weld.tieKm! >= s.kmFrom && weld.tieKm! <= s.kmTo) : []
  const htSec = matchingSections.length === 1 ? matchingSections[0] : undefined
  const aiRuns = films.filter((f) => f.ai)

  const coatApplied = !!weld.coat.fj || row.coatings.some((c) => c.kind === 'application')
  const coatInspected = !!weld.coat.bond || row.coatings.some((c) => c.kind === 'inspection')
  const coatFailed = weld.coat.fj?.result === 'rej' || weld.coat.bond?.verdict === 'rej' || row.coatings.some((c) => c.result === 'fail')
  const lastVt = [...vts].reverse()[0]
  const stages: Stage[] = [
    { id: 'welding', label: 'جوشکاری', icon: Flame, state: weld.welding ? 'done' : 'todo', date: weld.weldDate ? faDate(weld.weldDate) : undefined },
    { id: 'vt', label: 'بازرسی چشمی', icon: Eye, state: lastVt ? (lastVt.result === 'accept' ? 'done' : 'fail') : weld.vtReport === 'rej' ? 'fail' : weld.vtReport ? 'done' : 'todo', date: lastVt ? faDate(lastVt.at) : undefined },
    { id: 'rt', label: 'رادیوگرافی', icon: Radiation, state: films.some((f) => f.quality === 'accepted') ? 'done' : films.length ? 'now' : 'todo', date: films[0] ? faDate(films[0].createdAt) : undefined },
    { id: 'ai', label: 'تحلیل هوشمند', icon: Cpu, state: aiRuns.length ? 'done' : films.length ? 'now' : 'todo', hint: 'نواحی مشکوک و کیفیت تصویر' },
    { id: 'interp', label: 'تفسیر و ارزیابی', icon: ScanSearch, state: !evals.length ? (films.length ? 'now' : 'todo') : rEval && !rEval.signedAt ? 'now' : closed || rEval?.overall === 'accept' ? 'done' : 'fail', date: rEval ? faDate(rEval.signedAt ?? rEval.evaluatedAt) : undefined },
    { id: 'repair', label: `تعمیر (${fa(repairs.length)}/${fa(st.crit.maxRepairs)})`, icon: Wrench, state: !firstEval || (firstEval.overall === 'accept' && !repairs.length) ? 'na' : row.state === 'repair_due' ? 'now' : repairs.length ? 'done' : 'todo', date: repairs.at(-1) ? faDate(repairs.at(-1)!.createdAt) : undefined },
    { id: 'coating', label: 'پوشش سرجوش', icon: PaintRoller, state: coatApplied ? (weld.coat.fj?.result === 'rej' ? 'fail' : 'done') : 'todo', date: weld.coat.fj ? faDate(weld.coat.fj.date) : undefined },
    { id: 'coatinsp', label: 'بازرسی پوشش', icon: ShieldCheck, state: coatInspected ? (coatFailed ? 'fail' : 'done') : 'todo', date: weld.coat.bond ? faDate(weld.coat.bond.date) : undefined },
    { id: 'final', label: 'آزمون نهایی', icon: Waves, state: htSec?.failed ? 'fail' : htSec?.stage === 'accepted' ? 'done' : htSec ? 'now' : 'todo', hint: 'آزمون هیدرواستاتیک قطعهٔ شامل این سرجوش' },
    { id: 'closed', label: 'بسته شد', icon: Lock, state: closed ? (joint?.finalStatus === 'cut_out' ? 'fail' : 'done') : 'todo', date: closed ? faDate(joint?.closedAt) : undefined },
  ]
  const project = useMasterDataStore((x) => x.projects.find((p) => p.id === st.projectId))
  const ends = useMemo(() => pipeEnds(st.welds, st.pipes).get(weld.id), [st.welds, st.pipes, weld.id])
  const wps = st.wps.find((x) => x.id === joint?.wpsId)
  const steps = useMemo(() => timeline({ weld, vts, films, evals, repairs, coatings: row.coatings, closedAt: joint?.closedAt ?? null, finalFa: VERDICT_FA[joint?.finalStatus ?? 'accept'], nameOf: q.nameOf }), [weld, vts, films, evals, repairs, row.coatings, joint, q.nameOf]) // eslint-disable-line react-hooks/exhaustive-deps
  const hydro = htSec ? `قطعهٔ ${htSec.code}: ${htSec.failed ? 'مردود' : htSec.stage === 'accepted' ? 'پذیرفته' : 'در جریان'}` : ''
  const printSheet = () => { if (!openPassport({ row, projectName: project?.officialName ?? '', projectCode: project?.projectCode ?? '', ends, wps, films, defects, evals, repairs, vts, nameOf: q.nameOf, hydro })) st.run('', async () => { throw new Error('مرورگر پنجرهٔ چاپ را باز نکرد؛ اجازهٔ پنجرهٔ بازشو را بدهید.') }) }
  const [sec, setSec] = useState<Sec>('overview')
  const pick = (id: string) => setSec((id === 'coatinsp' ? 'coating' : id === 'closed' ? 'final' : id) as Sec)
  const h = row.health

  return (
    <div className="wq-file wq-passport">
      <header className="wq-file-head wq-rise">
        <button type="button" className="ps-btn is-ghost" onClick={onBack}><ArrowRight size={15} aria-hidden /> سرجوش‌ها</button>
        <div className="wq-file-title"><h2>سرجوش {weldLabel(weld)}</h2><span className="wq-state" style={{ '--c': QC_STATE_COLOR[row.state] } as CSSProperties}>{closed ? <Lock size={12} aria-hidden /> : null}{QC_STATE_FA[row.state]}</span></div>
        <button type="button" className="ps-btn is-primary" onClick={printSheet}><Printer size={15} aria-hidden /> فرم شناسنامه (چاپ / PDF)</button>
      </header>

      <section className="wq-strip wq-rise" style={{ '--i': 1 } as CSSProperties} aria-label="مشخصات سرجوش">
        <div><small>مقطع / سرجوش</small><b>{weldLabel(weld)}</b></div>
        <div><small>لولهٔ قبل ← لولهٔ بعد</small><b dir="ltr">{ends?.a || '—'} ← {ends?.b || weld.pipe || '—'}</b></div>
        <div><small>WPS</small><b dir="ltr">{wps ? `${wps.wpsNo}${wps.rev ? ` Rev.${wps.rev}` : ''}` : '—'}</b>{wps?.pqrNos ? <small dir="ltr">PQR {wps.pqrNos}</small> : null}</div>
        <div><small>قطر</small><b>{weld.central.size ? `${weld.central.size}″` : od ? `${fa(od / 25.4, 1)}″` : '—'}</b></div>
        <div><small>ضخامت</small><b>{thk ? `${fa(thk, 2)} mm` : '—'}</b>{!thk && <ThkEdit weldId={weld.id} />}</div>
        <div><small>طول لوله</small><b>{weld.lengthM != null ? `${fa(weld.lengthM, 2)} m` : '—'}</b></div>
        <div><small>طول جوش (π·OD)</small><b>{od ? `${fa(Math.PI * od)} mm` : '—'}</b></div>
        <div><small>گزارش جوشکاری</small><b>{weld.welding?.reportNo ?? '—'}</b><small>{weld.welding?.tieIn ? 'تای‌این' : ''}</small></div>
        <div className="wq-strip-h" style={{ '--c': GRADE_COLOR[h.grade] } as CSSProperties}><small>شاخص سلامت</small><b>{h.score == null ? '—' : fa(h.score)}</b></div>
      </section>

      <StageRail stages={stages} active={sec === 'coating' ? 'coating' : sec === 'final' ? 'final' : sec} onPick={pick} />
      <div className="wq-seg-tabs" role="tablist" aria-label="بخش‌های شناسنامه">
        {([['overview', 'خلاصه و شاخص سلامت'], ['welding', 'جوشکاران و ربع‌ها'], ['rt', 'فیلم‌ها'], ['interp', 'تفسیر و ارزیابی'], ['coating', 'پوشش']] as [Sec, string][]).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={sec === k} onClick={() => setSec(k)}>{l}</button>)}
      </div>

      {closed && <p className={`wq-closed ${joint?.finalStatus === 'cut_out' ? 'is-bad' : ''}`}><Lock size={15} aria-hidden /> پرونده با وضعیت «{VERDICT_FA[joint?.finalStatus ?? 'accept']}» در {faDate(joint?.closedAt)} بسته شد؛ نتایج رادیوگرافی دیگر تغییر نمی‌کند (پوشش و آزمون نهایی همچنان ثبت می‌شود).</p>}

      <div className="wq-pp-grid">
        <div className="wq-pp-main" key={sec}>
          {sec === 'overview' && (
            <>
              <section className="wq-card wq-rise"><header className="wq-card-head"><BadgeCheck size={16} aria-hidden /><h3>شاخص سلامت سرجوش — چرا این عدد؟</h3></header>
                <div className="wq-hbreak">
                  <div><h4>جوش {h.weld.score == null ? '' : `· ${fa(h.weld.score)}`}<small> (۷۰٪ وزن)</small></h4>{h.weld.items.length ? <ul>{h.weld.items.map((i) => <li key={i.label}><b>{fa(i.points, 1)}</b><span><strong>{i.label}</strong> — {i.why}</span></li>)}</ul> : <p className="ps-hint">بدون کسر امتیاز: بدون تعمیر، فیلم تمیز و جوشکاران با سابقهٔ مناسب.</p>}</div>
                  <div><h4>پوشش {h.coating.score == null ? '· ثبت نشده' : `· ${fa(h.coating.score)}`}<small> (۳۰٪ وزن)</small></h4>{h.coating.items.length ? <ul>{h.coating.items.map((i) => <li key={i.label}><b>{fa(i.points, 1)}</b><span><strong>{i.label}</strong> — {i.why}</span></li>)}</ul> : <p className="ps-hint">{h.coating.score == null ? 'پوشش این سرجوش هنوز ثبت نشده است.' : 'بدون کسر امتیاز.'}</p>}</div>
                </div>
                {h.notes.length > 0 && <ul className="wq-notes">{h.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
                <p className="ps-meta">قواعد: تعمیر اول −۲۰ و دوم −۱۵، سابقهٔ ترک −۱۰، نشانه‌های پذیرفته‌شده تا −۱۰ به نسبت حد مجاز مصرف‌شده، VT رد −۵، نرخ تعمیر جوشکاران بالاتر از پروژه تا −۱۰، صلاحیت نامعتبر −۱۰؛ پوشش: رد −۳۰، هر تعمیر −۱۵، منفذ −۱۰، چسبندگی −۲۰، سابقهٔ پوشش‌کار تا −۱۰. امتیاز = ۷۰٪ جوش + ۳۰٪ پوشش.</p>
              </section>
              <section className="wq-card wq-rise" style={{ '--i': 1 } as CSSProperties}><header className="wq-card-head"><Users size={16} aria-hidden /><h3>جوشکاران و محل ناپیوستگی‌ها</h3><button type="button" className="ps-link wq-head-link" onClick={() => setSec('welding')}>جزئیات</button></header>
                <WeldClock crew={row.crew} sides={weld.sides} defects={defects.map((d) => ({ code: codeOf(d), clock: d.clock, pass: d.pass, verdict: d.verdict }))} nameOf={q.nameOf} />
              </section>
              <section className="wq-card wq-rise" style={{ '--i': 2 } as CSSProperties}><header className="wq-card-head"><CalendarClock size={16} aria-hidden /><h3>مواعد زمانی عملیات</h3></header>
                {steps.length ? <div className="wq-tbl-wrap"><table className="wq-tbl"><thead><tr><th>عملیات</th><th>تاریخ</th><th>فاصله از قبلی</th><th>انجام‌دهنده / تأییدکننده</th><th>شرح</th></tr></thead>
                  <tbody>{steps.map((x, i) => { const gap = i ? Math.round((Date.parse(x.date) - Date.parse(steps[i - 1].date)) / 864e5) : null; return <tr key={x.key}><td>{x.label}</td><td>{faDate(x.date)}</td><td className={gap != null && gap > 7 ? 'is-late' : ''}>{gap == null ? '—' : `${fa(gap)} روز`}</td><td>{x.by || '—'}</td><td><small>{x.note || '—'}</small></td></tr> })}</tbody></table></div> : <p className="ps-hint">هنوز تاریخی برای این سرجوش ثبت نشده است.</p>}
              </section>
              <History evals={evals} defects={defects} repairs={repairs} films={films} current={closed ? 99 : round} onFilm={setViewer} />
              <Opinions weldId={weld.id} opinions={opinions} evals={evals} />
            </>
          )}

          {sec === 'welding' && (
            <section className="wq-card wq-rise"><header className="wq-card-head"><Users size={16} aria-hidden /><h3>جوشکاران به تفکیک پاس و ربع</h3>{(can.edit || can.submit) && !crewOpen && <button type="button" className="ps-btn wq-head-link" onClick={() => setCrewOpen(true)}><Plus size={14} aria-hidden /> ثبت جوشکار ربع</button>}</header>
              <div className="wq-weld-split"><WeldClock crew={row.crew} sides={weld.sides} defects={defects.map((d) => ({ code: codeOf(d), clock: d.clock, pass: d.pass, verdict: d.verdict }))} nameOf={q.nameOf} /><CrewTable crew={row.crew} sides={weld.sides} nameOf={q.nameOf} /></div>
              {crewLack.map((x) => <p key={x.pass} className="ps-hint is-warn">پاس «{PASS_FA[x.pass]}»: {fa(x.have)} جوشکار ثبت شده است؛ برای قطر {fa((od ?? 0) / 25.4, 0)} اینچ دست‌کم {fa(x.need)} جوشکار لازم است.</p>)}
              {crewOpen && <CrewEditor weld={weld} crew={row.crew} onClose={() => setCrewOpen(false)} />}
              <p className="ps-meta">منبع: گزارش جوشکاری {weld.welding?.reportNo ?? '—'} ({faDate(weld.weldDate || null)}) — ستون‌های R (سمت مسیر) و C (سمت کانال) به ترتیب ربع‌های ۱–۲ و ۳–۴ گرفته می‌شوند تا ترکیب دقیق ربع‌ها ثبت شود.</p>
            </section>
          )}

          {sec === 'vt' && <VtBlock weldId={weld.id} round={round} vts={vts.filter((v) => v.round === round)} />}

          {sec === 'rt' && (
            <section className="wq-card wq-rise"><header className="wq-card-head"><Radiation size={16} aria-hidden /><h3>فیلم‌های {roundName(round)}</h3></header>
              {rFilms.length ? <FilmList films={rFilms} defects={defects} onOpen={setViewer} canQuality={can.submit && !closed} /> : <p className="ps-hint">هنوز فیلمی برای این راند بارگذاری نشده است.</p>}
              {can.submit && !closed && <FilmUpload weldId={weld.id} round={round} films={rFilms} odMm={od} filmCount={joint?.filmCount ?? null} zone={zone} />}
              {films.some((f) => f.round !== round) && <><h4 className="wq-sub">راندهای دیگر</h4><FilmList films={films.filter((f) => f.round !== round)} defects={defects} onOpen={setViewer} canQuality={false} /></>}
            </section>
          )}

          {sec === 'ai' && (
            <section className="wq-card wq-rise"><header className="wq-card-head"><Cpu size={16} aria-hidden /><h3>تحلیل هوشمند فیلم‌ها</h3></header>
              <p className="ps-meta">دستیار تصویر در میز نور هر فیلم اجرا می‌شود: نوار جوش را پیدا می‌کند، نواحی با تیرگی غیرعادی نسبت به امتداد جوش را جدا می‌کند و از روی شکل، تیرگی و جایگاه نسبت به خط مرکز جوش، کد احتمالی را با دلیل پیشنهاد می‌دهد. کیفیت تصویر هم هنگام بارگذاری سنجیده می‌شود.</p>
              {films.length ? films.map((f) => (
                <div key={f.id} className="wq-ai-film">
                  <button type="button" className="wq-thumb" onClick={() => setViewer(f.id)} aria-label="باز کردن فیلم"><Thumb path={f.displayPath ?? f.path} alt={f.fileName} /><span><ScanSearch size={13} aria-hidden /> {f.ai ? 'میز نور' : 'اجرای دستیار'}</span></button>
                  <div>
                    <b>{f.segment ? `قطعهٔ ${f.segment}` : f.fileName} · {f.examType}{f.round ? fa(f.round) : ''}</b>
                    {f.metrics?.verdict && <p className={`wq-q-line wq-q-${f.metrics.verdict}`}>کیفیت تصویر: {f.metrics.verdict === 'good' ? 'خوب' : f.metrics.verdict === 'fair' ? 'متوسط' : 'ضعیف'} · کنتراست {fa(f.metrics.contrast, 1)} · وضوح {fa(f.metrics.sharpness)}{f.metrics.notes?.length ? ` — ${f.metrics.notes.join('؛ ')}` : ''}</p>}
                    {f.ai ? (
                      <div className="wq-tbl-wrap"><table className="wq-tbl"><thead><tr><th>پیشنهاد</th><th>موقعیت</th><th>اطمینان</th><th>دلیل</th><th>اقدام مفسر</th></tr></thead>
                        <tbody>{f.ai.items.map((x, k) => <tr key={k}><td>{x.code ? CODE_FA[x.code as Code] ?? x.code : '—'}</td><td>{x.clock != null ? `ساعت ${fa(x.clock, 1)}` : '—'}</td><td>{fa(x.confidence * 100)}٪</td><td><small>{x.why}</small></td><td><span className={`wq-act is-${x.action || 'none'}`}>{ACT_FA[x.action]}</span></td></tr>)}</tbody></table></div>
                    ) : <p className="ps-hint">دستیار هنوز روی این فیلم اجرا نشده؛ فیلم را باز کنید و «نواحی مشکوک» را بزنید.</p>}
                  </div>
                </div>
              )) : <p className="ps-hint">فیلمی بارگذاری نشده است.</p>}
            </section>
          )}

          {sec === 'interp' && (
            <>
              <section className="wq-card wq-rise"><header className="wq-card-head"><ScanSearch size={16} aria-hidden /><h3>ناپیوستگی‌های {roundName(round)}</h3>{can.submit && !closed && !addDefect && <button type="button" className="ps-btn wq-head-link" onClick={() => setAddDefect(true)}><Plus size={14} aria-hidden /> ثبت بدون کادر</button>}</header>
                {addDefect && <DefectForm weld={weld} crew={row.crew} odMm={od} init={newDraft()} onCancel={() => setAddDefect(false)} onSave={(d) => st.run(`«${CODE_FA[d.code]}» ثبت شد`, () => repo.addDefect(defectRow(d, { project_id: st.projectId, weld_id: weld.id, film_id: rFilms.find((f) => f.quality === 'accepted')?.id ?? null, round, created_name: st.me() })))} />}
                <DefectTable defects={rDefects} films={films} canRemove={(can.submit || can.configure) && !closed} />
                {uncoded.length > 0 && <p className="ps-hint is-warn">{fa(uncoded.length)} ناپیوستگی کد API 1104 ندارد و در ارزیابی شمرده نمی‌شود؛ آن را کنار بگذارید و با کد درست دوباره ثبت کنید.</p>}
              </section>
              {!closed && (
                <section className="wq-card wq-eval wq-rise" style={{ '--i': 1 } as CSSProperties}><header className="wq-card-head"><Gavel size={16} aria-hidden /><h3>ارزیابی طبق API 1104 و تأیید نهایی</h3></header>
                  {(!thk || !od) && <p className="ps-hint is-warn">{!od ? 'قطر لوله' : 'ضخامت دیواره'} در فهرست مرکزی جوش‌ها نیست؛ برای محاسبهٔ طول جوش و حدود پذیرش لازم است.</p>}
                  {rEval ? <EvalCard e={rEval} defects={rDefects} round={round} /> : <p className="ps-hint">هنوز ارزیابی‌ای برای این راند ثبت نشده است.</p>}
                  {can.submit && calc && (!rEval || rEval.signedAt == null) && !rFilms.some((f) => f.quality === 'accepted') && <p className="ps-hint">ارزیابی پس از بارگذاری فیلم این راند و تأیید کیفیت آن ممکن است.</p>}
                  {pendingFilms > 0 && <p className="ps-hint is-warn">کیفیت {fa(pendingFilms)} فیلم این راند هنوز بررسی نشده است؛ پیش از ارزیابی برای هر فیلم تأیید، ریتیک یا ریشوت ثبت کنید.</p>}
                  {cover && cover.hours < 12 && <p className="ps-hint is-warn">فیلم‌های تأییدشده {fa(cover.hours, 1)} از ۱۲ ساعت محیط جوش را می‌پوشانند؛ بازهٔ {cover.gaps.map(([a, b]) => `${fa(a, 1)} تا ${fa(b, 1)}`).join(' و ')} فیلم تأییدشده ندارد. ارزیابی بدون پوشش کامل محیط معتبر نیست.</p>}
                  {round === 0 && cov && circ && cov.gaps.length > 0 && <p className="ps-hint is-warn">فیلم‌های تأییدشده {fa(cov.mm)} از {fa(circ)} میلی‌متر محیط جوش را می‌پوشانند{missSeq.length ? ` (فیلم ${missSeq.map((k) => fa(k)).join('، ')} از ${fa(filmN ?? 0)} تأییدشده نیست)` : ''}؛ بدون فیلم: {cov.gaps.map(([a, b]) => `ساعت ${fa(clockOfMm(a, circ), 1)} تا ${fa(clockOfMm(b, circ) || 12, 1)}`).join(' و ')}. ارزیابی بدون پوشش کامل محیط معتبر نیست.</p>}
                  {round > 0 && zone && zoneMiss != null && zoneMiss > 0 && <p className="ps-hint is-warn">فیلم‌های RS تأییدشده {fa(zoneMiss)} میلی‌متر از ناحیهٔ تعمیر (ساعت {fa(zone.from, 1)} تا {fa(zone.to, 1)}) را نمی‌پوشانند.</p>}
                  {round > 0 && zone && zoneMiss === 0 && <p className="ps-meta">فیلم‌های RS ناحیهٔ تعمیر (ساعت {fa(zone.from, 1)} تا {fa(zone.to, 1)}) را کامل می‌پوشانند؛ بقیهٔ محیط با نتیجهٔ راند قبل پذیرفته است.</p>}
                  {!placed && !cover && accFilms.length > 0 && <p className="ps-meta">جای فیلم‌ها روی محیط ثبت نشده است (فیلم‌های قدیمی)؛ سامانه نمی‌تواند پوشش {round > 0 ? 'ناحیهٔ تعمیر' : 'کامل محیط جوش'} را کنترل کند.</p>}
                  {can.submit && calc && thk && !pendingFilms && (!rEval || rEval.signedAt == null) && rFilms.some((f) => f.quality === 'accepted') && (preview ? (
                    <div className="wq-preview" style={{ '--c': VERDICT_COLOR[calc.overall] } as CSSProperties}>
                      <b>نتیجه طبق API 1104: {VERDICT_FA[calc.overall]}</b>
                      <div className="wq-limits">{calc.limits.map((l) => <span key={l.label}><small>{l.label}</small>{l.value}</span>)}</div>
                      <ul className="wq-verdicts">{calc.findings.map((v) => { const d = rDefects.find((x) => x.id === v.id)!; const c = codeOf(d) as Code; return <li key={v.id} style={{ '--c': VERDICT_COLOR[v.verdict] } as CSSProperties}><b>{CODE_FA[c]} · {fa(d.lengthMm, 1)} mm{d.clock != null ? ` · ساعت ${fa(d.clock, 1)}` : ''}</b><span>{VERDICT_FA[v.verdict]} — {v.reasons.join(' | ')}</span></li> })}</ul>
                      {!calc.findings.length && <p className="ps-meta">ناپیوستگی‌ای ثبت نشده؛ جوش قابل قبول است.</p>}
                      <p className="ps-meta">{calc.note}</p>
                      <div className="wq-form-actions">
                        <button type="button" className="ps-btn is-primary" onClick={() => void st.run('ارزیابی ثبت شد؛ منتظر تأیید نهایی بازرس NDT است', () => repo.evaluate(weld.id, calc.overall, calc.note, calc.findings.map((f) => { const c = codeOf(rDefects.find((x) => x.id === f.id)!) as Code; return { id: f.id, verdict: f.verdict, reason: f.reasons.join(' | '), advice: adviceFor(c, f.verdict) } }), thk, st.me())).then((ok) => ok && setPreview(false))}><BadgeCheck size={15} aria-hidden /> ثبت ارزیابی</button>
                        <button type="button" className="ps-btn is-ghost" onClick={() => setPreview(false)}>انصراف</button>
                      </div>
                    </div>
                  ) : <button type="button" className="ps-btn is-primary" onClick={() => setPreview(true)}><Gavel size={15} aria-hidden /> {rEval ? 'ارزیابی دوباره با ناپیوستگی‌های فعلی' : 'ارزیابی طبق API 1104'}</button>)}
                </section>
              )}
              <Opinions weldId={weld.id} opinions={opinions} evals={evals} />
            </>
          )}

          {sec === 'repair' && (
            <section className="wq-card wq-rise"><header className="wq-card-head"><Wrench size={16} aria-hidden /><h3>تعمیرها ({fa(repairs.length)} از {fa(st.crit.maxRepairs)} مجاز)</h3></header>
              {repairs.length ? <ul className="wq-mini">{repairs.map((r) => { const next = q.last.get(`${weld.id}#${r.round + 1}`); return <li key={r.id}><i style={{ background: !next ? '#64748b' : next.overall === 'accept' ? '#22c55e' : '#ef4444' }} />تعمیر {r.round === 0 ? 'اول' : 'دوم'} · {r.method} · جوشکار {r.performedBy}{q.nameOf(r.performedBy) !== r.performedBy ? ` (${q.nameOf(r.performedBy)})` : ''}{r.repairWps ? ` · ${r.repairWps}` : ''} · {faDate(r.createdAt)} · {!next ? 'منتظر RS' : next.overall === 'accept' ? 'در RS پذیرفته شد' : 'در RS دوباره رد شد'}</li> })}</ul> : <p className="ps-hint">{row.state === 'repair_due' ? '' : 'این سرجوش تعمیری نداشته است.'}</p>}
              {rEval?.signedAt && rEval.overall === 'repair' && round < st.crit.maxRepairs && !closed && <RepairForm weld={weld} round={round} />}
            </section>
          )}

          {sec === 'coating' && (
            <section className="wq-card wq-rise"><header className="wq-card-head"><PaintRoller size={16} aria-hidden /><h3>پوشش سرجوش و بایگانی آزمون‌ها</h3></header>
              <CoatingPanel weld={weld} coatings={row.coatings} />
            </section>
          )}

          {sec === 'final' && (
            <section className="wq-card wq-rise"><header className="wq-card-head"><Waves size={16} aria-hidden /><h3>آزمون نهایی و بسته شدن پرونده</h3></header>
              <ul className="wq-final">
                <li className={closed ? 'is-ok' : ''}><b>رادیوگرافی</b><span>{closed ? `بسته شد — ${VERDICT_FA[joint?.finalStatus ?? 'accept']} (${faDate(joint?.closedAt)})` : QC_STATE_FA[row.state]}</span></li>
                <li className={coatInspected && !coatFailed ? 'is-ok' : coatFailed ? 'is-bad' : ''}><b>پوشش</b><span>{coatInspected ? (coatFailed ? 'مردود / نیاز به تعمیر' : 'بازرسی و قبول') : coatApplied ? 'اجرا شده، بازرسی ثبت نشده' : 'ثبت نشده'}</span></li>
                <li className={htSec?.failed ? 'is-bad' : htSec?.stage === 'accepted' ? 'is-ok' : ''}><b>آزمون هیدرواستاتیک</b><span>{hydro || (weld.tieKm == null ? 'کیلومتر این سرجوش ثبت نشده' : 'قطعهٔ آزمون شامل این کیلومتر تعریف نشده')}</span></li>
              </ul>
              <h4 className="wq-sub">تأییدهای شناسنامه</h4>
              <p className="ps-meta">آزادسازی سرجوش با تأیید سرپرست نظارت، پس از پذیرش امضاشده NDT و پذیرش هیدروتست قطعهٔ همان سرجوش ثبت می‌شود.</p>
              <div className="wq-signs">{SIGN_ROLES.map(([k, label]) => { const g = joint?.signs?.[k], may = k === 'supervision_head' ? can.approve : can.edit; return (
                <div key={k} className={g ? 'is-done' : ''}><b>{label}</b>{g ? <span>{g.name}<small>{faDate(g.at)}</small></span> : <small>امضا نشده</small>}
                  {may && <button type="button" className="ps-btn" onClick={() => void st.run(`تأیید «${label}» ثبت شد`, () => repo.passportSign(weld.id, k, st.me()))}>{k === 'supervision_head' ? 'ثبت آزادسازی' : g ? 'تأیید دوباره' : 'تأیید می‌کنم'}</button>}
                  {g && can.configure && <button type="button" className="ps-x" aria-label={`برداشتن تأیید ${label}`} onClick={() => void st.run('تأیید برداشته شد', () => repo.passportSign(weld.id, k, null))}>×</button>}</div>
              ) })}</div>
              <p className="ps-meta">هر تأیید با نام کاربر و تاریخ روی فرم شناسنامه چاپ می‌شود؛ برای نسخهٔ کاغذی، جای امضا و مهر زیر هر نام خالی می‌ماند.</p>
              <button type="button" className="ps-btn is-primary" onClick={printSheet}><Printer size={14} aria-hidden /> فرم شناسنامهٔ سرجوش (چاپ / PDF)</button>
            </section>
          )}
        </div>

        <aside className="wq-pp-side">
          <section className="wq-card wq-health-card"><HealthRing h={h} /><div><b>شاخص سلامت سرجوش</b><small>جوش {h.weld.score == null ? '—' : fa(h.weld.score)} · پوشش {h.coating.score == null ? '—' : fa(h.coating.score)}</small><button type="button" className="ps-link" onClick={() => setSec('overview')}>دلایل امتیاز</button></div></section>
          <section className="wq-card"><header className="wq-card-head"><Users size={15} aria-hidden /><h3>جوشکاران این سرجوش</h3></header>
            {row.welders.length ? <ul className="wq-side-welders">{row.welders.map((k) => { const s = q.welderStats.get(k); return <li key={k}><b className="ps-code">{k}</b><span>{q.nameOf(k) !== k ? q.nameOf(k) : 'خارج از فهرست'}</span><small>{s?.evaluated ? `نرخ تعمیر ${fa((s.repairRate ?? 0) * 100, 1)}٪ · امتیاز ${fa(s.score)}` : 'سابقهٔ رادیوگرافی ندارد'}</small></li> })}</ul> : <p className="ps-hint">ثبت نشده</p>}
          </section>
          {defects.length > 0 && <section className="wq-card"><header className="wq-card-head"><ScanSearch size={15} aria-hidden /><h3>ناپیوستگی‌ها</h3></header><ul className="wq-mini">{defects.map((d) => { const c = codeOf(d); return <li key={d.id}><i style={{ background: DEFECT_COLOR[c ? CODE_TYPE[c] : d.type] }} />{c || '—'} · {fa(d.lengthMm, 1)} mm · {d.round ? `RS${fa(d.round)}` : 'RT'}{d.verdict ? ` · ${VERDICT_FA[d.verdict]}` : ''}</li> })}</ul></section>}
        </aside>
      </div>
      {viewer && <FilmViewer filmId={viewer} weld={weld} readOnly={closed} onClose={() => setViewer(null)} />}
    </div>
  )
}

function FilmList({ films, defects, onOpen, canQuality }: { films: repo.Film[]; defects: repo.Defect[]; onOpen: (id: string) => void; canQuality: boolean }) {
  return (
    <ul className="wq-films">{films.map((f) => (
      <li key={f.id} style={{ '--c': QUALITY_COLOR[f.quality] } as CSSProperties}>
        <button type="button" className="wq-thumb" onClick={() => onOpen(f.id)} aria-label={`باز کردن فیلم ${f.segment || f.fileName} برای تفسیر`}><Thumb path={f.displayPath ?? f.path} alt={f.fileName} /><span><ScanSearch size={14} aria-hidden /> تفسیر</span></button>
        <div className="wq-film-meta">
          <b>{f.segment ? `قطعهٔ ${f.segment}` : f.fileName}</b>
          <small>{f.examType}{f.round ? fa(f.round) : ''} · نوبت {fa(f.attempt)}{f.iqi ? ` · IQI ${f.iqi}` : ''}{f.density ? ` · دانسیته ${f.density}` : ''}{f.origMime.includes('tif') ? ' · اصل TIFF' : ''}</small>
          <span className="wq-q">{QUALITY_FA[f.quality]}{f.qualityName ? ` · ${f.qualityName}` : ''}</span>
          {f.metrics?.verdict && <small className={`wq-q-${f.metrics.verdict}`}>کیفیت تصویر (خودکار): {f.metrics.verdict === 'good' ? 'خوب' : f.metrics.verdict === 'fair' ? 'متوسط' : 'ضعیف'}</small>}
          <small>{fa(defects.filter((d) => d.filmId === f.id).length)} ناپیوستگی · {f.pxPerMm ? 'کالیبره' : 'کالیبره نشده'}</small>
          {canQuality && <FilmQuality film={f} />}
        </div>
      </li>
    ))}</ul>
  )
}
