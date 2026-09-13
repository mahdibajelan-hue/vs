export function Footer() {
  return (
    <footer
      className="hub-fade-in relative z-10 flex flex-wrap items-center justify-between gap-2 border-t px-6 py-3 text-[10px] text-muted sm:px-10"
      style={{ borderColor: 'var(--border-soft)', animationDelay: '560ms' }}
    >
      <span>PMO Project Intelligence Platform</span>
      <span className="flex items-center gap-2.5" dir="ltr">
        <span>v1.0</span>
        <span className="opacity-40">•</span>
        <span className="flex items-center gap-1.5">
          <span className="radar-live-dot h-1 w-1 rounded-full" style={{ background: 'var(--text-muted)' }} />
          Last Sync: Just Now
        </span>
      </span>
    </footer>
  )
}
