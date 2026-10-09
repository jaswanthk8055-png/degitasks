import { useState, useRef, useId } from 'react'
import Dropdown from '../ui/Dropdown'
import Avatar from '../ui/Avatar'
import { useToastStore } from '../../stores/useToastStore'

export default function AssigneePicker({ assigneeIds = [], profiles, assignableProfiles, taskId, taskTitle, onUpdate }) {
  const [open, setOpen] = useState(false)
  const [initialFocus, setInitialFocus] = useState(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const btnRef = useRef(null)
  const menuId = useId()
  const taskLabel = taskTitle ? ` for "${taskTitle}"` : ''

  const assigned = profiles.filter((p) => assigneeIds.includes(p.id))
  const options = assignableProfiles ?? profiles

  const saveAssignees = async (next) => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      await onUpdate(taskId, { assignee_ids: next, assignee_id: next[0] ?? null })
    } catch (error) {
      useToastStore.getState().addToast(error.message || 'Could not update assignees', 'error')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const toggle = (profile) => {
    const isSelected = assigneeIds.includes(profile.id)
    const next = isSelected
      ? assigneeIds.filter((id) => id !== profile.id)
      : [...assigneeIds, profile.id]
    saveAssignees(next)
  }

  const clearAll = () => {
    if (savingRef.current) return
    saveAssignees([])
    setOpen(false)
    btnRef.current?.focus({ preventScroll: true })
  }

  return (
    <div className="relative flex items-center justify-center h-full">
      <button
        ref={btnRef}
        type="button"
        aria-label={`Edit assignees${taskLabel}: ${assigned.length ? assigned.map((p) => p.full_name).join(', ') : 'Unassigned'}`}
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
        className="flex items-center justify-center rounded-full hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue transition"
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

      <Dropdown id={menuId} role="menu" aria-label={`Assignees${taskLabel}`} initialFocus={initialFocus} open={open} onClose={() => setOpen(false)} className="w-52" anchorRef={btnRef}>
        <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-[#333]">
          Assign to
        </div>

        {options.map((profile) => {
          const checked = assigneeIds.includes(profile.id)
          return (
            <button
              key={profile.id}
              type="button"
              role="menuitemcheckbox"
              aria-label={profile.full_name}
              aria-checked={checked}
              aria-disabled={saving}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => toggle(profile)}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-blue text-sm text-gray-700 dark:text-gray-300 transition"
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
              type="button"
              role="menuitem"
              aria-label="Clear all assignees"
              aria-disabled={saving}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={clearAll}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-blue text-sm text-gray-500 dark:text-gray-400 transition"
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
