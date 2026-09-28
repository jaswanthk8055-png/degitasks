import { useEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { formatDueDate } from '../../lib/utils'
import { useToastStore } from '../../stores/useToastStore'

export default function DatePicker({ dueDate, taskId, onUpdate, field = 'due_date', label = 'Due date', highlightOverdue = true }) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!editing || !inputRef.current) return
    inputRef.current.focus()
    // showPicker() works in standard Chrome; silently ignored in Teams WebView
    try { inputRef.current.showPicker?.() } catch { /* The focused date input remains usable without a native picker. */ }
  }, [editing])

  const saveDate = async (value) => {
    setEditing(false)
    try {
      await onUpdate(taskId, { [field]: value || null })
    } catch (error) {
      useToastStore.getState().addToast(error.message || `Could not update ${label.toLowerCase()}`, 'error')
    }
  }

  // Small delay so onChange fires first when the user picks a date from the
  // calendar before blur closes edit mode
  const handleBlur = () => setTimeout(() => setEditing(false), 150)

  const displayDate = formatDueDate(dueDate)
  const isOverdue = highlightOverdue && dueDate && new Date(dueDate) < new Date() && displayDate !== 'Today'

  return (
    <div className="relative flex items-center h-full">
      {editing ? (
        <input
          ref={inputRef}
          type="date"
          aria-label={label}
          defaultValue={dueDate ? format(parseISO(dueDate), 'yyyy-MM-dd') : ''}
          onChange={(e) => saveDate(e.target.value)}
          onBlur={handleBlur}
          className="text-xs border border-primary-blue rounded px-1 py-0.5 outline-none bg-white dark:bg-[#222] text-gray-900 dark:text-gray-100 cursor-pointer"
          style={{ width: 130 }}
        />
      ) : (
        <>
          <button
            onClick={() => setEditing(true)}
            aria-label={`Edit ${label.toLowerCase()}`}
            className={`px-1.5 py-0.5 rounded text-xs transition hover:bg-gray-100 dark:hover:bg-white/10 focus:outline-none ${
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
              onClick={() => saveDate(null)}
              className="ml-0.5 text-gray-300 hover:text-red-400 opacity-0 group-hover/row:opacity-100 transition"
              title="Clear date"
              tabIndex={-1}
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
