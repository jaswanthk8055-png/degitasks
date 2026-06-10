import { useRef } from 'react'
import { format, parseISO } from 'date-fns'
import { formatDueDate } from '../../lib/utils'

export default function DatePicker({ dueDate, taskId, onUpdate }) {
  const inputRef = useRef(null)

  const handleChange = (e) => {
    onUpdate(taskId, { due_date: e.target.value || null })
  }

  const openPicker = () => {
    const el = inputRef.current
    if (!el) return
    if (el.showPicker) { try { el.showPicker() } catch { el.click() } }
    else el.click()
  }

  const displayDate = formatDueDate(dueDate)
  const isOverdue = dueDate && new Date(dueDate) < new Date() && displayDate !== 'Today'

  return (
    <div className="relative flex items-center h-full">
      {/* Hidden native date input — triggers the OS date picker */}
      <input
        ref={inputRef}
        type="date"
        value={dueDate ? format(parseISO(dueDate), 'yyyy-MM-dd') : ''}
        onChange={handleChange}
        className="sr-only"
        tabIndex={-1}
      />

      <button
        onClick={openPicker}
        className={`px-1.5 py-0.5 rounded text-xs transition hover:bg-gray-100 dark:hover:bg-white/10 focus:outline-none ${
          isOverdue ? 'text-status-red font-medium' : displayDate ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400'
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
    </div>
  )
}
