import { useState, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import Dropdown from '../ui/Dropdown'
import { formatDueDate } from '../../lib/utils'

export default function DatePicker({ dueDate, taskId, onUpdate }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)

  const handleChange = (e) => {
    setOpen(false)
    onUpdate(taskId, { due_date: e.target.value || null })
  }

  const displayDate = formatDueDate(dueDate)
  const isOverdue = dueDate && new Date(dueDate) < new Date() && displayDate !== 'Today'

  return (
    <div className="relative flex items-center h-full">
      <button
        ref={btnRef}
        onClick={() => setOpen((p) => !p)}
        className={`px-1.5 py-0.5 rounded text-xs transition hover:bg-gray-100 dark:hover:bg-white/10 focus:outline-none ${
          isOverdue ? 'text-status-red font-medium' : displayDate ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400'
        }`}
      >
        {displayDate || '—'}
      </button>

      <Dropdown open={open} onClose={() => setOpen(false)} className="w-auto" anchorRef={btnRef}>
        <div className="p-3">
          <p className="text-xs font-medium text-gray-500 mb-2">Due date</p>
          <input
            type="date"
            defaultValue={dueDate ? format(parseISO(dueDate), 'yyyy-MM-dd') : ''}
            onChange={handleChange}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-[#444] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-blue dark:bg-[#333] dark:text-white"
          />
          {dueDate && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setOpen(false); onUpdate(taskId, { due_date: null }) }}
              className="mt-2 w-full text-xs text-red-500 hover:text-red-700 text-left transition"
            >
              Clear date
            </button>
          )}
        </div>
      </Dropdown>
    </div>
  )
}
