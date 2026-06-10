import { useState, useRef } from 'react'
import { PRIORITY_OPTIONS } from '../../lib/utils'
import Dropdown from '../ui/Dropdown'

export default function PriorityPill({ priority, taskId, onUpdate }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)

  const option = PRIORITY_OPTIONS.find((o) => o.label === priority)
  const color = option?.color || 'transparent'
  const hasValue = !!priority

  const handleSelect = (opt) => {
    setOpen(false)
    onUpdate(taskId, { priority: opt.label })
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((p) => !p)}
        className={`w-full h-full px-2 py-1 rounded text-xs font-medium transition hover:opacity-90 focus:outline-none truncate ${
          hasValue ? 'text-white' : 'text-gray-400 bg-transparent hover:bg-gray-100'
        }`}
        style={hasValue ? { backgroundColor: color } : {}}
      >
        {priority || '—'}
      </button>

      <Dropdown open={open} onClose={() => setOpen(false)} className="w-36" anchorRef={btnRef}>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { setOpen(false); onUpdate(taskId, { priority: null }) }}
          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 text-sm text-gray-400 transition"
        >
          — None
        </button>
        {PRIORITY_OPTIONS.map((opt) => (
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
