import { useState } from 'react'
import { ArrowUpRight, Flag } from 'lucide-react'
import type { Analysis } from '../lib/kpis'
import { useLandStore } from '../store/useLandStore'
import { issueDraftFor } from '../lib/problems'
import { openRecord } from '../integration/records'
import { Badge } from './ui'

/**
 * One control for “this needs follow-up”: files the ready-made Issue, or — when it already exists — shows its live code and status
 * and jumps to it. The follow-up (owner, next action, deadline, history) then lives only in Issue Management.
 */
export function IssueButton({ a }: { a: Analysis }) {
  const p = a.parcel
  const today = useLandStore((s) => s.today)
  const transfer = useLandStore((s) => s.transfer)
  const l = useLandStore((s) => s.data?.linked.find((x) => x.parcelId === p.id && x.target === 'issue'))
  const [busy, setBusy] = useState(false)
  if (p.issueId) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Badge color="#22c55e">{l ? <><span className="la-km">{l.linkedCode}</span> · {l.linkedStatus}</> : 'Issue ثبت شده'}</Badge>
        <button className="la-btn la-btn-ghost la-btn-sm" aria-label="باز کردن Issue" onClick={() => openRecord('issue', p.issueId!, p.masterProjectId)}><ArrowUpRight size={13} /></button>
      </span>
    )
  }
  return (
    <button className="la-btn la-btn-sm" disabled={busy} onClick={async () => { setBusy(true); await transfer(p.id, 'issue', issueDraftFor(a, today).params); setBusy(false) }}>
      <Flag size={12} /> {busy ? 'در حال ثبت…' : 'ارسال به مدیریت مسائل'}
    </button>
  )
}
