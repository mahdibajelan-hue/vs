import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ChevronDown, Compass, Lightbulb } from 'lucide-react'
import { ModalPortal } from '../../../../components/common/ModalPortal'
import { guideSteps, helpKey, PAGE_HELP, type GuideStep } from '../../lib/control/guide'
import type { MaterialModel } from '../../lib/control/useMaterialModel'

type Go = (tab: string, sub?: string) => void
const read = (k: string): string | null => { try { return window.localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { window.localStorage.setItem(k, v) } catch { /* private mode: the card simply opens again next time */ } }

/** The help card of the open view: what it is, what to do in order, one tip and where to go next. Open the first time, folded once the person closes it. */
export function HelpBox({ tab, sub, onGo }: { tab: string; sub: string; onGo: Go }) {
  const key = helpKey(tab, sub)
  const h = PAGE_HELP[key]
  const storeKey = `mt-help:${key}`
  const [open, setOpen] = useState(() => read(storeKey) !== 'closed')
  useEffect(() => { setOpen(read(storeKey) !== 'closed') }, [storeKey])
  if (!h) return null
  const toggle = () => { const n = !open; setOpen(n); write(storeKey, n ? 'open' : 'closed') }
  return (
    <section className={`mt-help no-print${open ? ' open' : ''}`} aria-label={`راهنمای ${h.title}`}>
      <button className="mt-help-head" onClick={toggle} aria-expanded={open}><Lightbulb size={15} /><b>راهنمای «{h.title}»</b><span>{open ? 'بستن راهنما' : 'نمایش راهنما'}</span><ChevronDown size={15} className="chev" /></button>
      {open && (
        <div className="mt-help-body">
          <p>{h.what}</p>
          <ol>{h.steps.map((s) => <li key={s}>{s}</li>)}</ol>
          {h.tip && <p className="tip">نکته: {h.tip}</p>}
          {h.next && <button className="im-btn im-btn-sm" onClick={() => onGo(h.next!.tab, h.next!.sub)}>بعد از این: {h.next.label} <ArrowLeft size={13} /></button>}
        </div>
      )}
    </section>
  )
}

/** The working order of material supply as a wizard: each step shows its live status from the project's records, what to do, and a button that takes the person there. */
export function GuideWizard({ model, onGo, onClose, projectId }: { model: MaterialModel; onGo: Go; onClose: () => void; projectId: string }) {
  const steps = guideSteps(model)
  const firstOpen = Math.max(0, steps.findIndex((s) => s.status === 'current'))
  const [i, setI] = useState(firstOpen)
  const s: GuideStep = steps[i]
  const close = (never?: boolean) => { if (never) write(`mt-guide:${projectId}`, 'seen'); onClose() }
  return (
    <ModalPortal>
      <div className="im-overlay">
        <div className="im-modal mt-wiz" role="dialog" aria-modal="true" aria-label="راهنمای گام‌به‌گام تأمین">
          <div className="im-modal-head"><div><div className="im-modal-title"><Compass size={16} style={{ verticalAlign: '-3px' }} /> راهنمای گام‌به‌گام تأمین</div><p className="im-helper" style={{ margin: 0 }}>ترتیب کار از ورود اقلام تا خروج کالا؛ وضعیت هر گام از اطلاعات خود پروژه خوانده می‌شود.</p></div><button className="im-modal-close" onClick={() => close()} aria-label="بستن">✕</button></div>
          <ol className="mt-wiz-steps">
            {steps.map((x, k) => <li key={x.id}><button className={`${x.status}${k === i ? ' sel' : ''}`} onClick={() => setI(k)} aria-current={k === i ? 'step' : undefined} title={x.title}><span>{x.status === 'done' ? <Check size={13} /> : (k + 1).toLocaleString('fa-IR')}</span></button></li>)}
          </ol>
          <div className="mt-wiz-card">
            <div className="mt-wiz-top"><small>گام {(i + 1).toLocaleString('fa-IR')} از {steps.length.toLocaleString('fa-IR')}</small><span className={`mt-wiz-st ${s.status}`}>{s.status === 'done' ? 'انجام شده' : s.status === 'current' ? 'گام بعدی شما' : 'در انتظار'}</span></div>
            <h3>{s.title}</h3>
            <p className="why">{s.why}</p>
            <div className="mt-wiz-metric">{s.metric}</div>
            <ol className="todo">{s.todo.map((t) => <li key={t}>{t}</li>)}</ol>
          </div>
          <div className="fn-form-foot" style={{ position: 'static' }}>
            <button className="im-btn im-btn-ghost" disabled={i === 0} onClick={() => setI(i - 1)}><ArrowRight size={14} /> قبلی</button>
            <button className="im-btn im-btn-ghost" disabled={i === steps.length - 1} onClick={() => setI(i + 1)}>بعدی <ArrowLeft size={14} /></button>
            <button className="im-btn" style={{ marginInlineStart: 'auto' }} onClick={() => close(true)}>دیگر خودکار نشان نده</button>
            <button className="im-btn im-btn-primary" onClick={() => { onClose(); onGo(s.go.tab, s.go.sub) }}>{s.go.label}</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

/** Opens the wizard once per browser and project, the first time someone enters a project that has no packages yet. */
export const shouldAutoGuide = (projectId: string): boolean => read(`mt-guide:${projectId}`) !== 'seen'
