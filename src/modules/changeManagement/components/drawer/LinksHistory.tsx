import { useEffect, useMemo, useState } from 'react'
import { AlertOctagon, Link2, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { supabase } from '../../../../lib/supabaseClient'
import { useChangeStore } from '../../store/useChangeStore'
import { useChangeCtx } from '../../lib/useChangeData'
import { ACTION_FA } from '../../lib/changeFlow'
import type { ChangeHistory, ChangeLink, ChangeRequest } from '../../types'
import { jd } from '../RouteTrack'

interface Hit { id: string; code: string | null; title: string }
const REL_FA: Record<ChangeLink['relation'], string> = { raises: 'این تغییر ایجاد کرده', caused_by: 'علت این تغییر', mitigates: 'کاهنده', related: 'مرتبط' }

/** Rule-based suggestions (not AI, not automatic): shown to a person, created only on confirmation; creation is idempotent per title. */
export function suggestionsFor(r: ChangeRequest): { kind: 'risk' | 'issue'; title: string; text: string }[] {
  const out: { kind: 'risk' | 'issue'; title: string; text: string }[] = []
  if (r.proposedDays > 0) out.push({ kind: 'risk', title: `تأخیر در برنامه ناشی از تمدید ${r.proposedDays} روزهٔ ${r.crNumber}`, text: 'تمدید مدت می‌تواند تاریخ پایان پروژه و تعهدات پس از آن را جابه‌جا کند.' })
  if (r.proposedCost > 0) out.push({ kind: 'risk', title: `افزایش هزینه و فشار بر بودجه ناشی از ${r.crNumber}`, text: 'افزایش مبلغ قرارداد ممکن است از سقف بودجهٔ مصوب پروژه عبور کند.' })
  if (r.changeType === 'new_work') out.push({ kind: 'risk', title: `ابهام در دامنهٔ کار جدید (${r.crNumber})`, text: 'کار جدید خارج از دامنهٔ اولیه است و مشخصات و قیمت‌گذاری آن می‌تواند مناقشه‌برانگیز باشد.' })
  if (r.changeType === 'technical') out.push({ kind: 'risk', title: `ریسک انطباق فنی پس از تغییر طراحی/مشخصات (${r.crNumber})`, text: 'تغییر فنی ممکن است بر کیفیت، ایمنی و تأیید مدارک اثر بگذارد.' })
  if (r.routeStatus === 'blocked') out.push({ kind: 'issue', title: `توقف تصویب ${r.crNumber}: قاعدهٔ اختیار تعریف نشده`, text: 'مسیر تصویب این تغییر به‌دلیل نبود یا تعارض قواعد تعیین نشد و درخواست معطل مانده است.' })
  return out
}

export function LinksTab({ request, canLink }: { request: ChangeRequest; canLink: boolean }) {
  const rpc = useChangeStore((s) => s.rpc)
  const links = useChangeStore((s) => s.links).filter((l) => l.requestId === request.id)
  const [type, setType] = useState<'risk' | 'issue'>('risk')
  const [rel, setRel] = useState<ChangeLink['relation']>('related')
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from(type === 'risk' ? 'rm_risks' : 'im_issues').select('id, code, title').ilike('title', `%${q.trim()}%`).limit(8)
      setHits((data ?? []) as Hit[])
    }, 250)
    return () => clearTimeout(t)
  }, [q, type])
  const sug = useMemo(() => suggestionsFor(request).filter((s) => !links.some((l) => l.targetLabel.includes(s.title.slice(0, 20)) && l.targetType === s.kind)), [request, links])
  const act = async (name: string, args: Record<string, unknown>) => { const r = await rpc(name, args, request.id); setMsg(r.ok ? 'ثبت شد.' : r.error ?? ''); return r.ok }
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="im-helper">هر رکورد شناسه و فرایند مستقل خود را دارد؛ این‌جا فقط ارتباط ثبت می‌شود و در ماژول مقصد هم دیده می‌شود. ثبت تکراری با همان عنوان انجام نمی‌شود.</div>
      {links.length === 0 ? <div className="im-empty">هنوز ریسک یا مسئله‌ای به این تغییر وصل نشده است.</div> : (
        <div className="im-grid" style={{ gap: 8 }}>{links.map((l) => (
          <div key={l.id} className="im-card-flat" style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>{l.targetType === 'risk' ? <ShieldAlert size={16} style={{ color: '#ef4444', flex: 'none' }} /> : <AlertOctagon size={16} style={{ color: '#a78bfa', flex: 'none' }} />}
              <div style={{ minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 13 }}>{l.targetLabel}</div><div className="im-helper">{l.targetType === 'risk' ? 'ریسک' : 'مسئله'} · {REL_FA[l.relation]} · {l.source === 'manual' ? 'ثبت دستی' : 'پیشنهاد'} · {jd(l.createdAt)}</div></div></div>
            {canLink && <button className="im-btn im-btn-ghost" aria-label="حذف پیوند" onClick={() => act('cm_remove_link', { p_link: l.id })}><Trash2 size={14} /></button>}
          </div>))}
        </div>
      )}
      {canLink && sug.length > 0 && (
        <div>
          <div className="im-section-title">پیشنهادهای قاعده‌محور (فقط با تأیید شما ثبت می‌شوند)</div>
          <div className="im-grid" style={{ gap: 8 }}>{sug.map((s) => (
            <div key={s.title} className="cm-note" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div><b>{s.kind === 'risk' ? 'ریسک' : 'مسئله'}:</b> {s.title}<div className="im-helper">{s.text}</div></div>
              <button className="im-btn" onClick={() => act(s.kind === 'risk' ? 'cm_create_risk' : 'cm_create_issue', s.kind === 'risk' ? { p_request: request.id, p_title: s.title, p_event: s.text } : { p_request: request.id, p_title: s.title, p_description: s.text })}><Plus size={14} /> ثبت</button>
            </div>))}
          </div>
        </div>
      )}
      {canLink && (
        <div>
          <div className="im-section-title">پیوند به رکورد موجود</div>
          <div className="im-row">
            <select value={type} onChange={(e) => { setType(e.target.value as 'risk' | 'issue'); setHits([]) }} aria-label="نوع رکورد"><option value="risk">ریسک</option><option value="issue">مسئله</option></select>
            <select value={rel} onChange={(e) => setRel(e.target.value as ChangeLink['relation'])} aria-label="نوع ارتباط"><option value="related">مرتبط</option><option value="caused_by">علت این تغییر</option><option value="raises">این تغییر ایجاد کرده</option><option value="mitigates">کاهنده</option></select>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در عنوان (حداقل ۲ حرف)…" aria-label="جستجو" />
          </div>
          {hits.length > 0 && <div className="im-grid" style={{ gap: 6, marginTop: 8 }}>{hits.map((h) => <button key={h.id} type="button" className="im-card-flat" style={{ textAlign: 'start', display: 'flex', gap: 8, alignItems: 'center' }} onClick={async () => { if (await act('cm_link', { p_request: request.id, p_type: type, p_target: h.id, p_relation: rel, p_source: 'manual' })) { setQ(''); setHits([]) } }}><Link2 size={14} />{h.code ? h.code + ' · ' : ''}{h.title}</button>)}</div>}
        </div>
      )}
      {msg && <div className="im-helper" role="status">{msg}</div>}
    </div>
  )
}

