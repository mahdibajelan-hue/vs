import { ShieldCheck } from 'lucide-react'
import { CONDITIONAL_COLOR, type ApprovalLevel } from '../lib/competencyModel'

/**
 * Small "competency approved" seal shown next to an approved candidate's name (results page) and
 * pinned to the corner of their photo (assessments list) — the artwork itself is a self-contained
 * certified-PM medallion, so no extra caption text is layered on top of it. A conditional approval
 * (score 50–59) gets an orange shield instead of the gold medallion so the two never read alike.
 */
export function ApprovalMedal({ size = 'lg', level = 'approved' }: { size?: 'lg' | 'sm'; level?: ApprovalLevel }) {
  const width = size === 'lg' ? 18 : 14

  if (level === 'conditional') {
    return (
      <span
        title="تأیید مشروط"
        role="img"
        aria-label="تأیید مشروط"
        className="pointer-events-none inline-flex select-none items-center justify-center rounded-full align-middle text-white"
        style={{ width, height: width, background: CONDITIONAL_COLOR, boxShadow: '0 1px 3px rgba(0,0,0,0.55)' }}
      >
        <ShieldCheck size={Math.round(width * 0.66)} aria-hidden />
      </span>
    )
  }

  return (
    <img
      src={`${import.meta.env.BASE_URL}comp-approval-medal.png`}
      alt="تایید صلاحیت"
      title="تایید صلاحیت"
      width={width}
      height={width}
      className="pointer-events-none inline-block select-none align-middle"
      style={{ width, height: width, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.55))' }}
    />
  )
}
