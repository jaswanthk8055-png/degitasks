import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import BoardPage from '../src/pages/BoardPage'
import { useAuthStore } from '../src/stores/useAuthStore'
import { useBoardStore } from '../src/stores/useBoardStore'
import { useToastStore } from '../src/stores/useToastStore'

const database = vi.hoisted(() => ({ from: vi.fn() }))

// Exercise the real board, table, rows, filters, and store mutations. Only the
// transport and background subscriptions are replaced; no live service is used.
vi.mock('../src/lib/supabase', () => ({ supabase: { from: database.from } }))
vi.mock('../src/hooks/useBoard', () => ({ useBoard: () => ({ loading: false }) }))
vi.mock('../src/components/layout/NotificationBell', () => ({ default: () => null }))

const USER_ID = 'team-member-1'
const OTHER_USER_ID = 'team-member-2'
const BOARD_ID = 'board-1'
const GROUP_ID = 'group-1'
const WORKSPACE_ID = 'workspace-1'

let writes
let taskSequence
let projectSequence
let groupSequence
let fetchSpy

function installDatabaseDouble() {
  database.from.mockImplementation((table) => {
    if (!['tasks', 'groups', 'sub_groups', 'activity_log'].includes(table)) {
      throw new Error(`Unexpected database access in My Tasks test: ${table}`)
    }

    let row = null
    let operation = null
    const query = {
      insert(payload) {
        operation = { table, action: 'insert', payload: structuredClone(payload), filters: [] }
        writes.push(operation)
        if (table === 'tasks') {
          row = { id: `new-task-${++taskSequence}`, assignee_id: null, assignee_ids: [], ...payload }
        } else if (table === 'sub_groups') {
          row = { id: `new-project-${++projectSequence}`, ...payload }
        } else if (table === 'groups') {
          row = { id: `new-group-${++groupSequence}`, ...payload }
        } else {
          row = { id: `activity-${writes.length}`, ...payload }
        }
        return query
      },
      update(payload) {
        operation = { table, action: 'update', payload: structuredClone(payload), filters: [] }
        writes.push(operation)
        return query
      },
      select() { return query },
      eq(column, value) {
        operation?.filters.push({ column, value })
        return query
      },
      single() { return Promise.resolve({ data: row, error: null }) },
      then(resolve, reject) { return Promise.resolve({ data: row, error: null }).then(resolve, reject) },
    }
    return query
  })
}

function seedBoard({ view = 'My Tasks', groups, tasks, subGroups = [] } = {}) {
  const profile = {
    id: USER_ID,
    full_name: 'Team Member',
    email: 'team.member@example.test',
    default_page: view,
    avatar_color: '#0073ea',
  }
  const otherProfile = { id: OTHER_USER_ID, full_name: 'Colleague', avatar_color: '#fdab3d' }
  const board = { id: BOARD_ID, workspace_id: WORKSPACE_ID, name: 'Team Work', icon: '📋' }
  const taskDefaults = {
    board_id: BOARD_ID,
    group_id: GROUP_ID,
    sub_group_id: null,
    status: 'Not Started',
    status_color: '#c4c4c4',
    due_date: null,
    priority: null,
    created_by: USER_ID,
  }
  useAuthStore.setState({
    ...useAuthStore.getInitialState(),
    user: { id: USER_ID, email: profile.email },
    profile,
    loading: false,
  }, true)
  useBoardStore.setState({
    ...useBoardStore.getInitialState(),
    boards: [board],
    currentBoard: board,
    workspaceId: WORKSPACE_ID,
    groups: groups ?? [{ id: GROUP_ID, board_id: BOARD_ID, name: 'To Do', color: '#0073ea', position: 0 }],
    subGroups,
    profiles: [profile, otherProfile],
    memberProfiles: [profile, otherProfile],
    statusOptions: [{ label: 'Not Started', color: '#c4c4c4' }],
    tasks: tasks ?? [
      { ...taskDefaults, id: 'existing-mine', title: 'My existing task', position: 0, assignee_id: USER_ID, assignee_ids: [USER_ID] },
      { ...taskDefaults, id: 'existing-colleague', title: 'Colleague-only task', position: 1, assignee_id: OTHER_USER_ID, assignee_ids: [OTHER_USER_ID] },
      { ...taskDefaults, id: 'existing-shared', title: 'Shared team task', position: 2, assignee_id: OTHER_USER_ID, assignee_ids: [OTHER_USER_ID, USER_ID] },
    ],
  }, true)
  useToastStore.setState(useToastStore.getInitialState(), true)
}

