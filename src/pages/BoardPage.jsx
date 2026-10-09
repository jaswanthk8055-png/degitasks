import { useState, useEffect } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { useBoard } from '../hooks/useBoard'
import { useBoardStore } from '../stores/useBoardStore'
import { useAuthStore } from '../stores/useAuthStore'
import { useToastStore } from '../stores/useToastStore'
import TopBar from '../components/layout/TopBar'
import BoardTable from '../components/board/BoardTable'
import KanbanView from '../components/board/KanbanView'
import CalendarView from '../components/board/CalendarView'
import TaskDetailPanel from '../components/board/TaskDetailPanel'
import NewProjectDialog from '../components/board/NewProjectDialog'
import AutomationsPanel from '../components/board/AutomationsPanel'
import { isCompletedTaskGroup } from '../lib/taskGroups'

const EMPTY_FILTERS = { assigneeIds: [], statuses: [], priorities: [], dueThisWeek: false }

export default function BoardPage() {
  const { boardId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { loading, error: boardError } = useBoard(boardId)
  const { groups, tasks, subGroups, createTask, createGroup, currentBoard, updateTask, profiles } =
    useBoardStore()
  const { profile, user } = useAuthStore()
  const currentUserId = user?.id || profile?.id
  const { addToast } = useToastStore()

  const [activeView,       setActiveView]       = useState(profile?.default_page || 'Main Table')
  const [filters,          setFilters]          = useState(EMPTY_FILTERS)
  const [myTasksFilters,   setMyTasksFilters]   = useState(EMPTY_FILTERS)
  const [filterOpen,       setFilterOpen]       = useState(false)
  const [automationsOpen,  setAutomationsOpen]  = useState(false)
  const [groupBy,          setGroupBy]          = useState('group')
  const [myTasksGroupBy,   setMyTasksGroupBy]   = useState('group')
  const [newTaskId,        setNewTaskId]        = useState(null)
  const [creatingTask,     setCreatingTask]     = useState(false)
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [projectNavigation, setProjectNavigation] = useState(null)
  const isMyTasks = activeView === 'My Tasks'
  const activeFilters = isMyTasks ? myTasksFilters : filters
  const activeGroupBy = isMyTasks ? myTasksGroupBy : groupBy
  const currentProjectNavigation = projectNavigation?.boardId === boardId && projectNavigation?.userId === currentUserId
    ? projectNavigation : null

  // A selected empty project is a draft until its first task appears. Once a
  // project has tasks, completing/moving its last task must hide its empty row.
  if (currentProjectNavigation) {
    const previousProjects = currentProjectNavigation.projects || []
    const projects = previousProjects.flatMap((project) => {
      if (!subGroups.some((item) => item.id === project.id)) return []
      const hasTasks = tasks.some((task) => task.board_id === boardId && task.sub_group_id === project.id)
      if (project.hadTasks && !hasTasks) return []
      return [{ ...project, hadTasks: project.hadTasks || hasTasks }]
    })
    if (projects.length !== previousProjects.length
      || projects.some((project, index) => project.hadTasks !== previousProjects[index].hadTasks)) {
      setProjectNavigation({ ...currentProjectNavigation, projects })
    }
  }

  // Update document title when board changes
  useEffect(() => {
    document.title = currentBoard?.name ? `${currentBoard.name} — DegiTasks` : 'DegiTasks'
    return () => { document.title = 'DegiTasks' }
  }, [currentBoard?.name])

  const taskParams = new URLSearchParams(location.search)
  const hasTaskParam = taskParams.has('task')
  const legacyTaskId = location.state?.openTaskId
  const requestedTaskId = hasTaskParam ? taskParams.get('task') : legacyTaskId
  const hasTaskRequest = hasTaskParam || Boolean(legacyTaskId)
  const validTaskRequest = typeof requestedTaskId === 'string' && requestedTaskId.trim() !== ''
    && taskParams.getAll('task').length <= 1
  const boardReady = !loading && currentBoard?.id === boardId
  // Resolve from live board data only: deletion or a move must never leave a
  // stale, editable copy in the details panel. The URL also restores history.
  const liveSelectedTask = boardReady && validTaskRequest
    ? tasks.find((task) => task.id === requestedTaskId && task.board_id === boardId)
    : null
  const taskUnavailable = hasTaskRequest && !loading && !liveSelectedTask
    && (!currentBoard || currentBoard.id === boardId)

  // Existing notifications use location state. Canonicalize them into a
  // shareable URL and consume the state so closing cannot reopen the task.
  useEffect(() => {
    if (!legacyTaskId) return
    const params = new URLSearchParams(location.search)
    if (!params.has('task')) params.set('task', legacyTaskId)
    const state = { ...location.state }
    delete state.openTaskId
    navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, { replace: true, state })
  }, [legacyTaskId, location.pathname, location.search, location.hash, location.state, navigate])

  const handleNewTask = async () => {
    if (!currentBoard || !currentUserId || creatingTask) return
    setCreatingTask(true)
    try {
      const firstGroup = groups.filter((group) => !isCompletedTaskGroup(group)).sort((a, b) => a.position - b.position)[0]
        || await createGroup(currentBoard.id, 'Tasks')
      const task = await createTask(currentBoard.id, firstGroup.id, currentUserId, null, { assignToCreator: isMyTasks })
      setNewTaskId(task.id)
      addToast('Task created')
    } catch (error) {
      addToast(error.message || 'Could not create task', 'error')
    } finally {
      setCreatingTask(false)
    }
  }

  const handleOpenTask = (task) => {
    if (!boardReady || task.board_id !== boardId) return
    const params = new URLSearchParams(location.search)
    params.set('task', task.id)
    if (params.toString() === new URLSearchParams(location.search).toString()) return
    const state = { ...location.state }
    delete state.openTaskId
    navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, { state })
  }
  const handleClosePanel = () => {
    const params = new URLSearchParams(location.search)
    params.delete('task')
    const state = { ...location.state }
    delete state.openTaskId
    navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, { state })
  }

  const handleSelectProject = (project) => {
    if (isMyTasks) setMyTasksGroupBy('group')
    else { setActiveView('Main Table'); setGroupBy('group') }
    setProjectNavigation((previous) => ({
      boardId,
      userId: currentUserId,
      focusedId: project.id,
      projects: [
        ...(previous?.boardId === boardId && previous?.userId === currentUserId
          ? (previous.projects || []).filter((item) => item.id !== project.id) : []),
        { id: project.id, hadTasks: tasks.some((task) => task.board_id === boardId && task.sub_group_id === project.id) },
      ],
    }))
  }

  const handleExportCSV = () => {
    if (!currentBoard || !tasks.length) return
    const rows = [['Task', 'Status', 'Assignee', 'Due Date', 'Priority', 'Group']]
    tasks.forEach((t) => {
      const group = groups.find((g) => g.id === t.group_id)
      const assignee = profiles.find((p) => p.id === t.assignee_id)
      rows.push([
        `"${(t.title || '').replace(/"/g, '""')}"`,
        t.status || '',
        assignee?.full_name || '',
        t.due_date || '',
        t.priority || '',
        group?.name || '',
      ])
    })
    const csv = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${currentBoard.name || 'tasks'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    addToast('Board exported as CSV')
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden dark:bg-[#1a1a1a]">
        <BoardSkeleton />
      </div>
    )
  }

  if (boardError) {
    return (
      <div role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
        Could not load this board. Refresh the page to try again.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden dark:bg-[#1a1a1a]">
      <TopBar
        activeView={activeView}
        onViewChange={setActiveView}
        onNewTask={handleNewTask}
        creatingTask={creatingTask || !currentUserId}
        onNewProject={currentBoard && currentUserId ? () => setProjectDialogOpen(true) : undefined}
        onExport={handleExportCSV}
        onAutomations={() => setAutomationsOpen(true)}
        filters={activeFilters}
        onFiltersChange={isMyTasks ? setMyTasksFilters : setFilters}
        filterOpen={filterOpen}
        onFilterToggle={() => setFilterOpen((p) => !p)}
        groupBy={activeGroupBy}
        onGroupByChange={isMyTasks ? setMyTasksGroupBy : setGroupBy}
      />

      {taskUnavailable && (
        <div role="alert" className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <p>This task is unavailable on this board. It may have been deleted, moved, or you may not have access.</p>
          <button type="button" onClick={handleClosePanel} className="shrink-0 rounded px-2 py-1 font-medium underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
            Dismiss task message
          </button>
        </div>
      )}

      {(activeView === 'Main Table' || activeView === 'My Tasks') && (
        <div className="flex-1 overflow-hidden flex flex-col">
          {groups.length === 0 ? (
            <EmptyBoard onCreate={handleNewTask} creating={creatingTask || !currentUserId} />
          ) : (
            <BoardTable
              filters={
                isMyTasks
                  ? { ...myTasksFilters, assigneeIds: [currentUserId] }
                  : activeFilters
              }
              onOpenTask={handleOpenTask}
              groupBy={activeGroupBy}
              creationAssigneeId={isMyTasks ? currentUserId : null}
              filterMyProjects={isMyTasks}
              newTaskId={newTaskId}
              selectedProjectIds={currentProjectNavigation?.projects?.map((project) => project.id)}
              focusProjectId={currentProjectNavigation?.focusedId}
              focusProjectRequestId={currentProjectNavigation}
            />
          )}
        </div>
      )}

      {activeView === 'Summary' && (
        <KanbanView filters={filters} onOpenTask={handleOpenTask} />
      )}

      {activeView === 'Calendar' && (
        <CalendarView filters={filters} onOpenTask={handleOpenTask} />
      )}

      {liveSelectedTask && (
        <TaskDetailPanel
          key={liveSelectedTask.id}
          task={liveSelectedTask}
          onClose={handleClosePanel}
          onUpdate={updateTask}
        />
      )}

      <AutomationsPanel open={automationsOpen} onClose={() => setAutomationsOpen(false)} />
      {projectDialogOpen && currentBoard && (
        <NewProjectDialog key={currentBoard.id} onClose={() => setProjectDialogOpen(false)} onSelectProject={handleSelectProject} />
      )}
    </div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────
function BoardSkeleton() {
  return (
    <div className="flex-1 flex flex-col">
      {/* Top bar skeleton */}
      <div className="h-14 border-b border-gray-200 dark:border-[#333] flex items-center px-4 gap-4">
        <div className="skeleton h-5 w-32 rounded" />
        <div className="skeleton h-7 w-48 rounded-lg" />
        <div className="flex-1" />
        <div className="skeleton h-8 w-20 rounded-lg" />
        <div className="skeleton h-8 w-24 rounded-lg" />
      </div>
      {/* Group skeleton */}
      <div className="p-4 space-y-4">
        {[1, 2].map((g) => (
          <div key={g}>
            <div className="flex items-center gap-2 mb-2">
              <div className="skeleton h-3 w-3 rounded-full" />
              <div className="skeleton h-4 w-28 rounded" />
              <div className="skeleton h-3 w-8 rounded" />
            </div>
            <div className="border border-gray-100 dark:border-[#333] rounded-lg overflow-hidden">
              {[1, 2, 3].map((r) => (
                <div key={r} className="flex items-center gap-3 px-4 h-9 border-b border-gray-100 dark:border-[#2a2a2a]">
                  <div className="skeleton h-3 w-3 rounded-full" />
                  <div className="skeleton h-3 flex-1 max-w-[280px] rounded" />
                  <div className="skeleton h-5 w-24 rounded-full" />
                  <div className="skeleton h-5 w-20 rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Empty board ───────────────────────────────────────────────────────
function EmptyBoard({ onCreate, creating }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-white dark:bg-[#1a1a1a]">
      <div className="text-center max-w-xs">
        {/* Illustration */}
        <svg
          width="96"
          height="96"
          viewBox="0 0 96 96"
          fill="none"
          className="mx-auto mb-5"
        >
          <rect x="8" y="20" width="80" height="56" rx="8" fill="#EBF3FF" />
          <rect x="8" y="20" width="80" height="56" rx="8" stroke="#0073ea" strokeWidth="2" strokeOpacity="0.3" />
          <rect x="20" y="34" width="56" height="6" rx="3" fill="#0073ea" fillOpacity="0.25" />
          <rect x="20" y="46" width="40" height="6" rx="3" fill="#0073ea" fillOpacity="0.15" />
          <rect x="20" y="58" width="48" height="6" rx="3" fill="#0073ea" fillOpacity="0.1" />
          <circle cx="72" cy="24" r="14" fill="#0073ea" />
          <path d="M68 24h8M72 20v8" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          No tasks yet
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          Create your first group to start organizing work in this board.
        </p>
        <button
          onClick={onCreate}
          disabled={creating}
          className="px-5 py-2.5 bg-primary-blue text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition disabled:opacity-50 shadow-sm"
        >
          {creating ? 'Creating…' : 'Add your first task →'}
        </button>
      </div>
    </div>
  )
}
