import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBoardStore } from '../src/stores/useBoardStore'

const database = vi.hoisted(() => ({ from: vi.fn(), failure: null, savedRow: undefined }))
vi.mock('../src/lib/supabase', () => ({ supabase: { from: database.from } }))

let writes
const task = () => useBoardStore.getState().tasks[0]
const update = (patch) => useBoardStore.getState().updateTask('task', patch)

beforeEach(() => {
  writes = []
  database.failure = null
  database.savedRow = undefined
  vi.useFakeTimers()
  // This is already the next day in India, even though UTC is September 28.
  vi.setSystemTime(new Date('2026-09-28T20:00:00Z'))
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('No live network in completion tests') }))
  database.from.mockImplementation((table) => {
    let payload
    const query = {
      update(value) { payload = value; writes.push({ table, payload }); return query },
      insert(value) { payload = value; writes.push({ table, payload }); return query },
      eq() { return query },
      select() { return query },
      single() { return Promise.resolve({
        data: database.savedRow !== undefined ? database.savedRow : { id: `created-${table}`, ...payload },
        error: database.failure,
      }) },
      then(resolve, reject) { return Promise.resolve({ error: database.failure }).then(resolve, reject) },
    }
    return query
  })
  useBoardStore.setState({
    ...useBoardStore.getInitialState(),
    currentBoard: { id: 'board' },
    groups: [
      { id: 'active', board_id: 'board', name: 'In Progress', position: 0 },
      { id: 'completed', board_id: 'board', name: 'Completed Tasks', position: 1 },
      { id: 'other-board-completed', board_id: 'other-board', name: 'Completed Tasks', position: 0 },
    ],
    subGroups: [
      { id: 'project', board_id: 'board', group_id: 'active', name: 'PatGen' },
      { id: 'completed-project', board_id: 'board', group_id: 'completed', name: 'PatGen' },
    ],
    tasks: [{
      id: 'task', board_id: 'board', group_id: 'active', sub_group_id: 'project',
      status: 'In Review', title: 'Validate shared panel', due_date: '2026-10-01',
      assignee_ids: ['me', 'colleague'], completed_date: null,
    }],
  }, true)
})