function renderBoard(options) {
  seedBoard(options)
  return render(
    <MemoryRouter initialEntries={[`/board/${BOARD_ID}`]}>
      <Routes>
        <Route path="/board/:boardId" element={<BoardPage />} />
      </Routes>
    </MemoryRouter>
  )
}

function taskInserts() {
  return writes.filter((write) => write.table === 'tasks' && write.action === 'insert')
}

function expectAutoAssignedTask({ groupId = GROUP_ID, projectId = null } = {}) {
  expect(taskInserts()).toHaveLength(1)
  expect(taskInserts()[0].payload).toMatchObject({
    board_id: BOARD_ID,
    group_id: groupId,
    sub_group_id: projectId,
    created_by: USER_ID,
    assignee_id: USER_ID,
    assignee_ids: [USER_ID],
  })
  // Assignment must be in the initial insert so My Tasks never filters out the
  // new row while a second database update is pending.
  expect(writes.filter((write) => write.table === 'tasks' && write.action === 'update')).toEqual([])
  expect(writes).toEqual(expect.arrayContaining([
    expect.objectContaining({
      table: 'activity_log',
      payload: expect.objectContaining({
        action: 'task_created',
        meta: expect.objectContaining({ auto_assigned_user_id: USER_ID }),
      }),
    }),
  ]))
}

async function expectFocusedNewTitle() {
  const title = await screen.findByRole('textbox')
  await waitFor(() => expect(document.activeElement).toBe(title))
  expect(title.value).toBe('')
  expect(screen.queryByText('Colleague-only task')).toBeNull()
  return title
}

beforeEach(() => {
  localStorage.clear()
  writes = []
  taskSequence = 0
  projectSequence = 0
  groupSequence = 0
  database.from.mockReset()
  installDatabaseDouble()
  fetchSpy = vi.fn(() => { throw new Error('Live network calls are forbidden in My Tasks tests') })
  vi.stubGlobal('fetch', fetchSpy)
})

function existingTask(overrides = {}) {
  return {
    id: 'project-task-1',
    board_id: BOARD_ID,
    group_id: GROUP_ID,
    sub_group_id: null,
    title: 'My project task',
    position: 0,
    assignee_id: USER_ID,
    assignee_ids: [USER_ID],
    status: 'Not Started',
    status_color: '#c4c4c4',
    ...overrides,
  }
}

