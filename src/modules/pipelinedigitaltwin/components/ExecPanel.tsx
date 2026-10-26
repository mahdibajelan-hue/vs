import { useMemo, type CSSProperties } from 'react'
import { Briefcase, ExternalLink } from 'lucide-react'
import { usePdtStore } from '../store/usePdtStore'
import { useModuleStore } from '../../../store/useModuleStore'
import { HEALTH_STATUS_FA, healthColor } from '../../projectMetrics/HealthGuide'
import { STAGE_COLOR as PSSR_COLOR } from '../../pssr/lib/pssrCore'
import { assetPicture, execReading, kmByStage, physicalProgress } from '../lib/twinCore'
import type { Official } from '../hooks/useOfficial'

const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })
const TONE = { good: '#22c55e', warn: '#f59e0b', bad: '#ef4444' } as const
const BINS = 120

/**
 * For the CEO: the project in one screen, in plain language. The headline numbers are the same as the radar and the project
 * dashboard (one source), the line strip shows where along the route the work, the land and the commissioning stand.
 */
export function ExecPanel({ official }: { official: Official }) {
  const st = usePdtStore()
  const m = official.metrics
  const routeKm = st.route.lengthMeters / 1000
  const kmBuilt = kmByStage(st.joints, st.settings.stockLengthM).backfill
  const pic = assetPicture(st.assets, new Date().toISOString().slice(0, 10))
  const reading = execReading({ routeKm, physicalPct: physicalProgress(st.joints), officialCPct: m?.epc.cons?.actual ?? null, kmBackfilled: kmBuilt, kmUnderGas: official.kmUnderGas, jointNcr: st.joints.filter((j) => j.finalStatus === 'ncr').length, officialNcr: official.ncrOpen, assetsOverdue: pic.overdue, criticalAssetsPoor: pic.criticalPoor, landBlockedKm: official.landBlockedKm })
  // construction along the line: share of backfilled joints in each bin
  const built = useMemo(() => {
    const n = st.joints.length, per = Math.max(1, Math.ceil(n / BINS))
    return Array.from({ length: Math.ceil(n / per) }, (_, b) => { const s = st.joints.slice(b * per, (b + 1) * per); return s.filter((j) => j.backfillStatus === 'completed').length / s.length })
  }, [st.joints])
  const L = st.route.lengthMeters || 1
  const x = (meters: number) => Math.max(0, Math.min(100, (meters / L) * 100))
  return (
    <div className="tw-panel glass-panel">
      <div className="tw-ph"><span className="tw-ph-ico"><Briefcase size={16} /></span><h3>نمای مدیریتی</h3><small>همان اعداد رادار و داشبورد</small></div>
      <div className="tw-exec-hero">
        <div className="tw-num is-acc"><small>پیشرفت کل پروژه</small><b>{m ? `${fa(m.lifecycle.actual, 1)}٪` : official.loading ? '…' : '—'}</b><em>{m ? `برنامه ${fa(m.lifecycle.planned, 1)}٪` : ''}</em></div>
        <div className="tw-num"><small>سلامت پروژه</small><b style={{ color: healthColor(m?.health) }}>{m?.health ? fa(m.health.score) : '—'}</b><em>{m?.health ? HEALTH_STATUS_FA[m.health.status] : ''}</em></div>
        <div className="tw-num"><small>ساخته و خاک‌ریزی‌شده</small><b>{fa(kmBuilt, 1)} km</b><em>از {fa(routeKm, 1)} کیلومتر</em></div>
        <div className="tw-num"><small>شاخص زمان / هزینه</small><b dir="ltr" style={{ fontSize: '1.3rem', textAlign: 'right' }}>{m?.evm.spi != null ? fa(m.evm.spi, 2) : '—'} / {m?.evm.cpi != null ? fa(m.evm.cpi, 2) : '—'}</b><em>SPI / CPI پیمان EPC</em></div>
      </div>

      <section className="tw-sec">
        <h4>آنچه باید بدانید</h4>
        <ul className="tw-read">{reading.map((r, i) => <li key={i} style={{ '--c': TONE[r.tone] } as CSSProperties}><i />{r.text}</li>)}</ul>
      </section>

      <section className="tw-sec">
        <h4>مسیر در یک نگاه</h4>
        <div className="tw-strip">
          <div><span>ساخت</span><svg viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label="پیشرفت خاک‌ریزی در طول مسیر">{built.map((v, i) => v > 0 && <rect key={i} x={(i / built.length) * 100} width={100 / built.length + 0.05} height={10} fill="#22c55e" opacity={0.25 + v * 0.75} />)}</svg></div>
          <div><span>زمین</span><svg viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label="وضعیت آزادسازی اراضی">{(official.land ?? []).map((s, i) => <rect key={i} x={x(s.startMeters)} width={Math.max(0.3, x(s.endMeters) - x(s.startMeters))} height={10} fill={s.color} />)}</svg></div>
          <div><span>راه‌اندازی</span><svg viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label="سیستم‌های راه‌اندازی">{(official.pssr ?? []).map((s, i) => <rect key={i} x={x(s.startMeters)} width={Math.max(0.6, x(s.endMeters) - x(s.startMeters))} height={10} fill={PSSR_COLOR[s.stage]} />)}</svg></div>
        </div>
        <p className="tw-hint">ابتدای خط سمت چپ است. وضعیت زمین از ماژول تحصیل اراضی و راه‌اندازی از ماژول PSSR خوانده می‌شود.</p>
      </section>
      <button type="button" className="tw-btn" onClick={() => useModuleStore.getState().enterModule('projectdashboard')}><ExternalLink size={13} /> داشبورد کامل پروژه</button>
    </div>
  )
}
