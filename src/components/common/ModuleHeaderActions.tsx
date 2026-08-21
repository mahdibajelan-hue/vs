import { Home } from 'lucide-react'
import { SignOutButton } from '../Auth/SignOutButton'

interface ModuleHeaderActionsProps {
  onExitToHub: () => void
  className?: string
}

/**
 * The two buttons every module header ends with — back to the module hub, and sign out — were
 * each reimplemented ad hoc per module with drifting styles (rounded-lg vs rounded-full, icon-only
 * vs labeled, different positions/orders, some skipping the shared SignOutButton entirely). One
 * component now renders both, in the same order, style, and trailing position, everywhere a module
 * shell needs them, so a user recognizes them on sight regardless of which module they're in.
 */
export function ModuleHeaderActions({ onExitToHub, className = '' }: ModuleHeaderActionsProps) {
  return (
    <div className={`flex shrink-0 items-center gap-1.5 sm:gap-2 ${className}`}>
      <button
        onClick={onExitToHub}
        title="بازگشت به ماژول‌ها"
        className="flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-1.5 text-xs text-secondary hover:bg-white/5 transition-colors sm:px-3"
      >
        <Home size={14} /> <span className="hidden sm:inline">بازگشت به ماژول‌ها</span>
      </button>
      <SignOutButton className="flex items-center gap-1.5 rounded-full border border-red-400/25 px-2 py-1.5 text-xs text-red-300 hover:bg-red-500/10 transition-colors sm:px-3" />
    </div>
  )
}
