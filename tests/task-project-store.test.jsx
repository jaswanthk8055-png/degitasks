import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBoardStore } from '../src/stores/useBoardStore'

const database = vi.hoisted(() => ({ from: vi.fn(), single: vi.fn() }))
vi.mock('../src/lib/supabase', () => ({ supabase: { from: database.from } }))

const BOARD_ID = 'board-1'
const GROUP_ID = 'group-1'
const OTHER_GROUP_ID = 'group-2'
const PROJECT_ID = 'project-1'
const OTHER_PROJECT_ID = 'project-2'
const TASK_ID = 'task-1'
let writes
let fetchSpy

function task(overrides = {}) {
  return {
    id: TASK_ID,
    board_id: BOARD_ID,
    group_id: GROUP_ID,
    sub_group_id: null,
    title: 'Prepare shipping plan',
    position: 100,
    status: 'Working on it',
    status_color: '#fdab3d',
    assignee_id: 'member-1',
    assignee_ids: ['member-1', 'member-2'],
    due_date: '2026-10-10',
    priority: 'High',
    notes: 'Keep the client updated',
    created_by: 'member-2',
    ...overrides,
  }
}

function seed({ movingTask = task(), projects, groups, peers } = {}) {
  useBoardStore.setState({
    ...useBoardStore.getInitialState(),
    currentBoard: { id: BOARD_ID },
    groups: groups ?? [
      { id: GROUP_ID, board_id: BOARD_ID },
      { id: OTHER_GROUP_ID, board_id: BOARD_ID },
    ],
    subGroups: projects ?? [
      { id: PROJECT_ID, board_id: BOARD_ID, group_id: GROUP_ID },
      { id: OTHER_PROJECT_ID, board_id: BOARD_ID, group_id: OTHER_GROUP_ID },
    ],
    tasks: [movingTask, ...(peers ?? [
      task({ id: 'peer-1', position: 9 }),
      task({ id: 'peer-2', group_id: OTHER_GROUP_ID, sub_group_id: OTHER_PROJECT_ID, position: 50 }),
    ])],
    taskColumnValues: { [TASK_ID]: { 'custom-column': 'Original value' } },
  }, true)
}

function currentTask() {
  return useBoardStore.getState().tasks.find((candidate) => candidate.id === TASK_ID)
}

function moveTo(projectId) {
  return useBoardStore.getState().moveTaskToProject(TASK_ID, projectId)
}

beforeEach(() => {
  writes = []
  database.from.mockReset()
  database.single.mockReset()
  database.single.mockImplementation((row) => Promise.resolve({ data: row, error: null }))
  database.from.mockImplementation((table) => {
    if (table !== 'tasks') throw new Error(`Unexpected database table: ${table}`)
    let write
    const query = {
      update(payload) {
        write = { table, payload, filters: [], selected: false }
        writes.push(write)
        return query
      },
      eq(column, value) {
        write.filters.push({ column, value })
        return query
      },
      select() {
        write.selected = true
        return query
      },
      single() {
        const id = write.filters.find((filter) => filter.column === 'id')?.value
        const existing = useBoardStore.getState().tasks.find((candidate) => candidate.id === id)
        return database.single(existing ? { ...existing, ...write.payload } : null)
      },
    }
    return query
  })
  fetchSpy = vi.fn(() => { throw new Error('Live network calls are forbidden in task move tests') })
  vi.stubGlobal('fetch', fetchSpy)
  seed()
})

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

