import { useEffect, useState, type CSSProperties } from 'react'
import { Camera, ClipboardList, Eye, FileImage, Flame, MessageSquareText, Plus, Signature, Trash2, Upload, Wrench, XCircle, CheckCircle2 } from 'lucide-react'
import { useWqStore } from '../store/useWqStore'
import * as repo from '../repo'
import { DEFECT_COLOR, PASS_FA, VERDICT_FA, type Verdict } from '../lib/rules'
import { CODE_FA, CODE_TYPE } from '../lib/api1104'
import { QUAD_SHORT, type Quadrant } from '../lib/crew'
import { PASSES } from '../lib/analytics'
import { codeOf, fa, faDate, useQc } from '../lib/useQc'
import { FilmConvert, type Converted } from './FilmConvert'

export const QUALITY_FA: Record<repo.Film['quality'], string> = { pending: 'در انتظار بررسی کیفیت', accepted: 'کیفیت تأیید شد', retake: 'ریتیک — تکرار به درخواست کارفرما', reshoot: 'ریشوت — تکرار به هزینهٔ پیمانکار RT' }
export const QUALITY_COLOR: Record<repo.Film['quality'], string> = { pending: '#0ea5e9', accepted: '#22c55e', retake: '#f59e0b', reshoot: '#ef4444' }
export const VERDICT_COLOR: Record<Verdict, string> = { accept: '#22c55e', repair: '#f97316', cut_out: '#ef4444' }
export const roundName = (r: number) => (r === 0 ? 'RT — رادیوگرافی اولیه' : `RS${fa(r)} — پس از تعمیر ${r === 1 ? 'اول' : 'دوم'}`)

/** a film's viewable copy (the converted one when the original is a TIFF) */
export function Thumb({ path, alt }: { path: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { let off = false; void repo.signedUrl(path).then((u) => { if (!off) setUrl(u) }); return () => { off = true } }, [path])
  return url ? <img src={url} alt={alt} loading="lazy" /> : <span className="wq-thumb-ph"><FileImage size={20} aria-hidden /></span>
}

export function ThkEdit({ weldId }: { weldId: string }) {
  const st = useWqStore(); const [v, setV] = useState('')
  if (!st.caps.submit && !st.caps.edit) return null
  return <span className="wq-inline"><input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="mm" aria-label="ضخامت دیواره به میلی‌متر" /><button type="button" className="ps-btn" disabled={!(Number(v) > 0)} onClick={() => void st.run('ضخامت ثبت شد', () => repo.updateJoint(weldId, { thk_mm: Number(v) }))}>ثبت</button></span>
}

