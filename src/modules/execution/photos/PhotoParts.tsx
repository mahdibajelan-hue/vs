import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Award, Camera, ChevronLeft, ChevronRight, ImagePlus, Loader2, Pause, Play, Trash2, X } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { useAuthStore } from '../../../store/useAuthStore'
import { PERIOD_FA, keyOf, type Period } from './periods'
import { photoUrls, usePhotoStore, type Photo } from './photoStore'
import './photos.css'

const jd = (d: string) => formatJalali(d.slice(0, 10)).replace(/\d/g, (n) => '۰۱۲۳۴۵۶۷۸۹'[+n])
const PERIODS: Period[] = ['day', 'week', 'month']

/** the signed links of a set of files (one request for the set) */
export function usePhotoUrls(paths: string[]): Record<string, string> {
  const key = paths.join('|')
  const [m, setM] = useState<Record<string, string>>({})
  useEffect(() => { let off = false; if (paths.length) void photoUrls(paths).then((r) => { if (!off) setM(r) }); return () => { off = true } }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return m
}
/** which periods a photo was chosen for */
export function usePicksOf() {
  const picks = usePhotoStore((s) => s.picks)
  return (p: Photo) => PERIODS.filter((k) => picks.some((x) => x.period === k && x.key === keyOf(k, p.takenOn) && x.photoId === p.id))
}

/** choosing the photo of the day / week / month — on a photo's card and in the viewer */
export function PickButtons({ photo, can }: { photo: Photo; can: boolean }) {
  const st = usePhotoStore(); const mine = usePicksOf()(photo)
  if (!can && !mine.length) return null
  return (
    <span className="xp-picks">{PERIODS.map((k) => { const on = mine.includes(k); return can
      ? <button key={k} type="button" aria-pressed={on} className={on ? 'is-on' : ''} onClick={(e) => { e.stopPropagation(); void st.pick(photo, k) }} title={on ? `${PERIOD_FA[k]} است` : `انتخاب به‌عنوان ${PERIOD_FA[k]}`}><Award size={12} aria-hidden />{PERIOD_FA[k].replace('عکس ', '')}</button>
      : on ? <i key={k} className="is-on"><Award size={12} aria-hidden />{PERIOD_FA[k]}</i> : null })}</span>
  )
}

/** the large view of one photo, with its caption, the choice buttons and the next / previous of the same list */
export function PhotoViewer({ list, start, can, onClose }: { list: Photo[]; start: string; can: boolean; onClose: () => void }) {
  const st = usePhotoStore()
  const [i, setI] = useState(Math.max(0, list.findIndex((p) => p.id === start)))
  const p = list[Math.min(i, list.length - 1)]
  const url = usePhotoUrls(p ? [p.path] : [])[p?.path ?? '']
  const me = useAuthStore((s) => s.profile?.id ?? null)
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowLeft') setI((x) => Math.min(list.length - 1, x + 1)); if (e.key === 'ArrowRight') setI((x) => Math.max(0, x - 1)) }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [list.length, onClose])
  if (!p) return null
  return (
    <div className="xp-viewer" role="dialog" aria-modal="true" aria-label="نمایش عکس" onClick={onClose}>
      <div className="xp-viewer-in" onClick={(e) => e.stopPropagation()}>
        {url ? <img src={url} alt={p.caption || `عکس ${jd(p.takenOn)}`} /> : <span className="xp-wait"><Loader2 size={22} className="animate-spin" aria-hidden /></span>}
        <footer>
          <div><b>{p.caption || 'بدون شرح'}</b><small>{jd(p.takenOn)}{p.front ? ` · ${p.front}` : ''}{p.subject ? ` · ${p.subject}` : ''}{p.byName ? ` · ${p.byName}` : ''}</small></div>
          <PickButtons photo={p} can={can} />
          {(can && (p.byUser === me || !p.byUser)) && <button type="button" className="xp-ic" aria-label="حذف عکس" onClick={() => { if (window.confirm('این عکس حذف شود؟')) void st.remove(p.id).then((ok) => ok && (list.length <= 1 ? onClose() : setI((x) => Math.max(0, x - 1)))) }}><Trash2 size={15} aria-hidden /></button>}
          <button type="button" className="xp-ic" aria-label="بستن" onClick={onClose}><X size={16} aria-hidden /></button>
        </footer>
        {list.length > 1 && <><button type="button" className="xp-nav is-prev" aria-label="عکس قبلی" disabled={i === 0} onClick={() => setI(i - 1)}><ChevronRight size={20} aria-hidden /></button><button type="button" className="xp-nav is-next" aria-label="عکس بعدی" disabled={i >= list.length - 1} onClick={() => setI(i + 1)}><ChevronLeft size={20} aria-hidden /></button></>}
      </div>
    </div>
  )
}

/** a grid of thumbnails; a click opens the viewer */
export function PhotoGrid({ list, can }: { list: Photo[]; can: boolean }) {
  const urls = usePhotoUrls(list.map((p) => p.thumbPath)), picksOf = usePicksOf()
  const [open, setOpen] = useState<string | null>(null)
  return (
    <>
      <div className="xp-grid">{list.map((p) => { const pk = picksOf(p); return (
        <button key={p.id} type="button" className="xp-card" onClick={() => setOpen(p.id)} aria-label={`${p.caption || 'عکس'} — ${jd(p.takenOn)}`}>
          {urls[p.thumbPath] ? <img src={urls[p.thumbPath]} alt="" loading="lazy" /> : <span className="xp-ph" />}
          {pk.length > 0 && <span className="xp-medal"><Award size={12} aria-hidden />{pk.map((k) => PERIOD_FA[k].replace('عکس ', '')).join(' · ')}</span>}
          <span className="xp-cap"><b>{p.caption || '—'}</b><small>{jd(p.takenOn)}{p.front ? ` · ${p.front}` : ''}</small></span>
        </button>
      ) })}</div>
      {open && <PhotoViewer list={list} start={open} can={can} onClose={() => setOpen(null)} />}
    </>
  )
}

/** adding photos: several files at once, with one caption and subject for the batch */
export function PhotoUpload({ takenOn, reportId, front, compact }: { takenOn: string; reportId?: string | null; front?: string; compact?: boolean }) {
  const st = usePhotoStore()
  const [caption, setCaption] = useState(''), [subject, setSubject] = useState(''), [busy, setBusy] = useState(0)
  const pickFiles = async (files: File[]) => { if (!files.length) return; setBusy(files.length); await st.upload(files, { reportId, takenOn, caption: caption.trim(), subject: subject.trim(), front }); setBusy(0); setCaption('') }
  return (
    <div className={`xp-upload ${compact ? 'is-compact' : ''}`}>
      <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="شرح عکس (مثلاً: لوله‌گذاری کیلومتر ۱۲+۴۰۰)" aria-label="شرح عکس" />
      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="موضوع / عملیات" aria-label="موضوع عکس" list="xp-subjects" className="xp-subject" />
      <datalist id="xp-subjects">{['تسطیح و مسیرسازی', 'ریسه', 'خمکاری', 'جوشکاری', 'رادیوگرافی', 'پوشش سرجوش', 'کانال‌کنی', 'لوله‌گذاری', 'خاک‌ریزی', 'عبور از موانع', 'هیدروتست', 'ایستگاه', 'ایمنی و HSE', 'بازدید'].map((x) => <option key={x} value={x} />)}</datalist>
      <label className={`xp-add ${busy ? 'is-busy' : ''}`}>{busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <ImagePlus size={15} aria-hidden />}{busy ? `بارگذاری ${busy.toLocaleString('fa-IR')} عکس…` : 'افزودن عکس'}
        <input type="file" accept="image/*" multiple disabled={!!busy} onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; void pickFiles(f) }} /></label>
    </div>
  )
}

