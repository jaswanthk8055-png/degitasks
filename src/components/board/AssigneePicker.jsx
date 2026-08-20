import { useState, useRef } from 'react'
import Dropdown from '../ui/Dropdown'
import Avatar from '../ui/Avatar'

export default function AssigneePicker({ assigneeIds = [], profiles, assignableProfiles, taskId, onUpdate }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)

  const assigned = profiles.filter((p) => assigneeIds.includes(p.id))
  const options = assignableProfiles ?? profiles

  const toggle = (profile) => {
    const isSelected = assigneeIds.includes(profile.id)
    const next = isSelected
      ? assigneeIds.filter((id) => id !== profile.id)
      : [...assigneeIds, profile.id]
    onUpdate(taskId, { assignee_ids: next, assignee_id: next[0] ?? null })
  }

  const clearAll = () => {
    onUpdate(taskId, { assignee_ids: [], assignee_id: null })
    setOpen(false)
  }

  return (
    <div className="relative flex items-center justify-center h-full">
      <button
        ref={btnRef}
        onClick={() => setOpen((p) => !p)}
        className="flex items-center justify-center hover:opacity-80 transition"
        title={assigned.length ? assigned.map((p) => p.full_name).join(', ') : 'Assign'}
      >
        {assigned.length > 0 ? (
          <div className="flex items-center">
            {assigned.slice(0, 3).map((p, i) => (
              <div
                key={p.id}
                className="ring-2 ring-white dark:ring-[#1e1e1e] rounded-full"
                style={{ marginLeft: i > 0 ? '-6px' : '0', zIndex: assigned.length - i }}
              >
                <Avatar name={p.full_name} color={p.avatar_color} size="sm" />
              </div>
            ))}
            {assigned.length > 3 && (
              <div
                className="w-7 h-7 rounded-full bg-gray-200 dark:bg-[#333] ring-2 ring-white dark:ring-[#1e1e1e] flex items-center justify-center text-[10px] font-semibold text-gray-600 dark:text-gray-300"
                style={{ marginLeft: '-6px' }}
              >
                +{assigned.length - 3}
              </div>
            )}
          </div>
        ) : (
          <div className="w-7 h-7 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-gray-400 transition">
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
          </div>
        )}
      </button>

      <Dropdown open={open} onClose={() => setOpen(false)} className="w-52" anchorRef={btnRef}>
        <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-[#333]">
          Assign to
        </div>

        {options.map((profile) => {
          const checked = assigneeIds.includes(profile.id)
          return (
            <button
              key={profile.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => toggle(profile)}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 text-sm text-gray-700 dark:text-gray-300 transition"
            >
              <div className="flex-shrink-0 w-4 h-4 rounded border border-gray-300 dark:border-gray-600 flex items-center justify-center"
                style={{ background: checked ? '#0073ea' : 'transparent', borderColor: checked ? '#0073ea' : undefined }}>
                {checked && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <Avatar name={profile.full_name} color={profile.avatar_color} size="sm" />
              <span className="truncate">{profile.full_name}</span>
            </button>
          )
        })}

        {assigned.length > 0 && (
          <>
            <div className="border-t border-gray-100 dark:border-[#333] mt-1" />
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={clearAll}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 text-sm text-gray-500 dark:text-gray-400 transition"
            >
              <div className="w-7 h-7 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-gray-400 flex-shrink-0">
                ×
              </div>
              Clear all
            </button>
          </>
        )}
      </Dropdown>
    </div>
  )
}
