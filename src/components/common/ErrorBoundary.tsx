import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Short Persian name of the area, shown in the message (e.g. «نتایج ارزیابی»). */
  area?: string
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Keeps a render error inside one page instead of letting React unmount the whole app (which
 * shows up as a black screen with nothing to go on). Shows the error message so it can be
 * reported, plus a retry; give it a `key` that changes on navigation so moving to another page
 * resets it.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', this.props.area ?? '', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="glass-panel space-y-3 rounded-2xl border border-red-400/25 p-5 text-right" role="alert">
        <p className="flex items-center gap-2 text-sm font-bold text-red-300">
          <AlertTriangle size={16} />
          نمایش {this.props.area ?? 'این بخش'} با خطا مواجه شد
        </p>
        <p className="text-[11px] leading-6 text-secondary">
          بقیه‌ی سامانه سالم است و می‌توانید از منوی کناری به بخش دیگری بروید. اگر خطا تکرار شد، متن زیر را برای پشتیبانی بفرستید.
        </p>
        <pre dir="ltr" className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-black/40 p-3 text-left text-[10.5px] text-red-200">
          {error.message}
        </pre>
        <button
          onClick={() => this.setState({ error: null })}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3.5 py-2 text-xs text-secondary hover:bg-white/5"
        >
          <RotateCcw size={13} /> تلاش دوباره
        </button>
      </div>
    )
  }
}
