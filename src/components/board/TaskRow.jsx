import { useRef, useEffect, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useBoardStore } from '../../stores/useBoardStore'
import { useAuthStore, SUPER_USER_EMAIL } from '../../stores/useAuthStore'
import { COL_DEFAULTS } from './BoardTable'
import StatusPill from './StatusPill'
import PriorityPill from './PriorityPill'
import AssigneePicker from './AssigneePicker'
import DatePicker from './DatePicker'

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
}) {
  const titleInputRef = useRef(null)
  const { taskColumnValues, updateColumnValue } = useBoardStore()
  const { user } = useAuthStore()
  const canEdit = user?.email === SUPER_USER_EMAIL

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(task.title || '')

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  useEffect(() => {
    if (autoFocus) { setEditingTitle(true) }
  }, [autoFocus])

  useEffect(() => {
    if (editingTitle && titleInputRef.current) titleInputRef.current.focus()
  }, [editingTitle])

  // Keep local title in sync if task updates from realtime
  useEffect(() => {
    if (!editingTitle) setTitleValue(task.title || '')
  }, [task.title, editingTitle])

  const commitTitle = () => {
    setEditingTitle(false)
    const trimmed = titleValue.trim()
    if (trimmed !== task.title) onUpdate(task.id, { title: trimmed || task.title })
  }

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitTitle() }
    if (e.key === 'Escape') { setTitleValue(task.title || ''); setEditingTitle(false) }
  }

  const colValues = taskColumnValues[task.id] || {}

  // Helper: cell style for fixed-width columns
  const fw = (key) => ({ width: colWidths[key] ?? COL_DEFAULTS[key] })

  return (
    <div
      ref={setNodeRef}
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
            className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing transition opacity-0 group-hover/row:opacity-100"
            tabIndex={-1}
          >
            <svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="8" cy="5" r="1.5" /><circle cx="16" cy="5" r="1.5" />
              <circle cx="8" cy="12" r="1.5" /><circle cx="16" cy="12" r="1.5" />
              <circle cx="8" cy="19" r="1.5" /><circle cx="16" cy="19" r="1.5" />
            </svg>
          </button>
        )}
      </div>

      {/* Task title — click to edit inline; click ">" to open detail panel */}
      <div
        className="flex-shrink-0 flex items-center px-2 h-9 border-r border-border-color dark:border-[#2a2a2a] overflow-hidden"
        style={{ width: colWidths.title ?? COL_DEFAULTS.title }}
      >
        {editingTitle ? (
          <input
            ref={titleInputRef}
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={handleTitleKeyDown}
            className="flex-1 min-w-0 text-sm bg-transparent outline-none border-b border-primary-blue text-gray-900 dark:text-gray-100 py-0.5"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="flex-1 min-w-0 text-sm text-gray-900 dark:text-gray-100 hover:text-primary-blue transition truncate cursor-text"
            onClick={() => setEditingTitle(true)}
          >
            {task.title || <span className="text-gray-400 dark:text-gray-600 italic text-xs">Click to name</span>}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onOpenDetail?.(task) }}
          className="flex-shrink-0 ml-1 text-gray-300 hover:text-primary-blue opacity-0 group-hover/row:opacity-100 transition p-0.5 rounded"
          title="Open details"
          tabIndex={-1}
        >
          <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Status */}
      <div className="flex-shrink-0 flex items-center px-1 h-9 border-r border-border-color dark:border-[#2a2a2a]" style={fw('status')}>
        <StatusPill status={task.status} statusColor={task.status_color} taskId={task.id} onUpdate={onUpdate} />
      </div>

      {/* Assignee */}
      <div className="flex-shrink-0 flex items-center px-2 h-9 border-r border-border-color dark:border-[#2a2a2a]" style={fw('assignee')}>
        <AssigneePicker assigneeId={task.assignee_id} profiles={profiles} taskId={task.id} onUpdate={onUpdate} canEdit={canEdit} />
      </div>

      {/* Due Date */}
      <div className="flex-shrink-0 flex items-center px-2 h-9 border-r border-border-color dark:border-[#2a2a2a]" style={fw('dueDate')}>
        <DatePicker dueDate={task.due_date} taskId={task.id} onUpdate={onUpdate} />
      </div>

      {/* Priority */}
      <div className="flex-shrink-0 flex items-center px-1 h-9 border-r border-border-color dark:border-[#2a2a2a]" style={fw('priority')}>
        <PriorityPill priority={task.priority} taskId={task.id} onUpdate={onUpdate} />
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
            taskId={task.id}
            width={width}
            canEdit={canEdit}
            onUpdate={(val) => updateColumnValue(task.id, col.id, val)}
          />
        )
      })}

      {/* Delete button — all users can delete tasks */}
      <div className="w-8 h-9 flex items-center justify-center flex-shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(task.id) }}
          className="text-gray-300 hover:text-red-400 transition opacity-0 group-hover/row:opacity-100"
          title="Delete task"
          tabIndex={-1}
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
function CustomColumnCell({ column, value, taskId, width, onUpdate, canEdit = true }) {
  const [editing,  setEditing]  = useState(false)
  const [localVal, setLocalVal] = useState('')

  const startEdit = () => { setLocalVal(value ?? ''); setEditing(true) }
  const commitEdit = () => { setEditing(false); onUpdate(localVal) }
  const displayValue = value != null ? String(value) : ''

  return (
    <div
      className="flex-shrink-0 flex items-center px-2 h-9 border-r border-border-color dark:border-[#2a2a2a] cursor-text overflow-hidden"
      style={{ width }}
      onClick={startEdit}
    >
      {editing ? (
        column.type === 'checkbox' ? (
          <input
            type="checkbox"
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
            value={localVal}
            onChange={(e) => setLocalVal(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false) }}
            className="w-full text-xs bg-transparent outline-none border-b border-primary-blue text-gray-900 dark:text-gray-100"
            onClick={(e) => e.stopPropagation()}
          />
        )
      ) : column.type === 'checkbox' ? (
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onUpdate(e.target.checked)}
          className="accent-primary-blue"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="text-xs text-gray-600 dark:text-gray-400 truncate w-full">
          {displayValue || <span className="text-gray-300 dark:text-gray-600">—</span>}
        </span>
      )}
    </div>
  )
}
