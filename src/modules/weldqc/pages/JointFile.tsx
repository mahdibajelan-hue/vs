import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ArrowRight, BadgeCheck, Camera, CheckCircle2, ClipboardList, Eye, FileImage, Flame, Gavel, Lock, MessageSquareText, Plus, Printer, ScanSearch, Signature, Trash2, Upload, Wrench, XCircle } from 'lucide-react'
import { useWqStore } from '../store/useWqStore'
import * as repo from '../repo'
import { evaluateJoint, DEFECT_COLOR, DEFECT_FA, PASS_FA, VERDICT_FA, type Verdict } from '../lib/rules'
import { PASSES, QC_STATE_COLOR, QC_STATE_FA } from '../lib/analytics'
import { fa, faDate, useQc, weldLabel } from '../lib/useQc'
import { FilmViewer } from '../components/FilmViewer'
import { DefectForm, newDraft } from '../components/DefectForm'

const QUALITY_FA: Record<repo.Film['quality'], string> = { pending: 'در انتظار بررسی کیفیت', accepted: 'کیفیت تأیید شد', retake: 'ریتیک — تکرار به درخواست کارفرما', reshoot: 'ریشوت — تکرار به هزینهٔ پیمانکار RT' }
const QUALITY_COLOR: Record<repo.Film['quality'], string> = { pending: '#0ea5e9', accepted: '#22c55e', retake: '#f59e0b', reshoot: '#ef4444' }
const VERDICT_COLOR: Record<Verdict, string> = { accept: '#22c55e', repair: '#f97316', cut_out: '#ef4444' }
const roundName = (r: number) => (r === 0 ? 'RT — رادیوگرافی اولیه' : `RS${fa(r)} — پس از تعمیر ${r === 1 ? 'اول' : 'دوم'}`)

function Thumb({ path, alt }: { path: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { let off = false; void repo.signedUrl(path).then((u) => { if (!off) setUrl(u) }); return () => { off = true } }, [path])
  return url ? <img src={url} alt={alt} loading="lazy" /> : <span className="wq-thumb-ph"><FileImage size={20} aria-hidden /></span>
}

