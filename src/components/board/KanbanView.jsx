import { useState, useMemo } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core'
import { useBoardStore } from '../../stores/useBoardStore'
import { useAuthStore } from '../../stores/useAuthStore'
import { useToastStore } from '../../stores/useToastStore'
import { STATUS_OPTIONS, PRIORITY_OPTIONS, formatDueDate } from '../../lib/utils'
import Avatar from '../ui/Avatar'

// ── Droppable column ────────────────────────────────────────────────
function KanbanColumn({ status, color, tasks, profiles, onOpenTask, onAddTask }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div className="flex flex-col w-[272px] flex-shrink-0">
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 rounded-t-lg"
        style={{ borderBottom: `3px solid ${color}`, backgroundColor: color + '18' }}
      >
        <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex-1 truncate">{status}</span>
        <span className="text-xs font-semibold text-white px-2 py-0.5 rounded-full" style={{ backgroundColor: color }}>
          {tasks.length}
        </span>
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        className={`flex-1 flex flex-col gap-2 min-h-[120px] rounded-b-lg p-2 transition-colors ${
          isOver ? 'bg-blue-50 dark:bg-blue-950/20 ring-2 ring-primary-blue/30' : 'bg-gray-50/60 dark:bg-white/[0.03]'
        }`}
      >
        {tasks.map((task) => (
          <KanbanCard key={task.id} task={task} profiles={profiles} onOpenTask={onOpenTask} />
        ))}

        <button
          onClick={() => onAddTask(status, color)}
          className="flex items-center gap-1.5 px-2.5 py-2 text-xs text-gray-500 dark:text-gray-500 hover:text-primary-blue hover:bg-white dark:hover:bg-white/10 rounded-lg transition mt-auto"
        >
          <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
          Add task
        </button>
      </div>
    </div>
  )
}

// ── Draggable card ───────────────────────────────────────────────────
function KanbanCard({ task, profiles, onOpenTask }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id })
  const assignee = profiles.find((p) => p.id === task.assignee_id)
  const priorityOpt = PRIORITY_OPTIONS.find((p) => p.label === task.priority)

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#333] rounded-lg p-3 cursor-pointer select-none transition-shadow ${
        isDragging ? 'opacity-40 shadow-lg' : 'hover:shadow-md hover:border-gray-300 dark:hover:border-[#444]'
      }`}
      onClick={() => !isDragging && onOpenTask(task)}
    >
      <div className="flex items-start gap-2 mb-2">
        <p className="text-sm text-gray-800 dark:text-gray-200 font-medium leading-snug flex-1 min-w-0 break-words">
          {task.title || <span className="text-gray-400 italic text-xs">Untitled</span>}
        </p>
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="text-gray-300 hover:text-gray-500 dark:hover:text-gray-400 cursor-grab active:cursor-grabbing flex-shrink-0 mt-0.5 p-0.5"
          onClick={(e) => e.stopPropagation()}
          tabIndex={-1}
        >
          <svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="8" cy="5" r="1.5" /><circle cx="16" cy="5" r="1.5" />
            <circle cx="8" cy="12" r="1.5" /><circle cx="16" cy="12" r="1.5" />
            <circle cx="8" cy="19" r="1.5" /><circle cx="16" cy="19" r="1.5" />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {assignee && <Avatar name={assignee.full_name} color={assignee.avatar_color} size="xs" />}
        {task.due_date && (
          <span className="text-[11px] text-gray-400">{formatDueDate(task.due_date)}</span>
        )}
        {task.priority && (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-white ml-auto flex-shrink-0"
            style={{ backgroundColor: priorityOpt?.color || '#c4c4c4' }}
          >
            {task.priority}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Overlay ghost card ───────────────────────────────────────────────
function GhostCard({ task }) {
  return (
    <div className="bg-white dark:bg-[#1e1e1e] border border-primary-blue rounded-lg p-3 shadow-2xl w-[272px] opacity-90 rotate-1">
      <p className="text-sm text-gray-800 dark:text-gray-200 font-medium truncate">{task.title || 'Untitled'}</p>
    </div>
  )
}

// ── Main export ──────────────────────────────────────────────────────
export default function KanbanView({ onOpenTask }) {
  const { tasks, groups, profiles, createTask, updateTask, currentBoard } = useBoardStore()
  const { profile } = useAuthStore()
  const { addToast } = useToastStore()
  const [activeDragTask, setActiveDragTask] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const tasksByStatus = useMemo(() => {
    const map = {}
    STATUS_OPTIONS.forEach((s) => { map[s.label] = [] })
    tasks.forEach((t) => {
      const key = t.status || 'Not Started'
      if (map[key]) map[key].push(t)
      else map['Not Started'].push(t)
    })
    return map
  }, [tasks])

  const handleDragStart = ({ active }) => {
    setActiveDragTask(tasks.find((t) => t.id === active.id) || null)
  }

  const handleDragEnd = async ({ active, over }) => {
    setActiveDragTask(null)
    if (!over) return
    const task = tasks.find((t) => t.id === active.id)
    if (!task || over.id === task.status) return
    const newStatus = String(over.id)
    const statusOpt = STATUS_OPTIONS.find((s) => s.label === newStatus)
    await updateTask(task.id, { status: newStatus, status_color: statusOpt?.color || '#c4c4c4' })
    addToast(`Status changed to "${newStatus}"`)
  }

  const handleAddTask = async (status, color) => {
    if (!currentBoard) return
    const firstGroup = groups[0]
    if (!firstGroup) return
    const task = await createTask(currentBoard.id, firstGroup.id, profile?.id)
    if (task) {
      await updateTask(task.id, { status, status_color: color })
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex-1 overflow-auto scrollbar-thin bg-gray-50/50 dark:bg-[#111] p-5">
        <div className="flex gap-3 h-full min-h-[400px]">
          {STATUS_OPTIONS.map((s) => (
            <KanbanColumn
              key={s.label}
              status={s.label}
              color={s.color}
              tasks={tasksByStatus[s.label] || []}
              profiles={profiles}
              onOpenTask={onOpenTask}
              onAddTask={handleAddTask}
            />
          ))}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDragTask ? <GhostCard task={activeDragTask} /> : null}
      </DragOverlay>
    </DndContext>
  )
}
