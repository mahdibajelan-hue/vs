// Natural pixel size of the source artwork — used to keep the medal's aspect ratio correct at
// every size instead of stretching it.
const MEDAL_ASPECT = 364 / 320

/**
 * Prominent "competency approved" medal — a small badge or plain checkmark on the personnel card
 * went unnoticed (people scan the whole card, not one corner of it), so this is a proper
 * award-medal graphic pinned to the corner of the personnel card at a size and contrast that
 * can't be missed.
 */
export function ApprovalMedal({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  const width = size === 'lg' ? 68 : 36
  const height = Math.round(width * MEDAL_ASPECT)
  const fontSize = size === 'lg' ? 9 : 6.5

  return (
    <div
      className="pointer-events-none flex select-none flex-col items-center gap-1"
      style={{ width, filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.45))' }}
    >
      <img
        src={`${import.meta.env.BASE_URL}comp-approval-medal.png`}
        alt="تایید صلاحیت"
        width={width}
        height={height}
        style={{ width, height }}
      />
      <span
        className="-mt-1 rounded-full bg-[#0b0f16] px-1.5 py-0.5 font-extrabold text-amber-300 shadow"
        style={{ fontSize }}
      >
        تایید صلاحیت
      </span>
    </div>
  )
}