describe('moving tasks between projects', () => {
  it('moves an unprojected task into a project with one verified update and preserves its data', async () => {
    const before = currentTask()
    const peers = useBoardStore.getState().tasks.slice(1)
    const columnValues = useBoardStore.getState().taskColumnValues

    const moved = await moveTo(PROJECT_ID)

    expect(writes).toEqual([{
      table: 'tasks',
      payload: { group_id: GROUP_ID, sub_group_id: PROJECT_ID, position: 10 },
      filters: [{ column: 'id', value: TASK_ID }, { column: 'board_id', value: BOARD_ID }],
      selected: true,
    }])
    expect(database.single).toHaveBeenCalledOnce()
    expect(moved).toEqual({ ...before, sub_group_id: PROJECT_ID, position: 10 })
    expect(currentTask()).toEqual(moved)
    expect(useBoardStore.getState().tasks.slice(1)).toEqual(peers)
    expect(useBoardStore.getState().taskColumnValues).toBe(columnValues)
    expect(useBoardStore.getState().tasks).toHaveLength(3)
  })

  it('moves between projects in the same group and appends after the other tasks', async () => {
    seed({ movingTask: task({ sub_group_id: 'source-project' }) })

    await moveTo(PROJECT_ID)

    expect(currentTask()).toMatchObject({ group_id: GROUP_ID, sub_group_id: PROJECT_ID, position: 10 })
  })

  it('moves between groups by updating the group and project together', async () => {
    seed({ movingTask: task({ sub_group_id: PROJECT_ID }) })

    await moveTo(OTHER_PROJECT_ID)

    expect(writes).toHaveLength(1)
    expect(writes[0].payload).toEqual({ group_id: OTHER_GROUP_ID, sub_group_id: OTHER_PROJECT_ID, position: 51 })
    expect(currentTask()).toEqual(task({ group_id: OTHER_GROUP_ID, sub_group_id: OTHER_PROJECT_ID, position: 51 }))
  })

  it('removes the project while keeping the task in its current group', async () => {
    seed({ movingTask: task({ group_id: OTHER_GROUP_ID, sub_group_id: OTHER_PROJECT_ID }) })

    await moveTo(null)

    expect(currentTask()).toEqual(task({ group_id: OTHER_GROUP_ID, sub_group_id: null, position: 51 }))
  })

  it('uses the first position when the destination group has no tasks', async () => {
    seed({ peers: [] })

    await moveTo(OTHER_PROJECT_ID)

    expect(currentTask()).toMatchObject({ group_id: OTHER_GROUP_ID, sub_group_id: OTHER_PROJECT_ID, position: 0 })
  })

  it.each([null, PROJECT_ID])('does not write or change position when already in %s', async (projectId) => {
    seed({ movingTask: task({ sub_group_id: projectId }) })
    const before = currentTask()

    expect(await moveTo(projectId)).toBe(before)
    expect(currentTask()).toBe(before)
    expect(database.from).not.toHaveBeenCalled()
  })

  it.each([
    ['missing project', [], undefined, 'Choose a project from this board.'],
    ['another board', [{ id: PROJECT_ID, board_id: 'another-board', group_id: GROUP_ID }], undefined, 'Choose a project from this board.'],
    ['missing parent group', [{ id: PROJECT_ID, board_id: BOARD_ID, group_id: 'deleted-group' }], undefined, 'The destination group is no longer available.'],
    ['parent group from another board', undefined, [{ id: GROUP_ID, board_id: 'another-board' }], 'The destination group is no longer available.'],
  ])('rejects a %s without changing local or persisted tasks', async (_name, projects, groups, message) => {
    seed({ projects, groups })
    const before = useBoardStore.getState().tasks

    await expect(moveTo(PROJECT_ID)).rejects.toThrow(message)

    expect(useBoardStore.getState().tasks).toBe(before)
    expect(database.from).not.toHaveBeenCalled()
  })

  it('rejects a task that is no longer in the current store', async () => {
    await expect(useBoardStore.getState().moveTaskToProject('deleted-task', PROJECT_ID))
      .rejects.toThrow('This task is no longer available.')
    expect(database.from).not.toHaveBeenCalled()
  })

  it('propagates a database error and leaves the current placement unchanged', async () => {
    const error = { message: 'Permission denied', code: '42501' }
    database.single.mockResolvedValueOnce({ data: null, error })
    const before = useBoardStore.getState().tasks

    await expect(moveTo(PROJECT_ID)).rejects.toBe(error)

    expect(useBoardStore.getState().tasks).toBe(before)
  })

  it('rejects a write with no returned task instead of presenting it as a successful move', async () => {
    database.single.mockResolvedValueOnce({ data: null, error: null })
    const before = useBoardStore.getState().tasks

    await expect(moveTo(PROJECT_ID)).rejects.toThrow('The task could not be moved.')

    expect(useBoardStore.getState().tasks).toBe(before)
  })

  it('waits for persistence and preserves unrelated edits made while the move is pending', async () => {
    let finishSave
    database.single.mockImplementationOnce((row) => new Promise((resolve) => {
      finishSave = () => resolve({ data: row, error: null })
    }))
    const pending = moveTo(PROJECT_ID)
    expect(currentTask().sub_group_id).toBeNull()

    useBoardStore.getState().applyRealtimeEvent('tasks', 'UPDATE', { ...currentTask(), title: 'Updated while saving' })
    finishSave()
    await pending

    expect(currentTask()).toMatchObject({ title: 'Updated while saving', sub_group_id: PROJECT_ID, position: 10 })
  })

  it('does not restore a task deleted while its move request is pending', async () => {
    let finishSave
    database.single.mockImplementationOnce((row) => new Promise((resolve) => {
      finishSave = () => resolve({ data: row, error: null })
    }))
    const pending = moveTo(PROJECT_ID)

    useBoardStore.getState().applyRealtimeEvent('tasks', 'DELETE', null, { id: TASK_ID })
    finishSave()
    await pending

    expect(currentTask()).toBeUndefined()
    expect(useBoardStore.getState().tasks).toHaveLength(2)
  })
})