afterEach(() => {
  expect(fetch).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('shared task completion lifecycle', () => {
  it('saves status, mirrored project, and the India completion date in one task write', async () => {
    await update({ status: 'Done', status_color: '#00c875' })
    expect(writes).toEqual([{ table: 'tasks', payload: {
      status: 'Done', status_color: '#00c875', group_id: 'completed',
      sub_group_id: 'completed-project', completed_date: '2026-09-29',
    } }])
    expect(task()).toMatchObject({
      status: 'Done', group_id: 'completed', sub_group_id: 'completed-project',
      completed_date: '2026-09-29', due_date: '2026-10-01', assignee_ids: ['me', 'colleague'],
    })
  })

  it('creates a matching destination project before saving the completed task', async () => {
    useBoardStore.setState((s) => ({ subGroups: s.subGroups.filter((p) => p.id === 'project') }))
    await update({ status: 'Done' })
    expect(writes.map((w) => w.table)).toEqual(['sub_groups', 'tasks'])
    expect(task()).toMatchObject({ group_id: 'completed', sub_group_id: 'created-sub_groups' })
  })

  it.each(['In Review', 'Following Up', 'On Hold', null])('returns reopened %s work to its matching active project', async (status) => {
    await update({ status: 'Done' })
    writes = []
    await update({ status })
    expect(writes).toEqual([{ table: 'tasks', payload: {
      status, group_id: 'active', sub_group_id: 'project', completed_date: null,
    } }])
    expect(task()).toMatchObject({ group_id: 'active', sub_group_id: 'project', completed_date: null })
  })

  it('preserves manually edited dates through other edits, clears and restamps on recompletion', async () => {
    await update({ status: 'Done' })
    await update({ completed_date: '2026-09-25' })
    await update({ title: 'Renamed', status: 'Done' })
    expect(task().completed_date).toBe('2026-09-25')
    await update({ completed_date: null })
    await update({ title: 'Another edit' })
    expect(task().completed_date).toBeNull()
    await update({ status: 'In Review' })
    vi.setSystemTime(new Date('2026-09-30T06:00:00Z'))
    await update({ status: 'Done' })
    expect(task().completed_date).toBe('2026-09-30')
  })

  it('honors an explicit date supplied with completion', async () => {
    await update({ status: 'Done', completed_date: '2026-09-20' })
    expect(task().completed_date).toBe('2026-09-20')
  })

  it('applies valid status automations in the shared path and ignores invalid completed destinations', async () => {
    useBoardStore.setState((s) => ({
      groups: [...s.groups, { id: 'follow-up', board_id: 'board', name: 'Follow-up', position: 2 }],
      automations: [
        { enabled: true, trigger: { type: 'status_change', value: 'Following Up' }, action: { type: 'move_to_group', groupId: 'follow-up' } },
        { enabled: true, trigger: { type: 'status_change', value: 'Following Up' }, action: { type: 'move_to_group', groupId: 'completed' } },
      ],
    }))
    await update({ status: 'Following Up' })
    expect(task()).toMatchObject({ group_id: 'follow-up', status: 'Following Up' })
  })

  it('repairs existing misplaced work without losing the active project', async () => {
    useBoardStore.setState((s) => ({ tasks: [{ ...s.tasks[0], group_id: 'completed', sub_group_id: 'completed-project' }] }))
    await update({ title: 'Edit legacy task' })
    expect(task()).toMatchObject({ group_id: 'active', sub_group_id: 'project', status: 'In Review' })
  })

  it('matches active project names ignoring capitalization and outer whitespace', async () => {
    await update({ status: 'Done' })
    useBoardStore.setState((s) => ({
      groups: [{ id: 'unrelated', board_id: 'board', name: 'Other work', position: -1 }, ...s.groups],
      subGroups: s.subGroups.map((p) => p.id === 'project' ? { ...p, name: '  patgen  ' } : p),
    }))
    writes = []
    await update({ status: 'In Review' })
    expect(task()).toMatchObject({ group_id: 'active', sub_group_id: 'project' })
    expect(writes.map((w) => w.table)).toEqual(['tasks'])
  })

  it('uses the persisted completion fields instead of overwriting trigger corrections', async () => {
    database.savedRow = {
      ...task(), status: 'Done', group_id: 'completed', sub_group_id: 'completed-project',
      completed_date: '2026-09-28', position: 7,
    }
    await update({ status: 'Done' })
    expect(task()).toMatchObject({ status: 'Done', completed_date: '2026-09-28', position: 7 })
  })

  it('does not present a zero-row database update as saved', async () => {
    const before = task()
    database.savedRow = null
    await expect(update({ status: 'Done' })).rejects.toThrow('The task could not be updated')
    expect(task()).toBe(before)
  })

  it('creates an active group when reopening a completed-only board', async () => {
    await update({ status: 'Done' })
    useBoardStore.setState((s) => ({ groups: s.groups.filter((g) => g.id === 'completed') }))
    await update({ status: 'On Hold' })
    expect(task()).toMatchObject({ group_id: 'created-groups', sub_group_id: 'created-sub_groups', completed_date: null })
  })

  it('rejects moving unfinished work into a completed project', async () => {
    await expect(useBoardStore.getState().moveTaskToProject('task', 'completed-project'))
      .rejects.toThrow('Mark this task as Done')
    expect(writes).toEqual([])
    expect(task().group_id).toBe('active')
  })

  it('leaves local status and date unchanged when persistence fails', async () => {
    const before = task()
    database.failure = new Error('Permission denied')
    await expect(update({ status: 'Done' })).rejects.toThrow('Permission denied')
    expect(task()).toBe(before)
  })
})