describe('My Tasks project visibility and completed groups', () => {
  it('hides existing empty and colleague-only projects in My Tasks, while Main Table shows them', () => {
    renderBoard({
      subGroups: [
        { id: 'colleague-project', board_id: BOARD_ID, group_id: GROUP_ID, name: 'Colleague Project', position: 0 },
        { id: 'empty-project', board_id: BOARD_ID, group_id: GROUP_ID, name: 'Existing Empty Project', position: 1 },
      ],
      tasks: [existingTask({
        sub_group_id: 'colleague-project', title: 'Colleague-only task',
        assignee_id: OTHER_USER_ID, assignee_ids: [OTHER_USER_ID],
      })],
    })

    expect(screen.queryByText('Colleague Project')).toBeNull()
    expect(screen.queryByText('Existing Empty Project')).toBeNull()
    expect(screen.queryByText('Colleague-only task')).toBeNull()
    expect(screen.queryByText('+ Add task to this project', { exact: true })).toBeNull()
    // The active group itself still offers a place to create work.
    expect(screen.getByText('+ Add Project', { exact: true })).toBeTruthy()
    expect(screen.getByText('+ Add task', { exact: true })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^Main Table$/ }))
    expect(screen.getByText('Colleague Project')).toBeTruthy()
    expect(screen.getByText('Existing Empty Project')).toBeTruthy()
    expect(screen.getByText('Colleague-only task')).toBeTruthy()
  })

  it('shows a mixed project with only the current user’s own and shared tasks', () => {
    renderBoard({
      subGroups: [{ id: 'mixed-project', board_id: BOARD_ID, group_id: GROUP_ID, name: 'Mixed Project', position: 0 }],
      tasks: [
        existingTask({ id: 'project-mine', sub_group_id: 'mixed-project', title: 'My project task' }),
        existingTask({ id: 'project-colleague', sub_group_id: 'mixed-project', title: 'Colleague-only task', position: 1, assignee_id: OTHER_USER_ID, assignee_ids: [OTHER_USER_ID] }),
        existingTask({ id: 'project-shared', sub_group_id: 'mixed-project', title: 'Shared project task', position: 2, assignee_id: OTHER_USER_ID, assignee_ids: [OTHER_USER_ID, USER_ID] }),
      ],
    })

    expect(screen.getByText('Mixed Project')).toBeTruthy()
    expect(screen.getByText('My project task')).toBeTruthy()
    expect(screen.getByText('Shared project task')).toBeTruthy()
    expect(screen.queryByText('Colleague-only task')).toBeNull()
    expect(screen.getByText('+ Add task to this project', { exact: true })).toBeTruthy()
  })

  it.each([
    ['My Tasks', 'Completed Tasks'],
    ['Main Table', 'Completed Tasks'],
    ['My Tasks', '  cOmPlEtEd  '],
    ['Main Table', '  cOmPlEtEd  '],
  ])('keeps completed tasks visible without creation controls in %s (%s)', (view, name) => {
    renderBoard({
      view,
      groups: [{ id: GROUP_ID, board_id: BOARD_ID, name, color: '#00c875', position: 0 }],
      subGroups: [{ id: 'finished-project', board_id: BOARD_ID, group_id: GROUP_ID, name: 'Finished Project', position: 0 }],
      tasks: [existingTask({ sub_group_id: 'finished-project', title: 'My completed task', status: 'Done', status_color: '#00c875' })],
    })

    expect(screen.getByText('My completed task')).toBeTruthy()
    expect(screen.getByText('Finished Project')).toBeTruthy()
    expect(screen.queryByText('+ Add Project', { exact: true })).toBeNull()
    expect(screen.queryByText('+ Add task', { exact: true })).toBeNull()
    expect(screen.queryByText('+ Add task to this project', { exact: true })).toBeNull()
    expect(taskInserts()).toHaveLength(0)
  })

  it.each(['My Tasks', 'Main Table'])('chooses the active group for header creation when Completed Tasks comes first in %s', async (view) => {
    renderBoard({
      view,
      groups: [
        { id: 'completed-group', board_id: BOARD_ID, name: 'Completed Tasks', color: '#00c875', position: 0 },
        { id: GROUP_ID, board_id: BOARD_ID, name: 'In Progress', color: '#0073ea', position: 1 },
      ],
      tasks: [existingTask({ group_id: 'completed-group', title: 'My completed task', status: 'Done' })],
    })

    fireEvent.click(screen.getByRole('button', { name: /^New Task$/ }))
    await expectFocusedNewTitle()
    expect(taskInserts()).toHaveLength(1)
    expect(taskInserts()[0].payload.group_id).toBe(GROUP_ID)
    expect(writes.filter((write) => write.table === 'groups')).toEqual([])
    if (view === 'My Tasks') expectAutoAssignedTask()
    else expect(taskInserts()[0].payload.assignee_id ?? null).toBeNull()
  })

  it.each(['My Tasks', 'Main Table'])('creates an active group instead of inserting into a completed-only board in %s', async (view) => {
    renderBoard({
      view,
      groups: [{ id: 'completed-group', board_id: BOARD_ID, name: 'Completed Tasks', color: '#00c875', position: 0 }],
      tasks: [existingTask({ group_id: 'completed-group', title: 'My completed task', status: 'Done' })],
    })

    fireEvent.click(screen.getByRole('button', { name: /^New Task$/ }))
    await expectFocusedNewTitle()
    expect(taskInserts()).toHaveLength(1)
    expect(taskInserts()[0].payload.group_id).toBe('new-group-1')
    expect(writes).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'groups', action: 'insert', payload: expect.objectContaining({ name: 'Tasks' }) }),
    ]))
    expect(screen.getByText('My completed task')).toBeTruthy()
    if (view === 'My Tasks') expectAutoAssignedTask({ groupId: 'new-group-1' })
    else expect(taskInserts()[0].payload.assignee_id ?? null).toBeNull()
  })

  it('allows creation in an ordinary group even when all its current tasks are Done', () => {
    renderBoard({ tasks: [existingTask({ status: 'Done', title: 'Finished task in active group' })] })
    expect(screen.getByText('Finished task in active group')).toBeTruthy()
    expect(screen.getByText('+ Add Project', { exact: true })).toBeTruthy()
    expect(screen.getByText('+ Add task', { exact: true })).toBeTruthy()
  })
})