/**
 * پروندهٔ کیفی سرجوش — one weld from the central register, with everything QC records on it round by round: VT, films and
 * their quality, interpretation and defects (each charged to the welders of its pass), the automatic evaluation, the NDT
 * inspector's sign-off, the repair and the next round. The welders and the weld's facts are read, never typed here.
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
  const thk = row.thk
  const can = st.caps
  const rFilms = films.filter((f) => f.round === round), rDefects = defects.filter((d) => d.round === round)
  const rEval = [...evals].reverse().find((e) => e.round === round)
  const calc = useMemo(() => (thk ? evaluateJoint(thk, rDefects.filter((d) => !d.filmId || rFilms.some((f) => f.id === d.filmId && f.quality === 'accepted')).map((d) => ({ id: d.id, type: d.type, lengthMm: d.lengthMm, depthMm: d.depthMm, positionMm: d.positionMm })), st.crit) : null), [thk, rDefects, rFilms, st.crit])
  const welders = [...new Set(PASSES.flatMap((p) => weld.stampsBy[p]))]

  return (
    <div className="wq-file">
      <header className="wq-file-head wq-rise">
        <button type="button" className="ps-btn is-ghost" onClick={onBack}><ArrowRight size={15} aria-hidden /> سرجوش‌ها</button>
        <div className="wq-file-title"><h2>سرجوش {weldLabel(weld)}</h2><span className="wq-state" style={{ '--c': QC_STATE_COLOR[row.state] } as CSSProperties}>{closed ? <Lock size={12} aria-hidden /> : null}{QC_STATE_FA[row.state]}</span></div>
        <button type="button" className="ps-btn" onClick={() => window.print()}><Printer size={15} aria-hidden /> چاپ گزارش</button>
      </header>

      <section className="wq-card wq-ident wq-rise" style={{ '--i': 1 } as CSSProperties}>
        <div className="wq-ident-grid">
          <div><small>لوله</small><b>{weld.pipe || '—'}</b></div>
          <div><small>قطر</small><b>{weld.central.size ? `${weld.central.size}″` : '—'}</b></div>
          <div><small>ضخامت دیواره (t)</small><b>{thk ? `${fa(thk, 2)} mm` : '—'}</b>{!thk && <ThkEdit weldId={weld.id} />}</div>
          <div><small>تاریخ جوشکاری</small><b>{faDate(weld.weldDate || null)}</b><small>{weld.welding ? `گزارش ${weld.welding.reportNo}${weld.welding.tieIn ? ' · تای‌این' : ''}` : 'گزارش جوشکاری ثبت نشده'}</small></div>
          <div><small>نتیجهٔ RT در گزارش اجرا</small><b>{weld.rt ? (weld.rt.result === 'acc' ? 'قابل قبول' : weld.rt.result === 'rep' ? 'تعمیر' : weld.rt.result || '—') : '—'}</b><small>{weld.rt ? `${faDate(weld.rt.date)} · ${weld.rt.reportNo}` : 'فقط برای مقایسه'}</small></div>
        </div>
        <div className="wq-passes" aria-label="جوشکاران هر پاس">
          {PASSES.map((p) => (
            <div key={p} className={weld.stampsBy[p].length ? '' : 'is-empty'}><small>{PASS_FA[p]}</small>{weld.stampsBy[p].length ? weld.stampsBy[p].map((s) => <span key={s}><b className="ps-code">{s}</b>{q.nameOf(s) !== s ? q.nameOf(s) : ''}</span>) : <em>—</em>}</div>
          ))}
        </div>
        {!welders.length && <p className="ps-hint is-warn">مهر جوشکاران این سرجوش در گزارش جوشکاری «مدیریت اجرا» ثبت نشده؛ عیوب به جوشکاری نسبت داده نمی‌شوند تا گزارش کامل شود.</p>}
      </section>

      <ol className="wq-rounds wq-rise" style={{ '--i': 2 } as CSSProperties} aria-label="راندهای بازرسی">
        {[0, 1, 2].map((r) => {
          const e = [...evals].reverse().find((x) => x.round === r)
          const stt = r > round ? 'future' : r < round ? 'done' : closed ? 'done' : 'now'
          return (
            <li key={r} className={`is-${stt}`} style={{ '--c': e ? VERDICT_COLOR[e.overall] : stt === 'now' ? '#8b5cf6' : 'var(--border-soft)' } as CSSProperties}>
              <span className="wq-round-dot">{e?.signedAt ? (e.overall === 'accept' ? <CheckCircle2 size={16} aria-hidden /> : e.overall === 'cut_out' ? <XCircle size={16} aria-hidden /> : <Wrench size={16} aria-hidden />) : fa(r + 1)}</span>
              <b>{roundName(r)}</b><small>{e ? `${VERDICT_FA[e.overall]}${e.signedAt ? ' · تأیید بازرس' : ' · منتظر تأیید'}` : stt === 'future' ? 'در صورت تعمیر' : 'در جریان'}</small>
            </li>
          )
        })}
      </ol>

      {closed && <p className={`wq-closed ${joint?.finalStatus === 'cut_out' ? 'is-bad' : ''}`}><Lock size={15} aria-hidden /> پرونده با وضعیت «{VERDICT_FA[joint?.finalStatus ?? 'accept']}» در {faDate(joint?.closedAt)} بسته شد؛ دیگر چیزی در آن تغییر نمی‌کند.</p>}

      {!closed && (
        <>
          <VtBlock weldId={weld.id} round={round} vts={vts.filter((v) => v.round === round)} />

          <section className="wq-card wq-rise" style={{ '--i': 3 } as CSSProperties}>
            <header className="wq-card-head"><FileImage size={16} aria-hidden /><h3>فیلم‌های {roundName(round)}</h3></header>
            {rFilms.length ? <ul className="wq-films">{rFilms.map((f) => (
              <li key={f.id} style={{ '--c': QUALITY_COLOR[f.quality] } as CSSProperties}>
                <button type="button" className="wq-thumb" onClick={() => setViewer(f.id)} aria-label={`باز کردن فیلم ${f.segment || f.fileName} برای تفسیر`}><Thumb path={f.path} alt={f.fileName} /><span><ScanSearch size={14} aria-hidden /> تفسیر</span></button>
                <div className="wq-film-meta">
                  <b>{f.segment ? `قطعهٔ ${f.segment}` : f.fileName}</b>
                  <small>{f.examType}{f.round ? fa(f.round) : ''} · نوبت {fa(f.attempt)}{f.iqi ? ` · IQI ${f.iqi}` : ''}{f.density ? ` · دانسیته ${f.density}` : ''}</small>
                  <span className="wq-q">{QUALITY_FA[f.quality]}{f.qualityName ? ` · ${f.qualityName}` : ''}</span>
                  {f.qualityNote && <small>{f.qualityNote}</small>}
                  <small>{fa(defects.filter((d) => d.filmId === f.id).length)} عیب · {f.pxPerMm ? 'کالیبره' : 'کالیبره نشده'}</small>
                  {can.submit && <FilmQuality film={f} />}
                </div>
              </li>
            ))}</ul> : <p className="ps-hint">هنوز فیلمی برای این راند بارگذاری نشده است.</p>}
            {can.submit && <FilmUpload weldId={weld.id} round={round} films={rFilms} />}
          </section>

          <section className="wq-card wq-rise" style={{ '--i': 4 } as CSSProperties}>
            <header className="wq-card-head"><ScanSearch size={16} aria-hidden /><h3>عیوب این راند</h3>{can.submit && !addDefect && <button type="button" className="ps-btn wq-head-link" onClick={() => setAddDefect(true)}><Plus size={14} aria-hidden /> عیب بدون کادر</button>}</header>
            {addDefect && <DefectForm weld={weld} init={newDraft()} onCancel={() => setAddDefect(false)} onSave={(d) => st.run(`عیب «${DEFECT_FA[d.type]}» ثبت شد`, () => repo.addDefect({ project_id: st.projectId, weld_id: weld.id, film_id: rFilms.find((f) => f.quality === 'accepted')?.id ?? null, round, defect_type: d.type, length_mm: d.lengthMm, depth_mm: d.depthMm, position_mm: d.positionMm, pass: d.pass, welders: d.welders, detected_by: 'manual', note: d.note, created_name: st.me() }))} />}
            <DefectTable defects={rDefects} films={films} canRemove={can.submit || can.configure} />
          </section>

          <section className="wq-card wq-eval wq-rise" style={{ '--i': 5 } as CSSProperties}>
            <header className="wq-card-head"><Gavel size={16} aria-hidden /><h3>ارزیابی و تأیید نهایی</h3></header>
            {!thk && <p className="ps-hint is-warn">ضخامت دیواره در فهرست مرکزی جوش‌ها نیست؛ آن را در کارت بالا وارد کنید تا ارزیابی ممکن شود.</p>}
            {rEval ? <EvalCard e={rEval} defects={rDefects} round={round} /> : <p className="ps-hint">هنوز ارزیابی‌ای برای این راند ثبت نشده است.</p>}
            {can.submit && thk && calc && (!rEval || rEval.signedAt == null) && !rFilms.some((f) => f.quality === 'accepted') && <p className="ps-hint">ارزیابی پس از بارگذاری فیلم این راند و تأیید کیفیت آن ممکن است.</p>}
            {can.submit && thk && calc && (!rEval || rEval.signedAt == null) && rFilms.some((f) => f.quality === 'accepted') && (
              preview ? (
                <div className="wq-preview" style={{ '--c': VERDICT_COLOR[calc.overall] } as CSSProperties}>
                  <b>نتیجهٔ قواعد پذیرش: {VERDICT_FA[calc.overall]}</b>
                  <p className="ps-meta">t = {fa(thk, 2)} mm · حد طول تکی {fa(calc.limits.singleMm, 1)} mm · حد تجمعی در {fa(st.crit.windowMm)} mm برابر {fa(calc.limits.aggregateMm, 1)} mm</p>
                  <ul className="wq-verdicts">{calc.verdicts.map((v) => { const d = rDefects.find((x) => x.id === v.id)!; return <li key={v.id} style={{ '--c': VERDICT_COLOR[v.verdict] } as CSSProperties}><b>{DEFECT_FA[d.type]} · {fa(d.lengthMm, 1)} mm</b><span>{VERDICT_FA[v.verdict]} — {v.reason}</span></li> })}</ul>
                  {!calc.verdicts.length && <p className="ps-meta">عیبی ثبت نشده؛ جوش قابل قبول تلقی می‌شود.</p>}
                  <div className="wq-form-actions">
                    <button type="button" className="ps-btn is-primary" onClick={() => void st.run('ارزیابی ثبت شد؛ منتظر تأیید نهایی بازرس NDT است', () => repo.evaluate(weld.id, calc.overall, calc.note, calc.verdicts, thk, st.me())).then((ok) => ok && setPreview(false))}><BadgeCheck size={15} aria-hidden /> ثبت ارزیابی</button>
                    <button type="button" className="ps-btn is-ghost" onClick={() => setPreview(false)}>انصراف</button>
                  </div>
                </div>
              ) : <button type="button" className="ps-btn is-primary" onClick={() => setPreview(true)}><Gavel size={15} aria-hidden /> {rEval ? 'ارزیابی دوباره با عیوب فعلی' : 'ارزیابی با قواعد پذیرش'}</button>
            )}
            {rEval && rEval.signedAt && rEval.overall === 'repair' && round < st.crit.maxRepairs && <RepairForm weld={weld} round={round} />}
          </section>
        </>
      )}

      <History evals={evals} defects={defects} repairs={repairs} films={films} current={closed ? 99 : round} onFilm={setViewer} />
      <Opinions weldId={weld.id} opinions={opinions} evals={evals} />
      {viewer && <FilmViewer filmId={viewer} weld={weld} readOnly={closed} onClose={() => setViewer(null)} />}
    </div>
  )
}

function ThkEdit({ weldId }: { weldId: string }) {
  const st = useWqStore(); const [v, setV] = useState('')
  if (!st.caps.submit && !st.caps.edit) return null
  return <span className="wq-inline"><input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="mm" aria-label="ضخامت دیواره به میلی‌متر" /><button type="button" className="ps-btn" disabled={!(Number(v) > 0)} onClick={() => void st.run('ضخامت ثبت شد', () => repo.updateJoint(weldId, { thk_mm: Number(v) }))}>ثبت</button></span>
}

function FilmQuality({ film }: { film: repo.Film }) {
  const st = useWqStore(); const [note, setNote] = useState(''); const [open, setOpen] = useState(false)
  const set = (q: repo.Film['quality']) => st.run(`کیفیت فیلم: ${QUALITY_FA[q]}`, () => repo.updateFilm(film.id, { quality_status: q, quality_note: note.trim(), quality_name: st.me(), quality_at: new Date().toISOString() })).then((ok) => ok && setOpen(false))
  if (!open) return <button type="button" className="ps-btn" onClick={() => setOpen(true)}><Eye size={14} aria-hidden /> بررسی کیفیت فیلم</button>
  return (
    <div className="wq-quality">
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="توضیح (دانسیته، IQI، خوانایی)" aria-label="توضیح کیفیت" />
      <div className="wq-form-actions">
        <button type="button" className="ps-btn is-ok" onClick={() => void set('accepted')}>تأیید کیفیت</button>
        <button type="button" className="ps-btn" onClick={() => void set('retake')} title="هزینه با کارفرما">ریتیک</button>
        <button type="button" className="ps-btn is-bad" onClick={() => void set('reshoot')} title="هزینه با پیمانکار رادیوگرافی">ریشوت</button>
        <button type="button" className="ps-btn is-ghost" onClick={() => setOpen(false)}>بستن</button>
      </div>
    </div>
  )
}

function FilmUpload({ weldId, round, films }: { weldId: string; round: number; films: repo.Film[] }) {
  const st = useWqStore()
  const [files, setFiles] = useState<File[]>([]), [segment, setSegment] = useState(''), [iqi, setIqi] = useState(''), [density, setDensity] = useState(''), [busy, setBusy] = useState(false)
  const upload = async () => {
    setBusy(true)
    const ok = await st.run(`${fa(files.length)} فیلم بارگذاری شد`, async () => {
      for (const [k, f] of files.entries()) {
        const dims = await new Promise<{ w: number | null; h: number | null }>((res) => { const u = URL.createObjectURL(f), im = new Image(); im.onload = () => { res({ w: im.width, h: im.height }); URL.revokeObjectURL(u) }; im.onerror = () => { res({ w: null, h: null }); URL.revokeObjectURL(u) }; im.src = u })
        const seg = files.length > 1 ? (segment ? `${segment}-${k + 1}` : f.name.replace(/\.[^.]+$/, '')) : segment
        const attempt = films.filter((x) => x.segment === seg).length + 1
        const path = await repo.uploadFile(st.projectId!, weldId, f, f.name)
        await repo.addFilm({ project_id: st.projectId!, weld_id: weldId, round, exam_type: round === 0 ? 'RT' : 'RS', attempt, segment: seg, path, file_name: f.name, mime: f.type, width: dims.w, height: dims.h, iqi, density, uploaded_name: st.me() })
      }
    })
    setBusy(false); if (ok) { setFiles([]); setSegment('') }
  }
  return (
    <div className="wq-upload">
      <label className="wq-drop"><Upload size={18} aria-hidden /><span>{files.length ? files.map((f) => f.name).join('، ') : 'تصویر فیلم (JPG / PNG / WebP، اسکن یا دیجیتال)'}</span>
        <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => setFiles([...(e.target.files ?? [])])} /></label>
      <div className="wq-form is-row">
        <label><span>قطعه / موقعیت فیلم</span><input value={segment} onChange={(e) => setSegment(e.target.value)} placeholder="مثلاً 0-1 یا ساعت ۱۲ تا ۳" /></label>
        <label><span>IQI</span><input value={iqi} onChange={(e) => setIqi(e.target.value)} placeholder="مثلاً 10 FE EN" /></label>
        <label><span>دانسیته</span><input value={density} onChange={(e) => setDensity(e.target.value)} placeholder="2.0–4.0" /></label>
        <button type="button" className="ps-btn is-primary" disabled={!files.length || busy} onClick={() => void upload()}><Upload size={14} aria-hidden /> بارگذاری {round === 0 ? 'RT' : `RS${fa(round)}`}</button>
      </div>
    </div>
  )
}

function DefectTable({ defects, films, canRemove }: { defects: repo.Defect[]; films: repo.Film[]; canRemove: boolean }) {
  const st = useWqStore(); const q = useQc()
  if (!defects.length) return <p className="ps-hint">عیبی ثبت نشده است. عیب را روی فیلم با ابزار «کادر عیب» بکشید یا بدون کادر ثبت کنید.</p>
  return (
    <div className="wq-tbl-wrap"><table className="wq-tbl">
      <thead><tr><th>نوع</th><th>طول</th><th>عمق</th><th>موقعیت</th><th>پاس و جوشکار</th><th>فیلم</th><th>نتیجه</th><th aria-label="عملیات" /></tr></thead>
      <tbody>{defects.map((d) => (
        <tr key={d.id}>
          <td><span className="wq-dtype" style={{ '--c': DEFECT_COLOR[d.type] } as CSSProperties}>{DEFECT_FA[d.type]}</span>{d.detectedBy === 'ai' && <small className="ps-meta"> · پیشنهاد پردازش تصویر</small>}</td>
          <td>{fa(d.lengthMm, 1)} mm</td><td>{d.depthMm ? `${fa(d.depthMm, 2)} mm` : '—'}</td><td>{fa(d.positionMm)} mm</td>
          <td>{d.pass ? PASS_FA[d.pass] : '—'}<br />{d.welders.length ? d.welders.map((w) => <b key={w} className="ps-code" title={q.nameOf(w)}>{w}</b>) : <small className="ps-meta">نامشخص</small>}</td>
          <td>{films.find((f) => f.id === d.filmId)?.segment || (d.filmId ? 'فیلم' : '—')}</td>
          <td>{d.verdict ? <span className="wq-verdict" style={{ '--c': VERDICT_COLOR[d.verdict] } as CSSProperties} title={d.verdictReason}>{VERDICT_FA[d.verdict]}</span> : <small className="ps-meta">ارزیابی نشده</small>}</td>
          <td>{canRemove && <button type="button" className="ps-x" aria-label="کنار گذاشتن این عیب" title="کنار گذاشتن (در سابقه می‌ماند)" onClick={() => { if (window.confirm('این عیب کنار گذاشته شود؟ (پاک نمی‌شود و در سابقه می‌ماند)')) void st.run('عیب کنار گذاشته شد', () => repo.updateDefect(d.id, { removed_at: new Date().toISOString() })) }}><Trash2 size={14} aria-hidden /></button>}</td>
        </tr>
      ))}</tbody>
    </table></div>
  )
}

function EvalCard({ e, defects, round }: { e: repo.Evaluation; defects: repo.Defect[]; round: number }) {
  const st = useWqStore(); const [force, setForce] = useState(false)
  const lastRound = round >= st.crit.maxRepairs
  return (
    <div className="wq-evalcard" style={{ '--c': VERDICT_COLOR[e.overall] } as CSSProperties}>
      <div className="wq-evalcard-top"><b>{VERDICT_FA[e.overall]}</b><small>ارزیاب: {e.evaluatedName || '—'} · {faDate(e.evaluatedAt)}</small></div>
      {defects.filter((d) => d.verdict && d.verdict !== 'accept').map((d) => <p key={d.id} className="wq-advice"><b>{DEFECT_FA[d.type]}:</b> {d.verdictReason}<br /><span>پیشنهاد تعمیر: {d.repairAdvice}</span></p>)}
      <p className="ps-meta">{e.summary}</p>
      {e.signedAt ? <p className="wq-signed"><Signature size={14} aria-hidden /> تأیید نهایی بازرس NDT: {e.signedName || '—'} · {faDate(e.signedAt)}{e.forcedCutout ? ' · تبدیل به برش' : ''}</p>
        : st.caps.approve ? (
          <div className="wq-sign">
            {lastRound && e.overall === 'repair' && <label className="wq-check"><input type="checkbox" checked={force} onChange={(x) => setForce(x.target.checked)} /> سقف دو تعمیر تکمیل شده؛ نتیجه به «برش» تبدیل شود</label>}
            <button type="button" className="ps-btn is-ok" onClick={() => void st.run(force || e.overall !== 'repair' ? 'تأیید نهایی ثبت شد و پرونده بسته شد' : 'تأیید نهایی ثبت شد؛ اکنون مهندس ناظر جوش تعمیر را ثبت می‌کند', () => repo.sign(e.weldId, force, st.me()))}><Signature size={15} aria-hidden /> تأیید نهایی بازرس NDT</button>
          </div>
        ) : <p className="ps-hint">منتظر تأیید نهایی بازرس NDT.</p>}
      {lastRound && e.overall === 'repair' && e.signedAt && <p className="ps-hint is-warn">سقف تعمیر تکمیل شده؛ طبق رویه، برش کامل لازم است.</p>}
    </div>
  )
}

function RepairForm({ weld, round }: { weld: repo.QcWeld; round: number }) {
  const st = useWqStore(); const q = useQc()
  const [r, setR] = useState({ method: '', performedBy: '', approvedBy: '', repairWps: '', note: '' })
  if (!st.caps.edit) return <p className="ps-hint">منتظر ثبت تعمیر توسط مهندس ناظر جوش.</p>
  const options = [...new Set([...PASSES.flatMap((p) => weld.stampsBy[p]), ...st.welders.filter((w) => w.status === 'active').map((w) => w.key)])]
  return (
    <form className="wq-form wq-repair" onSubmit={(e) => { e.preventDefault(); void st.run(`تعمیر ثبت شد؛ راند RS${fa(round + 1)} باز شد`, () => repo.addRepair(weld.id, r, st.me())) }}>
      <b className="is-wide"><Wrench size={15} aria-hidden /> ثبت تعمیر {round === 0 ? 'اول' : 'دوم'}</b>
      <label className="is-wide"><span>روش تعمیر</span><input value={r.method} onChange={(e) => setR({ ...r, method: e.target.value })} placeholder="مثلاً سنگ‌زنی تا فلز سالم و جوش مجدد ریشه" required /></label>
      <label><span>جوشکار تعمیر</span><select value={r.performedBy} onChange={(e) => setR({ ...r, performedBy: e.target.value })} required><option value="">انتخاب از فهرست جوشکاران…</option>{options.map((k) => <option key={k} value={k}>{k}{q.nameOf(k) !== k ? ` — ${q.nameOf(k)}` : ''}</option>)}</select></label>
      <label><span>Repair WPS</span><input value={r.repairWps} onChange={(e) => setR({ ...r, repairWps: e.target.value })} /></label>
      <label><span>تأییدکننده</span><input value={r.approvedBy} onChange={(e) => setR({ ...r, approvedBy: e.target.value })} /></label>
      <label><span>توضیح</span><input value={r.note} onChange={(e) => setR({ ...r, note: e.target.value })} /></label>
      <div className="is-wide wq-form-actions"><button type="submit" className="ps-btn is-primary"><Wrench size={14} aria-hidden /> ثبت تعمیر و باز کردن راند بعد</button></div>
    </form>
  )
}

function VtBlock({ weldId, round, vts }: { weldId: string; round: number; vts: repo.Vt[] }) {
  const st = useWqStore()
  const [open, setOpen] = useState(false), [res, setRes] = useState<'accept' | 'reject'>('accept'), [note, setNote] = useState(''), [files, setFiles] = useState<File[]>([])
  const last = vts.at(-1)
  const save = () => st.run('بازرسی چشمی ثبت شد', async () => {
    const up: repo.Vt['files'] = []
    for (const f of files) up.push({ path: await repo.uploadFile(st.projectId!, weldId, f, f.name), name: f.name, mime: f.type })
    await repo.addVt({ project_id: st.projectId!, weld_id: weldId, round, result: res, note: note.trim(), files: up, by_name: st.me() })
  }).then((ok) => { if (ok) { setOpen(false); setNote(''); setFiles([]) } })
  return (
    <section className="wq-card wq-rise" style={{ '--i': 2 } as CSSProperties}>
      <header className="wq-card-head"><Eye size={16} aria-hidden /><h3>بازرسی چشمی (VT)</h3>{st.caps.edit && !open && <button type="button" className="ps-btn wq-head-link" onClick={() => setOpen(true)}><Plus size={14} aria-hidden /> ثبت VT</button>}</header>
      {last ? <p className={`wq-vt is-${last.result}`}>{last.result === 'accept' ? <CheckCircle2 size={15} aria-hidden /> : <XCircle size={15} aria-hidden />} {last.result === 'accept' ? 'قابل قبول' : 'رد'} · {last.byName} · {faDate(last.at)}{last.note ? ` — ${last.note}` : ''}{last.files.length ? ` · ${fa(last.files.length)} پیوست` : ''}</p> : <p className="ps-hint">برای این راند هنوز VT ثبت نشده است.</p>}
      {open && (
        <div className="wq-form is-row">
          <label><span>نتیجه</span><select value={res} onChange={(e) => setRes(e.target.value as 'accept' | 'reject')}><option value="accept">قابل قبول</option><option value="reject">رد</option></select></label>
          <label className="is-grow"><span>توضیح</span><input value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <label className="wq-drop is-small"><Camera size={15} aria-hidden /><span>{files.length ? `${fa(files.length)} فایل` : 'عکس / ویدئو'}</span><input type="file" accept="image/*,video/*" multiple onChange={(e) => setFiles([...(e.target.files ?? [])])} /></label>
          <button type="button" className="ps-btn is-primary" onClick={() => void save()}>ثبت</button><button type="button" className="ps-btn is-ghost" onClick={() => setOpen(false)}>انصراف</button>
        </div>
      )}
    </section>
  )
}

function History({ evals, defects, repairs, films, current, onFilm }: { evals: repo.Evaluation[]; defects: repo.Defect[]; repairs: repo.Repair[]; films: repo.Film[]; current: number; onFilm: (id: string) => void }) {
  const q = useQc()
  const rounds = [0, 1, 2].filter((r) => r < current && (evals.some((e) => e.round === r) || films.some((f) => f.round === r)))
  if (!rounds.length) return null
  return (
    <section className="wq-card wq-rise" style={{ '--i': 6 } as CSSProperties}>
      <header className="wq-card-head"><ClipboardList size={16} aria-hidden /><h3>سابقهٔ راندهای {current === 99 ? 'پرونده' : 'قبلی'}</h3></header>
      {rounds.map((r) => {
        const e = [...evals].reverse().find((x) => x.round === r), rp = repairs.find((x) => x.round === r)
        return (
          <details key={r} className="wq-hist" open={current === 99}>
            <summary><b>{roundName(r)}</b>{e && <span className="wq-verdict" style={{ '--c': VERDICT_COLOR[e.overall] } as CSSProperties}>{VERDICT_FA[e.overall]}</span>}</summary>
            <p className="ps-meta">{fa(films.filter((f) => f.round === r).length)} فیلم · ارزیاب {e?.evaluatedName || '—'} · بازرس {e?.signedName || '—'} {e?.signedAt ? `(${faDate(e.signedAt)})` : ''}</p>
            {films.some((f) => f.round === r) && <div className="wq-hist-films">{films.filter((f) => f.round === r).map((f) => <button key={f.id} type="button" className="wq-thumb" onClick={() => onFilm(f.id)} aria-label={`دیدن فیلم ${f.segment || f.fileName}`}><Thumb path={f.path} alt={f.fileName} /><span><Eye size={13} aria-hidden /> {f.segment || 'فیلم'}</span></button>)}</div>}
            <ul className="wq-mini">{defects.filter((d) => d.round === r).map((d) => <li key={d.id}><i style={{ background: DEFECT_COLOR[d.type] }} />{DEFECT_FA[d.type]} {fa(d.lengthMm, 1)} mm · {d.pass ? PASS_FA[d.pass] : '—'} · {d.welders.join('، ') || 'جوشکار نامشخص'}{d.verdict ? ` · ${VERDICT_FA[d.verdict]}` : ''}</li>)}</ul>
            {rp && <p className="wq-repair-line"><Wrench size={14} aria-hidden /> تعمیر: {rp.method} · جوشکار {rp.performedBy}{q.nameOf(rp.performedBy) !== rp.performedBy ? ` (${q.nameOf(rp.performedBy)})` : ''}{rp.repairWps ? ` · WPS ${rp.repairWps}` : ''} · {faDate(rp.createdAt)}</p>}
          </details>
        )
      })}
    </section>
  )
}

function Opinions({ weldId, opinions, evals }: { weldId: string; opinions: repo.Opinion[]; evals: repo.Evaluation[] }) {
  const st = useWqStore()
  const [body, setBody] = useState(''), [stance, setStance] = useState<repo.Opinion['stance']>('note')
  const can = st.caps.approve || st.caps.submit || st.caps.edit
  const target = evals.at(-1)
  const STANCE: Record<repo.Opinion['stance'], string> = { agree: 'موافق ارزیابی', disagree: 'مخالف ارزیابی', note: 'یادداشت' }
  return (
    <section className="wq-card wq-rise" style={{ '--i': 7 } as CSSProperties}>
      <header className="wq-card-head"><MessageSquareText size={16} aria-hidden /><h3>نظرات کارشناسی</h3><span className="ps-meta">ثبت‌شده‌ها ویرایش و حذف نمی‌شوند</span></header>
      {opinions.length ? <ul className="wq-opinions">{opinions.map((o) => <li key={o.id} className={`is-${o.stance}`}><b>{o.authorName || '—'}</b><span>{STANCE[o.stance]} · {faDate(o.at)}</span><p>{o.body}</p></li>)}</ul> : <p className="ps-hint">هنوز نظری ثبت نشده است.</p>}
      {can && (
        <div className="wq-form is-row">
          <label><span>نوع</span><select value={stance} onChange={(e) => setStance(e.target.value as repo.Opinion['stance'])}>{Object.entries(STANCE).map(([k, v]) => <option key={k} value={k} disabled={k !== 'note' && !target}>{v}</option>)}</select></label>
          <label className="is-grow"><span>متن نظر</span><input value={body} onChange={(e) => setBody(e.target.value)} /></label>
          <button type="button" className="ps-btn" disabled={!body.trim()} onClick={() => void st.run('نظر ثبت شد', () => repo.addOpinion({ project_id: st.projectId!, weld_id: weldId, target_kind: stance !== 'note' && target ? 'evaluation' : 'joint', target_id: stance !== 'note' && target ? target.id : weldId, stance, body: body.trim(), author_name: st.me() })).then((ok) => ok && setBody(''))}><Flame size={14} aria-hidden /> ثبت نظر</button>
        </div>
      )}
    </section>
  )
}
