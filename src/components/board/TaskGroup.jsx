import { useState, useRef, useEffect } from 'react'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useBoardStore } from '../../stores/useBoardStore'
import { useAuthStore, SUPER_USER_EMAIL } from '../../stores/useAuthStore'
import { GROUP_COLORS } from '../../lib/utils'
import TaskRow from './TaskRow'
import Modal from '../ui/Modal'

const COLUMN_TYPES = [
  { type: 'text',     label: 'Text',     icon: 'T' },
  { type: 'number',   label: 'Number',   icon: '#' },
  { type: 'date',     label: 'Date',     icon: '📅' },
  { type: 'checkbox', label: 'Checkbox', icon: '☑' },
]

export default function TaskGroup({
  group,
  tasks,
  subGroups = [],
  profiles,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onUpdateGroupName,
  onDeleteGroup,
  onAddSubGroup,
  onUpdateSubGroup,
  onDeleteSubGroup,
  onOpenTask,
  colWidths,
  onWidthChange,
  isVirtual = false,
  hideAddTask = false,
}) {
  const { boardColumns, createBoardColumn, updateBoardColumn, deleteBoardColumn, updateGroup, currentBoard } = useBoardStore()
  const { user } = useAuthStore()
  const canEdit = !isVirtual && user?.email === SUPER_USER_EMAIL
  const storageKey = `group-collapsed-${group.id}`
  const [collapsed,           setCollapsed]           = useState(() => localStorage.getItem(storageKey) === 'true')
  const [editingName,         setEditingName]         = useState(false)
  const [nameValue,           setNameValue]           = useState(group.name)
  const [newTaskId,           setNewTaskId]           = useState(null)
  const [addColModal,         setAddColModal]         = useState(false)
  const [confirmDelete,       setConfirmDelete]       = useState(false)
  const [newColLabel,         setNewColLabel]         = useState('')
  const [newColType,          setNewColType]          = useState('text')
  const [savingCol,           setSavingCol]           = useState(false)
  const [colContextMenu,      setColContextMenu]      = useState(null)
  const [renamingColId,       setRenamingColId]       = useState(null)
  const [renameValue,         setRenameValue]         = useState('')
  const [colorPickerOpen,     setColorPickerOpen]     = useState(false)
  // Sub-group state
  const [collapsedSGs,        setCollapsedSGs]        = useState({})
  const [addingSubGroup,      setAddingSubGroup]      = useState(false)
  const [newSGName,           setNewSGName]           = useState('')
  const [editingSGId,         setEditingSGId]         = useState(null)
  const [editingSGName,       setEditingSGName]       = useState('')
  const contextMenuRef    = useRef(null)
  const colorPickerRef    = useRef(null)

  const visibleColumns = boardColumns.filter((c) => !c.hidden)

  // Close context menu on outside click
  useEffect(() => {
    if (!colContextMenu) return
    const handler = (e) => {
      if (!contextMenuRef.current?.contains(e.target)) setColContextMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [colContextMenu])

  // Close color picker on outside click
  useEffect(() => {
    if (!colorPickerOpen) return
    const handler = (e) => {
      if (!colorPickerRef.current?.contains(e.target)) setColorPickerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [colorPickerOpen])

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(storageKey, String(next))
  }

  const commitName = () => {
    setEditingName(false)
    if (nameValue.trim() && nameValue !== group.name) onUpdateGroupName(group.id, nameValue.trim())
    else setNameValue(group.name)
  }

  const handleAddTask = async (subGroupId = null) => {
    const task = await onAddTask(group.id, subGroupId)
    if (task) {
      setNewTaskId(task.id)
      if (collapsed) { setCollapsed(false); localStorage.setItem(storageKey, 'false') }
      if (subGroupId) setCollapsedSGs((prev) => ({ ...prev, [subGroupId]: false }))
    }
  }

  const toggleSG = (sgId) => setCollapsedSGs((prev) => ({ ...prev, [sgId]: !prev[sgId] }))

  const handleAddSubGroup = async (e) => {
    e.preventDefault()
    if (!newSGName.trim() || !onAddSubGroup) return
    await onAddSubGroup(newSGName.trim())
    setNewSGName('')
    setAddingSubGroup(false)
  }

  const commitSGName = async (sg) => {
    const trimmed = editingSGName.trim()
    if (trimmed && trimmed !== sg.name) await onUpdateSubGroup?.(sg.id, { name: trimmed })
    setEditingSGId(null)
  }

  const ungroupedTasks = tasks.filter((t) => !t.sub_group_id)

  const handleAddColumn = async (e) => {
    e.preventDefault()
    if (!newColLabel.trim() || !currentBoard) return
    setSavingCol(true)
    try {
      await createBoardColumn(currentBoard.id, newColLabel.trim(), newColType)
      setAddColModal(false); setNewColLabel(''); setNewColType('text')
    } finally { setSavingCol(false) }
  }

  const handleColContextMenu = (e, columnId) => {
    e.preventDefault()
    const col = boardColumns.find((c) => c.id === columnId)
    setColContextMenu({ columnId, x: e.clientX, y: e.clientY })
    setRenameValue(col?.label || '')
  }

  const handleRenameCol = async (columnId) => {
    if (!renameValue.trim()) return
    await updateBoardColumn(columnId, { label: renameValue.trim() })
    setRenamingColId(null); setColContextMenu(null)
  }

  const handleHideCol   = async (id) => { await updateBoardColumn(id, { hidden: true });  setColContextMenu(null) }
  const handleDeleteCol = async (id) => { await deleteBoardColumn(id);                    setColContextMenu(null) }

  return (
    <div className="mb-2">
      {/* ── Group header ── */}
      <div className="flex items-stretch group/grphdr" style={{ borderLeft: `3px solid ${group.color}` }}>
        <div className="flex items-center gap-2 px-3 py-2 flex-1">
          <button onClick={toggleCollapsed} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition">
            <svg
              width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
              className={`transition-transform duration-150 ${collapsed ? '-rotate-90' : ''}`}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Color dot */}
          {canEdit ? (
            <div className="relative flex-shrink-0" ref={colorPickerRef}>
              <button
                onClick={() => setColorPickerOpen((p) => !p)}
                className="w-3 h-3 rounded-full hover:ring-2 hover:ring-offset-1 transition-shadow flex-shrink-0"
                style={{ backgroundColor: group.color, outlineColor: group.color }}
                title="Change group color"
              />
              {colorPickerOpen && (
                <div className="absolute left-0 top-5 bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#444] rounded-lg shadow-xl p-2 z-[9999] flex flex-wrap gap-1.5 w-[132px]">
                  {GROUP_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => { updateGroup(group.id, { color: c }); setColorPickerOpen(false) }}
                      className="w-5 h-5 rounded-full transition-transform hover:scale-110 flex-shrink-0"
                      style={{
                        backgroundColor: c,
                        outline: c === group.color ? `2px solid ${c}` : 'none',
                        outlineOffset: '2px',
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
          )}

          {editingName ? (
            <input
              autoFocus
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName()
                if (e.key === 'Escape') { setNameValue(group.name); setEditingName(false) }
              }}
              className="text-sm font-bold border-b border-primary-blue outline-none bg-transparent"
              style={{ color: group.color }}
            />
          ) : (
            <span
              onDoubleClick={canEdit ? () => setEditingName(true) : undefined}
              className="text-sm font-bold select-none cursor-default"
              style={{ color: group.color }}
            >
              {group.name}
            </span>
          )}

          <span className="text-xs text-gray-400 dark:text-gray-600 ml-1">
            {tasks.length} {tasks.length === 1 ? 'item' : 'items'}
          </span>

          {/* Delete group button — only for super user */}
          {canEdit && onDeleteGroup && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="ml-2 opacity-0 group-hover/grphdr:opacity-100 transition-opacity p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
              title="Delete group"
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      {!collapsed && (
        <div className="group-body-enter">
          <ColumnHeaders
            columns={visibleColumns}
            onAddColumn={() => setAddColModal(true)}
            onColContextMenu={handleColContextMenu}
            renamingColId={renamingColId}
            renameValue={renameValue}
            onRenameValueChange={setRenameValue}
            onRenameSubmit={handleRenameCol}
            onRenameCancel={() => setRenamingColId(null)}
            colWidths={colWidths}
            onWidthChange={onWidthChange}
          />

          <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {/* Ungrouped tasks (no sub_group_id) */}
            {ungroupedTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                groupColor={group.color}
                profiles={profiles}
                onUpdate={onUpdateTask}
                onDelete={onDeleteTask}
                onOpenDetail={onOpenTask}
                autoFocus={task.id === newTaskId}
                extraColumns={visibleColumns}
                colWidths={colWidths}
              />
            ))}

            {/* Sub-group sections */}
            {subGroups.map((sg) => {
              const sgTasks = tasks.filter((t) => t.sub_group_id === sg.id)
              const sgCollapsed = !!collapsedSGs[sg.id]
              return (
                <div key={sg.id}>
                  {/* Sub-group header */}
                  <div
                    className="flex items-center gap-1.5 pl-6 pr-3 h-8 bg-gray-50 dark:bg-[#1d1d1d] border-b border-border-color dark:border-[#2a2a2a] group/sghdr"
                    style={{ borderLeft: `3px solid ${group.color}` }}
                  >
                    <button onClick={() => toggleSG(sg.id)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition flex-shrink-0">
                      <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                        className={`transition-transform duration-150 ${sgCollapsed ? '-rotate-90' : ''}`}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <div className="w-2 h-2 rounded-sm flex-shrink-0 opacity-60" style={{ backgroundColor: group.color }} />

                    {editingSGId === sg.id ? (
                      <input
                        autoFocus
                        value={editingSGName}
                        onChange={(e) => setEditingSGName(e.target.value)}
                        onBlur={() => commitSGName(sg)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitSGName(sg)
                          if (e.key === 'Escape') setEditingSGId(null)
                        }}
                        className="text-xs font-semibold border-b border-primary-blue outline-none bg-transparent text-gray-700 dark:text-gray-200 flex-1"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        onDoubleClick={!isVirtual ? () => { setEditingSGId(sg.id); setEditingSGName(sg.name) } : undefined}
                        className="text-xs font-semibold text-gray-600 dark:text-gray-300 flex-1 cursor-default select-none truncate"
                        title={!isVirtual ? 'Double-click to rename' : undefined}
                      >
                        {sg.name}
                      </span>
                    )}

                    <span className="text-[10px] text-gray-400 dark:text-gray-600 flex-shrink-0">{sgTasks.length}</span>

                    {!isVirtual && (
                      <button
                        onClick={() => onDeleteSubGroup?.(sg.id)}
                        className="opacity-0 group-hover/sghdr:opacity-100 transition-opacity p-0.5 rounded text-gray-400 hover:text-red-500 flex-shrink-0"
                        title="Delete section"
                      >
                        <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Sub-group tasks */}
                  {!sgCollapsed && (
                    <>
                      {sgTasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          groupColor={group.color}
                          profiles={profiles}
                          onUpdate={onUpdateTask}
                          onDelete={onDeleteTask}
                          onOpenDetail={onOpenTask}
                          autoFocus={task.id === newTaskId}
                          extraColumns={visibleColumns}
                          colWidths={colWidths}
                        />
                      ))}
                      {/* Add task inside sub-group */}
                      {!isVirtual && !hideAddTask && (
                        <div
                          className="flex items-center gap-2 pl-8 pr-4 h-8 hover:bg-row-hover dark:hover:bg-[#252525] transition cursor-pointer group/sgadd border-b border-border-color dark:border-[#2a2a2a]"
                          style={{ borderLeft: `3px solid ${group.color}` }}
                          onClick={() => handleAddTask(sg.id)}
                        >
                          <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-gray-300 group-hover/sgadd:text-primary-blue transition flex-shrink-0">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                          </svg>
                          <span className="text-[11px] text-gray-300 group-hover/sgadd:text-primary-blue transition">+ Add task</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </SortableContext>

          {/* Add sub-group input */}
          {!isVirtual && addingSubGroup ? (
            <form
              onSubmit={handleAddSubGroup}
              className="flex items-center gap-2 pl-6 pr-3 h-8 border-b border-border-color dark:border-[#2a2a2a]"
              style={{ borderLeft: `3px solid ${group.color}` }}
            >
              <div className="w-2 h-2 rounded-sm flex-shrink-0 opacity-40" style={{ backgroundColor: group.color }} />
              <input
                autoFocus
                value={newSGName}
                onChange={(e) => setNewSGName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setAddingSubGroup(false); setNewSGName('') } }}
                placeholder="Section name…"
                className="flex-1 text-xs bg-transparent outline-none border-b border-primary-blue text-gray-700 dark:text-gray-200 py-0.5"
              />
              <button type="submit" disabled={!newSGName.trim()} className="text-[10px] text-primary-blue font-medium disabled:opacity-40">Add</button>
              <button type="button" onClick={() => { setAddingSubGroup(false); setNewSGName('') }} className="text-[10px] text-gray-400">Cancel</button>
            </form>
          ) : !isVirtual ? (
            <div
              className="flex items-center gap-2 pl-6 pr-3 h-7 hover:bg-gray-50 dark:hover:bg-[#1d1d1d] transition cursor-pointer group/addsg border-b border-border-color dark:border-[#2a2a2a] opacity-0 hover:opacity-100 focus-within:opacity-100"
              style={{ borderLeft: `3px solid ${group.color}` }}
              onClick={() => setAddingSubGroup(true)}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
            >
              <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-gray-300 group-hover/addsg:text-gray-500 transition flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
              </svg>
              <span className="text-[11px] text-gray-300 group-hover/addsg:text-gray-500 transition">+ Add section</span>
            </div>
          ) : null}

          {/* Add task to group (ungrouped) */}
          {!isVirtual && !hideAddTask && (
            <div
              className="flex items-center gap-2 px-4 h-9 hover:bg-row-hover dark:hover:bg-[#252525] transition cursor-pointer group/add border-b border-border-color dark:border-[#333]"
              style={{ borderLeft: `3px solid ${group.color}` }}
              onClick={() => handleAddTask(null)}
            >
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-gray-400 group-hover/add:text-primary-blue transition flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
              </svg>
              <span className="text-xs text-gray-400 group-hover/add:text-primary-blue transition">+ Add task</span>
            </div>
          )}

          {/* Summary */}
          <div
            className="flex items-center px-4 py-1.5 bg-gray-50 dark:bg-[#161616] border-b border-border-color dark:border-[#333]"
            style={{ borderLeft: `3px solid ${group.color}` }}
          >
            <span className="text-xs text-gray-400">{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</span>
          </div>
        </div>
      )}

      {/* ── Delete Group Confirmation ── */}
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete group">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
          Delete <span className="font-semibold" style={{ color: group.color }}>{group.name}</span>?
          This will permanently remove the group and all <span className="font-semibold">{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</span> inside it.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setConfirmDelete(false)}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 dark:bg-[#333] dark:text-gray-300 dark:hover:bg-[#3a3a3a] rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={() => { setConfirmDelete(false); onDeleteGroup(group.id) }}
            className="px-4 py-2 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg transition"
          >
            Delete group
          </button>
        </div>
      </Modal>

      {/* ── Add Column Modal ── */}
      <Modal open={addColModal} onClose={() => setAddColModal(false)} title="Add column">
        <form onSubmit={handleAddColumn} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Column name</label>
            <input
              autoFocus
              value={newColLabel}
              onChange={(e) => setNewColLabel(e.target.value)}
              placeholder="e.g. Notes, Score, Completed"
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-blue dark:bg-[#252525] dark:border-[#444] dark:text-white"
            />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Column type</p>
            <div className="grid grid-cols-2 gap-2">
              {COLUMN_TYPES.map((ct) => (
                <button
                  key={ct.type}
                  type="button"
                  onClick={() => setNewColType(ct.type)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition ${
                    newColType === ct.type
                      ? 'border-primary-blue bg-blue-50 text-primary-blue dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-[#444] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
                  }`}
                >
                  <span className="text-base w-5 text-center">{ct.icon}</span>
                  {ct.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setAddColModal(false)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition">Cancel</button>
            <button
              type="submit"
              disabled={savingCol || !newColLabel.trim()}
              className="px-4 py-2 text-sm text-white bg-primary-blue hover:bg-blue-600 rounded-lg transition disabled:opacity-50"
            >
              {savingCol ? 'Adding…' : 'Add column'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Column context menu ── */}
      {colContextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[8000] bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#444] rounded-lg shadow-xl py-1 min-w-[140px]"
          style={{ left: colContextMenu.x, top: colContextMenu.y }}
        >
          <button onClick={() => { setRenamingColId(colContextMenu.columnId); setColContextMenu(null) }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 text-left transition">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            Rename
          </button>
          <button onClick={() => handleHideCol(colContextMenu.columnId)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 text-left transition">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
            Hide
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-[#333]" />
          <button onClick={() => handleDeleteCol(colContextMenu.columnId)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 text-left transition">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

// ── Resize handle ──────────────────────────────────────────────────────────────
// Positioned at right:-4px so the 9px-wide hit zone straddles the visible border.
// This ensures clicks exactly ON the column divider line register on the correct
// (left) column's handle instead of slipping into the next column's area.
function ResizeHandle({ colKey, currentWidth, onWidthChange }) {
  const dragRef = useRef(null)

  const handleMouseDown = (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { startX: e.clientX, startW: currentWidth }

    const onMove = (mv) => {
      if (!dragRef.current) return
      onWidthChange(colKey, dragRef.current.startW + (mv.clientX - dragRef.current.startX))
    }
    const onUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor     = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor     = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      className="absolute top-0 h-full cursor-col-resize opacity-0 hover:opacity-100 group-hover/hdr:opacity-100 flex items-center justify-center z-20 transition-opacity"
      style={{ right: '-1px', width: '8px' }}
    >
      <div className="w-px h-4 rounded-full bg-primary-blue/60 group-hover/hdr:bg-primary-blue" />
    </div>
  )
}

// ── Column headers row ─────────────────────────────────────────────────────────
function ColumnHeaders({
  columns,
  onAddColumn,
  onColContextMenu,
  renamingColId,
  renameValue,
  onRenameValueChange,
  onRenameSubmit,
  onRenameCancel,
  colWidths,
  onWidthChange,
}) {
  // Shared cell style for fixed columns
  const cell = (key, label, extra = '') => (
    <div
      key={key}
      className={`relative group/hdr flex-shrink-0 flex items-center px-3 h-8 text-[11px] font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wide border-r border-border-color dark:border-[#333] select-none ${extra}`}
      style={{ width: colWidths[key] }}
    >
      {label}
      <ResizeHandle colKey={key} currentWidth={colWidths[key]} onWidthChange={onWidthChange} />
    </div>
  )

  return (
    <div className="flex items-stretch bg-white dark:bg-[#1e1e1e] border-b border-t border-border-color dark:border-[#333]">
      {/* color-bar stub + drag/checkbox stub — must match TaskRow exactly */}
      <div className="w-0.5 flex-shrink-0" />
      <div className="w-10 flex-shrink-0" />

      {/* Title column — fixed width like all other columns so resize works */}
      <div
        className="relative group/hdr flex-shrink-0 flex items-center px-3 h-8 text-[11px] font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wide border-r border-border-color dark:border-[#333] select-none"
        style={{ width: colWidths.title }}
      >
        Task
        <ResizeHandle colKey="title" currentWidth={colWidths.title} onWidthChange={onWidthChange} />
      </div>

      {/* Fixed columns */}
      {cell('status',   'Status')}
      {cell('assignee', 'Assignee')}
      {cell('dueDate',  'Due Date')}
      {cell('priority', 'Priority')}

      {/* Custom columns */}
      {columns.map((col) => {
        const colKey = `custom_${col.id}`
        const width  = colWidths[colKey] ?? 112
        return (
          <div
            key={col.id}
            onContextMenu={(e) => onColContextMenu(e, col.id)}
            className="relative group/hdr flex-shrink-0 flex items-center px-3 h-8 text-[11px] font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wide border-r border-border-color dark:border-[#333] cursor-context-menu hover:bg-gray-50 dark:hover:bg-white/5 transition select-none"
            style={{ width }}
            title="Right-click for options"
          >
            {renamingColId === col.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => onRenameValueChange(e.target.value)}
                onBlur={() => onRenameSubmit(col.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter')  onRenameSubmit(col.id)
                  if (e.key === 'Escape') onRenameCancel()
                }}
                className="w-full text-[11px] bg-transparent outline-none border-b border-primary-blue"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="truncate">{col.label}</span>
            )}
            <ResizeHandle colKey={colKey} currentWidth={width} onWidthChange={onWidthChange} />
          </div>
        )
      })}

      {/* ➕ Add column — same width as delete button in TaskRow → w-8 (32px) */}
      <div className="w-8 flex-shrink-0 flex items-center justify-center h-8">
        <button onClick={onAddColumn} className="text-gray-400 hover:text-primary-blue transition" title="Add column">
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
      {/* ← NO extra spacer here — exactly matches TaskRow's delete button slot */}
    </div>
  )
}
