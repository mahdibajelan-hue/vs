import { useEffect, useMemo, useState } from 'react'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { Camera } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { todayTehran } from '../../../lib/today'
import { useExecutionStore } from '../store/useExecutionStore'
import { PERIOD_FA, type Period } from './periods'
import { usePhotoStore } from './photoStore'
import { PhotoGrid, PhotoRotator, PhotoUpload, PickFigure } from './PhotoParts'

/** عکس‌های کارگاه — the project's site photos: the chosen ones of today, this week and this month, all of them by day, and adding more. */
export function PhotosPage({ projectId }: { projectId: string }) {
  const st = usePhotoStore()
  const can = useExecutionStore((s) => s.can(projectId, 'record') || s.can(projectId, 'review') || s.can(projectId, '*'))
  const today = todayTehran()
  const [subject, setSubject] = useState(''), [q, setQ] = useState(''), [date, setDate] = useState(today)
  useEffect(() => { void st.load(projectId, true) }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps
  const subjects = useMemo(() => [...new Set(st.photos.map((p) => p.subject).filter(Boolean))].sort(), [st.photos])
  const shown = st.photos.filter((p) => (!subject || p.subject === subject) && (!q || `${p.caption} ${p.front} ${p.subject} ${p.byName}`.includes(q)))
  const days = useMemo(() => [...new Set(shown.map((p) => p.takenOn))], [shown])
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <PhotoRotator projectId={projectId} height={340} />
      <section className="fn-sec">
        <header><div><h2>عکس‌های برگزیده</h2><p>عکس روز، هفته (شنبه تا جمعه) و ماه در گزارش‌های روزانه، هفتگی و ماهانه چاپ می‌شوند. برای انتخاب، عکس را باز کنید و «روز»، «هفته» یا «ماه» را بزنید.</p></div></header>
        <div className="xp-featured">{(['day', 'week', 'month'] as Period[]).map((k) => <div key={k}>{st.pickOf(k, today) ? <PickFigure projectId={projectId} period={k} iso={today} /> : <p className="im-helper" style={{ margin: 0, padding: '18px 12px', border: '1px dashed var(--im-line)', borderRadius: 12 }}>{PERIOD_FA[k]} هنوز انتخاب نشده است.</p>}</div>)}</div>
      </section>
      <section className="fn-sec">
        <header><div><h2><Camera size={15} style={{ verticalAlign: '-2px' }} aria-hidden /> همهٔ عکس‌ها</h2><p>{st.photos.length.toLocaleString('fa-IR')} عکس · عکس‌های هر گزارش روزانه از داخل همان گزارش هم اضافه می‌شوند.</p></div></header>
        {can && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><label className="im-helper" style={{ margin: 0 }}>تاریخ عکس <JalaliDateInput value={date} onChange={(v) => setDate(!v || v > today ? today : v)} /></label><div style={{ flex: 1, minWidth: 260 }}><PhotoUpload takenOn={date} /></div></div>}
        <div className="mt-filters no-print" style={{ marginBottom: 6 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو در شرح، جبهه یا عکاس" aria-label="جست‌وجو در عکس‌ها" />
          <select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="موضوع"><option value="">همهٔ موضوع‌ها</option>{subjects.map((x) => <option key={x} value={x}>{x}</option>)}</select>
        </div>
        {st.loading && !st.photos.length ? <div className="im-skeleton" style={{ height: 180 }} /> : days.length ? days.map((d) => { const list = shown.filter((p) => p.takenOn === d); return <div key={d}><h3 className="xp-day">{formatJalali(d).replace(/\d/g, (n) => '۰۱۲۳۴۵۶۷۸۹'[+n])}<small>{list.length.toLocaleString('fa-IR')} عکس</small></h3><PhotoGrid list={list} can={can} /></div> }) : <p className="im-helper">هنوز عکسی بارگذاری نشده است. از هر گزارش روزانه یا از همین صفحه عکس اضافه کنید.</p>}
      </section>
    </div>
  )
}
