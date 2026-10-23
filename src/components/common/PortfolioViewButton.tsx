import { Network } from 'lucide-react'
import { useModuleStore, type ModuleKey } from '../../store/useModuleStore'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { hasModuleAccess, useModuleAccessStore } from '../../store/useModuleAccessStore'

/** Opens this module's multi-project (portfolio) view. Shown only inside a single project, to people who can see Portfolio Management. */
export function openPortfolioView(module: ModuleKey, tab?: string) {
  useProjectContextStore.getState().clear()
  useModuleStore.getState().enterModule(module, 'portfolio', tab)
}

export function PortfolioViewButton({ module, tab, className = 'im-btn im-btn-sm' }: { module: ModuleKey; tab?: string; className?: string }) {
  const allowed = useModuleAccessStore((s) => hasModuleAccess(s.accessibleModules, 'executive'))
  if (!allowed) return null
  return (
    <button type="button" className={className} onClick={() => openPortfolioView(module, tab)} title="همین ماژول برای همهٔ پروژه‌های سبد">
      <Network size={14} aria-hidden /> دیدن در سطح پرتفولیو
    </button>
  )
}
