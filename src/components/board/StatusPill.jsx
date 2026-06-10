import { useState, useRef } from 'react'
import { STATUS_OPTIONS } from '../../lib/utils'
import Dropdown from '../ui/Dropdown'

export default function StatusPill({ status, statusColor, taskId, onUpdate }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)

  const handleSelect = (option) => {
    setOpen(false)
    onUpdate(taskId, { status: option.label, status_color: option.color })
  }

  const color = statusColor || STATUS_OPTIONS.find((o) => o.label === status)?.color || '#c4c4c4'

  return (
    <div className="relative w-full">
      <button
        ref={btnRef}
        onClick={() => setOpen((p) => !p)}
        className="w-full h-6 px-2 rounded text-[11px] font-semibold text-white transition hover:opacity-85 focus:outline-none truncate"
        style={{ backgroundColor: color }}
      >
        {status || 'Not Started'}
      </button>

      <Dropdown open={open} onClose={() => setOpen(false)} className="w-44" anchorRef={btnRef}>
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleSelect(opt)}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 text-sm text-gray-700 dark:text-gray-300 transition"
          >
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: opt.color }} />
            {opt.label}
          </button>
        ))}
      </Dropdown>
    </div>
  )
}
