import { useState, type CSSProperties } from 'react'
import { BadgeCheck, PenLine, ShieldAlert, Undo2 } from 'lucide-react'
import { useAuthStore } from '../../../store/useAuthStore'
import { signsOf, signValid, withSign, withoutSign, type SignRole } from '../lib/esign'

const CSS = `.es-grid{display:grid;gap:.45rem;grid-template-columns:repeat(auto-fit,minmax(min(13rem,100%),1fr))}
.es-card{display:grid;gap:.25rem;padding:.6rem .7rem;border-radius:.85rem;border:1px dashed var(--border-soft);font-size:12px;min-width:0}
.es-card>span{color:var(--text-muted);font-size:11px;font-weight:700}.es-card b{font-size:12.5px;overflow-wrap:anywhere}.es-card small{color:var(--text-muted);font-size:10.5px;overflow-wrap:anywhere}
.es-card.is-ok{border-style:solid;border-color:color-mix(in srgb,#22c55e 55%,transparent);background:color-mix(in srgb,#22c55e 8%,transparent)}
.es-card.is-void{border-style:solid;border-color:color-mix(in srgb,#ef4444 55%,transparent);background:color-mix(in srgb,#ef4444 7%,transparent)}
.es-row{display:flex;align-items:center;gap:.35rem;flex-wrap:wrap}.es-head{display:flex;align-items:center;gap:.4rem;font-size:12.5px;font-weight:800;margin-bottom:.35rem}`

const when = (iso: string) => new Date(iso).toLocaleString('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

/**
 * The record's signature block: each role signed electronically by the signed-in user (name, account, time and the
 * record's fingerprint). A record edited after signing voids its signatures until they are given again.
 * `saved` is the record as stored; signing writes it back with the new signature through `onSave`.
 */
export function ESign({ roles, saved, ctx, onSave, dirty }: { roles: SignRole[]; saved: Record<string, unknown> | null; ctx: string; onSave: (data: Record<string, unknown>) => Promise<boolean>; dirty?: boolean }) {
  const p = useAuthStore((s) => s.profile)
  const [busy, setBusy] = useState(false)
  const signs = saved ? signsOf(saved) : {}
  const act = async (f: () => Record<string, unknown>) => { setBusy(true); try { await onSave(f()) } finally { setBusy(false) } }
  const blocked = !saved ? 'ابتدا فرم را ذخیره کنید؛ امضا روی نسخهٔ ذخیره‌شده ثبت می‌شود.' : dirty ? 'تغییرات ذخیره نشده‌اند؛ پیش از امضا فرم را ذخیره کنید.' : null
  return (
    <div><style>{CSS}</style>
      <div className="es-head"><PenLine size={14} /> امضای الکترونیک</div>
      <div className="es-grid">
        {roles.map((r) => {
          const s = signs[r.k]
          const ok = s && saved ? signValid(s, saved, ctx) : false
          const mine = s && p && s.email === p.email
          return (
            <div key={r.k} className={`es-card${s ? (ok ? ' is-ok' : ' is-void') : ''}`}>
              <span>{r.label}</span>
              {s ? <>
                <div className="es-row">{ok ? <BadgeCheck size={15} color="#22c55e" /> : <ShieldAlert size={15} color="#ef4444" />}<b>{s.name || s.email}</b></div>
                <small>{when(s.at)} · <span dir="ltr">{s.email}</span></small>
                <small style={{ color: ok ? undefined : '#ef4444' } as CSSProperties}>{ok ? <>کد اعتبار <span dir="ltr">{s.fp}</span></> : 'باطل — فرم پس از امضا تغییر کرده است'}</small>
                <div className="es-row">
                  {!ok && <button type="button" className="ps-btn" disabled={busy || !!blocked} onClick={() => act(() => withSign(saved!, r.k, { name: p?.fullName ?? '', email: p?.email ?? '' }, new Date().toISOString(), ctx))}><PenLine size={13} /> امضای مجدد</button>}
                  {mine && <button type="button" className="ps-btn is-ghost" disabled={busy} onClick={() => act(() => withoutSign(saved!, r.k))}><Undo2 size={13} /> پس گرفتن امضا</button>}
                </div>
              </> : <button type="button" className="ps-btn" disabled={busy || !!blocked || !p} title={blocked ?? undefined}
                onClick={() => { if (window.confirm(`امضای این فرم به عنوان «${r.label}» با نام ${p?.fullName || p?.email} ثبت شود؟`)) void act(() => withSign(saved!, r.k, { name: p?.fullName ?? '', email: p?.email ?? '' }, new Date().toISOString(), ctx)) }}><PenLine size={13} /> امضا با نام من</button>}
            </div>
          )
        })}
      </div>
      {blocked && <small className="ps-meta">{blocked}</small>}
    </div>
  )
}
