import { useState, useRef, useId } from 'react'
import { PRIORITY_OPTIONS } from '../../lib/utils'
import { useToastStore } from '../../stores/useToastStore'
import Dropdown from '../ui/Dropdown'

export default function PriorityPill({ priority, taskId, taskTitle, onUpdate }) {
  const [open, setOpen] = useState(false)
  const [initialFocus, setInitialFocus] = useState(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const btnRef = useRef(null)
  const menuId = useId()
  const taskLabel = taskTitle ? ` for "${taskTitle}"` : ''

  const option = PRIORITY_OPTIONS.find((o) => o.label === priority)
  const color = option?.color || 'transparent'
  const hasValue = !!priority

  const handleSelect = async (opt) => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setOpen(false)
    btnRef.current?.focus({ preventScroll: true })
    try {
      await onUpdate(taskId, { priority: opt.label })
    } catch (error) {
      useToastStore.getState().addToast(error.message || 'Could not update priority', 'error')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-label={`Edit priority${taskLabel}: ${priority || 'None'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-disabled={saving}
        aria-busy={saving}
        onClick={(event) => {
          if (savingRef.current) return
          setInitialFocus(event.detail === 0 ? 'first' : null)
          setOpen((p) => !p)
        }}
        onKeyDown={(event) => {
          if (open && event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            setOpen(false)
            return
          }
          if (savingRef.current || !['ArrowDown', 'ArrowUp'].includes(event.key)) return
          event.preventDefault()
          setInitialFocus(event.key === 'ArrowUp' ? 'last' : 'first')
          setOpen(true)
        }}
        className={`w-full h-full px-2 py-1 rounded text-xs font-medium transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue truncate ${
          hasValue ? 'text-white' : 'text-gray-400 bg-transparent hover:bg-gray-100'
        }`}
        style={hasValue ? { backgroundColor: color } : {}}
      >
        {priority || '—'}
      </button>

      <Dropdown id={menuId} role="menu" aria-label={`Priority${taskLabel}`} initialFocus={initialFocus} open={open} onClose={() => setOpen(false)} className="w-36" anchorRef={btnRef}>
        <button
          type="button"
          role="menuitemradio"
          aria-checked={!priority}
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleSelect({ label: null })}
          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-blue text-sm text-gray-400 transition"
        >
          — None
        </button>
        {PRIORITY_OPTIONS.map((opt) => (
          <button
            key={opt.label}
            type="button"
            role="menuitemradio"
            aria-checked={opt.label === priority}
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleSelect(opt)}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-blue text-sm text-gray-700 dark:text-gray-300 transition"
          >
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: opt.color }} />
            {opt.label}
          </button>
        ))}
      </Dropdown>
    </div>
  )
}
