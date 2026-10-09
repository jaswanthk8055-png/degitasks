import { useEffect, useId, useRef } from 'react'

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])'

export default function Modal({ open, onClose, title, children, busy = false, ariaDescribedBy }) {
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const openerRef = useRef(typeof document === 'undefined' ? null : document.activeElement)
  const titleId = useId()

  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) {
      const rememberFocus = (event) => {
        if (!event.target.closest?.('[data-modal-root]')) openerRef.current = event.target
      }
      if (!document.activeElement?.closest('[data-modal-root]')) openerRef.current = document.activeElement
      document.addEventListener('focusin', rememberFocus)
      return () => document.removeEventListener('focusin', rememberFocus)
    }
    const dialog = dialogRef.current
    const opener = dialog.contains(document.activeElement) ? openerRef.current : document.activeElement
    const focusableElements = () => [...dialog.querySelectorAll(FOCUSABLE)].filter((element) => (
      element.tabIndex >= 0 && !element.closest('[hidden], [aria-hidden="true"], [inert]')
    ))
    // Keep existing autofocus behavior for forms inside the dialog.
    if (!dialog.contains(document.activeElement)) (focusableElements()[0] || dialog).focus()
    const handler = (e) => {
      if (e.defaultPrevented) return
      const modals = document.querySelectorAll('[data-modal-root]')
      if (modals[modals.length - 1] !== dialog) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCloseRef.current()
      }
      if (e.key !== 'Tab') return
      const controls = focusableElements()
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (!first) {
        e.preventDefault()
        dialog.focus()
      } else if (!dialog.contains(document.activeElement) || document.activeElement === dialog) {
        e.preventDefault()
        const target = e.shiftKey ? last : first
        target.focus()
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
      if (opener?.isConnected && !dialog.contains(opener)) opener.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Dialog'}
        aria-describedby={ariaDescribedBy}
        aria-busy={busy}
        tabIndex={-1}
        data-modal-root="true"
        className="relative bg-white dark:bg-[#252525] rounded-xl shadow-2xl border border-transparent dark:border-[#3a3a3a] w-full max-w-md mx-4 p-6 animate-palette-in"
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h3 id={titleId} className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
            <button
              type="button"
              aria-label={`Close ${title}`}
              disabled={busy}
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition disabled:opacity-50"
            >
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
