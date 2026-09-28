import { useEffect, useId, useRef, useState } from 'react'
import { useBoardStore } from '../../stores/useBoardStore'
import { useToastStore } from '../../stores/useToastStore'
import Dropdown from '../ui/Dropdown'

export default function TaskProjectPicker({ task, compact = false }) {
  const { groups, subGroups, moveTaskToProject } = useBoardStore()
  const { addToast } = useToastStore()
  const [open, setOpen] = useState(false)
  const [destination, setDestination] = useState(task.sub_group_id || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const pendingRef = useRef(false)
  const buttonRef = useRef(null)
  const selectRef = useRef(null)
  const selectId = useId()
  const currentProject = subGroups.find((project) => project.id === task.sub_group_id)
  const currentGroup = groups.find((group) => group.id === task.group_id)
  const boardGroups = groups.filter((group) => group.board_id === task.board_id)
    .sort((a, b) => a.position - b.position)
  // Use the full board list: My Tasks may hide empty or colleague-only projects.
  const projects = subGroups.filter((project) => project.board_id === task.board_id
    && boardGroups.some((group) => group.id === project.group_id))
  const selectedProject = projects.find((project) => project.id === destination)
  const canMove = destination !== (task.sub_group_id || '')
    && (!destination || !!selectedProject)

  // The portal is hidden until Dropdown measures it; focus after it is visible.
  useEffect(() => {
    if (open) selectRef.current?.focus()
  }, [open])

  const close = () => {
    if (pendingRef.current) return
    setOpen(false)
  }

  const handleEscape = (event) => {
    if (event.key !== 'Escape' || !open) return
    event.stopPropagation()
    close()
    buttonRef.current?.focus()
  }

  const handleMove = async (event) => {
    event.preventDefault()
    if (pendingRef.current || !canMove) return
    pendingRef.current = true
    setSaving(true)
    setError('')
    try {
      await moveTaskToProject(task.id, destination || null)
      addToast(destination ? `Moved to "${selectedProject.name}"` : 'Moved out of project')
      setOpen(false)
      buttonRef.current?.focus()
    } catch (cause) {
      const message = cause.message || 'Could not move task. Please try again.'
      setError(message)
      addToast(message, 'error')
    } finally {
      pendingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className={compact ? 'flex-shrink-0 ml-1' : 'min-w-0 max-w-full'}>
      <button
        ref={buttonRef}
        type="button"
        title="Move to project"
        aria-label={compact ? `Move "${task.title || 'Untitled task'}" to project` : 'Move to project'}
        aria-expanded={open}
        disabled={saving}
        onKeyDown={handleEscape}
        onClick={(event) => {
          event.stopPropagation()
          if (open) { close(); return }
          setDestination(task.sub_group_id || '')
          setError('')
          setOpen(true)
        }}
        className={compact
          ? 'p-1 rounded text-gray-400 hover:text-primary-blue hover:bg-blue-50 dark:hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-primary-blue transition disabled:opacity-50'
          : 'flex items-center gap-2 max-w-full px-2 py-1 rounded text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-primary-blue transition disabled:opacity-50'}
      >
        {!compact && <span className="truncate">{currentProject?.name || 'No project'}</span>}
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} className="flex-shrink-0" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14 7l5 5-5 5M5 12h14" />
        </svg>
      </button>

      <Dropdown open={open} onClose={close} anchorRef={buttonRef} className="w-72">
        <form
          onSubmit={handleMove}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={handleEscape}
          className="p-3 space-y-3"
          aria-label="Move to project"
          aria-busy={saving}
        >
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Move to project</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 break-words">
              Current: {currentProject?.name || 'No project'}{currentGroup ? ` · ${currentGroup.name}` : ''}
            </p>
          </div>
          <div>
            <label htmlFor={selectId} className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Destination project</label>
            <select
              id={selectId}
              ref={selectRef}
              value={destination}
              disabled={saving}
              onChange={(event) => { setDestination(event.target.value); setError('') }}
              className="w-full rounded-md border border-gray-200 dark:border-[#444] bg-white dark:bg-[#252525] text-sm text-gray-900 dark:text-gray-100 px-2 py-2 focus:outline-none focus:ring-2 focus:ring-primary-blue disabled:opacity-50"
            >
              <option value="">No project</option>
              {boardGroups.map((group) => {
                const groupProjects = projects.filter((project) => project.group_id === group.id)
                  .sort((a, b) => a.position - b.position)
                if (!groupProjects.length) return null
                return (
                  <optgroup key={group.id} label={group.name}>
                    {groupProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </optgroup>
                )
              })}
            </select>
          </div>
          {!projects.length && <p className="text-xs text-gray-500 dark:text-gray-400">No projects yet. Create a project to move this task into it.</p>}
          {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} disabled={saving} className="px-3 py-1.5 text-xs rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving || !canMove} className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary-blue text-white hover:bg-blue-600 disabled:opacity-50">
              {saving ? 'Moving…' : 'Move task'}
            </button>
          </div>
        </form>
      </Dropdown>
    </div>
  )
}
