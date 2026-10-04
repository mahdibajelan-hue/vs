/**
 * PLATFORM SEAM — the only file in this module (besides integration/) that imports from outside it.
 *
 * Everything the Mission & Visit Debrief module borrows from the host application is re-exported here
 * under a stable name: the Supabase client, the signed-in user, the shared UI primitives, the Jalali
 * calendar helpers. To lift this module into another application, re-implement this one file; nothing
 * else in `src/modules/missions` knows the host exists. `scripts/check-module-boundaries.mjs` enforces it.
 */
export { supabase } from '../../../lib/supabaseClient'
export { friendlyErrorMessage } from '../../../lib/friendlyError'
export { useAuthStore } from '../../../store/useAuthStore'
export { JalaliDateInput } from '../../../components/common/JalaliDateInput'
export { Modal } from '../../../components/common/Modal'
export { FarinMark } from '../../../components/common/Logo'
export { ModuleHeaderActions } from '../../../components/common/ModuleHeaderActions'
export { StorageErrorBanner } from '../../../components/Layout/StorageErrorBanner'
export { formatJalali, isoToJalali, jalaliToIso, todayJalali, toGregorian, toJalali, jalaliMonthLength, JALALI_MONTHS } from '../../../lib/jalali'
