import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { randomGroupColor, loadStatusOptions, saveStatusOptionsToStorage } from '../lib/utils'

function loadAutomationsCache(boardId) {
  try { return JSON.parse(localStorage.getItem(`board-automations-${boardId}`) || '[]') } catch { return [] }
}
function saveAutomationsCache(boardId, list) {
  try { localStorage.setItem(`board-automations-${boardId}`, JSON.stringify(list)) } catch {}
}

export const useBoardStore = create((set, get) => ({
  boards: [],
  currentBoard: null,
  groups: [],
  tasks: [],
  subGroups: [],
  profiles: [],
  boardColumns: [],
  taskColumnValues: {},    // { taskId: { columnId: value, ... }, ... }
  statusOptions: [],
  automations: [],
  workspaceId: null,
  realtimeConnected: false,
  loading: false,

  // ─── Boards ───────────────────────────────────────────────────────
  fetchBoards: async (workspaceId) => {
    set({ workspaceId })
    const { data, error } = await supabase
      .from('boards')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at')
    if (!error) set({ boards: data || [] })
  },

  setCurrentBoard: (board) => set({ currentBoard: board }),

  createBoard: async (workspaceId, userId, name, icon = '📋', color = '#0073ea') => {
    const { data, error } = await supabase
      .from('boards')
      .insert({ workspace_id: workspaceId, name, icon, color, created_by: userId })
      .select()
      .single()
    if (error) throw error

    await supabase.from('groups').insert([
      { board_id: data.id, name: 'To Do', color: '#0073ea', position: 0 },
    ])

    set((s) => ({ boards: [...s.boards, data] }))
    return data
  },

  updateBoard: async (boardId, updates) => {
    await supabase.from('boards').update(updates).eq('id', boardId)
    set((s) => ({
      boards: s.boards.map((b) => (b.id === boardId ? { ...b, ...updates } : b)),
      currentBoard: s.currentBoard?.id === boardId ? { ...s.currentBoard, ...updates } : s.currentBoard,
    }))
  },

  deleteBoard: async (boardId) => {
    await supabase.from('boards').delete().eq('id', boardId)
    set((s) => ({ boards: s.boards.filter((b) => b.id !== boardId) }))
  },

  updateBoardName: async (boardId, name) => {
    await supabase.from('boards').update({ name }).eq('id', boardId)
    set((s) => ({
      boards: s.boards.map((b) => (b.id === boardId ? { ...b, name } : b)),
      currentBoard: s.currentBoard?.id === boardId ? { ...s.currentBoard, name } : s.currentBoard,
    }))
  },

  updateStatusOptions: async (boardId, options) => {
    const { error } = await supabase.from('boards').update({ status_options: options }).eq('id', boardId)
    if (error) console.error('[DegiTasks] Failed to save status_options:', error)
    saveStatusOptionsToStorage(boardId, options)
    set((s) => ({
      statusOptions: options,
      currentBoard: s.currentBoard?.id === boardId
        ? { ...s.currentBoard, status_options: options }
        : s.currentBoard,
    }))
  },

  updateAutomations: async (boardId, list) => {
    const { error } = await supabase.from('boards').update({ automations: list }).eq('id', boardId)
    if (error) console.error('[DegiTasks] Failed to save automations:', error)
    saveAutomationsCache(boardId, list)
    set((s) => ({
      automations: list,
      currentBoard: s.currentBoard?.id === boardId
        ? { ...s.currentBoard, automations: list }
        : s.currentBoard,
    }))
  },

  // ─── Groups ───────────────────────────────────────────────────────
  fetchBoardData: async (boardId, silent = false) => {
    if (!silent) set({ loading: true })

    const boardRes = await supabase.from('boards').select('*').eq('id', boardId).single()
    const workspaceId = boardRes.data?.workspace_id

    const [groupsRes, tasksRes, membersRes, columnsRes, subGroupsRes] = await Promise.all([
      supabase.from('groups').select('*').eq('board_id', boardId).order('position'),
      supabase.from('tasks').select('*').eq('board_id', boardId).order('position'),
      supabase.from('workspace_members').select('user_id').eq('workspace_id', workspaceId),
      supabase.from('board_columns').select('*').eq('board_id', boardId).order('position'),
      supabase.from('sub_groups').select('*').eq('board_id', boardId).order('position'),
    ])

    // Collect user IDs from workspace_members (may be limited by RLS)
    // + all assignee IDs from tasks (always visible) to ensure we load every assignee's profile
    const memberIds = membersRes.data?.map((m) => m.user_id).filter(Boolean) ?? []
    const singleAssignees = tasksRes.data?.map((t) => t.assignee_id).filter(Boolean) ?? []
    const multiAssignees = (tasksRes.data ?? []).flatMap((t) => t.assignee_ids ?? []).filter(Boolean)
    const allUserIds = [...new Set([...memberIds, ...singleAssignees, ...multiAssignees])]
    const { data: profilesData } = allUserIds.length > 0
      ? await supabase.from('profiles').select('*').in('id', allUserIds)
      : { data: [] }
    const profilesRes = { data: profilesData ?? [] }

    // Fetch column values for all tasks in this board
    let taskColumnValues = {}
    if (columnsRes.data?.length > 0 && tasksRes.data?.length > 0) {
      const taskIds = tasksRes.data.map((t) => t.id)
      const { data: valData } = await supabase
        .from('task_column_values')
        .select('*')
        .in('task_id', taskIds)

      if (valData) {
        valData.forEach((v) => {
          if (!taskColumnValues[v.task_id]) taskColumnValues[v.task_id] = {}
          taskColumnValues[v.task_id][v.column_id] = v.value
        })
      }
    }

    // Status options: use DB if it has actual entries, otherwise fall back to localStorage/defaults
    const dbStatusOptions = boardRes.data?.status_options
    const statusOptions = (Array.isArray(dbStatusOptions) && dbStatusOptions.length > 0)
      ? dbStatusOptions
      : loadStatusOptions(boardId)

    // Automations: use DB if it has actual entries, otherwise fall back to localStorage
    const dbAutomations = boardRes.data?.automations
    const automations = (Array.isArray(dbAutomations) && dbAutomations.length > 0)
      ? dbAutomations
      : loadAutomationsCache(boardId)

    set({
      currentBoard: boardRes.data,
      groups: groupsRes.data || [],
      tasks: tasksRes.data || [],
      subGroups: subGroupsRes.data || [],
      profiles: profilesRes.data || [],
      boardColumns: columnsRes.data || [],
      taskColumnValues,
      statusOptions,
      automations,
      loading: false,
    })
  },

  createGroup: async (boardId, name) => {
    const groups = get().groups
    const position = groups.length
    const color = randomGroupColor()

    const { data, error } = await supabase
      .from('groups')
      .insert({ board_id: boardId, name, color, position })
      .select()
      .single()
    if (error) throw error

    set((s) => ({ groups: [...s.groups, data] }))
    return data
  },

  updateGroupName: async (groupId, name) => {
    await supabase.from('groups').update({ name }).eq('id', groupId)
    set((s) => ({
      groups: s.groups.map((g) => (g.id === groupId ? { ...g, name } : g)),
    }))
  },

  updateGroup: async (groupId, updates) => {
    await supabase.from('groups').update(updates).eq('id', groupId)
    set((s) => ({
      groups: s.groups.map((g) => (g.id === groupId ? { ...g, ...updates } : g)),
    }))
  },

  deleteGroup: async (groupId) => {
    await supabase.from('tasks').delete().eq('group_id', groupId)
    await supabase.from('groups').delete().eq('id', groupId)
    set((s) => ({
      groups: s.groups.filter((g) => g.id !== groupId),
      tasks:  s.tasks.filter((t) => t.group_id !== groupId),
    }))
  },

  // ─── Sub-groups ───────────────────────────────────────────────────
  createSubGroup: async (boardId, groupId, name) => {
    const existing = get().subGroups.filter((sg) => sg.group_id === groupId)
    const position = existing.length
    const { data, error } = await supabase
      .from('sub_groups')
      .insert({ board_id: boardId, group_id: groupId, name, position })
      .select()
      .single()
    if (error) throw error
    set((s) => ({ subGroups: [...s.subGroups, data] }))
    return data
  },

  updateSubGroup: async (subGroupId, updates) => {
    await supabase.from('sub_groups').update(updates).eq('id', subGroupId)
    set((s) => ({
      subGroups: s.subGroups.map((sg) => (sg.id === subGroupId ? { ...sg, ...updates } : sg)),
    }))
  },

  deleteSubGroup: async (subGroupId) => {
    await supabase.from('tasks').update({ sub_group_id: null }).eq('sub_group_id', subGroupId)
    await supabase.from('sub_groups').delete().eq('id', subGroupId)
    set((s) => ({
      subGroups: s.subGroups.filter((sg) => sg.id !== subGroupId),
      tasks: s.tasks.map((t) => t.sub_group_id === subGroupId ? { ...t, sub_group_id: null } : t),
    }))
  },

  // ─── Tasks ────────────────────────────────────────────────────────
  createTask: async (boardId, groupId, userId, subGroupId = null) => {
    const groupTasks = get().tasks.filter((t) => t.group_id === groupId)
    const position = groupTasks.length

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        board_id: boardId,
        group_id: groupId,
        sub_group_id: subGroupId,
        title: '',
        status: 'Not Started',
        status_color: '#c4c4c4',
        position,
        created_by: userId,
      })
      .select()
      .single()
    if (error) throw error

    set((s) => ({ tasks: [...s.tasks, data] }))

    get().logActivity({
      taskId: data.id,
      userId,
      action: 'task_created',
      meta: { task_title: '' },
    })

    return data
  },

  updateTask: async (taskId, updates) => {
    const { error } = await supabase.from('tasks').update(updates).eq('id', taskId)
    if (error) throw error
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
    }))
  },

  deleteTask: async (taskId) => {
    await supabase.from('tasks').delete().eq('id', taskId)
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== taskId) }))
  },

  // ─── Board Columns ────────────────────────────────────────────────
  createBoardColumn: async (boardId, label, type) => {
    const cols = get().boardColumns
    const position = cols.length
    const { data, error } = await supabase
      .from('board_columns')
      .insert({ board_id: boardId, label, type, position })
      .select()
      .single()
    if (error) throw error
    set((s) => ({ boardColumns: [...s.boardColumns, data] }))
    return data
  },

  updateBoardColumn: async (columnId, updates) => {
    await supabase.from('board_columns').update(updates).eq('id', columnId)
    set((s) => ({
      boardColumns: s.boardColumns.map((c) => (c.id === columnId ? { ...c, ...updates } : c)),
    }))
  },

  deleteBoardColumn: async (columnId) => {
    await supabase.from('board_columns').delete().eq('id', columnId)
    set((s) => ({ boardColumns: s.boardColumns.filter((c) => c.id !== columnId) }))
  },

  reorderBoardColumns: async (reordered) => {
    set({ boardColumns: reordered })
    await Promise.all(reordered.map((c, i) => supabase.from('board_columns').update({ position: i }).eq('id', c.id)))
  },

  // ─── Column Values ────────────────────────────────────────────────
  updateColumnValue: async (taskId, columnId, value) => {
    await supabase
      .from('task_column_values')
      .upsert({ task_id: taskId, column_id: columnId, value })
    set((s) => ({
      taskColumnValues: {
        ...s.taskColumnValues,
        [taskId]: { ...(s.taskColumnValues[taskId] || {}), [columnId]: value },
      },
    }))
  },

  // ─── Activity logging ─────────────────────────────────────────────
  logActivity: async ({ taskId, userId, action, meta = {} }) => {
    const { workspaceId, currentBoard, tasks } = get()
    if (!workspaceId || !currentBoard || !userId) return
    const task = tasks.find((t) => t.id === taskId)
    try {
      await supabase.from('activity_log').insert({
        workspace_id: workspaceId,
        board_id: currentBoard.id,
        task_id: taskId,
        user_id: userId,
        action,
        meta: { task_title: task?.title || '', ...meta },
      })
    } catch {
      // best-effort
    }
  },

  // ─── Realtime sync ────────────────────────────────────────────────
  applyRealtimeEvent: (table, eventType, newRecord, oldRecord) => {
    set((s) => {
      if (table === 'tasks') {
        if (eventType === 'INSERT') {
          const exists = s.tasks.some((t) => t.id === newRecord.id)
          return exists ? {} : { tasks: [...s.tasks, newRecord] }
        }
        if (eventType === 'UPDATE') {
          return { tasks: s.tasks.map((t) => (t.id === newRecord.id ? newRecord : t)) }
        }
        if (eventType === 'DELETE') {
          return { tasks: s.tasks.filter((t) => t.id !== oldRecord.id) }
        }
      }
      if (table === 'groups') {
        if (eventType === 'INSERT') {
          const exists = s.groups.some((g) => g.id === newRecord.id)
          return exists ? {} : { groups: [...s.groups, newRecord] }
        }
        if (eventType === 'UPDATE') {
          return { groups: s.groups.map((g) => (g.id === newRecord.id ? newRecord : g)) }
        }
        if (eventType === 'DELETE') {
          return { groups: s.groups.filter((g) => g.id !== oldRecord.id) }
        }
      }
      if (table === 'board_columns') {
        if (eventType === 'INSERT') {
          const exists = s.boardColumns.some((c) => c.id === newRecord.id)
          return exists ? {} : { boardColumns: [...s.boardColumns, newRecord].sort((a, b) => a.position - b.position) }
        }
        if (eventType === 'UPDATE') {
          return { boardColumns: s.boardColumns.map((c) => (c.id === newRecord.id ? newRecord : c)) }
        }
        if (eventType === 'DELETE') {
          return { boardColumns: s.boardColumns.filter((c) => c.id !== oldRecord.id) }
        }
      }
      if (table === 'sub_groups') {
        if (eventType === 'INSERT') {
          const exists = s.subGroups.some((sg) => sg.id === newRecord.id)
          return exists ? {} : { subGroups: [...s.subGroups, newRecord].sort((a, b) => a.position - b.position) }
        }
        if (eventType === 'UPDATE') {
          return { subGroups: s.subGroups.map((sg) => (sg.id === newRecord.id ? newRecord : sg)) }
        }
        if (eventType === 'DELETE') {
          return { subGroups: s.subGroups.filter((sg) => sg.id !== oldRecord.id) }
        }
      }
      if (table === 'boards' && eventType === 'UPDATE') {
        const updates = {}
        if (newRecord.status_options) updates.statusOptions = newRecord.status_options
        if (newRecord.automations)    updates.automations   = newRecord.automations
        if (newRecord.name !== undefined) updates.currentBoard = { ...s.currentBoard, ...newRecord }
        return updates
      }
      return {}
    })
  },

  setRealtimeConnected: (connected) => set({ realtimeConnected: connected }),
}))
