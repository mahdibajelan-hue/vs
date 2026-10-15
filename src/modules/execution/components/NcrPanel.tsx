import { Fragment, useState } from 'react'
import { useEpcStore } from '../store/useEpcStore'
import { Chip, Section, fmtD } from '../../finance/components/fn'
import type { NcrLinkRow, NcrRow, NcrStatus } from '../epcTypes'

const ST_FA: Record<NcrStatus, string> = { open: 'باز', dispositioned: 'تعیین‌تکلیف‌شده', capa: 'در اقدام اصلاحی', verifying: 'بررسی اثربخشی', closed: 'بسته', void: 'باطل' }
const ST_TONE: Record<NcrStatus, 'bad' | 'warn' | 'neutral' | 'good'> = { open: 'bad', dispositioned: 'warn', capa: 'warn', verifying: 'warn', closed: 'good', void: 'neutral' }
const DISP_FA = { repair: 'تعمیر', accept_deviation: 'پذیرش با استثنا', reject: 'رد', rework: 'بازکاری' } as const
const SEV_FA = { low: 'کم', medium: 'متوسط', high: 'زیاد' } as const
const LINK_FA: Record<NcrLinkRow['status'], string> = { linked: 'متصل', pending: 'در انتظار', failed: 'ناموفق', broken: 'قطع‌شده' }
const TARGET_FA = { issue: 'مسئله', risk: 'ریسک' } as const

/** NCR register of the project: one record per non-conformity; RCA/CAPA live on the linked Issue (no second copy). Permissions and allowed transitions are enforced by the database — the buttons only offer the next steps. */
export function NcrPanel({ projectId }: { projectId: string }) {
  const epc = useEpcStore()
  const [open, setOpen] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [disp, setDisp] = useState<keyof typeof DISP_FA>('repair')
  const [busy, setBusy] = useState(false)
  const rows = epc.ncrs.filter((n) => n.projectId === projectId)
  const run = async (f: () => Promise<unknown>) => { setBusy(true); await f(); setBusy(false); setNote('') }
  const steps = (n: NcrRow): { to: NcrStatus; label: string; needNote?: boolean; disposition?: boolean; skip?: boolean }[] => {
    if (n.status === 'open') return [{ to: 'dispositioned', label: 'تعیین تکلیف', disposition: true }, { to: 'void', label: 'ابطال', needNote: true }]
    if (n.status === 'dispositioned') return [{ to: 'capa', label: 'شروع اقدام اصلاحی' }, ...(n.disposition === 'accept_deviation' ? [{ to: 'verifying' as NcrStatus, label: 'ارسال برای تأیید' }] : []), { to: 'void', label: 'ابطال', needNote: true }]
    if (n.status === 'capa') return [{ to: 'verifying', label: 'ارسال برای تأیید اثربخشی' }]
    if (n.status === 'verifying') return [{ to: 'closed', label: 'بستن (اثربخش بود)' }, { to: 'capa', label: 'برگشت به اقدام', needNote: true }]
    return []
  }
  return (
    <Section title={`عدم انطباق‌ها (NCR) — ${rows.length.toLocaleString('fa-IR')}`} hint="RCA و اقدام اصلاحی/پیشگیرانه روی همان «مسئله»ٔ متصل ثبت می‌شود؛ اینجا فقط وضعیت آن‌ها دیده می‌شود.">
      <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>کد</th><th>سرجوش</th><th>شدت</th><th>وضعیت</th><th>تعیین تکلیف</th><th>مهلت</th><th>اتصال‌ها</th><th /></tr></thead>
        <tbody>{rows.map((n) => { const links = epc.ncrLinks.filter((l) => l.ncrId === n.id); const ev = epc.ncrEvents.filter((e) => e.ncrId === n.id); return (
          <Fragment key={n.id}>
            <tr><td dir="ltr"><b>{n.code}</b></td><td dir="ltr">{n.weldRef || '—'}</td><td><Chip tone={n.severity === 'high' ? 'bad' : n.severity === 'medium' ? 'warn' : 'neutral'}>{SEV_FA[n.severity]}</Chip>{n.rcaRequired && <Chip tone="warn">RCA لازم</Chip>}</td><td><Chip tone={ST_TONE[n.status]}>{ST_FA[n.status]}</Chip></td><td>{n.disposition ? DISP_FA[n.disposition] : '—'}</td><td>{n.dueDate ? fmtD(n.dueDate) : '—'}</td>
              <td>{(['issue', 'risk'] as const).map((t) => { const l = links.find((x) => x.targetType === t); return <span key={t} style={{ display: 'inline-flex', gap: 3, alignItems: 'center', marginInlineEnd: 6 }}><Chip tone={l?.status === 'linked' ? 'good' : l ? 'bad' : 'neutral'}>{TARGET_FA[t]}: {l ? LINK_FA[l.status] : '—'}</Chip>{(!l || l.status !== 'linked') && n.status !== 'void' && <button className="im-btn im-btn-sm" disabled={busy} title={l?.error} onClick={() => void run(() => epc.ncrLink(n.id, t))}>{l ? 'تلاش دوباره' : 'ثبت'}</button>}</span> })}</td>
              <td><button className="im-btn im-btn-sm" onClick={() => setOpen(open === n.id ? null : n.id)}>{open === n.id ? 'بستن' : 'جزئیات'}</button></td></tr>
            {open === n.id && <tr><td colSpan={8}>
              <div style={{ display: 'grid', gap: 8, padding: 8 }}>
                <div>{n.description || '—'}</div>
                {links.filter((l) => l.error).map((l) => <div key={l.id} className="im-helper" style={{ color: '#b91c1c' }}>اتصال {TARGET_FA[l.targetType]}: {l.error}</div>)}
                {steps(n).length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="یادداشت" style={{ minWidth: 220 }} aria-label="یادداشت" />
                  {n.status === 'open' && <select value={disp} onChange={(e) => setDisp(e.target.value as keyof typeof DISP_FA)} aria-label="تعیین تکلیف">{Object.entries(DISP_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
                  {steps(n).map((s) => <button key={s.to + s.label} className="im-btn im-btn-sm im-btn-primary" disabled={busy || (s.needNote && !note.trim())} onClick={() => void run(() => epc.ncrTransition(n.id, s.to, note, s.disposition ? disp : undefined))}>{s.label}</button>)}
                </div>}
                <div><b>تاریخچه</b>{ev.map((e) => <div key={e.id} className="sub">{fmtD(e.at.slice(0, 10))} · {e.kind}{e.toStatus ? ` → ${ST_FA[e.toStatus as NcrStatus] ?? e.toStatus}` : ''}{e.note ? ` — ${e.note}` : ''}</div>)}</div>
              </div></td></tr>}
          </Fragment>) })}
          {rows.length === 0 && <tr><td colSpan={8} className="sub">NCR ثبت نشده است؛ از جدول مغایرت‌ها «تبدیل به NCR» بزنید.</td></tr>}</tbody></table></div>
    </Section>
  )
}
