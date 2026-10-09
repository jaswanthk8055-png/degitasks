import { useRef, useEffect, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useBoardStore } from '../../stores/useBoardStore'
import { useAuthStore, SUPER_USER_EMAIL } from '../../stores/useAuthStore'
import { COL_DEFAULTS } from './columnWidths'
import StatusPill from './StatusPill'
import PriorityPill from './PriorityPill'
import AssigneePicker from './AssigneePicker'
import DatePicker from './DatePicker'
import TaskProjectPicker from './TaskProjectPicker'
import { useSaveFeedback } from '../../hooks/useSaveFeedback'

export default function TaskRow({
  task,
  groupColor,
  profiles,
  onUpdate,
  onDelete,
  onOpenDetail,
  autoFocus = false,
  extraColumns = [],
  colWidths = COL_DEFAULTS,
  showCompletedDate = false,
}) {
  const titleInputRef = useRef(null)
  const titleButtonRef = useRef(null)
  const restoreTitleFocus = useRef(false)
  const [savingTitle, setSavingTitle] = useState(false)
  const { taskColumnValues, updateColumnValue, memberProfiles } = useBoardStore()
  const { user } = useAuthStore()
  const canEdit = user?.email === SUPER_USER_EMAIL
  const feedback = useSaveFeedback()
  const taskTitle = task.title || 'Untitled task'
  const handleUpdate = (taskId, updates) => feedback.save(() => onUpdate(taskId, updates))
  const committingTitle = useRef(false)
  const cancelTitle = useRef(false)

  const [editingTitle, setEditingTitle] = useState(autoFocus)
  const [titleValue, setTitleValue] = useState(task.title || '')
  const [previousAutoFocus, setPreviousAutoFocus] = useState(autoFocus)

  // A newly created row may receive its autofocus flag after it first mounts.
  if (autoFocus !== previousAutoFocus) {
    setPreviousAutoFocus(autoFocus)
    if (autoFocus) {
      setTitleValue(task.title || '')
      setEditingTitle(true)
    }
  }

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  useEffect(() => {
    if (editingTitle && titleInputRef.current) titleInputRef.current.focus()
  }, [editingTitle])

  const commitTitle = async () => {
    if (cancelTitle.current || committingTitle.current) return
    const trimmed = titleValue.trim()
    const finish = () => {
      setEditingTitle(false)
      if (restoreTitleFocus.current) requestAnimationFrame(() => titleButtonRef.current?.focus())
      restoreTitleFocus.current = false
    }
    if (!trimmed || trimmed === task.title) { finish(); return }
    committingTitle.current = true
    setSavingTitle(true)
    const saved = await handleUpdate(task.id, { title: trimmed })
    committingTitle.current = false
    setSavingTitle(false)
    if (saved) finish()
  }

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); restoreTitleFocus.current = true; commitTitle() }
    if (e.key === 'Escape') {
      e.stopPropagation()
      cancelTitle.current = true
      setTitleValue(task.title || '')
      setEditingTitle(false)
      requestAnimationFrame(() => titleButtonRef.current?.focus())
    }
  }

  const colValues = taskColumnValues[task.id] || {}

  // Helper: cell style for fixed-width columns
  const fw = (key) => ({ width: colWidths[key] ?? COL_DEFAULTS[key] })

  return (
    <div
      ref={setNodeRef}
      data-task-id={task.id}
      data-board-id={task.board_id}
      data-save-state={feedback.state}
      style={style}
      className={`flex items-stretch border-b border-border-color dark:border-[#2a2a2a] group/row transition-colors duration-150 ${
        isDragging
          ? 'shadow-lg z-10 bg-white dark:bg-[#1e1e1e]'
          : 'bg-white dark:bg-[#1a1a1a] hover:bg-row-hover dark:hover:bg-[#252525]'
      }`}
    >
      {/* Group color bar */}
      <div className="w-0.5 flex-shrink-0" style={{ backgroundColor: groupColor }} />

      {/* Drag handle — fixed 40px */}
      <div className="w-10 h-9 flex items-center justify-center flex-shrink-0">
        {canEdit && (
          <button
            {...attributes}
            {...listeners}
            aria-label={`Reorder "${taskTitle}"`}
            className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing transition opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:ring-2 focus-visible:ring-primary-blue"
          >
            <svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="8" cy="5" r="1.5" /><circle cx="16" cy="5" r="1.5" />
              <circle cx="8" cy="12" r="1.5" /><circle cx="16" cy="12" r="1.5" />
              <circle cx="8" cy="19" r="1.5" /><circle cx="16" cy="19" r="1.5" />
            </svg>
          </button>
        )}
      </div>

      {/* Keep inline naming and a separate, keyboard-accessible details action. */}
      <div
        className="flex-shrink-0 flex items-center px-2 h-9 border-r border-border-color dark:border-[#2a2a2a] overflow-hidden"
        style={{ width: colWidths.title ?? COL_DEFAULTS.title }}
      >
        {editingTitle ? (
          <input
            ref={titleInputRef}
            aria-label="Task name"
            data-field="title"
            readOnly={savingTitle}
            aria-busy={savingTitle}
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={handleTitleKeyDown}
            className="flex-1 min-w-0 text-sm bg-transparent outline-none border-b border-primary-blue text-gray-900 dark:text-gray-100 py-0.5"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <button
            ref={titleButtonRef}
            type="button"
            aria-label={`Edit task name: ${taskTitle}`}
            className="flex-1 min-w-0 text-left text-sm text-gray-900 dark:text-gray-100 hover:text-primary-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-blue transition truncate"
            onClick={() => {
              cancelTitle.current = false
              setTitleValue(task.title || '')
              setEditingTitle(true)
            }}
          >
            {task.title?.trim() ? task.title : <span className="text-gray-400 dark:text-gray-600 italic text-xs">Click to name</span>}
          </button>
        )}
        <TaskProjectPicker task={task} compact />
        <button type="button"
          onClick={(event) => { event.stopPropagation(); onOpenDetail?.(task) }}
          className="flex-shrink-0 ml-1 text-gray-300 hover:text-primary-blue opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:ring-2 focus-visible:ring-primary-blue transition p-0.5 rounded"
          title="Open details" aria-label={`Open details for "${taskTitle}"`}>
          <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <span role="status" aria-live="polite" aria-atomic="true" title={feedback.message}
          className={`ml-1 text-[10px] flex-shrink-0 ${feedback.state === 'error' ? 'text-red-600' : 'text-gray-400'}`}>
          {feedback.state === 'error' ? 'Save failed' : feedback.message}
        </span>
      </div>

      {/* Status */}
      <div className="flex-shrink-0 flex items-center px-1 h-9 border-r border-border-color dark:border-[#2a2a2a]" style={fw('status')}>
        <StatusPill status={task.status} statusColor={task.status_color} taskId={task.id} taskTitle={taskTitle} onUpdate={handleUpdate} />
      </div>

      {/* Assignee */}
      <div className="flex-shrink-0 flex items-center px-2 h-9 border-r border-border-color dark:border-[#2a2a2a]" style={fw('assignee')}>
        <AssigneePicker assigneeIds={task.assignee_ids ?? (task.assignee_id ? [task.assignee_id] : [])} profiles={profiles} assignableProfiles={memberProfiles} taskId={task.id} taskTitle={taskTitle} onUpdate={handleUpdate} />
      </div>

      {/* Due Date */}
      <div className="flex-shrink-0 flex items-center px-2 h-9 border-r border-border-color dark:border-[#2a2a2a]" style={fw('dueDate')}>
        <DatePicker dueDate={task.due_date} taskId={task.id} taskTitle={taskTitle} onUpdate={handleUpdate} />
      </div>

      {/* Completed Date */}
      {showCompletedDate && (
        <div className="flex-shrink-0 flex items-center px-2 h-9 border-r border-border-color dark:border-[#2a2a2a]" style={fw('completedDate')}>
          <DatePicker
            dueDate={task.completed_date}
            taskId={task.id}
            taskTitle={taskTitle}
            onUpdate={handleUpdate}
            field="completed_date"
            label="Completed date"
            highlightOverdue={false}
          />
        </div>
      )}

      {/* Priority */}
      <div className="flex-shrink-0 flex items-center px-1 h-9 border-r border-border-color dark:border-[#2a2a2a]" style={fw('priority')}>
        <PriorityPill priority={task.priority} taskId={task.id} taskTitle={taskTitle} onUpdate={handleUpdate} />
      </div>

      {/* Custom columns */}
      {extraColumns.map((col) => {
        const colKey = `custom_${col.id}`
        const width  = colWidths[colKey] ?? 112
        return (
          <CustomColumnCell
            key={col.id}
            column={col}
            value={colValues[col.id]}
            width={width}
            taskTitle={taskTitle}
            onUpdate={(val) => feedback.save(() => updateColumnValue(task.id, col.id, val))}
          />
        )
      })}

      {/* Delete button — all users can delete tasks */}
      <div className="w-8 h-9 flex items-center justify-center flex-shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(task.id) }}
          className="text-gray-300 hover:text-red-400 transition opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:ring-2 focus-visible:ring-primary-blue"
          title="Delete task"
          aria-label={`Delete "${taskTitle}"`}
        >
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── Custom column cell ────────────────────────────────────────────────────────
function CustomColumnCell({ column, value, width, onUpdate, taskTitle }) {
  const [editing,  setEditing]  = useState(false)
  const [localVal, setLocalVal] = useState('')
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const cancelled = useRef(false)
  const buttonRef = useRef(null)
  const restoreFocus = useRef(false)

  const startEdit = () => { cancelled.current = false; setLocalVal(value ?? ''); setEditing(true) }
  const commitEdit = async () => {
    if (pending.current || cancelled.current) return
    pending.current = true
    setSaving(true)
    const saved = await onUpdate(localVal)
    pending.current = false
    setSaving(false)
    if (saved !== false) {
      setEditing(false)
      if (restoreFocus.current) requestAnimationFrame(() => buttonRef.current?.focus())
    }
    restoreFocus.current = false
  }
  const displayValue = value != null ? String(value) : ''

  return (
    <div
      className="flex-shrink-0 flex items-center px-2 h-9 border-r border-border-color dark:border-[#2a2a2a] cursor-text overflow-hidden"
      style={{ width }}
      data-field={column.id}
    >
      {editing ? (
        column.type === 'checkbox' ? (
          <input
            type="checkbox"
            aria-label={`${column.label} for "${taskTitle}"`}
            checked={!!value}
            onChange={(e) => { onUpdate(e.target.checked); setEditing(false) }}
            autoFocus
            className="accent-primary-blue"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <input
            autoFocus
            type={column.type === 'number' ? 'number' : column.type === 'date' ? 'date' : 'text'}
            aria-label={`${column.label} for "${taskTitle}"`}
            readOnly={saving}
            aria-busy={saving}
            value={localVal}
            onChange={(e) => setLocalVal(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); restoreFocus.current = true; commitEdit() }
              if (e.key === 'Escape') {
                e.stopPropagation()
                cancelled.current = true
                setEditing(false)
                requestAnimationFrame(() => buttonRef.current?.focus())
              }
            }}
            className="w-full text-xs bg-transparent outline-none border-b border-primary-blue text-gray-900 dark:text-gray-100"
            onClick={(e) => e.stopPropagation()}
          />
        )
      ) : column.type === 'checkbox' ? (
        <input
          type="checkbox"
          aria-label={`${column.label} for "${taskTitle}"`}
          checked={!!value}
          onChange={(e) => onUpdate(e.target.checked)}
          className="accent-primary-blue"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <button ref={buttonRef} type="button" onClick={startEdit} aria-label={`Edit ${column.label} for "${taskTitle}": ${displayValue || 'Empty'}`}
          className="text-left text-xs text-gray-600 dark:text-gray-400 truncate w-full focus-visible:ring-2 focus-visible:ring-primary-blue">
          {displayValue || <span className="text-gray-300 dark:text-gray-600">—</span>}
        </button>
      )}
    </div>
  )
}
