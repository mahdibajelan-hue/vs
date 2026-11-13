import { useState } from 'react'
import { Camera, Plus, Save, ShieldCheck, Trash2, Users, X } from 'lucide-react'
import { useWqStore } from '../store/useWqStore'
import * as repo from '../repo'
import { PASSES, QUAD_FA, type CrewRow, type Quadrant } from '../lib/crew'
import { PASS_FA, type Pass } from '../lib/rules'
import { fa, faDate, useQc } from '../lib/useQc'
import { toNum } from './DefectForm'

const POSITIONS = ['5G', '6G', '2G', '1G']
const PROCESSES = ['SMAW', 'GMAW', 'FCAW', 'GTAW', 'SAW']

/** recording who welded which pass in which quadrant — one row per quadrant chosen (or the whole pass) */
export function CrewEditor({ weld, crew, onClose }: { weld: repo.QcWeld; crew: CrewRow[]; onClose: () => void }) {
  const st = useWqStore(); const q = useQc()
  const [pass, setPass] = useState<Pass>('root'), [quads, setQuads] = useState<Quadrant[]>([1]), [welder, setWelder] = useState('')
  const [position, setPosition] = useState('5G'), [direction, setDirection] = useState<CrewRow['direction']>('downhill'), [process, setProcess] = useState('SMAW')
  const [start, setStart] = useState(''), [end, setEnd] = useState(''), [vt, setVt] = useState<CrewRow['vt']>(''), [note, setNote] = useState('')
  const welders = st.welders.filter((w) => w.kind !== 'coater' && w.status === 'active')
  const toggle = (x: Quadrant) => setQuads(x === 0 ? [0] : quads.includes(x) ? quads.filter((y) => y !== x && y !== 0) : [...quads.filter((y) => y !== 0), x])
  const save = () => st.run(`جوشکار ${welder} برای پاس ${PASS_FA[pass]} ثبت شد`, () => repo.addCrew(quads.map((qd) => ({ project_id: st.projectId, weld_id: weld.id, pass, quadrant: qd, welder_key: welder, position, direction, process, started_at: start ? new Date(start).toISOString() : null, finished_at: end ? new Date(end).toISOString() : null, vt, note, created_name: st.me() })))).then((ok) => { if (ok) { setNote(''); setVt('') } })
  const live = crew.filter((c) => !c.removed)
  return (
    <div className="wq-panel-light">
      <header className="wq-card-head"><Users size={16} aria-hidden /><h3>ثبت جوشکاران به تفکیک پاس و ربع</h3><button type="button" className="ps-btn is-ghost wq-head-link" onClick={onClose}><X size={14} aria-hidden /> بستن</button></header>
      <p className="ps-meta">ربع‌ها با نگاه در جهت پیشروی خط: ۱ = ساعت ۱۲ تا ۳، ۲ = ۳ تا ۶، ۳ = ۶ تا ۹، ۴ = ۹ تا ۱۲. ثبت این‌جا بر نیمه‌های گزارش جوشکاری (سمت مسیر / کانال) مقدم است.</p>
      <div className="wq-form">
        <label><span>پاس</span><select value={pass} onChange={(e) => setPass(e.target.value as Pass)}>{PASSES.map((p) => <option key={p} value={p}>{PASS_FA[p]}</option>)}</select></label>
        <div className="wq-quads is-wide" role="group" aria-label="ربع‌ها">{([0, 1, 2, 3, 4] as Quadrant[]).map((x) => <button key={x} type="button" aria-pressed={quads.includes(x)} onClick={() => toggle(x)}>{QUAD_FA[x]}</button>)}</div>
        <label><span>جوشکار</span><select value={welder} onChange={(e) => setWelder(e.target.value)} required><option value="">از فهرست جوشکاران…</option>{welders.map((w) => <option key={w.id} value={w.key}>{w.key}{w.name ? ` — ${w.name}` : ''}</option>)}</select></label>
        <label><span>وضعیت (Position)</span><select value={position} onChange={(e) => setPosition(e.target.value)}>{POSITIONS.map((p) => <option key={p}>{p}</option>)}</select></label>
        <label><span>جهت</span><select value={direction} onChange={(e) => setDirection(e.target.value as CrewRow['direction'])}><option value="downhill">سرپایین (Downhill)</option><option value="uphill">سربالا (Uphill)</option><option value="">—</option></select></label>
        <label><span>فرایند</span><select value={process} onChange={(e) => setProcess(e.target.value)}>{PROCESSES.map((p) => <option key={p}>{p}</option>)}</select></label>
        <label><span>شروع</span><input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label><span>پایان</span><input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        <label><span>VT این بخش</span><select value={vt} onChange={(e) => setVt(e.target.value as CrewRow['vt'])}><option value="">—</option><option value="accept">قبول</option><option value="reject">رد</option></select></label>
        <label className="is-wide"><span>توضیح</span><input value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <div className="is-wide wq-form-actions"><button type="button" className="ps-btn is-primary" disabled={!welder || !quads.length} onClick={() => void save()}><Save size={14} aria-hidden /> ثبت</button></div>
      </div>
      {live.length > 0 && <ul className="wq-mini wq-crew-list">{live.map((c) => <li key={c.id}><b className="ps-code">{c.welderKey}</b>{q.nameOf(c.welderKey) !== c.welderKey ? q.nameOf(c.welderKey) : ''} · {PASS_FA[c.pass]} · {QUAD_FA[c.quadrant]}{c.position ? ` · ${c.position}` : ''}{c.startedAt ? ` · ${faDate(c.startedAt)}` : ''}<button type="button" className="ps-x" aria-label="کنار گذاشتن این ردیف" onClick={() => void st.run('ردیف کنار گذاشته شد', () => repo.removeCrew(c.id))}><Trash2 size={13} aria-hidden /></button></li>)}</ul>}
    </div>
  )
}

