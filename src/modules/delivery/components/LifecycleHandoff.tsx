import { useEffect, useState } from 'react'
import { ArrowLeftRight, ExternalLink } from 'lucide-react'
import { useModuleStore } from '../../../store/useModuleStore'
import { LIFECYCLE_FA, lifecycleStrategyOf, type LifecycleStrategy } from '../lib/handoff'
import { lifecycleNow, type Decision, type Study } from '../repo'

const GOV_FA: Record<string, string> = { draft: 'پیش‌نویس', proposed: 'پیشنهادی', reviewed: 'بازبینی‌شده', approved: 'تصویب‌شده', baseline: 'خط مبنا', in_execution: 'در حال اجرا', revised: 'بازنگری‌شده', completed: 'پایان‌یافته' }
const SG_FA: Record<string, string> = { ...LIFECYCLE_FA, emergency_fast_track: 'تسریع اضطراری (Emergency)' }
const when = (s: string) => { try { return new Date(s).toLocaleDateString('fa-IR-u-ca-persian', { dateStyle: 'medium' }) } catch { return s } }
type Now = Awaited<ReturnType<typeof lifecycleNow>>

/**
 * After approval: propose the matching execution strategy to the project's Stage-Gate lifecycle. The proposal is kept on
 * the study; Stage-Gate shows it beside its own strategy selector, and a person applies it there to re-plan the phases.
 */
export function LifecycleHandoff({ study, approval, canApply, busy, onApply }: { study: Study; approval: Decision | null; canApply: boolean; busy: boolean; onApply: (k: LifecycleStrategy) => Promise<boolean> }) {
  const sug = lifecycleStrategyOf(approval?.execution ?? [], approval?.method ?? null)
  const [pick, setPick] = useState<LifecycleStrategy>((study.lifecycle?.strategy as LifecycleStrategy) ?? sug.key)
  const [now, setNow] = useState<Now | null | undefined>(undefined)
  useEffect(() => { void lifecycleNow(study.projectId).then(setNow).catch(() => setNow(null)) }, [study.projectId, study.lifecycle?.at])
  const baselined = !!now?.govStatus && ['baseline', 'in_execution', 'revised', 'completed'].includes(now.govStatus)
  return (
    <section className="ds-card ds-handoff" aria-labelledby="ds-lc-h">
      <header><h3 id="ds-lc-h"><ArrowLeftRight size={15} aria-hidden />پیشنهاد به چرخهٔ عمر پروژه (Stage-Gate)</h3>
        <p>راهبرد اجرای متناظر با تصمیم مصوب به‌عنوان پیشنهاد برای Stage-Gate ثبت می‌شود و در «مستر پلن چرخهٔ عمر» (ماژول برنامه‌ریزی و کنترل زمان) کنار انتخاب راهبرد نمایش داده می‌شود. تا وقتی کاربر آن را انتخاب و «اعمال به برنامه فازها» را نزند، برنامهٔ فازها تغییر نمی‌کند.</p></header>
      <dl className="ds-kv">
        <div><dt>راهبرد فعلی در Stage-Gate</dt><dd>{now === undefined ? '…' : !now?.linked ? 'این پروژه به پروژهٔ Stage-Gate پیوند نخورده است' : now.strategy ? `${SG_FA[now.strategy] ?? now.strategy} · ${GOV_FA[now.govStatus ?? ''] ?? now.govStatus ?? '—'}` : 'هنوز برنامه‌ای اعمال نشده'}</dd></div>
        <div><dt>آخرین پیشنهاد ثبت‌شده از این مطالعه</dt><dd>{study.lifecycle ? `${SG_FA[study.lifecycle.strategy] ?? study.lifecycle.strategy} · ${study.lifecycle.by} · ${when(study.lifecycle.at)}` : '—'}</dd></div>
      </dl>
      <p className="ds-muted">پیشنهاد موتور: <b>{LIFECYCLE_FA[sug.key]}</b> — {sug.why}</p>
      {baselined && <p className="ds-warn-l">برنامهٔ Stage-Gate «{GOV_FA[now!.govStatus!]}» است؛ اعمال راهبرد تازه در آنجا برنامه را به وضعیت «بازنگری‌شده» می‌برد.</p>}
      {now && !now.linked && <p className="ds-warn-l">برای نمایش پیشنهاد در Stage-Gate، ابتدا پروژهٔ Stage-Gate را در آن ماژول به این پروژه پیوند دهید.</p>}
      {canApply ? (
        <div className="ds-actions">
          <div className="ds-seg is-wrap" role="radiogroup" aria-label="راهبرد اجرا در چرخهٔ عمر">
            {(Object.keys(LIFECYCLE_FA) as LifecycleStrategy[]).map((k) => <button key={k} type="button" role="radio" aria-checked={pick === k} onClick={() => setPick(k)}>{LIFECYCLE_FA[k]}</button>)}
          </div>
          <button type="button" className="ds-btn" disabled={busy || now === undefined || study.lifecycle?.strategy === pick} onClick={() => void onApply(pick)}><ArrowLeftRight size={15} aria-hidden />ثبت پیشنهاد برای چرخهٔ عمر</button>
        </div>
      ) : <p className="ds-muted">ثبت پیشنهاد به دسترسی «تصویب‌کنندهٔ راهبرد اجرا» نیاز دارد.</p>}
      {study.lifecycle && now?.linked && <button type="button" className="ds-link" onClick={() => { try { sessionStorage.setItem('sch.openTab', 'lifeplan'); sessionStorage.setItem('sch.openProject', study.projectId) } catch { /* private mode */ } useModuleStore.getState().enterModule('scheduling') }}><ExternalLink size={13} aria-hidden /> رفتن به مستر پلن چرخهٔ عمر</button>}
    </section>
  )
}