afterEach(() => {
  cleanup()
  expect(fetchSpy).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

describe('My Tasks creation through the board UI and store', () => {
  it('creates from New Task, assigns atomically, focuses the row, and keeps it visible after naming', async () => {
    renderBoard()
    expect(screen.getByText('My existing task')).toBeTruthy()
    expect(screen.getByText('Shared team task')).toBeTruthy()
    expect(screen.queryByText('Colleague-only task')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /^New Task$/ }))
    const title = await expectFocusedNewTitle()
    expectAutoAssignedTask()

    fireEvent.change(title, { target: { value: 'Prepare shipping plan' } })
    fireEvent.keyDown(title, { key: 'Enter', code: 'Enter' })
    expect(await screen.findByText('Prepare shipping plan')).toBeTruthy()
    await waitFor(() => expect(useBoardStore.getState().tasks.find((task) => task.id === 'new-task-1')?.title).toBe('Prepare shipping plan'))
    expect(screen.queryByText('Colleague-only task')).toBeNull()
  })

  it('creates and immediately edits a self-assigned task from inline Add task', async () => {
    renderBoard()
    fireEvent.click(screen.getByText('+ Add task', { exact: true }))
    await expectFocusedNewTitle()
    expectAutoAssignedTask()
  })

  it('keeps an empty new project visible and creates a self-assigned task inside it', async () => {
    renderBoard()
    fireEvent.click(screen.getByText('+ Add Project', { exact: true }))
    fireEvent.change(screen.getByPlaceholderText('Project name…'), { target: { value: 'New Client Project' } })
    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }))

    expect(await screen.findByText('New Client Project')).toBeTruthy()
    expect(taskInserts()).toHaveLength(0)
    fireEvent.click(screen.getByText('+ Add task to this project', { exact: true }))
    await expectFocusedNewTitle()
    expectAutoAssignedTask({ projectId: 'new-project-1' })
    expect(useBoardStore.getState().subGroups).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'new-project-1', group_id: GROUP_ID, name: 'New Client Project' }),
    ]))
  })

  it('expands a persisted collapsed group and focuses a task created from the header', async () => {
    localStorage.setItem(`group-collapsed-${GROUP_ID}`, 'true')
    renderBoard()
    expect(screen.queryByText('My existing task')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /^New Task$/ }))
    await expectFocusedNewTitle()
    expectAutoAssignedTask()
    expect(screen.getByText('My existing task')).toBeTruthy()
    expect(localStorage.getItem(`group-collapsed-${GROUP_ID}`)).toBe('false')
  })

  it('offers creation when only a colleague has tasks in the group', async () => {
    renderBoard({ tasks: [{
      id: 'colleague-only', board_id: BOARD_ID, group_id: GROUP_ID, sub_group_id: null,
      title: 'Colleague-only task', position: 0, assignee_id: OTHER_USER_ID, assignee_ids: [OTHER_USER_ID],
      status: 'Not Started', status_color: '#c4c4c4',
    }] })
    expect(screen.queryByText('Colleague-only task')).toBeNull()
    fireEvent.click(screen.getByText('+ Add task', { exact: true }))
    await expectFocusedNewTitle()
    expectAutoAssignedTask()
  })

  it('creates the first group and a self-assigned task on an empty board', async () => {
    renderBoard({ groups: [], tasks: [] })
    fireEvent.click(screen.getByRole('button', { name: /Add your first task/ }))
    await expectFocusedNewTitle()
    expectAutoAssignedTask({ groupId: 'new-group-1' })
  })

  it('keeps Main Table task creation unassigned', async () => {
    renderBoard({ view: 'Main Table' })
    expect(screen.getByText('Colleague-only task')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^New Task$/ }))
    await screen.findByRole('textbox')

    expect(taskInserts()).toHaveLength(1)
    const payload = taskInserts()[0].payload
    expect(payload.created_by).toBe(USER_ID)
    expect(payload.assignee_id ?? null).toBeNull()
    expect(payload.assignee_ids ?? []).toEqual([])
    const activity = writes.find((write) => write.table === 'activity_log')
    expect(activity?.payload.meta.auto_assigned_user_id).toBeUndefined()
  })
})