/** the photos of one daily report, inside its editor */
export function ReportPhotos({ projectId, reportId, date, front, can }: { projectId: string; reportId: string; date: string; front: string; can: boolean }) {
  const st = usePhotoStore()
  useEffect(() => { void st.load(projectId) }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => st.photos.filter((p) => p.reportId === reportId), [st.photos, reportId])
  return (
    <section className="fn-sec xp-report no-print">
      <header><div><h2><Camera size={15} style={{ verticalAlign: '-2px' }} aria-hidden /> عکس‌های این گزارش</h2><p>از عملیات و موضوع‌های مهم امروز چند عکس بگذارید؛ در گالری پروژه می‌چرخند و از میانشان عکس روز، هفته و ماه برای گزارش‌ها انتخاب می‌شود.</p></div><span className="xp-count">{list.length.toLocaleString('fa-IR')} عکس</span></header>
      {can && <PhotoUpload takenOn={date} reportId={reportId} front={front} />}
      {list.length ? <PhotoGrid list={list} can={can} /> : <p className="im-helper" style={{ margin: 0 }}>هنوز عکسی برای این گزارش گذاشته نشده است.</p>}
    </section>
  )
}

/**
 * The project's photos changing one after another (the chosen photos first, then the newest). It waits under the
 * pointer, can be paused, and does not move by itself for people who asked their system for less motion.
 */
