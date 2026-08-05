import type { StateStorage } from 'zustand/middleware'
import { useSystemStore } from '../store/useSystemStore'

/**
 * Wraps localStorage so a full-quota write doesn't throw synchronously out of whatever
 * store action triggered it (e.g. mid-way through an SVG upload, silently aborting it
 * with no visible error). Instead it surfaces a clear message via useSystemStore.
 */
export function createSafeLocalStorage(): StateStorage {
  return {
    getItem: (name) => localStorage.getItem(name),
    setItem: (name, value) => {
      try {
        localStorage.setItem(name, value)
        useSystemStore.getState().setStorageError(null)
      } catch (err) {
        const isQuota = err instanceof DOMException && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
        useSystemStore
          .getState()
          .setStorageError(
            isQuota
              ? 'فضای ذخیره‌سازی محلی مرورگر پر شده است — آخرین تغییر ذخیره نشد. از پروژه‌های حجیم (به‌خصوص نقشه‌های SVG بزرگ) خروجی JSON بگیرید، سپس آن‌ها را از این مرورگر حذف کنید تا فضا آزاد شود.'
              : 'ذخیره‌سازی محلی داده‌ها با خطا مواجه شد. اگر مرورگر در حالت خصوصی/ناشناس باز است، معمولاً ذخیره‌سازی محلی را محدود یا غیرفعال می‌کند.',
          )
      }
    },
    removeItem: (name) => localStorage.removeItem(name),
  }
}
