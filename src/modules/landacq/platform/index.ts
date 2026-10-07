/**
 * PLATFORM SEAM — the only file in this module that imports from outside it.
 * Everything the Land Acquisition module borrows from the host (Supabase client, signed-in user, shared UI
 * primitives, navigation stores, the Jalali calendar) is re-exported here under a stable name.
 * `scripts/check-module-boundaries.mjs` enforces it.
 */
export { supabase } from '../../../lib/supabaseClient'
export { friendlyErrorMessage } from '../../../lib/friendlyError'
export { useAuthStore } from '../../../store/useAuthStore'
export { useModuleStore } from '../../../store/useModuleStore'
export { useProjectContextStore } from '../../../store/useProjectContextStore'
export { useDeepLinkStore } from '../../../store/useDeepLinkStore'
export { JalaliDateInput } from '../../../components/common/JalaliDateInput'
export { Modal } from '../../../components/common/Modal'
export { ModuleHeaderActions } from '../../../components/common/ModuleHeaderActions'
export { StorageErrorBanner } from '../../../components/Layout/StorageErrorBanner'
export { toJalali, toGregorian, JALALI_MONTHS } from '../../../lib/jalali'
