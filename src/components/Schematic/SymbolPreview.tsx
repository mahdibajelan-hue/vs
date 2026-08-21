import { SYMBOL_CATEGORY_COLOR, SYMBOL_DEFS, type SymbolType } from '../../data/pipingSymbols'

export function SymbolPreview({ type, size = 26 }: { type: SymbolType; size?: number }) {
  const def = SYMBOL_DEFS[type]
  return (
    <svg
      width={size}
      height={size}
      viewBox="-14 -14 28 28"
      style={{ color: SYMBOL_CATEGORY_COLOR[def.category] }}
      dangerouslySetInnerHTML={{ __html: def.markup }}
    />
  )
}
