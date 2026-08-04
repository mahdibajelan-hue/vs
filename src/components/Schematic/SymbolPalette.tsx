import { MousePointer2, PenLine } from 'lucide-react'
import { SYMBOL_CATEGORY_LABEL, SYMBOL_LIST, type SymbolCategory, type SymbolType } from '../../data/pipingSymbols'
import { SymbolPreview } from './SymbolPreview'

export type EditorMode = 'select' | 'draw' | `symbol:${SymbolType}`

interface SymbolPaletteProps {
  mode: EditorMode
  onModeChange: (m: EditorMode) => void
}

const CATEGORIES: SymbolCategory[] = ['valve', 'joint', 'fitting']

export function SymbolPalette({ mode, onModeChange }: SymbolPaletteProps) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="p-3 space-y-1.5 border-b" style={{ borderColor: 'var(--border-soft)' }}>
        <button
          onClick={() => onModeChange('select')}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
            mode === 'select' ? 'bg-brand-500/15 text-brand-300 font-medium' : 'text-secondary hover:bg-white/5'
          }`}
        >
          <MousePointer2 size={15} /> انتخاب / ویرایش
        </button>
        <button
          onClick={() => onModeChange('draw')}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
            mode === 'draw' ? 'bg-brand-500/15 text-brand-300 font-medium' : 'text-secondary hover:bg-white/5'
          }`}
        >
          <PenLine size={15} /> ترسیم خط لوله جدید
        </button>
      </div>

      {CATEGORIES.map((cat) => (
        <div key={cat} className="p-3 border-b" style={{ borderColor: 'var(--border-soft)' }}>
          <p className="mb-2 text-xs font-bold text-secondary">{SYMBOL_CATEGORY_LABEL[cat]}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {SYMBOL_LIST.filter((s) => s.category === cat).map((s) => {
              const active = mode === `symbol:${s.type}`
              return (
                <button
                  key={s.type}
                  onClick={() => onModeChange(`symbol:${s.type}`)}
                  title={s.label}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition-colors ${
                    active
                      ? 'bg-brand-500/15 border-brand-400/40 text-brand-300'
                      : 'border-transparent bg-white/[0.02] text-secondary hover:bg-white/5'
                  }`}
                >
                  <SymbolPreview type={s.type} />
                  <span className="text-[10px] leading-tight text-center">{s.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
