import { useEffect } from 'react'
import { PenLine, Undo2 } from 'lucide-react'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { Chip } from '../../finance/components/fn'
import { fmtD } from '../../finance/components/fn'
import type { Report } from '../types'

const PARTY_FA = { contractor: 'پیمانکار', consultant: 'مشاور', supervision: 'نظارت', employer: 'کارفرما', other: 'سایر' } as const

/** The electronic signatures of one technical form: every slot shows who signs, who has signed (with the signature copied at that moment) and — for the assigned person — a sign button. Editing a draft after signing clears the signatures. */
export function SignaturesCard({ report, dirty }: { report: Pick<Report, 'id' | 'projectId' | 'formKey' | 'status'>; dirty?: boolean }) {
  const slots = useEpcStore((s) => s.signSlots).filter((x) => x.projectId === report.projectId && x.formKey === report.formKey && x.active).sort((a, b) => a.sort - b.sort)
  const sigs = useEpcStore((s) => s.signatures).filter((x) => x.reportId === report.id)
  const epc = useEpcStore.getState()
  const me = useAuthStore((s) => s.session?.user.id)
  const isAdmin = useAuthStore((s) => Boolean(s.profile?.isAdmin))
  const people = useEpcPeople()
  useEffect(() => { void useEpcStore.getState().loadSignatures(report.id) }, [report.id, report.status])
  if (slots.length === 0) return null
  const draftish = report.status === 'draft' || report.status === 'returned' || report.status === 'incomplete'
  const sent = report.status === 'submitted' || report.status === 'partially_approved'
  // the last required supervision-side slot: its signature is the final approval of the report
  const finalKey = [...slots].reverse().find((x) => x.required && x.party !== 'contractor')?.slotKey
  return (
    <div className="im-card" style={{ padding: 12, display: 'grid', gap: 8 }}>
      <b>امضاها</b>
      {dirty && <span className="ex-warn">تغییرات ذخیره‌نشده دارید؛ پس از ذخیره امضا کنید (تغییر گزارش بعد از امضا، امضاها را پاک می‌کند).</span>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 }}>
        {slots.map((sl, i) => {
          const sg = sigs.find((x) => x.slotKey === sl.slotKey)
          const prevOk = slots.slice(0, i).every((p) => !p.required || sigs.some((x) => x.slotKey === p.slotKey))
          const mine = sl.userId === me, asAdmin = !mine && isAdmin   // the system admin may sign any slot, under their own name
          return (
            <div key={sl.id} style={{ border: '1px solid var(--im-line, #e2e8f0)', borderRadius: 10, padding: 8, display: 'grid', gap: 4, minHeight: 112 }}>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><b>{sl.label}</b><Chip tone="neutral">{PARTY_FA[sl.party]}</Chip>{!sl.required && <Chip tone="neutral">اختیاری</Chip>}</span>
              <span className="im-helper">امضاکننده: {people(sl.userId) || 'تعیین نشده'}</span>
              {sg ? <>
                <img src={sg.image} alt={`امضای ${sg.userName}`} style={{ maxHeight: 54, maxWidth: '100%', objectFit: 'contain', alignSelf: 'start' }} />
                <small>{sg.userName} · {fmtD(sg.signedAt.slice(0, 10))} {new Date(sg.signedAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</small>
                {(sg.userId === me || isAdmin) && draftish && <button className="im-btn im-btn-sm" style={{ justifySelf: 'start' }} onClick={() => void epc.unsignReport(report.id, sl.slotKey)}><Undo2 size={12} /> لغو امضا</button>}
              </> : <>
                <Chip tone="warn">امضا نشده</Chip>
                {(mine || asAdmin) && sl.party !== 'contractor' && !sent && <small className="im-helper">پس از ارسال گزارش برای نظارت امضا می‌شود</small>}
                {(mine || asAdmin) && (sl.party === 'contractor' || sent) && <button className="im-btn im-btn-primary im-btn-sm" disabled={!prevOk || !!dirty || report.status === 'rejected'} title={!prevOk ? 'ابتدا امضاهای قبلی ثبت شود' : sl.slotKey === finalKey ? 'ردیف‌های در انتظار، با همین امضا تأیید نهایی می‌شوند' : undefined} style={{ justifySelf: 'start' }} onClick={() => void epc.signReport(report.id, sl.slotKey)}><PenLine size={13} /> {sl.slotKey === finalKey && sl.party !== 'contractor' ? 'امضا و تأیید نهایی' : asAdmin ? 'امضا به‌عنوان مدیر سامانه' : 'امضا با حساب من'}</button>}
              </>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
function useEpcPeople() { const people = useExecutionStore((s) => s.people); return (id: string | null) => (id ? people.get(id) ?? '' : '') }
