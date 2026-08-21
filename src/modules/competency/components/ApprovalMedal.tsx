/**
 * Small "competency approved" seal shown next to an approved candidate's name (results page) and
 * pinned to the corner of their photo (assessments list) — the artwork itself is a self-contained
 * certified-PM medallion, so no extra caption text is layered on top of it.
 */
export function ApprovalMedal({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  const width = size === 'lg' ? 18 : 14

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
