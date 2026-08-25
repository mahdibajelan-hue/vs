import type { ModuleKey } from '../../store/useModuleStore'
import { ProjectControlCenter } from './launchpad/ProjectControlCenter'

/** Entry point kept at its original path/name so RootApp's import doesn't need to change — the
 * actual Launchpad implementation lives in ./launchpad (Header/ModuleLaunchpad/Footer + one
 * component per module card, see that folder for the breakdown). */
export function ModuleHub({ onEnterModule }: { onEnterModule: (key: ModuleKey) => void }) {
  return <ProjectControlCenter onEnterModule={onEnterModule} />
}
