import { useEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { formatDueDate } from '../../lib/utils'
import { useToastStore } from '../../stores/useToastStore'

export default function DatePicker({ dueDate, taskId, taskTitle, onUpdate, field = 'due_date', label = 'Due date', highlightOverdue = true }) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef(null)
  const buttonRef = useRef(null)
  const blurTimerRef = useRef(null)
  const restoreFocusRef = useRef(false)
  const taskLabel = taskTitle ? ` for "${taskTitle}"` : ''

  useEffect(() => {
    if (!editing) {
      if (restoreFocusRef.current) buttonRef.current?.focus({ preventScroll: true })
      restoreFocusRef.current = false
      return
    }
    if (!inputRef.current) return
    inputRef.current.focus()
    // showPicker() works in standard Chrome; silently ignored in Teams WebView
    try { inputRef.current.showPicker?.() } catch { /* The focused date input remains usable without a native picker. */ }
  }, [editing])

  useEffect(() => () => clearTimeout(blurTimerRef.current), [])

  const closeEditor = () => {
    clearTimeout(blurTimerRef.current)
    restoreFocusRef.current = true
    setEditing(false)
    buttonRef.current?.focus({ preventScroll: true })
  }

  const saveDate = async (value) => {
    closeEditor()
    try {
      await onUpdate(taskId, { [field]: value || null })
    } catch (error) {
      useToastStore.getState().addToast(error.message || `Could not update ${label.toLowerCase()}`, 'error')
    }
  }

  // Small delay so onChange fires first when the user picks a date from the
  // calendar before blur closes edit mode
  const handleBlur = () => {
    clearTimeout(blurTimerRef.current)
    blurTimerRef.current = setTimeout(() => setEditing(false), 150)
  }

  const displayDate = formatDueDate(dueDate)
  const isOverdue = highlightOverdue && dueDate && new Date(dueDate) < new Date() && displayDate !== 'Today'

  return (
    <div className="relative flex items-center h-full">
      {editing ? (
        <input
          ref={inputRef}
          type="date"
          aria-label={`${label}${taskLabel}`}
          defaultValue={dueDate ? format(parseISO(dueDate), 'yyyy-MM-dd') : ''}
          onChange={(e) => saveDate(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            event.stopPropagation()
            closeEditor()
          }}
          className="text-xs border border-primary-blue rounded px-1 py-0.5 outline-none bg-white dark:bg-[#222] text-gray-900 dark:text-gray-100 cursor-pointer"
          style={{ width: 130 }}
        />
      ) : (
        <>
          <button
            ref={buttonRef}
            type="button"
            onClick={() => { clearTimeout(blurTimerRef.current); setEditing(true) }}
            aria-label={`Edit ${label.toLowerCase()}${taskLabel}: ${dueDate ? format(parseISO(dueDate), 'yyyy-MM-dd') : 'Not set'}`}
            className={`px-1.5 py-0.5 rounded text-xs transition hover:bg-gray-100 dark:hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue ${
              isOverdue
                ? 'text-status-red font-medium'
                : displayDate
                ? 'text-gray-700 dark:text-gray-300'
                : 'text-gray-400'
            }`}
          >
            {displayDate || '—'}
          </button>

          {dueDate && (
            <button
              type="button"
              onClick={() => saveDate(null)}
              aria-label={`Clear ${label.toLowerCase()}${taskLabel}`}
              className="ml-0.5 rounded text-gray-300 hover:text-red-400 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue transition"
              title="Clear date"
            >
              <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </>
      )}
    </div>
  )
}
