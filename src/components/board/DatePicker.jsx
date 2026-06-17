import { useEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { formatDueDate } from '../../lib/utils'

export default function DatePicker({ dueDate, taskId, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!editing || !inputRef.current) return
    inputRef.current.focus()
    // showPicker() works in standard Chrome; silently ignored in Teams WebView
    try { inputRef.current.showPicker?.() } catch {}
  }, [editing])

  const handleChange = (e) => {
    onUpdate(taskId, { due_date: e.target.value || null })
    setEditing(false)
  }

  // Small delay so onChange fires first when the user picks a date from the
  // calendar before blur closes edit mode
  const handleBlur = () => setTimeout(() => setEditing(false), 150)

  const displayDate = formatDueDate(dueDate)
  const isOverdue = dueDate && new Date(dueDate) < new Date() && displayDate !== 'Today'

  return (
    <div className="relative flex items-center h-full">
      {editing ? (
        <input
          ref={inputRef}
          type="date"
          defaultValue={dueDate ? format(parseISO(dueDate), 'yyyy-MM-dd') : ''}
          onChange={handleChange}
          onBlur={handleBlur}
          className="text-xs border border-primary-blue rounded px-1 py-0.5 outline-none bg-white dark:bg-[#222] text-gray-900 dark:text-gray-100 cursor-pointer"
          style={{ width: 130 }}
        />
      ) : (
        <>
          <button
            onClick={() => setEditing(true)}
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
              onClick={() => onUpdate(taskId, { due_date: null })}
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