export function HistoryTab({ history, canComment, requestId, onComment }: { history: ChangeHistory[]; canComment: boolean; requestId: string; onComment: () => void }) {
  const rpc = useChangeStore((s) => s.rpc)
  const ctx = useChangeCtx()
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {canComment && (
        <div className="im-row"><input value={text} onChange={(e) => setText(e.target.value)} placeholder="یادداشت یا نظر…" aria-label="یادداشت" /><button className="im-btn" disabled={!text.trim()} onClick={async () => { const r = await rpc('cm_comment', { p_request: requestId, p_text: text }); if (!r.ok) setErr(r.error ?? ''); else { setText(''); setErr(''); onComment() } }}>ثبت یادداشت</button></div>
      )}
      {err && <div className="im-err">{err}</div>}
      {history.length === 0 ? <div className="im-empty">هنوز رویدادی ثبت نشده است.</div> : (
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
          {[...history].reverse().map((h) => (
            <li key={h.id} className="im-card-flat" style={{ display: 'grid', gap: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><b style={{ fontSize: 13 }}>{ACTION_FA[h.action] ?? h.action}</b><span className="im-helper">{jd(h.createdAt)} · {new Date(h.createdAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</span></div>
              <div className="im-helper">{ctx.userName(h.userId)}{h.roleLabel ? ' · ' + h.roleLabel : ''}</div>
              {h.comment && <div style={{ fontSize: 12.5, lineHeight: 1.8 }}>{h.comment}</div>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
