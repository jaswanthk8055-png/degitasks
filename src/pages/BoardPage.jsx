import { useState, useEffect } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { useBoard } from '../hooks/useBoard'
import { useBoardStore } from '../stores/useBoardStore'
import { useAuthStore } from '../stores/useAuthStore'
import { useToastStore } from '../stores/useToastStore'
import TopBar from '../components/layout/TopBar'
import BoardTable from '../components/board/BoardTable'
import KanbanView from '../components/board/KanbanView'
import CalendarView from '../components/board/CalendarView'
import TaskDetailPanel from '../components/board/TaskDetailPanel'
import AutomationsPanel from '../components/board/AutomationsPanel'

const EMPTY_FILTERS = { assigneeIds: [], statuses: [], priorities: [], dueThisWeek: false }

export default function BoardPage() {
  const { boardId } = useParams()
  const location = useLocation()
  const { loading } = useBoard(boardId)
  const { groups, tasks, createTask, createGroup, currentBoard, updateTask, profiles } =
    useBoardStore()
  const { profile } = useAuthStore()
  const { addToast } = useToastStore()

  const [activeView,       setActiveView]       = useState('Main Table')
  const [selectedTask,     setSelectedTask]     = useState(null)
  const [filters,          setFilters]          = useState(EMPTY_FILTERS)
  const [filterOpen,       setFilterOpen]       = useState(false)
  const [automationsOpen,  setAutomationsOpen]  = useState(false)
  const [groupBy,          setGroupBy]          = useState('group')

  // Update document title when board changes
  useEffect(() => {
    document.title = currentBoard?.name ? `${currentBoard.name} — DegiTasks` : 'DegiTasks'
    return () => { document.title = 'DegiTasks' }
  }, [currentBoard?.name])

  // Open a specific task if navigated here with state (from CommandPalette)
  useEffect(() => {
    if (!location.state?.openTaskId || loading) return
    const task = tasks.find((t) => t.id === location.state.openTaskId)
    if (task) setSelectedTask(task)
  }, [location.state?.openTaskId, loading, tasks.length])

  const liveSelectedTask = selectedTask
    ? tasks.find((t) => t.id === selectedTask.id) || selectedTask
    : null

  const handleNewTask = async () => {
    if (!currentBoard) return
    const firstGroup = groups[0]
    if (!firstGroup) {
      const newGroup = await createGroup(currentBoard.id, 'Tasks')
      await createTask(currentBoard.id, newGroup.id, profile?.id)
    } else {
      await createTask(currentBoard.id, firstGroup.id, profile?.id)
    }
    addToast('Task created')
  }

  const handleOpenTask = (task) => setSelectedTask(task)
  const handleClosePanel = () => setSelectedTask(null)

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

  return (
    <div className="flex flex-col h-full overflow-hidden dark:bg-[#1a1a1a]">
      <TopBar
        activeView={activeView}
        onViewChange={setActiveView}
        onNewTask={handleNewTask}
        onExport={handleExportCSV}
        onAutomations={() => setAutomationsOpen(true)}
        filters={filters}
        onFiltersChange={setFilters}
        filterOpen={activeView === 'My Tasks' ? false : filterOpen}
        onFilterToggle={activeView === 'My Tasks' ? null : () => setFilterOpen((p) => !p)}
        groupBy={groupBy}
        onGroupByChange={activeView === 'My Tasks' ? null : setGroupBy}
      />

      {(activeView === 'Main Table' || activeView === 'My Tasks') && (
        <div className="flex-1 overflow-hidden flex flex-col">
          {groups.length === 0 ? (
            <EmptyBoard boardId={boardId} profileId={profile?.id} />
          ) : (
            <BoardTable
              filters={
                activeView === 'My Tasks'
                  ? { assigneeIds: profile?.id ? [profile.id] : [], statuses: [], priorities: [], dueThisWeek: false }
                  : filters
              }
              onOpenTask={handleOpenTask}
              groupBy={activeView === 'My Tasks' ? 'group' : groupBy}
            />
          )}
        </div>
      )}

      {activeView === 'Kanban' && (
        <KanbanView onOpenTask={handleOpenTask} />
      )}

      {activeView === 'Calendar' && (
        <CalendarView onOpenTask={handleOpenTask} />
      )}

      {liveSelectedTask && (
        <TaskDetailPanel
          task={liveSelectedTask}
          onClose={handleClosePanel}
          onUpdate={updateTask}
        />
      )}

      <AutomationsPanel open={automationsOpen} onClose={() => setAutomationsOpen(false)} />
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
function EmptyBoard({ boardId, profileId }) {
  const { createGroup, createTask } = useBoardStore()
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    setCreating(true)
    try {
      const group = await createGroup(boardId, 'To Do')
      await createTask(boardId, group.id, profileId)
    } finally {
      setCreating(false)
    }
  }

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
          onClick={handleCreate}
          disabled={creating}
          className="px-5 py-2.5 bg-primary-blue text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition disabled:opacity-50 shadow-sm"
        >
          {creating ? 'Creating…' : 'Add your first task →'}
        </button>
      </div>
    </div>
  )
}
