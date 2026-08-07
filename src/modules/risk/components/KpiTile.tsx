export function KpiTile({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="glass-panel rounded-2xl p-3">
      <p className="num text-xl font-extrabold" style={{ color }}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-muted">{label}</p>
    </div>
  )
}
