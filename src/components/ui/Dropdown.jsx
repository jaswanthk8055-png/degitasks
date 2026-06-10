import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function Dropdown({ open, onClose, children, className = '', anchorRef = null }) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  // Recalculate position from the anchor element each time the dropdown opens
  useEffect(() => {
    if (!open || !anchorRef?.current) return
    const r = anchorRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left })
  }, [open, anchorRef])

  // Close on outside click or scroll
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (
        ref.current && !ref.current.contains(e.target) &&
        !(anchorRef?.current?.contains(e.target))
      ) onClose()
    }
    const onScroll = () => onClose()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  const content = (
    <div
      ref={ref}
      style={
        anchorRef
          ? { position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }
          : undefined
      }
      className={`${
        anchorRef ? '' : 'absolute z-50'
      } bg-white dark:bg-[#252525] rounded-lg shadow-xl border border-gray-200 dark:border-[#3a3a3a] py-1 min-w-[160px] animate-dropdown ${className}`}
    >
      {children}
    </div>
  )

  return anchorRef ? createPortal(content, document.body) : content
}

export function DropdownItem({ onClick, children, className = '' }) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 flex items-center gap-2 transition-colors ${className}`}
    >
      {children}
    </button>
  )
}
