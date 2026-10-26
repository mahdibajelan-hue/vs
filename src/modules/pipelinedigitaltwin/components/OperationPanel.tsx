import type { CSSProperties } from 'react'
import { ExternalLink, Gauge, ShieldCheck, Wrench } from 'lucide-react'
import { usePdtStore } from '../store/usePdtStore'
import { useModuleStore } from '../../../store/useModuleStore'
import { formatJalali } from '../../../lib/jalali'
import { formatChainage } from '../lib/chainage'
import { STAGE_COLOR as PSSR_COLOR, STAGE_FA as PSSR_FA } from '../../pssr/lib/pssrCore'
import { assetPicture, dueState, EVENT_FA, OPSTATE_FA, type OpState } from '../lib/twinCore'
import { DUE_COLOR, DUE_FA } from './AssetPanel'
import type { Official } from '../hooks/useOfficial'

const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })
const today = () => new Date().toISOString().slice(0, 10)
export const OP_COLOR: Record<OpState, string> = { open: '#22c55e', closed: '#ef4444', throttled: '#f59e0b', na: '#64748b' }

/**
 * For the operator: which stretches are under gas (from the PSSR module), every line valve and its position, what
 * inspection is due, and the latest operations — the questions asked in a dispatching room.
 */
export function OperationPanel({ official }: { official: Official }) {
  const st = usePdtStore()
  const valves = st.assets.filter((a) => a.kind === 'valve')
  const pic = assetPicture(st.assets, today())
  const due = st.assets.filter((a) => { const d = dueState(a, today()); return d === 'overdue' || d === 'soon' }).sort((a, b) => (a.nextInspection ?? '').localeCompare(b.nextInspection ?? ''))
  const recent = st.events.slice(0, 6)
  const tagOf = (id: string) => st.assets.find((a) => a.id === id)?.tag ?? ''
  const routeKm = st.route.lengthMeters / 1000
  return (
    <div className="tw-panel glass-panel">
      <div className="tw-ph"><span className="tw-ph-ico"><Gauge size={16} /></span><h3>بهره‌برداری</h3><small>{formatJalali(today())}</small></div>
      <div className="tw-dual">
        <div className="tw-num is-acc"><small>تحت گاز</small><b>{fa(official.kmUnderGas, 1)} km</b><em>از {fa(routeKm, 1)} کیلومتر مسیر</em></div>
        <div className="tw-num"><small>شیرهای خط</small><b>{fa(valves.length - pic.valvesClosed)} / {fa(valves.length)}</b><em>{pic.valvesClosed ? `${fa(pic.valvesClosed)} شیر بسته` : 'همه باز'}</em></div>
      </div>

      <section className="tw-sec">
        <h4><ShieldCheck size={13} /> آمادگی راه‌اندازی (PSSR)</h4>
        {official.pssr?.length ? (
          <div className="tw-list">
            {[...official.pssr].sort((a, b) => a.startMeters - b.startMeters).map((s) => (
              <div key={s.code} className="tw-row" style={{ cursor: 'default' }}>
                <span className="tw-dot" style={{ '--c': PSSR_COLOR[s.stage] } as CSSProperties} />
                <span><b className="tw-tag" dir="ltr">{s.code}</b><small>{s.name}</small></span>
                <span className="tw-pill" style={{ '--c': PSSR_COLOR[s.stage] } as CSSProperties}>{PSSR_FA[s.stage]}</span>
              </div>
            ))}
          </div>
        ) : <p className="tw-hint">{official.loading ? 'در حال خواندن…' : 'سیستم راه‌اندازی برای این پروژه تعریف نشده است.'}</p>}
        <button type="button" className="tw-btn" onClick={() => useModuleStore.getState().enterModule('pssr')}><ExternalLink size={13} /> ماژول آمادگی راه‌اندازی</button>
      </section>

      <section className="tw-sec">
        <h4>شیرهای خط</h4>
        {valves.length ? (
          <div className="tw-list">
            {valves.map((v) => (
              <button key={v.id} type="button" className={`tw-row ${st.selectedAssetId === v.id ? 'is-on' : ''}`} onClick={() => st.selectAsset(v.id)}>
                <span className="tw-dot" style={{ '--c': OP_COLOR[v.opState] } as CSSProperties} />
                <span><b><span className="tw-tag" dir="ltr">{v.tag}</span> {v.name}</b><small dir="ltr" style={{ textAlign: 'right' }}>{formatChainage(v.km * 1000)}</small></span>
                <span className="tw-pill" style={{ '--c': OP_COLOR[v.opState] } as CSSProperties}>{OPSTATE_FA[v.opState]}</span>
              </button>
            ))}
          </div>
        ) : <p className="tw-hint">شیری ثبت نشده است؛ از نمای «دارایی‌ها» ثبت کنید.</p>}
      </section>

      <section className="tw-sec">
        <h4><Wrench size={13} /> بازرسی‌های پیش رو</h4>
        {due.length ? (
          <div className="tw-list">
            {due.map((a) => { const d = dueState(a, today()); return (
              <button key={a.id} type="button" className="tw-row" onClick={() => st.selectAsset(a.id)}>
                <span className="tw-dot" style={{ '--c': DUE_COLOR[d] } as CSSProperties} />
                <span><b className="tw-tag" dir="ltr">{a.tag}</b><small>{a.nextInspection ? formatJalali(a.nextInspection) : ''}</small></span>
                <span className="tw-pill" style={{ '--c': DUE_COLOR[d] } as CSSProperties}>{DUE_FA[d]}</span>
              </button>
            ) })}
          </div>
        ) : <p className="tw-hint">بازرسی عقب‌افتاده یا نزدیکی نیست.</p>}
      </section>

      {recent.length > 0 && (
        <section className="tw-sec">
          <h4>آخرین عملیات و بازرسی‌ها</h4>
          <ul className="tw-list">
            {recent.map((e) => <li key={e.id} className="tw-row" style={{ cursor: 'default' }}><span className="tw-tag" dir="ltr">{tagOf(e.assetId)}</span><span><b>{EVENT_FA[e.kind]}{e.opState ? ` → ${OPSTATE_FA[e.opState]}` : ''}</b><small>{e.result || e.note || '—'}</small></span><small>{formatJalali(e.at)}</small></li>)}
          </ul>
        </section>
      )}
    </div>
  )
}
