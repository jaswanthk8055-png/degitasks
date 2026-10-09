import { useId, useRef, useState } from 'react'
import { useBoardStore } from '../../stores/useBoardStore'
import { useToastStore } from '../../stores/useToastStore'
import { isCompletedTaskGroup } from '../../lib/taskGroups'
import { normalizeProjectName } from '../../lib/taskProjects'
import Modal from '../ui/Modal'

export default function NewProjectDialog({ onClose, onSelectProject }) {
  const { currentBoard, groups, subGroups, createGroup, createSubGroup, activateProjectForNewTask } = useBoardStore()
  const { addToast } = useToastStore()
  const nameId = useId()
  const groupId = useId()
  const helpId = useId()
  const submitting = useRef(false)
  const boardGroups = groups.filter((group) => group.board_id === currentBoard.id).sort((a, b) => a.position - b.position)
  const activeGroups = boardGroups.filter((group) => !isCompletedTaskGroup(group))
  const [name, setName] = useState('')
  const [destination, setDestination] = useState(activeGroups[0]?.id || '')
  const [saving, setSaving] = useState(false)
  const [selectingName, setSelectingName] = useState(null)
  const [error, setError] = useState('')
  const query = normalizeProjectName(name)
  const projects = subGroups.filter((project) => project.board_id === currentBoard.id
    && boardGroups.some((group) => group.id === project.group_id))
  const projectsByName = new Map()
  for (const project of projects) {
    const key = normalizeProjectName(project.name)
    const previous = projectsByName.get(key)
    const completed = isCompletedTaskGroup(boardGroups.find((group) => group.id === project.group_id))
    const previousCompleted = previous && isCompletedTaskGroup(boardGroups.find((group) => group.id === previous.group_id))
    if (!previous || previousCompleted && !completed) projectsByName.set(key, project)
  }
  const matches = [...projectsByName.values()].filter((project) => normalizeProjectName(project.name).includes(query))
    .sort((a, b) => a.name.localeCompare(b.name))
  const exactMatch = projectsByName.has(query)

  const close = () => { if (!submitting.current) onClose() }
  const selectProject = async (project) => {
    if (submitting.current) return
    submitting.current = true
    setSaving(true)
    setSelectingName(normalizeProjectName(project.name))
    setError('')
    try {
      const activeProject = await activateProjectForNewTask(project.id)
      onSelectProject(activeProject)
      onClose()
    } catch (selectionError) {
      setError(selectionError.message || 'Could not open this project in To Do. Please try again.')
    } finally {
      submitting.current = false
      setSaving(false)
      setSelectingName(null)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting.current) return
    const trimmed = name.trim().replace(/\s+/g, ' ')
    if (!trimmed) { setError('Enter a project name.'); return }
    // Read the latest store at submission time, including realtime inserts.
    const state = useBoardStore.getState()
    if (state.currentBoard?.id !== currentBoard.id) return
    if (state.subGroups.some((project) => project.board_id === currentBoard.id
      && normalizeProjectName(project.name) === normalizeProjectName(trimmed))) {
      setError('A project with this name already exists. Select it below.')
      return
    }
    const target = state.groups.find((group) => group.id === destination && group.board_id === currentBoard.id
      && !isCompletedTaskGroup(group))
    if (!target && activeGroups.length) { setError('Choose an active group for this project.'); return }
    submitting.current = true
    setSaving(true)
    setError('')
    try {
      const group = target || await createGroup(currentBoard.id, 'Tasks')
      const latestMatch = useBoardStore.getState().subGroups.find((project) => project.board_id === currentBoard.id
        && normalizeProjectName(project.name) === normalizeProjectName(trimmed))
      if (latestMatch) {
        setError('A project with this name already exists. Select it below.')
        return
      }
      const project = await createSubGroup(currentBoard.id, group.id, trimmed)
      onSelectProject(project)
      addToast('Project created')
      onClose()
    } catch (saveError) {
      setError(saveError.message || 'Could not create project. Please try again.')
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={close} title="Add Project">
      <div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor={nameId} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Project name</label>
            <input
              id={nameId}
              autoFocus
              value={name}
              onChange={(event) => { setName(event.target.value); setError('') }}
              disabled={saving}
              placeholder="Project name…"
              aria-describedby={helpId}
              className="w-full rounded-lg border border-gray-300 dark:border-[#444] px-3 py-2 text-sm bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-primary-blue disabled:opacity-60"
            />
            <p id={helpId} className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">Search by any part of a name. Select an existing project to add tasks in To Do, or create a new project.</p>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">{query ? 'Matching projects' : 'Existing projects'}</p>
            <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200 dark:border-[#444]">
              {matches.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  disabled={saving}
                  aria-busy={selectingName === normalizeProjectName(project.name)}
                  onClick={() => selectProject(project)}
                  aria-label={`Select project ${project.name} in ${boardGroups.find((group) => group.id === project.group_id)?.name}`}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 focus-visible:bg-blue-50 dark:focus-visible:bg-blue-900/20 border-b last:border-b-0 border-gray-100 dark:border-[#333] disabled:opacity-60"
                >
                  <span className="min-w-0 truncate text-sm text-gray-900 dark:text-gray-100">{project.name}</span>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 flex-shrink-0">{selectingName === normalizeProjectName(project.name) ? 'Opening…' : boardGroups.find((group) => group.id === project.group_id)?.name}</span>
                </button>
              ))}
              {!matches.length && <p className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400">{query ? 'No matching projects. You can create a new project.' : 'No projects yet.'}</p>}
            </div>
            {exactMatch && query && <p className="mt-2 text-xs text-primary-blue" role="status">A project with this name already exists. Select it above.</p>}
          </div>

          {activeGroups.length > 0 ? (
            <div>
              <label htmlFor={groupId} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Group for new project</label>
              <select id={groupId} value={destination} disabled={saving} onChange={(event) => { setDestination(event.target.value); setError('') }} className="w-full rounded-lg border border-gray-300 dark:border-[#444] px-3 py-2 text-sm bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-primary-blue">
                {activeGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </div>
          ) : <p className="text-xs text-gray-500 dark:text-gray-400">A Tasks group will be created for your new project.</p>}
          {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" disabled={saving} onClick={close} className="px-3 py-2 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving || !query || exactMatch} className="px-3.5 py-2 rounded-lg text-xs font-medium bg-primary-blue text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed">{saving && !selectingName ? 'Creating…' : 'Create project'}</button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
