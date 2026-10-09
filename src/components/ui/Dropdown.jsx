import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { getDropdownPosition } from '../../lib/dropdownPosition'

export default function Dropdown({ open, onClose, children, className = '', anchorRef = null, id, role, 'aria-label': ariaLabel, initialFocus = null }) {
  const ref = useRef(null)

  // Measure before paint so a menu near the last row opens above its trigger.
  useLayoutEffect(() => {
    if (!open || !anchorRef?.current || !ref.current) return
    const menu = ref.current
    const anchor = anchorRef.current
    const visualViewport = window.visualViewport

    const updatePosition = () => {
      const viewport = {
        width: visualViewport?.width ?? window.innerWidth,
        height: visualViewport?.height ?? window.innerHeight,
        top: visualViewport?.offsetTop ?? 0,
        left: visualViewport?.offsetLeft ?? 0,
      }
      // Constrain width before measuring height, since labels can wrap.
      const availableWidth = Math.max(0, viewport.width - 16)
      menu.style.maxWidth = `${availableWidth}px`
      menu.style.minWidth = `${Math.min(160, availableWidth)}px`
      const position = getDropdownPosition(anchor.getBoundingClientRect(), {
        width: menu.offsetWidth,
        height: menu.scrollHeight + menu.offsetHeight - menu.clientHeight,
      }, viewport)
      menu.style.top = `${position.top}px`
      menu.style.left = `${position.left}px`
      menu.style.maxHeight = `${position.maxHeight}px`
      menu.style.visibility = 'visible'
    }

    updatePosition()
    const observer = new ResizeObserver(updatePosition)
    observer.observe(menu)
    observer.observe(anchor)
    window.addEventListener('resize', updatePosition)
    visualViewport?.addEventListener('resize', updatePosition)
    visualViewport?.addEventListener('scroll', updatePosition)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updatePosition)
      visualViewport?.removeEventListener('resize', updatePosition)
      visualViewport?.removeEventListener('scroll', updatePosition)
    }
  }, [open, anchorRef])

  useEffect(() => {
    if (!open || !initialFocus || !ref.current) return
    const items = ref.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex="0"]')
    const item = initialFocus === 'last' ? items[items.length - 1] : items[0]
    item?.focus({ preventScroll: true })
  }, [open, initialFocus])

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      // Portals still bubble through their React parent (including task panels).
      event.stopPropagation()
      onClose()
      anchorRef?.current?.focus({ preventScroll: true })
      return
    }
    if (role !== 'menu') return
    if (event.key === 'Tab') {
      onClose()
      // Return to the trigger before the browser performs its normal Tab move.
      anchorRef?.current?.focus({ preventScroll: true })
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = Array.from(ref.current.querySelectorAll('[role^="menuitem"]:not(:disabled):not([aria-disabled="true"])'))
    if (!items.length) return
    event.preventDefault()
    event.stopPropagation()
    const current = items.indexOf(document.activeElement)
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? items.length - 1
      : event.key === 'ArrowDown' ? (current + 1) % items.length
      : (current <= 0 ? items.length : current) - 1
    items[next].focus()
  }

  // Scrolling a long menu must keep it open so every option is reachable.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (
        ref.current && !ref.current.contains(e.target) &&
        !(anchorRef?.current?.contains(e.target))
      ) onClose()
    }
    const onScroll = (e) => {
      if (!ref.current?.contains(e.target)) onClose()
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        anchorRef?.current?.focus({ preventScroll: true })
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('scroll', onScroll, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('scroll', onScroll, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  const content = (
    <div
      ref={ref}
      id={id}
      role={role}
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      style={
        anchorRef
          ? {
            position: 'fixed', top: 0, left: 0, zIndex: 9999,
            visibility: 'hidden', overflowY: 'auto', overscrollBehavior: 'contain',
          }
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
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-blue flex items-center gap-2 transition-colors ${className}`}
    >
      {children}
    </button>
  )
}
