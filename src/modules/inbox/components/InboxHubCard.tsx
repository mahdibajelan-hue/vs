import { PmisMark } from '../../../components/common/Logo'
import { useMemo } from 'react'
import { ArrowLeft, Bell, Inbox } from 'lucide-react'
import { useNotificationStore } from '../../../store/useNotificationStore'
import { SOURCE_COLOR, SOURCE_ICON } from '../lib/look'
import { BUCKETS, BUCKET_LABEL_FA, computeStats, mood } from '../lib/stats'
import { BUCKET_COLOR } from '../lib/look'
import { selectVisible, useInboxStore } from '../store/useInboxStore'
import { SOURCE_LABEL_FA } from '../types'
import '../inbox.css'

const fa = (n: number) => n.toLocaleString('fa-IR')

/** The «کارتابل من» tile of the launchpad: a wide banner like the module tiles, but alive — a mascot that reacts to the load, a donut by module and the due-date bars. */
export function InboxHubCard({ locked }: { locked?: boolean }) {
  const items = useInboxStore((s) => s.items)
  const snoozed = useInboxStore((s) => s.snoozed)
  const loaded = useInboxStore((s) => s.loadedOnce)
  const setOpen = useInboxStore((s) => s.setOpen)
  const setFilter = useInboxStore((s) => s.setFilter)
  const notes = useNotificationStore((s) => s.items.length)
  const st = useMemo(() => computeStats(selectVisible({ items, snoozed })), [items, snoozed])
  const md = mood(st)
  const total = st.total || 1
  const r = 26, c = 2 * Math.PI * r
  let off = 0
  const max = Math.max(1, ...BUCKETS.map((b) => st.byBucket[b]))
  const go = (source?: string) => { if (locked) return; setFilter({ source: (source ?? 'all') as never, group: 'all', bucket: 'all', urgentOnly: false, project: '', q: '' }); setOpen(true, null, 'inbox') }
  return (
    <div className={`ibh${locked ? ' locked' : ''}`}>
      <button type="button" className="ibh-main" onClick={() => go()} disabled={locked} aria-label="ورود به کارتابل من">
        <span className="ibh-art" aria-hidden>
          <svg viewBox="0 0 120 96" width="104" height="84">
            <defs><linearGradient id="ibh-g" x1="0" x2="1"><stop offset="0" stopColor="#22d3ee" /><stop offset="1" stopColor="#a78bfa" /></linearGradient></defs>
            <g className="ibh-card c3"><rect x="22" y="14" width="76" height="46" rx="9" fill="#1e3a68" stroke="#38bdf8" strokeOpacity=".5" /></g>
            <g className="ibh-card c2"><rect x="16" y="22" width="76" height="46" rx="9" fill="#27487f" stroke="#7dd3fc" strokeOpacity=".6" /></g>
            <g className="ibh-card c1"><rect x="10" y="30" width="76" height="50" rx="10" fill="url(#ibh-g)" /><path d="M10 46 h76" stroke="#fff" strokeOpacity=".35" /><rect x="20" y="55" width="34" height="5" rx="2.5" fill="#fff" fillOpacity=".75" /><rect x="20" y="65" width="22" height="5" rx="2.5" fill="#fff" fillOpacity=".45" /><path d="M68 62 l5 5 l10 -11" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" /></g>
          </svg>
          <span className="ibh-face">{loaded ? md.face : '📬'}</span>
        </span>
        <span className="ibh-txt">
          <span className="ibh-brand" dir="ltr" aria-label="FARIN PMIS"><span className="ibh-brand-farin">FARIN</span><PmisMark className="ibh-brand-pmis" /></span>
          <span className="ibh-tag"><Inbox size={13} /> Unified Inbox</span>
          <b>کارتابل من</b>
          <span className="ibh-sub">{locked ? 'پس از ورود، همهٔ کارهای شما در همهٔ ماژول‌ها یک‌جاست' : loaded ? md.text : 'در حال بارگذاری…'}</span>
          <span className="ibh-nums">
            <span><em>{fa(st.total)}</em>کار باز</span>
            <span className={st.urgent ? 'hot' : ''}><em>{fa(st.urgent)}</em>فوری</span>
            <span><em>{fa(st.byGroup.decide)}</em>تصمیم و تأیید</span>
            <span className={notes ? 'note' : ''}><Bell size={12} /><em>{fa(notes)}</em>اعلان</span>
          </span>
        </span>
        <span className="ibh-go" aria-hidden><ArrowLeft size={18} /></span>
      </button>

      {!locked && (
        <div className="ibh-viz">
          <div className="ibh-donut" title="سهم هر ماژول">
            <svg viewBox="0 0 70 70" width="74" height="74" aria-hidden>
              <circle cx="35" cy="35" r={r} fill="none" stroke="rgba(148,163,184,.25)" strokeWidth="9" />
              {st.bySource.map(([k, v]) => { const len = (v / total) * c; const el = <circle key={k} cx="35" cy="35" r={r} fill="none" stroke={SOURCE_COLOR[k]} strokeWidth="9" strokeDasharray={`${Math.max(0, len - 1.2)} ${c}`} strokeDashoffset={-off} transform="rotate(-90 35 35)" />; off += len; return el })}
              <text x="35" y="39" textAnchor="middle" className="ibh-dn">{fa(st.total)}</text>
            </svg>
            <ul>{st.bySource.slice(0, 4).map(([k, v]) => { const I = SOURCE_ICON[k]; return <li key={k}><button onClick={() => go(k)}><I size={12} style={{ color: SOURCE_COLOR[k] }} />{SOURCE_LABEL_FA[k]}<b>{fa(v)}</b></button></li> })}{st.bySource.length === 0 && <li className="ibh-none">کار بازی نیست 🎉</li>}</ul>
          </div>
          <div className="ibh-bars" title="مهلت انجام کارها">
            {BUCKETS.map((b) => <span key={b} className="ibh-bar"><i style={{ height: `${Math.max(st.byBucket[b] ? 12 : 4, (st.byBucket[b] / max) * 100)}%`, background: BUCKET_COLOR[b] }} /><em>{BUCKET_LABEL_FA[b]}</em></span>)}
          </div>
        </div>
      )}
    </div>
  )
}
