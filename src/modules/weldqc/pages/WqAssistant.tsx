import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { jalaliFileDate } from '../../../lib/jalali'
import { Bot, Database, Download, GraduationCap, Target } from 'lucide-react'
import { useWqStore } from '../store/useWqStore'
import type { AiSample } from '../repo'
import { aiSamples, toSamples } from '../lib/aiSamples'
import { MIN_CODE, MIN_REAL, report, train } from '../lib/learn'
import { CODES, CODE_FA, type Code } from '../lib/api1104'
import { DETECTOR_VERSION } from '../lib/detect'
import { codeOf, fa, weldLabel } from '../lib/useQc'

const pc = (v: number | null) => (v == null ? '—' : `${fa(v * 100)}٪`)

/**
 * دستیار هوشمند و آموزش — how the image assistant is doing (measured on the interpreters' own decisions), what it has
 * learned so far, and the labelled set it leaves behind for training a detection network.
 */
export function WqAssistant() {
  const st = useWqStore()
  const [rows, setRows] = useState<AiSample[] | null>(null)
  useEffect(() => { let off = false; void aiSamples(true).then((r) => { if (!off) setRows(r) }); return () => { off = true } }, [])
  const mine = useMemo(() => (rows ?? []).filter((r) => r.projectId === st.projectId), [rows, st.projectId])
  const rep = useMemo(() => report(mine.map((r) => ({ action: r.action, aiCode: r.aiCode, finalCode: r.finalCode, filmId: r.filmId, detector: r.detector }))), [mine])
  const all = useMemo(() => toSamples(rows ?? []), [rows])
  const model = useMemo(() => train(all), [all])
  const real = all.filter((s) => s.real).length, coded = all.filter((s) => s.real && s.code).length
  const boxed = st.defects.filter((d) => !d.removed && d.bbox && codeOf(d))
  const filmsRun = st.films.filter((f) => f.ai).length

  /** the labelled set of this project in COCO form: films (their stored paths), boxes with API 1104 codes, dismissed alarms */
  const exportSet = () => {
    const films = st.films.filter((f) => boxed.some((d) => d.filmId === f.id) || mine.some((r) => r.filmId === f.id))
    const ids = new Map(films.map((f, i) => [f.id, i + 1]))
    const doc = {
      info: { description: 'Pipeline girth weld radiographs — interpreter-labelled indications (API 1104 codes)', project_id: st.projectId, exported_at: new Date().toISOString(), detector: DETECTOR_VERSION, storage_bucket: 'wq-films' },
      categories: CODES.map((c, i) => ({ id: i + 1, name: c, title: CODE_FA[c] })),
      images: films.map((f) => { const w = st.welds.find((x) => x.id === f.weldId); return { id: ids.get(f.id), file_name: f.displayPath ?? f.path, original: f.path, width: f.width, height: f.height, weld: w ? weldLabel(w) : '', segment: f.segment, exam: `${f.examType}${f.round || ''}`, px_per_mm: f.pxPerMm, iqi: f.iqi, density: f.density } }),
      annotations: boxed.filter((d) => ids.has(d.filmId ?? '')).map((d, i) => ({ id: i + 1, image_id: ids.get(d.filmId!), category_id: CODES.indexOf(codeOf(d) as Code) + 1, bbox: [d.bbox!.x, d.bbox!.y, d.bbox!.w, d.bbox!.h], area: d.bbox!.w * d.bbox!.h, iscrowd: 0, length_mm: d.lengthMm, width_mm: d.widthMm, clock: d.clock, pass: d.pass, verdict: d.verdict, source: d.detectedBy, by: d.createdName })),
      false_alarms: mine.filter((r) => r.action === 'dismissed' && r.bbox && ids.has(r.filmId)).map((r) => ({ image_id: ids.get(r.filmId), bbox: [r.bbox!.x, r.bbox!.y, r.bbox!.w, r.bbox!.h], proposed: r.aiCode, features: r.feats })),
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' })); a.download = `rt-labels-${jalaliFileDate(new Date().toISOString())}.json`; a.click(); URL.revokeObjectURL(a.href)
  }

  const need = Math.max(0, MIN_REAL - all.length)
  return (
    <div className="wq-assist">
      <section className="ps-kpis">
        <div className="ps-kpi" style={{ '--c': '#0ea5e9' } as CSSProperties}><small>فیلم تحلیل‌شده</small><b>{fa(filmsRun)}</b><span>از {fa(st.films.length)} فیلم پروژه</span></div>
        <div className="ps-kpi" style={{ '--c': '#22c55e' } as CSSProperties}><small>دقت پیشنهادها</small><b>{pc(rep.precision)}</b><span>{fa(rep.accepted + rep.modified)} واقعی از {fa(rep.reviewed)} بررسی‌شده</span></div>
        <div className="ps-kpi" style={{ '--c': '#a855f7' } as CSSProperties}><small>درستی کد پیشنهادی</small><b>{pc(rep.codeAgreement)}</b><span>{fa(rep.modified)} مورد را مفسر اصلاح کرد</span></div>
        <div className="ps-kpi" style={{ '--c': '#f59e0b' } as CSSProperties}><small>پوشش (یافتن عیوب واقعی)</small><b>{pc(rep.recall)}</b><span>{fa(rep.missed)} عیب را دستیار ندید</span></div>
      </section>

      <section className="wq-card">
        <header className="wq-card-head"><GraduationCap size={16} aria-hidden /><h3>یادگیری از تصمیم‌های مفسران</h3><span className={`wq-learn ${model ? 'is-on' : ''}`}>{model ? 'فعال' : 'در حال جمع‌آوری داده'}</span></header>
        <div className="wq-assist-bars">
          <Bar label="تصمیم‌های ثبت‌شده (همهٔ پروژه‌های شما)" v={all.length} of={MIN_REAL} note={`${fa(real)} واقعی · ${fa(all.length - real)} هشدار کاذب`} />
          <Bar label="نمونهٔ دارای کد نهایی" v={coded} of={MIN_CODE} note="برای پیشنهاد کد از روی موارد مشابه" />
          <Bar label="کادر عیب برچسب‌خورده در این پروژه" v={boxed.length} of={2000} note="برای آموزش شبکهٔ تشخیص (مرحلهٔ ۳)" />
        </div>
        <p className="ps-meta">{model
          ? `رتبه‌بندی نواحی مشکوک اکنون از ${fa(model.n)} تصمیم یاد گرفته است${model.cv != null ? `؛ در آزمون پنج‌بخشی، با ${fa(model.cv * 100)}٪ تصمیم‌هایی که ندیده بود هم‌خوان بود` : ''}. مواردی که مفسران مرتب رد می‌کنند پایین فهرست می‌روند و کد پیشنهادی با رأی نزدیک‌ترین موارد مشابه اصلاح می‌شود.`
          : `تا ${fa(MIN_REAL)} تصمیم (دست‌کم ۶ تأیید و ۶ رد) دستیار فقط با قاعده کار می‌کند${need ? `؛ ${fa(need)} تصمیم دیگر لازم است` : '؛ از هر دو نوع تصمیم باید به اندازهٔ کافی باشد'}. هر «بررسی و ثبت» و هر «رد» در میز نور یک نمونهٔ آموزشی است؛ رد کردن هشدارهای کاذب به اندازهٔ تأیید عیب واقعی ارزش دارد.`}</p>
      </section>

      <section className="wq-card">
        <header className="wq-card-head"><Target size={16} aria-hidden /><h3>عملکرد به تفکیک کد</h3><span className="ps-meta">بر پایهٔ تصمیم مفسر، نه برآورد خود دستیار</span></header>
        {rep.byCode.length ? (
          <div className="wq-tbl-wrap"><table className="wq-tbl"><thead><tr><th>کد پیشنهادی</th><th>نشان داده شد</th><th>همان کد تأیید شد</th><th>واقعی با کد دیگر</th><th>هشدار کاذب</th><th>دیده نشد</th></tr></thead>
            <tbody>{rep.byCode.map((r) => <tr key={r.code}><td>{r.code === '—' ? 'بدون کد' : CODE_FA[r.code as Code] ?? r.code}</td><td>{fa(r.shown)}</td><td>{fa(r.right)}</td><td>{fa(r.other)}</td><td className={r.dismissed > r.right + r.other ? 'is-late' : ''}>{fa(r.dismissed)}</td><td className={r.missed ? 'is-late' : ''}>{fa(r.missed)}</td></tr>)}</tbody></table></div>
        ) : <p className="ps-hint">هنوز تصمیمی ثبت نشده است. در میز نور هر فیلم «نواحی مشکوک» را بزنید و هر مورد را تأیید، اصلاح یا رد کنید؛ اگر عیبی را دستیار ندید و خودتان کادر کشیدید، به‌عنوان «دیده نشد» شمرده می‌شود.</p>}
      </section>

      <section className="wq-card">
        <header className="wq-card-head"><Database size={16} aria-hidden /><h3>مجموعهٔ دادهٔ برچسب‌خورده</h3><button type="button" className="ps-btn wq-head-link" onClick={exportSet} disabled={!boxed.length && !mine.length}><Download size={14} aria-hidden /> خروجی برچسب‌ها (COCO JSON)</button></header>
        <p className="ps-meta">هر کادر عیبی که مفسر روی فیلم می‌کشد یا تأیید می‌کند، با کد API 1104، ابعاد، موقعیت ساعتی و نتیجهٔ ارزیابی ذخیره می‌شود؛ هشدارهای ردشده هم به‌عنوان نمونهٔ منفی نگه داشته می‌شوند. خروجی، قالب استاندارد آموزش شبکه‌های تشخیص است و مسیر فایل هر فیلم در مخزن خصوصی «wq-films» را دارد.</p>
      </section>

      <section className="wq-card">
        <header className="wq-card-head"><Bot size={16} aria-hidden /><h3>نقشهٔ راه آموزش مدل</h3></header>
        <ol className="wq-road">
          <li className="is-done"><b>مرحلهٔ ۱ — تشخیص قاعده‌محور (فعال، نسخهٔ {DETECTOR_VERSION})</b><span>نوار جوش، آستانه نسبت به نویز همان فیلم، اندازه‌گیری هر ناحیه و کد پیشنهادی با دلیل. بدون نیاز به داده؛ همهٔ پردازش در مرورگر است و فیلم جایی فرستاده نمی‌شود.</span></li>
          <li className={model ? 'is-done' : 'is-now'}><b>مرحلهٔ ۲ — یادگیری از تصمیم‌های مفسر ({model ? 'فعال' : `از ${fa(MIN_REAL)} تصمیم`})</b><span>مدل سبک روی ویژگی‌های اندازه‌گیری‌شده: هشدارهای کاذب تکراری را پایین می‌برد و کد را از موارد مشابه قبلی پیشنهاد می‌دهد. با هر تصمیم تازه دوباره برازش می‌شود.</span></li>
          <li className={boxed.length >= 2000 ? 'is-now' : ''}><b>مرحلهٔ ۳ — شبکهٔ تشخیص آموزش‌دیده (از حدود ۲٬۰۰۰ کادر برچسب‌خورده)</b><span>با خروجی همین صفحه یک شبکهٔ تشخیص شیء یا قطعه‌بندی، بیرون از سامانه آموزش داده می‌شود (شروع از وزن‌های پیش‌آموخته روی مجموعه‌های عمومی رادیوگرافی جوش) و پس از سنجش روی فیلم‌هایی که ندیده، به‌صورت ONNX در همین میز نور اجرا می‌شود. معیار پذیرش: پوشش عیوب مردودکننده و نرخ هشدار کاذب، سنجیده با همین جدول.</span></li>
          <li><b>همیشه — مفسر تصمیم‌گیرنده است</b><span>طبق API 1104 تفسیر با شخص دارای صلاحیت است؛ دستیار فقط جای نگاه را پیشنهاد می‌دهد و هیچ عیبی بدون تأیید مفسر ثبت نمی‌شود. نمونه‌برداری دوره‌ای از فیلم‌های «بدون ناحیهٔ مشکوک» برای سنجش موارد دیده‌نشده لازم است.</span></li>
        </ol>
      </section>
    </div>
  )
}
function Bar({ label, v, of, note }: { label: string; v: number; of: number; note: string }) {
  return <div className="wq-abar"><span>{label}</span><b>{fa(v)}<small> / {fa(of)}</small></b><i><em style={{ width: `${Math.min(100, (v / of) * 100)}%` }} /></i><small>{note}</small></div>
}
