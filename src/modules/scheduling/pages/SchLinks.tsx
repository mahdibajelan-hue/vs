import { useMemo, useState } from 'react'
import { Plus, Search, Trash2 } from 'lucide-react'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { jalaliText } from '../../execution/lib/periods'
import { Chip, KpiCard, Section } from '../../finance/components/fn'
import { fa } from '../../execution/components/common'
import { LINK_LABEL_FA, type LinkTarget, type SchLink } from '../lib/types'
import { useSchedulingStore } from '../store/useSchedulingStore'
import type { LiveModel } from '../store/useScheduleModel'
import { Hint } from '../components/Hint'

const d = (x: string | null) => (x ? jalaliText(x) : '—')
const READY = { ready: ['good', 'آماده'], at_risk: ['warn', 'در خطر'], blocked: ['bad', 'مانع'], unknown: ['neutral', 'نامشخص'] } as const
const HINT: Record<LinkTarget, string> = { exec_activity: 'link-exec', eng_doc: 'link-doc', mtl_package: 'link-package', risk: 'link-risk', issue: 'link-risk' }

/** Links of a schedule activity to execution activities, engineering documents, supply packages, risks and issues (many-to-many, by stable ids) and the readiness they imply. */
export function SchLinks({ projectId, m }: { projectId: string; m: LiveModel }) {
  const st = useSchedulingStore()
  const acts = m.cur!.activities.filter((a) => a.type === 'task' || a.type === 'milestone')
  const [q, setQ] = useState('')
  const [selId, setSelId] = useState('')
  const [type, setType] = useState<LinkTarget>('eng_doc')
  const [target, setTarget] = useState('')
  const [tq, setTq] = useState('')
  const [needKind, setNeedKind] = useState<'start' | 'continue' | 'finish'>('start')
  const [needDate, setNeedDate] = useState('')
  const [busy, setBusy] = useState(false)
  const list = useMemo(() => { const n = q.trim().toLowerCase(); return acts.filter((a) => !n || `${a.code} ${a.name}`.toLowerCase().includes(n)).slice(0, 200) }, [acts, q])
  const sel = acts.find((a) => a.id === selId)
  const mine = m.links.filter((l) => l.activityUid === sel?.uid)
  const src = m.sources
  const label = (l: Pick<SchLink, 'targetType' | 'targetId'>): string => {
    if (l.targetType === 'exec_activity') return src.exec.get(l.targetId)?.title ?? 'فعالیت اجرایی (نامعتبر)'
    if (l.targetType === 'eng_doc') { const x = src.docs.get(l.targetId); return x ? `${x.docNo} — ${x.title}` : 'مدرک (نامعتبر)' }
    if (l.targetType === 'mtl_package') { const x = src.packages.get(l.targetId); return x ? `${x.code} — ${x.title}` : 'بسته (نامعتبر)' }
    if (l.targetType === 'risk') { const x = src.risks.get(l.targetId); return x ? `${x.code} — ${x.title}` : 'ریسک (نامعتبر)' }
    const x = src.issues.get(l.targetId); return x ? x.title : 'مسئله (نامعتبر)'
  }
  const options = useMemo(() => {
    const n = tq.trim().toLowerCase()
    const all: { id: string; text: string }[] =
      type === 'exec_activity' ? [...src.exec.values()].map((x) => ({ id: x.id, text: x.title }))
      : type === 'eng_doc' ? [...src.docs.values()].map((x) => ({ id: x.id, text: `${x.docNo} — ${x.title}` }))
      : type === 'mtl_package' ? [...src.packages.values()].map((x) => ({ id: x.id, text: `${x.code} — ${x.title}` }))
      : type === 'risk' ? [...src.risks.values()].map((x) => ({ id: x.id, text: `${x.code} — ${x.title}` }))
      : [...src.issues.values()].map((x) => ({ id: x.id, text: x.title }))
    return all.filter((o) => !n || o.text.toLowerCase().includes(n)).slice(0, 120)
  }, [type, tq, src])
  const needs = type === 'eng_doc' || type === 'mtl_package'
  const add = async () => {
    if (!sel || !target) return
    setBusy(true)
    await st.saveLink({ projectId, activityUid: sel.uid, targetType: type, targetId: target, needKind: needs ? needKind : 'start', needDate: needs && needDate ? needDate : null, note: '' })
    setBusy(false); setTarget('')
  }
  const total = m.links.length, blocked = [...m.integration.values()].filter((i) => i.readiness === 'blocked').length, atRisk = [...m.integration.values()].filter((i) => i.readiness === 'at_risk').length
  const linkedActs = new Set(m.links.map((l) => l.activityUid)).size

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="اتصال ثبت‌شده" value={fa(total)} sub={`${fa(linkedActs)} فعالیت دارای اتصال`} />
        <KpiCard i={1} label={<span>مانع <Hint id="readiness" /></span>} value={fa(blocked)} tone={blocked ? 'bad' : 'good'} />
        <KpiCard i={2} label="در خطر" value={fa(atRisk)} tone={atRisk ? 'warn' : 'good'} />
        <KpiCard i={3} label={<span>اثر تأخیر تأمین بر پایان <Hint id="delay-impact" /></span>} value={m.impact.overall == null ? '—' : `${fa(m.impact.overall)} روز`} tone={m.impact.overall ? 'bad' : 'good'} sub="بر پایهٔ منطق شبکه" />
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(260px, 340px) 1fr', alignItems: 'start' }}>
        <div className="im-card" style={{ padding: 0 }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '8px 10px' }}><Search size={14} aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجوی فعالیت…" dir="auto" aria-label="جست‌وجوی فعالیت" style={{ flex: 1 }} /></label>
          <div style={{ maxHeight: 520, overflow: 'auto' }}>
            {list.map((a) => { const i = m.integration.get(a.uid); const [t, l] = READY[i?.readiness ?? 'unknown']; return (
              <button key={a.id} type="button" onClick={() => setSelId(a.id)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderBottom: '1px solid rgba(148,163,184,.15)', background: a.id === selId ? 'rgba(14,165,233,.14)' : undefined, fontSize: 12 }}>
                <b className="fn-code" style={{ minWidth: 54 }}>{a.code}</b><span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>{i && <Chip tone={t}>{l}</Chip>}
              </button>) })}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {!sel ? <div className="im-card im-empty" style={{ padding: 24 }}>یک فعالیت را از فهرست انتخاب کنید تا اتصال‌هایش را ببینید و ویرایش کنید.</div> : (
            <>
              <Section title={<span><b className="fn-code">{sel.code}</b> {sel.name}</span>} hint={`پیش‌بینی: ${d(m.forecast.byId.get(sel.id)?.start ?? null)} تا ${d(m.forecast.byId.get(sel.id)?.finish ?? null)}`}>
                {mine.length === 0 ? <p className="im-helper" style={{ margin: 0 }}>اتصالی ثبت نشده است.</p> : (
                  <table className="ex-lines"><tbody>
                    {mine.map((l) => (
                      <tr key={l.id}><td><Chip tone="neutral">{LINK_LABEL_FA[l.targetType]}</Chip></td><td style={{ whiteSpace: 'normal' }}>{label(l)}</td>
                        <td>{l.needDate ? `نیاز: ${d(l.needDate)}` : ''}</td>
                        <td>{st.canEdit && <button className="im-btn im-btn-sm im-btn-danger" aria-label="حذف اتصال" onClick={() => void st.removeLink(l.id)}><Trash2 size={12} /></button>}</td></tr>
                    ))}
                  </tbody></table>
                )}
                {(() => { const i = m.integration.get(sel.uid); return i && i.blockers.length > 0 ? <ul style={{ margin: '8px 0 0', paddingInlineStart: 18, listStyle: 'disc', fontSize: 12.5 }}>{i.blockers.map((b, k) => <li key={k} style={{ color: b.severity === 'high' ? '#dc2626' : undefined }}>{b.text}</li>)}</ul> : null })()}
              </Section>
              {st.canEdit && (
                <Section title={<span>افزودن اتصال <Hint id={HINT[type]} /></span>}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <label className="ex-lab">نوع<select value={type} onChange={(e) => { setType(e.target.value as LinkTarget); setTarget(''); setTq('') }}>{(Object.keys(LINK_LABEL_FA) as LinkTarget[]).map((k) => <option key={k} value={k}>{LINK_LABEL_FA[k]}</option>)}</select></label>
                    <label className="ex-lab" style={{ flex: '1 1 220px' }}>جست‌وجو<input value={tq} onChange={(e) => setTq(e.target.value)} dir="auto" /></label>
                    <label className="ex-lab" style={{ flex: '2 1 280px' }}>مورد<select value={target} onChange={(e) => setTarget(e.target.value)}><option value="">— انتخاب —</option>{options.map((o) => <option key={o.id} value={o.id}>{o.text.slice(0, 90)}</option>)}</select></label>
                    {needs && <label className="ex-lab">نیاز برای<select value={needKind} onChange={(e) => setNeedKind(e.target.value as typeof needKind)}><option value="start">شروع</option><option value="continue">ادامه</option><option value="finish">پایان</option></select></label>}
                    {needs && <label className="ex-lab">تاریخ نیاز<JalaliDateInput value={needDate} onChange={setNeedDate} /></label>}
                    <button className="im-btn im-btn-primary" disabled={busy || !target} onClick={() => void add()}><Plus size={14} /> افزودن</button>
                  </div>
                  {needs && <p className="im-helper" style={{ margin: '6px 0 0' }}>اگر تاریخ نیاز خالی بماند، شروع پیش‌بینی‌شدهٔ فعالیت ملاک است.</p>}
                </Section>
              )}
            </>
          )}
        </div>
      </div>
      {m.impact.items.length > 0 && (
        <Section title={<span>اثر تأخیر تأمین بر پایان پروژه <Hint id="delay-impact" /></span>} hint="هر مورد با «شروع نه زودتر از» تاریخ تحویل پیش‌بینی‌شده سنجیده شده است" flush>
          <table className="ex-lines"><thead><tr><th>فعالیت</th><th>شروع نه زودتر از</th><th className="num">اثر بر پایان پروژه</th></tr></thead><tbody>
            {m.impact.items.map((x) => <tr key={x.activityId}><td><b className="fn-code">{x.code}</b></td><td>{d(x.startNoEarlier)}</td><td className="num">{x.absorbed ? <Chip tone="good">جذب شناوری</Chip> : <b className="ex-bad">{fa(x.projectSlipDays)} روز</b>}</td></tr>)}
          </tbody></table>
        </Section>
      )}
    </div>
  )
}