const RES_FA = { '': '—', pass: 'قبول', repair: 'نیاز به تعمیر', fail: 'مردود' } as const
const KIND_FA = { application: 'اجرای پوشش', inspection: 'بازرسی / آزمون', repair: 'تعمیر پوشش' } as const

/** the field-joint coating of a weld: what the daily reports say, and the QC records (applicator, random tests, repairs) */
export function CoatingPanel({ weld, coatings }: { weld: repo.QcWeld; coatings: repo.Coating[] }) {
  const st = useWqStore(); const q = useQc()
  const [open, setOpen] = useState(false)
  const [x, setX] = useState({ kind: 'inspection' as repo.Coating['kind'], random: false, applicator: [...coatings].reverse().find((c) => c.applicatorKey)?.applicatorKey ?? '', system: weld.coat.fj?.sleeve ?? '', kv: '', count: '', dft: '', adhesion: '', visual: '' as repo.Coating['visual'], result: '' as repo.Coating['result'], defects: '', note: '' })
  const [files, setFiles] = useState<File[]>([])
  const people = [...st.welders].sort((a, b) => Number(b.kind === 'coater') - Number(a.kind === 'coater'))
  const save = () => st.run('سابقهٔ پوشش ثبت شد', async () => {
    const up: repo.Coating['files'] = []
    for (const f of files) up.push({ path: await repo.uploadFile(st.projectId!, weld.id, f, f.name), name: f.name, mime: f.type })
    await repo.addCoating({ project_id: st.projectId, weld_id: weld.id, kind: x.kind, random_test: x.random, applicator_key: x.applicator, system: x.system, holiday_kv: toNum(x.kv), holiday_count: toNum(x.count), dft_min_um: toNum(x.dft), adhesion: toNum(x.adhesion), visual: x.visual, result: x.result, defects: x.defects, files: up, note: x.note, created_name: st.me() })
  }).then((ok) => { if (ok) { setOpen(false); setFiles([]) } })
  const fj = weld.coat.fj, bond = weld.coat.bond
  return (
    <div className="wq-coat">
      <div className="wq-coat-facts">
        <div className={fj ? (fj.result === 'rej' ? 'is-bad' : 'is-ok') : 'is-na'}><small>اجرای پوشش (گزارش روزانه)</small><b>{fj ? `${fj.sleeve || 'پوشش سرجوش'} · ${fj.result === 'rej' ? 'مردود' : fj.result ? 'قبول' : 'ثبت شده'}` : 'ثبت نشده'}</b><small>{fj ? `${faDate(fj.date)} · ${fj.reportNo}${fj.thkMin != null ? ` · کمترین ضخامت ${fa(fj.thkMin)} µm` : ''}` : 'فرم «پوشش سرجوش» گزارش روزانه'}</small></div>
        <div className={bond ? (bond.verdict === 'rej' ? 'is-bad' : 'is-ok') : 'is-na'}><small>آزمون چسبندگی و منفذیابی</small><b>{bond ? (bond.verdict === 'rej' ? 'مردود' : bond.verdict === 'ok' ? 'قبول' : 'ثبت شده') : 'ثبت نشده'}</b><small>{bond ? `${faDate(bond.date)} · ${bond.reportNo}${bond.holVolt ? ` · ${bond.holVolt} kV` : ''}${bond.holidays != null ? ` · ${fa(bond.holidays)} منفذ` : ''}` : 'فرم «آزمون چسبندگی / منفذیابی»'}</small></div>
      </div>
      {coatings.length > 0 && <ul className="wq-coat-list">{coatings.map((c) => (
        <li key={c.id} className={`is-${c.result || 'none'}`}>
          <b>{KIND_FA[c.kind]}{c.random ? ' · آزمون تصادفی' : ''}</b>
          <span>{c.applicatorKey ? <><b className="ps-code">{c.applicatorKey}</b> {q.nameOf(c.applicatorKey) !== c.applicatorKey ? q.nameOf(c.applicatorKey) : ''}</> : 'پوشش‌کار —'}{c.system ? ` · ${c.system}` : ''}</span>
          <small>{faDate(c.at)} · {[c.holidayKv != null ? `منفذیابی ${fa(c.holidayKv)} kV` : '', c.holidayCount != null ? `${fa(c.holidayCount)} منفذ` : '', c.dftMinUm != null ? `ضخامت ≥ ${fa(c.dftMinUm)} µm` : '', c.adhesion != null ? `چسبندگی ${fa(c.adhesion, 1)}` : '', c.visual ? `ظاهری ${c.visual === 'pass' ? 'قبول' : 'رد'}` : ''].filter(Boolean).join(' · ')}{c.defects ? ` · عیوب: ${c.defects}` : ''}{c.files.length ? ` · ${fa(c.files.length)} پیوست` : ''}</small>
          <em>{RES_FA[c.result]}</em>
          {(st.caps.edit || st.caps.submit) && <button type="button" className="ps-x" aria-label="کنار گذاشتن" onClick={() => void st.run('سابقه کنار گذاشته شد', () => repo.removeCoating(c.id))}><Trash2 size={13} aria-hidden /></button>}
        </li>
      ))}</ul>}
      {(st.caps.edit || st.caps.submit) && (open ? (
        <div className="wq-form">
          <label><span>نوع</span><select value={x.kind} onChange={(e) => setX({ ...x, kind: e.target.value as repo.Coating['kind'] })}>{Object.entries(KIND_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label><span>پوشش‌کار</span><select value={x.applicator} onChange={(e) => setX({ ...x, applicator: e.target.value })}><option value="">از فهرست پوشش‌کاران / جوشکاران…</option>{people.map((w) => <option key={w.id} value={w.key}>{w.key}{w.name ? ` — ${w.name}` : ''}{w.kind === 'coater' ? ' (پوشش‌کار)' : ''}</option>)}</select></label>
          <label><span>سیستم پوشش</span><input value={x.system} onChange={(e) => setX({ ...x, system: e.target.value })} placeholder="مثلاً Heat shrink sleeve 3LPE" /></label>
          <label className="wq-check"><input type="checkbox" checked={x.random} onChange={(e) => setX({ ...x, random: e.target.checked })} /> آزمون تصادفی</label>
          <label><span>ولتاژ منفذیابی (kV)</span><input inputMode="decimal" value={x.kv} onChange={(e) => setX({ ...x, kv: e.target.value })} /></label>
          <label><span>تعداد منفذ</span><input inputMode="numeric" value={x.count} onChange={(e) => setX({ ...x, count: e.target.value })} /></label>
          <label><span>کمترین ضخامت (µm)</span><input inputMode="decimal" value={x.dft} onChange={(e) => setX({ ...x, dft: e.target.value })} /></label>
          <label><span>چسبندگی (N/cm)</span><input inputMode="decimal" value={x.adhesion} onChange={(e) => setX({ ...x, adhesion: e.target.value })} /></label>
          <label><span>ظاهری</span><select value={x.visual} onChange={(e) => setX({ ...x, visual: e.target.value as repo.Coating['visual'] })}><option value="">—</option><option value="pass">قبول</option><option value="fail">رد</option></select></label>
          <label><span>نتیجه</span><select value={x.result} onChange={(e) => setX({ ...x, result: e.target.value as repo.Coating['result'] })}><option value="">—</option><option value="pass">قبول</option><option value="repair">نیاز به تعمیر</option><option value="fail">مردود</option></select></label>
          <label className="is-wide"><span>عیوب مشاهده‌شده</span><input value={x.defects} onChange={(e) => setX({ ...x, defects: e.target.value })} placeholder="مثلاً منفذ ساعت ۶، جدایش لبهٔ اسلیو" /></label>
          <label className="wq-drop is-small"><Camera size={15} aria-hidden /><span>{files.length ? `${fa(files.length)} فایل` : 'عکس / گزارش'}</span><input type="file" accept="image/*,application/pdf" multiple onChange={(e) => setFiles([...(e.target.files ?? [])])} /></label>
          <label className="is-wide"><span>توضیح</span><input value={x.note} onChange={(e) => setX({ ...x, note: e.target.value })} /></label>
          <div className="is-wide wq-form-actions"><button type="button" className="ps-btn is-primary" onClick={() => void save()}><ShieldCheck size={14} aria-hidden /> ثبت در بایگانی پوشش</button><button type="button" className="ps-btn is-ghost" onClick={() => setOpen(false)}>انصراف</button></div>
        </div>
      ) : <button type="button" className="ps-btn" onClick={() => setOpen(true)}><Plus size={14} aria-hidden /> ثبت اجرا، آزمون یا تعمیر پوشش</button>)}
    </div>
  )
}