export function FilmQuality({ film }: { film: repo.Film }) {
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

export function FilmUpload({ weldId, round, films }: { weldId: string; round: number; films: repo.Film[] }) {
  const st = useWqStore()
  const [files, setFiles] = useState<File[]>([]), [segment, setSegment] = useState(''), [iqi, setIqi] = useState(''), [density, setDensity] = useState(''), [conv, setConv] = useState(false)
  const upload = async (out: Converted[]) => {
    const ok = await st.run(`${fa(out.length)} فیلم تبدیل و بارگذاری شد`, async () => {
      for (const [k, c] of out.entries()) {
        const seg = out.length > 1 ? (segment ? `${segment}-${k + 1}` : c.original.name.replace(/\.[^.]+$/, '')) : segment
        const attempt = films.filter((x) => x.segment === seg).length + 1
        const display = await repo.uploadFile(st.projectId!, weldId, c.display, c.displayName)
        const original = await repo.uploadFile(st.projectId!, weldId, c.original, c.original.name)
        await repo.addFilm({ project_id: st.projectId!, weld_id: weldId, round, exam_type: round === 0 ? 'RT' : 'RS', attempt, segment: seg, path: original, display_path: display, orig_mime: c.original.type || (c.keepOriginal ? 'image/tiff' : ''), file_name: c.original.name, mime: 'image/webp', width: c.width, height: c.height, iqi, density, uploaded_name: st.me(), metrics: c.metrics })
      }
    })
    setConv(false); if (ok) { setFiles([]); setSegment('') }
  }
  return (
    <div className="wq-upload">
      <label className="wq-drop"><Upload size={18} aria-hidden /><span>{files.length ? files.map((f) => f.name).join('، ') : 'فیلم اسکن‌شده یا دیجیتال: TIFF (۸ یا ۱۶ بیتی)، JPG، PNG، WebP'}</span>
        <input type="file" accept=".tif,.tiff,image/tiff,image/png,image/jpeg,image/webp" multiple onChange={(e) => setFiles([...(e.target.files ?? [])])} /></label>
      <div className="wq-form is-row">
        <label><span>قطعه / موقعیت فیلم</span><input value={segment} onChange={(e) => setSegment(e.target.value)} placeholder="مثلاً 0-1 یا ساعت ۱۲ تا ۳" /></label>
        <label><span>IQI</span><input value={iqi} onChange={(e) => setIqi(e.target.value)} placeholder="مثلاً 10 FE EN" /></label>
        <label><span>دانسیته</span><input value={density} onChange={(e) => setDensity(e.target.value)} placeholder="2.0–4.0" /></label>
        <button type="button" className="ps-btn is-primary" disabled={!files.length} onClick={() => setConv(true)}><Upload size={14} aria-hidden /> تبدیل، بهبود و بارگذاری {round === 0 ? 'RT' : `RS${fa(round)}`}</button>
      </div>
      {conv && <FilmConvert files={files} onCancel={() => setConv(false)} onDone={upload} />}
    </div>
  )
}

export function DefectTable({ defects, films, canRemove }: { defects: repo.Defect[]; films: repo.Film[]; canRemove: boolean }) {
  const st = useWqStore(); const q = useQc()
  if (!defects.length) return <p className="ps-hint">ناپیوستگی‌ای ثبت نشده است. عیب را روی فیلم با ابزار «کادر عیب» بکشید، از «نواحی مشکوک» دستیار تأیید کنید یا بدون کادر ثبت کنید.</p>
  return (
    <div className="wq-tbl-wrap"><table className="wq-tbl">
      <thead><tr><th>کد و نوع</th><th>ابعاد</th><th>ساعت / ربع</th><th>پاس و جوشکار</th><th>فیلم</th><th>نتیجه</th><th aria-label="عملیات" /></tr></thead>
      <tbody>{defects.map((d) => { const c = codeOf(d); return (
        <tr key={d.id}>
          <td><span className="wq-dtype" style={{ '--c': DEFECT_COLOR[c ? CODE_TYPE[c] : d.type] } as CSSProperties}>{c ? CODE_FA[c] : d.type}</span>{d.detectedBy === 'ai' && <small className="ps-meta"> · {d.aiAction === 'modified' ? 'پیشنهاد دستیار (اصلاح‌شده)' : 'پیشنهاد دستیار'}</small>}</td>
          <td>{fa(d.lengthMm, 1)} mm{d.widthMm ? ` × ${fa(d.widthMm, 1)}` : ''}{d.depthMm ? ` · عمق ${fa(d.depthMm, 2)}` : ''}{d.densityOver ? ' · تیره' : ''}</td>
          <td>{d.clock != null ? `ساعت ${fa(d.clock, 1)}` : '—'}{d.quadrant ? <small className="ps-meta"> · ربع {QUAD_SHORT[d.quadrant as Quadrant]}</small> : ''}</td>
          <td>{d.pass ? PASS_FA[d.pass] : '—'}<br />{d.welders.length ? d.welders.map((w) => <b key={w} className="ps-code" title={q.nameOf(w)}>{w}</b>) : <small className="ps-meta">نامشخص</small>}</td>
          <td>{films.find((f) => f.id === d.filmId)?.segment || (d.filmId ? 'فیلم' : '—')}</td>
          <td>{d.verdict ? <span className="wq-verdict" style={{ '--c': VERDICT_COLOR[d.verdict] } as CSSProperties} title={d.verdictReason}>{VERDICT_FA[d.verdict]}</span> : <small className="ps-meta">ارزیابی نشده</small>}</td>
          <td>{canRemove && <button type="button" className="ps-x" aria-label="کنار گذاشتن این عیب" title="کنار گذاشتن (در سابقه می‌ماند)" onClick={() => { if (window.confirm('این عیب کنار گذاشته شود؟ (پاک نمی‌شود و در سابقه می‌ماند)')) void st.run('عیب کنار گذاشته شد', () => repo.updateDefect(d.id, { removed_at: new Date().toISOString() })) }}><Trash2 size={14} aria-hidden /></button>}</td>
        </tr>
      ) })}</tbody>
    </table></div>
  )
}

export function EvalCard({ e, defects, round }: { e: repo.Evaluation; defects: repo.Defect[]; round: number }) {
  const st = useWqStore(); const [force, setForce] = useState(false)
  const lastRound = round >= st.crit.maxRepairs
  return (
    <div className="wq-evalcard" style={{ '--c': VERDICT_COLOR[e.overall] } as CSSProperties}>
      <div className="wq-evalcard-top"><b>{VERDICT_FA[e.overall]}</b><small>ارزیاب: {e.evaluatedName || '—'} · {faDate(e.evaluatedAt)}</small></div>
      {defects.filter((d) => d.verdict && d.verdict !== 'accept').map((d) => <p key={d.id} className="wq-advice"><b>{codeOf(d) ? CODE_FA[codeOf(d) as keyof typeof CODE_FA] : d.type}:</b> {d.verdictReason}<br /><span>پیشنهاد تعمیر: {d.repairAdvice}</span></p>)}
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

export function RepairForm({ weld, round }: { weld: repo.QcWeld; round: number }) {
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

export function VtBlock({ weldId, round, vts }: { weldId: string; round: number; vts: repo.Vt[] }) {
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

export function History({ evals, defects, repairs, films, current, onFilm }: { evals: repo.Evaluation[]; defects: repo.Defect[]; repairs: repo.Repair[]; films: repo.Film[]; current: number; onFilm: (id: string) => void }) {
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
            <ul className="wq-mini">{defects.filter((d) => d.round === r).map((d) => <li key={d.id}><i style={{ background: DEFECT_COLOR[d.type] }} />{codeOf(d) || d.type} {fa(d.lengthMm, 1)} mm{d.clock != null ? ` · ساعت ${fa(d.clock, 1)}` : ''} · {d.pass ? PASS_FA[d.pass] : '—'} · {d.welders.join('، ') || 'جوشکار نامشخص'}{d.verdict ? ` · ${VERDICT_FA[d.verdict]}` : ''}</li>)}</ul>
            {rp && <p className="wq-repair-line"><Wrench size={14} aria-hidden /> تعمیر: {rp.method} · جوشکار {rp.performedBy}{q.nameOf(rp.performedBy) !== rp.performedBy ? ` (${q.nameOf(rp.performedBy)})` : ''}{rp.repairWps ? ` · WPS ${rp.repairWps}` : ''} · {faDate(rp.createdAt)}</p>}
          </details>
        )
      })}
    </section>
  )
}

export function Opinions({ weldId, opinions, evals }: { weldId: string; opinions: repo.Opinion[]; evals: repo.Evaluation[] }) {
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