export function PhotoRotator({ projectId, height = 260, onOpenGallery }: { projectId: string; height?: number; onOpenGallery?: () => void }) {
  const st = usePhotoStore(); const picksOf = usePicksOf()
  useEffect(() => { void st.load(projectId) }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => { const chosen = new Set(st.picks.map((x) => x.photoId)); return [...st.photos.filter((p) => chosen.has(p.id)), ...st.photos.filter((p) => !chosen.has(p.id))].slice(0, 24) }, [st.photos, st.picks])
  const urls = usePhotoUrls(list.map((p) => p.path))
  const n = list.length
  // a strip of three copies of the list: the middle copy is the one shown; after a move past its ends the strip jumps
  // back by one copy without animation, so the carousel runs endlessly in one direction
  const [pos, setPos] = useState(0), [anim, setAnim] = useState(true), [paused, setPaused] = useState(false), hover = useRef(false)
  useEffect(() => { setAnim(false); setPos(n) }, [n])
  useEffect(() => { if (!anim) { const r = requestAnimationFrame(() => setAnim(true)); return () => cancelAnimationFrame(r) } }, [anim])
  const still = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  useEffect(() => { if (paused || still || n < 2) return; const t = setInterval(() => { if (!hover.current && !document.hidden) setPos((x) => x + 1) }, 6000); return () => clearInterval(t) }, [paused, still, n])
  if (!n) return null
  const go = (d: number) => setPos((x) => x + d)
  const settle = () => { if (pos >= 2 * n || pos < n) { setAnim(false); setPos(((pos % n) + n) % n + n) } }
  const idx = ((pos % n) + n) % n
  const strip = n > 1 ? [...list, ...list, ...list] : list
  return (
    <figure className={`xp-rot${n > 1 ? ' is-strip' : ''}`} style={{ '--h': `${height}px`, '--k': n > 1 ? pos : 0 } as CSSProperties} onPointerEnter={() => { hover.current = true }} onPointerLeave={() => { hover.current = false }} aria-roledescription="نمایش چرخشی عکس‌های پروژه">
      <div className={`xp-rot-track${anim ? '' : ' no-anim'}`} onTransitionEnd={(e) => { if (e.target === e.currentTarget) settle() }}>
        {strip.map((p, k) => {
          const url = urls[p.path], on = n > 1 ? k === pos : true, pk = on ? picksOf(p) : []
          return (
            <div key={`${k}-${p.id}`} className={`xp-rot-slot${on ? ' is-on' : ''}`} aria-hidden={!on || undefined} onClick={!on && n > 1 ? () => go(k - pos) : undefined}>
              {url && <><div className="xp-rot-bg" style={{ backgroundImage: `url("${url}")` }} /><img src={url} alt={on ? p.caption || 'عکس کارگاه' : ''} loading={Math.abs(k - pos) < 3 ? 'eager' : 'lazy'} /></>}
              {on && <figcaption>
                {pk.length > 0 && <span className="xp-medal is-inline"><Award size={12} aria-hidden />{pk.map((x) => PERIOD_FA[x]).join(' · ')}</span>}
                <b>{p.caption || 'عکس کارگاه'}</b><small>{jd(p.takenOn)}{p.front ? ` · ${p.front}` : ''}{p.subject ? ` · ${p.subject}` : ''}</small>
              </figcaption>}
            </div>
          )
        })}
      </div>
      <div className="xp-rot-ctl">
        {n > 1 && <><button type="button" aria-label="عکس قبلی" onClick={() => go(-1)}><ChevronRight size={15} aria-hidden /></button>
          <button type="button" aria-label={paused ? 'ادامهٔ نمایش' : 'توقف نمایش'} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused || still ? <Play size={13} aria-hidden /> : <Pause size={13} aria-hidden />}</button>
          <button type="button" aria-label="عکس بعدی" onClick={() => go(1)}><ChevronLeft size={15} aria-hidden /></button>
          <span>{(idx + 1).toLocaleString('fa-IR')} / {n.toLocaleString('fa-IR')}</span></>}
        {onOpenGallery && <button type="button" className="xp-rot-all" onClick={onOpenGallery}>همهٔ عکس‌ها</button>}
      </div>
    </figure>
  )
}

/** the chosen photo of a period, for a report page (nothing when none was chosen) */
export function PickFigure({ projectId, period, iso }: { projectId: string; period: Period; iso: string }) {
  const st = usePhotoStore()
  useEffect(() => { void st.load(projectId) }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps
  const p = st.pickOf(period, iso)
  const url = usePhotoUrls(p ? [p.path] : [])[p?.path ?? '']
  if (!p || !url) return null
  return <figure className="xp-fig"><img src={url} alt={p.caption || PERIOD_FA[period]} /><figcaption><b><Award size={13} aria-hidden /> {PERIOD_FA[period]}</b>{p.caption ? ` — ${p.caption}` : ''}<small>{jd(p.takenOn)}{p.front ? ` · ${p.front}` : ''}{p.byName ? ` · عکس از ${p.byName}` : ''}</small></figcaption></figure>
}
