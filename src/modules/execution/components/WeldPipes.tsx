import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { fmtD } from '../../finance/components/fn'

interface Trace { pipe_raw: string; entry_date: string | null; entry_report_no: string | null; heat_no: string; od_in: number | null; wt_in: number | null; length_m: number | null; status: string
  string_report_no: string | null; string_date: string | null; string_km: string | null; string_origin: string | null; bend_report_no: string | null; bend_date: string | null; bend_km: string | null }
interface Dossier { pipe_before: string | null; pipe_after: string | null; pipe_before_trace: Trace | null; pipe_after_trace: Trace | null; fitup_report_no: string | null; fitup_date: string | null }

/** The two pipes of a joint (chosen at fit-up) with everything the site minutes recorded for each: entry to the site, stringing, bending. Read from the database view ex_weld_dossier — nothing is typed twice. */
export function WeldPipes({ weldId }: { weldId: string }) {
  const [d, setD] = useState<Dossier | null | undefined>(undefined)
  useEffect(() => { let on = true; setD(undefined)
    void supabase.from('ex_weld_dossier').select('pipe_before, pipe_after, pipe_before_trace, pipe_after_trace, fitup_report_no, fitup_date').eq('weld_id', weldId).maybeSingle().then(({ data }) => { if (on) setD((data as Dossier | null) ?? null) })
    return () => { on = false } }, [weldId])
  if (d === undefined) return <p className="im-helper" role="status">در حال خواندن لوله‌های این سرجوش…</p>
  if (!d) return null
  const card = (title: string, raw: string | null, t: Trace | null) => (
    <div className="wp-card">
      <b>{title}</b>
      {!raw ? <span className="im-helper">در فیت‌آپ ثبت نشده</span> : <>
        <span className="wp-no" dir="ltr">{raw}</span>
        {!t ? <span className="im-helper">در بانک لوله (ورود لوله به کارگاه) پیدا نشد</span> : <dl>
          <dt>ورود به کارگاه</dt><dd>{t.entry_date ? fmtD(t.entry_date) : '—'}{t.entry_report_no ? ` · ${t.entry_report_no}` : ''}</dd>
          <dt>مشخصات</dt><dd dir="ltr">{[t.od_in != null ? `${t.od_in}"` : '', t.wt_in != null ? `WT ${t.wt_in}"` : '', t.length_m != null ? `${t.length_m} m` : '', t.heat_no ? `Heat ${t.heat_no}` : ''].filter(Boolean).join(' · ') || '—'}</dd>
          <dt>ریسه</dt><dd>{t.string_date ? `${fmtD(t.string_date)} · ${t.string_report_no ?? ''}${t.string_km ? ` · km ${t.string_km}` : ''}` : 'ریسه نشده'}</dd>
          {t.bend_date && <><dt>خمکاری</dt><dd>{fmtD(t.bend_date)} · {t.bend_report_no}{t.bend_km ? ` · km ${t.bend_km}` : ''}</dd></>}
        </dl>}
      </>}
    </div>
  )
  return (
    <div className="wp">
      {card('لولهٔ قبل از سرجوش', d.pipe_before, d.pipe_before_trace)}
      <div className="wp-joint" aria-hidden><span />سرجوش{d.fitup_date ? <small>فیت‌آپ {fmtD(d.fitup_date)}</small> : null}<span /></div>
      {card('لولهٔ بعد از سرجوش', d.pipe_after, d.pipe_after_trace)}
    </div>
  )
}
