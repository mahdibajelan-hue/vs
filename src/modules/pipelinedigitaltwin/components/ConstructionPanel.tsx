import { useMemo, type CSSProperties } from 'react'
import { AlertTriangle, ExternalLink, HardHat, Plus } from 'lucide-react'
import type { Joint } from '../types'
import { usePdtStore } from '../store/usePdtStore'
import { useModuleStore } from '../../../store/useModuleStore'
import { deriveFinalStatus } from '../lib/progressEngine'
import { jointStageStateAsOf } from '../lib/jointHistory'
import { kmByStage, physicalProgress, STAGE_FA, STAGE_ORDER } from '../lib/twinCore'
import { STAGE_COLOR } from './EntryDrawer'
import type { Official } from '../hooks/useOfficial'

const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })
const WEEK = 7 * 86400000

/**
 * For the site engineer and the project manager: how much of the line is built, stage by stage, in km — next to the
 * execution module's official construction progress, so a gap between what is recorded on the route and what is reported
 * is visible at once. `joints` may be «as of» an earlier date (timeline).
 */
export function ConstructionPanel({ joints, official, onEntry }: { joints: Joint[]; official: Official; onEntry: () => void }) {
  const st = usePdtStore()
  const routeKm = st.route.lengthMeters / 1000
  const km = kmByStage(joints, st.settings.stockLengthM)
  const phys = physicalProgress(joints)
  const weekAgo = useMemo(() => {
    const iso = new Date(Date.now() - WEEK).toISOString()
    return physicalProgress(st.joints.map((j) => { const s = jointStageStateAsOf(j, iso); return { ...j, ...s, finalStatus: deriveFinalStatus(s) } }))
  }, [st.joints])
  const cons = official.metrics?.epc.cons ?? null
  const ncrJoints = joints.filter((j) => j.finalStatus === 'ncr').length
  const gap = cons ? phys - cons.actual : null

  return (
    <div className="tw-panel glass-panel">
      <div className="tw-ph"><span className="tw-ph-ico"><HardHat size={16} /></span><h3>پیشرفت ساخت</h3><small>{st.scrubDate ? 'نمای تاریخ گذشته' : 'وضعیت امروز'}</small></div>
      <button type="button" className="tw-cta" onClick={onEntry} disabled={!!st.scrubDate}><Plus size={16} /> ثبت پیشرفت روی مسیر</button>

      <div className="tw-dual">
        <div className="tw-num is-acc"><small>پیشرفت فیزیکی (روی مسیر)</small><b>{fa(phys, 1)}٪</b><em>{phys - weekAgo >= 0.05 ? `▲ ${fa(phys - weekAgo, 1)} در هفتهٔ اخیر` : 'بدون تغییر در هفتهٔ اخیر'}</em></div>
        <div className="tw-num"><small>پیشرفت ساخت (ماژول اجرا)</small><b>{official.loading ? '…' : cons ? `${fa(cons.actual, 1)}٪` : '—'}</b><em>{cons?.planned != null ? `برنامه ${fa(cons.planned, 1)}٪` : 'رقم رسمی پروژه'}</em></div>
      </div>
      {gap != null && Math.abs(gap) >= 5 && <p className="tw-gap">{fa(Math.abs(gap), 1)} واحد اختلاف بین ثبت روی مسیر و گزارش ماژول اجرا؛ {gap < 0 ? 'بخشی از کار انجام‌شده هنوز روی مسیر ثبت نشده است.' : 'گزارش‌های روزانهٔ ماژول اجرا از ثبت روی مسیر عقب‌ترند.'}</p>}

      <section className="tw-sec">
        <h4>کیلومتر انجام‌شده از {fa(routeKm, 1)} کیلومتر</h4>
        <div className="tw-bars">
          {STAGE_ORDER.map((s) => (
            <div key={s} className="tw-bar" style={{ '--c': STAGE_COLOR[s], '--w': `${routeKm ? Math.min(100, (km[s] / routeKm) * 100) : 0}%` } as CSSProperties}>
              <span>{STAGE_FA[s]}</span><i /><b>{fa(km[s], 1)} km</b>
            </div>
          ))}
        </div>
      </section>

      <section className="tw-sec">
        <h4><AlertTriangle size={13} /> کیفیت</h4>
        <div className="tw-dual">
          <div className="tw-num"><small>سرجوش با NDT مردود</small><b style={{ color: ncrJoints ? 'var(--bad)' : undefined }}>{fa(ncrJoints)}</b><em>ثبت‌شده روی مسیر</em></div>
          <div className="tw-num"><small>NCR باز</small><b>{official.ncrOpen == null ? '—' : fa(official.ncrOpen)}</b><em>ماژول اجرا (رسمی)</em></div>
        </div>
        <button type="button" className="tw-btn" onClick={() => useModuleStore.getState().enterModule('execution')}><ExternalLink size={13} /> ثبت و پیگیری NCR در ماژول مدیریت اجرا</button>
      </section>

      <p className="tw-hint">هر {fa(st.settings.stockLengthM)} متر یک سرجوش؛ {fa(st.joints.length)} سرجوش روی {fa(routeKm, 1)} کیلومتر. پیشرفت فیزیکی = میانگین وزنی پنج فعالیت هر سرجوش (جوش ۳۰، NDT ۲۰، پوشش ۲۰، پایین‌آوری ۱۵، خاک‌ریزی ۱۵).</p>
    </div>
  )
}
