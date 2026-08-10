import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

interface ModalProps {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  width?: string
  /**
   * True while the modal holds data-entry the user hasn't saved yet. While dirty, closing
   * (Escape or the header's explicit close button) shows a "discard changes?" confirmation
   * instead of closing silently — entered data is never lost without an explicit choice.
   * Clicking the backdrop never closes the modal at all, dirty or not (spec requirement:
   * only Save / Cancel / an explicit close control may close a data-entry modal).
   */
  isDirty?: boolean
}

export function Modal({ title, subtitle, onClose, children, width = 'max-w-lg', isDirty = false }: ModalProps) {
  const [confirmingClose, setConfirmingClose] = useState(false)

  const attemptClose = () => {
    if (isDirty) {
      setConfirmingClose(true)
      return
    }
    onClose()
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') attemptClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, onClose])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className={`glass-panel relative w-full ${width} rounded-2xl p-5 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            {subtitle && <p className="text-sm text-secondary mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={attemptClose}
            className="rounded-lg p-1.5 text-secondary hover:bg-white/10 hover:text-current transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        {children}

        {confirmingClose && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/70 p-4 backdrop-blur-sm">
            <div className="glass-panel w-full max-w-xs rounded-2xl p-4 text-center">
              <p className="text-sm font-bold">تغییرات ذخیره‌نشده دارید</p>
              <p className="mt-1 text-xs leading-6 text-secondary">مطمئنید می‌خواهید این تغییرات را رها کنید؟</p>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  onClick={() => setConfirmingClose(false)}
                  className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-medium text-white hover:bg-brand-400 transition-colors"
                >
                  ادامه ویرایش
                </button>
                <button
                  onClick={() => {
                    setConfirmingClose(false)
                    onClose()
                  }}
                  className="rounded-lg px-4 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  رها کردن تغییرات
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
