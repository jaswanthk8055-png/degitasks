import { useState, useCallback, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core'

function collisionDetectionStrategy(args) {
  const activeId = String(args.active.id)
  // Sections reordering: plain closestCenter among all registered droppables
  if (activeId.startsWith('sg-sort-')) return closestCenter(args)
  // Task drag: if the pointer is directly over a section header, snap to it
  const pointerHits = pointerWithin(args)
  const sectionHits = pointerHits.filter((c) => String(c.id).startsWith('sg-sort-'))
  if (sectionHits.length > 0) return sectionHits
  return closestCenter(args)
}
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { supabase } from '../../lib/supabase'
import { useBoardStore } from '../../stores/useBoardStore'
import { useAuthStore, SUPER_USER_EMAIL } from '../../stores/useAuthStore'
import { useToastStore } from '../../stores/useToastStore'
import { STATUS_OPTIONS, PRIORITY_OPTIONS, avatarColorFromName, applyTaskFilters } from '../../lib/utils'
import TaskGroup from './TaskGroup'
import TaskRow from './TaskRow'


// Default pixel widths for fixed columns
export const COL_DEFAULTS = {
  title:    320,
  status:   140,
  assignee: 112,
  dueDate:  112,
  priority: 112,
}
const MIN_WIDTH = 60
const MAX_WIDTH = 600

function loadWidths(boardId) {
  try {
    const raw = localStorage.getItem(`col-widths-${boardId}`)
    return raw ? { ...COL_DEFAULTS, ...JSON.parse(raw) } : { ...COL_DEFAULTS }
  } catch {
    return { ...COL_DEFAULTS }
  }
}

function buildVirtualGroups(groupBy, tasks, profiles) {
  if (groupBy === 'status') {
    const present = new Set(tasks.map((t) => t.status || null))
    const result = STATUS_OPTIONS
      .filter((s) => present.has(s.label))
      .map((s) => ({ id: `vg-s-${s.label}`, name: s.label, color: s.color, _vField: 'status', _vKey: s.label }))
    if (present.has(null)) result.push({ id: 'vg-s-null', name: 'No Status', color: '#c4c4c4', _vField: 'status', _vKey: null })
    return result
  }
  if (groupBy === 'priority') {
    const present = new Set(tasks.map((t) => t.priority || null))
    const result = PRIORITY_OPTIONS
      .filter((p) => present.has(p.label))
      .map((p) => ({ id: `vg-p-${p.label}`, name: p.label, color: p.color, _vField: 'priority', _vKey: p.label }))
    if (present.has(null)) result.push({ id: 'vg-p-null', name: 'No Priority', color: '#888888', _vField: 'priority', _vKey: null })
    return result
  }
  if (groupBy === 'assignee') {
    const assigneeIds = [...new Set(tasks.map((t) => t.assignee_id))]
    const assigned = assigneeIds
      .filter(Boolean)
      .map((id) => profiles.find((p) => p.id === id))
      .filter(Boolean)
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
      .map((p) => ({
        id: `vg-a-${p.id}`,
        name: p.full_name || 'Unknown',
        color: p.avatar_color || avatarColorFromName(p.full_name),
        _vField: 'assignee_id',
        _vKey: p.id,
      }))
    if (assigneeIds.includes(null) || assigneeIds.includes(undefined)) {
      assigned.push({ id: 'vg-a-null', name: 'Unassigned', color: '#c4c4c4', _vField: 'assignee_id', _vKey: null })
    }
    return assigned
  }
  return null
}

export default function BoardTable({ filters, onOpenTask, groupBy = 'group', hideAddTask = false }) {
  const {
    groups, tasks, subGroups, profiles, boardColumns, automations,
    createGroup, createTask, updateTask, deleteTask, updateGroupName, deleteGroup,
    createSubGroup, updateSubGroup, deleteSubGroup,
    currentBoard, logActivity,
  } = useBoardStore()
  const { profile, user } = useAuthStore()
  const canEdit = user?.email === SUPER_USER_EMAIL
  const { addToast } = useToastStore()

  const [activeTask, setActiveTask]   = useState(null)
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  // ── Column widths ──────────────────────────────────────────────────
  const boardId = currentBoard?.id
  const [colWidths, setColWidths] = useState(() => loadWidths(boardId))

  const handleWidthChange = useCallback((colKey, newWidth) => {
    const w = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth))
    setColWidths((prev) => {
      const next = { ...prev, [colKey]: w }
      try { localStorage.setItem(`col-widths-${boardId}`, JSON.stringify(next)) } catch {}
      return next
    })
  }, [boardId])

  // ── DnD ───────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Find a section by name in the target group, or create it if missing.
  // Returns the sub_group_id to use, or null if the task had no section.
  const findOrCreateSubGroup = async (sourceSubGroupId, targetGroupId) => {
    if (!sourceSubGroupId) return null
    const source = subGroups.find((sg) => sg.id === sourceSubGroupId)
    if (!source) return null
    const existing = subGroups.find(
      (sg) => sg.group_id === targetGroupId && sg.name === source.name
    )
    if (existing) return existing.id
    const created = await createSubGroup(currentBoard.id, targetGroupId, source.name)
    return created.id
  }

  const handleUpdateTask = async (taskId, updates) => {
    const prevTask = tasks.find((t) => t.id === taskId)
    await updateTask(taskId, updates)

    if (updates.status && updates.status !== prevTask?.status) {
      logActivity({ taskId, userId: profile?.id, action: 'status_changed', meta: { new_status: updates.status } })
      addToast(`Status → "${updates.status}"`)

      // Run automations for status changes
      for (const rule of automations) {
        if (!rule.enabled) continue
        if (rule.trigger.type === 'status_change' && rule.trigger.value === updates.status) {
          if (rule.action.type === 'move_to_group') {
            const targetGroupId = rule.action.groupId
            // Mirror the section into the target group (find by name or create)
            const newSubGroupId = await findOrCreateSubGroup(prevTask?.sub_group_id, targetGroupId)
            await updateTask(taskId, { group_id: targetGroupId, sub_group_id: newSubGroupId })
            const groupName = groups.find((g) => g.id === targetGroupId)?.name
            if (groupName) addToast(`Moved to "${groupName}"`)
          }
        }
      }
    }
    if ('assignee_id' in updates && updates.assignee_id !== prevTask?.assignee_id) {
      const assigneeName = profiles.find((p) => p.id === updates.assignee_id)?.full_name || 'Unassigned'
      logActivity({ taskId, userId: profile?.id, action: 'task_assigned', meta: { assignee_name: assigneeName } })
      if (updates.assignee_id && updates.assignee_id !== profile?.id) {
        supabase.from('notifications').insert({
          user_id: updates.assignee_id,
          message: `${profile?.full_name || 'Someone'} assigned "${prevTask?.title || 'a task'}" to you`,
          task_id: taskId,
          read: false,
        })
        addToast(`Assigned to ${assigneeName}`)
        // Fire-and-forget email — doesn't block the UI
        fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assigneeId: updates.assignee_id,
            taskTitle: prevTask?.title || 'a task',
            assignerName: profile?.full_name || 'Someone',
            boardName: currentBoard?.name || 'DegiTasks',
            boardId: currentBoard?.id,
            taskId,
          }),
        }).catch(() => {})
      }
    }
  }

  const handleDragStart = ({ active }) => setActiveTask(tasks.find((t) => t.id === active.id) || null)

  const handleDragEnd = async ({ active, over }) => {
    setActiveTask(null)
    if (!over || active.id === over.id) return

    const activeIdStr = String(active.id)
    const overIdStr   = String(over.id)

    // ── Section reordering (available to all users) ───────────────────
    if (activeIdStr.startsWith('sg-sort-')) {
      if (!overIdStr.startsWith('sg-sort-')) return
      const activeSgId = activeIdStr.slice('sg-sort-'.length)
      const overSgId   = overIdStr.slice('sg-sort-'.length)
      const activeSg   = subGroups.find((sg) => sg.id === activeSgId)
      const overSg     = subGroups.find((sg) => sg.id === overSgId)
      if (!activeSg || !overSg || activeSg.group_id !== overSg.group_id) return
      const groupSGs = subGroups
        .filter((sg) => sg.group_id === activeSg.group_id)
        .sort((a, b) => a.position - b.position)
      const oldIdx = groupSGs.findIndex((sg) => sg.id === activeSgId)
      const newIdx = groupSGs.findIndex((sg) => sg.id === overSgId)
      const reordered = [...groupSGs]
      const [moved] = reordered.splice(oldIdx, 1)
      reordered.splice(newIdx, 0, moved)
      await Promise.all(reordered.map((sg, i) => updateSubGroup(sg.id, { position: i })))
      return
    }

    // ── Task moves (super user only) ──────────────────────────────────
    if (!canEdit) return
    const draggedTask = tasks.find((t) => t.id === active.id)
    if (!draggedTask) return

    // Dropped onto a section header
    if (overIdStr.startsWith('sg-sort-')) {
      const targetSgId = overIdStr.slice('sg-sort-'.length)
      const targetSg = subGroups.find((sg) => sg.id === targetSgId)
      if (!targetSg) return
      if (draggedTask.sub_group_id === targetSgId && draggedTask.group_id === targetSg.group_id) return
      const updates = { sub_group_id: targetSgId }
      if (draggedTask.group_id !== targetSg.group_id) updates.group_id = targetSg.group_id
      await updateTask(draggedTask.id, updates)
      return
    }

    const overTask = tasks.find((t) => t.id === over.id)
    if (!overTask) return

    if (groupBy !== 'group') {
      const getVKey = (task) => {
        if (groupBy === 'status')   return task.status   ?? null
        if (groupBy === 'priority') return task.priority ?? null
        if (groupBy === 'assignee') return task.assignee_id ?? null
      }
      const draggedVKey = getVKey(draggedTask)
      const overVKey    = getVKey(overTask)
      if (draggedVKey !== overVKey) {
        const fieldKey = groupBy === 'assignee' ? 'assignee_id' : groupBy
        await handleUpdateTask(draggedTask.id, { [fieldKey]: overVKey })
      } else {
        const groupTasks = tasks
          .filter((t) => getVKey(t) === draggedVKey)
          .sort((a, b) => a.position - b.position)
        const oldIdx  = groupTasks.findIndex((t) => t.id === active.id)
        const newIdx  = groupTasks.findIndex((t) => t.id === over.id)
        const reordered = [...groupTasks]
        const [moved] = reordered.splice(oldIdx, 1)
        reordered.splice(newIdx, 0, moved)
        await Promise.all(reordered.map((t, i) => updateTask(t.id, { position: i })))
      }
      return
    }

    if (draggedTask.group_id === overTask.group_id) {
      const groupTasks = tasks
        .filter((t) => t.group_id === draggedTask.group_id)
        .sort((a, b) => a.position - b.position)
      const oldIdx  = groupTasks.findIndex((t) => t.id === active.id)
      const newIdx  = groupTasks.findIndex((t) => t.id === over.id)
      const reordered = [...groupTasks]
      const [moved] = reordered.splice(oldIdx, 1)
      reordered.splice(newIdx, 0, moved)
      await Promise.all(reordered.map((t, i) => updateTask(t.id, { position: i })))
    } else {
      // Mirror section into target group by name (find or create), then move
      const newSubGroupId = await findOrCreateSubGroup(draggedTask.sub_group_id, overTask.group_id)
      await updateTask(draggedTask.id, { group_id: overTask.group_id, position: overTask.position, sub_group_id: newSubGroupId })
    }
  }

  const handleAddGroup = async (e) => {
    e.preventDefault()
    if (!newGroupName.trim() || !currentBoard) return
    await createGroup(currentBoard.id, newGroupName.trim())
    setNewGroupName('')
    setAddingGroup(false)
  }

  const handleAddTask = async (groupId, subGroupId = null) => {
    if (!currentBoard) return null
    const task = await createTask(currentBoard.id, groupId, profile?.id, subGroupId)
    if (task) addToast('Task created')
    return task
  }

  const handleDeleteTask = async (taskId) => {
    await deleteTask(taskId)
    addToast('Task deleted', 'error')
  }

  const handleDeleteGroup = async (groupId) => {
    await deleteGroup(groupId)
    addToast('Group deleted', 'error')
  }

  const filterTask = (task) => applyTaskFilters([task], filters).length > 0

  const sortedGroups   = [...groups].sort((a, b) => a.position - b.position)
  const visibleColumns = boardColumns.filter((c) => !c.hidden)
  const virtualGroups  = buildVirtualGroups(groupBy, tasks, profiles)

  const renderGroups = () => {
    if (virtualGroups) {
      return virtualGroups.map((vg) => {
        const getVKey = (t) => {
          if (groupBy === 'status')   return t.status   ?? null
          if (groupBy === 'priority') return t.priority ?? null
          if (groupBy === 'assignee') return t.assignee_id ?? null
        }
        const groupTasks = tasks
          .filter((t) => getVKey(t) === vg._vKey)
          .filter(filterTask)
          .sort((a, b) => a.position - b.position)
        if (groupTasks.length === 0) return null
        return (
          <TaskGroup
            key={vg.id}
            group={vg}
            tasks={groupTasks}
            profiles={profiles}
            onAddTask={null}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
            onUpdateGroupName={() => {}}
            onOpenTask={onOpenTask}
            colWidths={colWidths}
            onWidthChange={handleWidthChange}
            isVirtual
            hideAddTask
          />
        )
      })
    }
    return sortedGroups.map((group) => {
      const groupTasks = tasks
        .filter((t) => t.group_id === group.id)
        .filter(filterTask)
        .sort((a, b) => a.position - b.position)
      if (hideAddTask && groupTasks.length === 0) return null
      const groupSubGroups = subGroups
        .filter((sg) => sg.group_id === group.id)
        .sort((a, b) => a.position - b.position)
      return (
        <TaskGroup
          key={group.id}
          group={group}
          tasks={groupTasks}
          subGroups={groupSubGroups}
          profiles={profiles}
          onAddTask={handleAddTask}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
          onUpdateGroupName={updateGroupName}
          onDeleteGroup={handleDeleteGroup}
          onAddSubGroup={(name) => createSubGroup(currentBoard.id, group.id, name)}
          onUpdateSubGroup={updateSubGroup}
          onDeleteSubGroup={deleteSubGroup}
          onOpenTask={onOpenTask}
          colWidths={colWidths}
          onWidthChange={handleWidthChange}
          hideAddTask={hideAddTask}
        />
      )
    })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetectionStrategy}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex-1 overflow-auto scrollbar-thin bg-white dark:bg-[#1a1a1a]">
        <div className="min-w-max">
          {renderGroups()}

          {/* Add Group — only for super user in default grouping */}
          {canEdit && !virtualGroups && (
            <div className="mt-4 px-4 pb-8">
              {addingGroup ? (
                <form onSubmit={handleAddGroup} className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Group name"
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-[#444] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-blue bg-white dark:bg-[#252525] dark:text-white"
                    onKeyDown={(e) => { if (e.key === 'Escape') { setAddingGroup(false); setNewGroupName('') } }}
                  />
                  <button type="submit" className="px-3 py-1.5 text-sm text-white bg-primary-blue rounded-lg hover:bg-blue-600 transition">Add</button>
                  <button type="button" onClick={() => { setAddingGroup(false); setNewGroupName('') }} className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition">Cancel</button>
                </form>
              ) : (
                <button
                  onClick={() => setAddingGroup(true)}
                  className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-500 hover:text-primary-blue transition px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/20"
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                  </svg>
                  Add group
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeTask && (
          <div className="bg-white dark:bg-[#1e1e1e] shadow-xl border border-gray-200 dark:border-[#444] rounded opacity-95">
            <TaskRow
              task={activeTask}
              groupColor={groups.find((g) => g.id === activeTask.group_id)?.color || '#0073ea'}
              profiles={profiles}
              onUpdate={() => {}}
              onDelete={() => {}}
              extraColumns={visibleColumns}
              colWidths={colWidths}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
