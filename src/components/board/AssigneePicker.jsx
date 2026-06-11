import { useState, useRef } from 'react'
import Dropdown from '../ui/Dropdown'
import Avatar from '../ui/Avatar'
import { useAuthStore } from '../../stores/useAuthStore'

export default function AssigneePicker({ assigneeId, profiles, taskId, onUpdate, canEdit = false }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const { user } = useAuthStore()
  const assignee = profiles.find((p) => p.id === assigneeId)

  const handleSelect = (profile) => {
    setOpen(false)
    onUpdate(taskId, { assignee_id: profile ? profile.id : null })
  }

  // For normal users: show current assignee + allow self-assign only (other users hidden)
  const pickerProfiles = canEdit ? profiles : profiles.filter((p) => p.id === user?.id)

  return (
    <div className="relative flex items-center justify-center h-full">
      <button
        ref={btnRef}
        onClick={() => setOpen((p) => !p)}
        className="flex items-center justify-center hover:opacity-80 transition"
        title={assignee?.full_name || 'Assign'}
      >
        {assignee ? (
          <Avatar name={assignee.full_name} color={assignee.avatar_color} size="sm" />
        ) : (
          <div className="w-7 h-7 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-gray-400 transition">
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
          </div>
        )}
      </button>

      <Dropdown open={open} onClose={() => setOpen(false)} className="w-48" anchorRef={btnRef}>
        <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-[#333]">
          Assign to
        </div>
        {/* Admin can unassign anyone; normal user can only unassign themselves */}
        {assigneeId && (canEdit || assigneeId === user?.id) && (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleSelect(null)}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 text-sm text-gray-500 dark:text-gray-400 transition"
          >
            <div className="w-7 h-7 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-gray-400 flex-shrink-0">
              ×
            </div>
            Unassign
          </button>
        )}
        {pickerProfiles.map((profile) => (
          <button
            key={profile.id}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleSelect(profile)}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 text-sm text-gray-700 dark:text-gray-300 transition"
          >
            <Avatar name={profile.full_name} color={profile.avatar_color} size="sm" />
            <span className="truncate">{profile.full_name}</span>
          </button>
        ))}
      </Dropdown>
    </div>
  )
}
