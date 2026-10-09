import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBoardStore } from '../src/stores/useBoardStore'

const database = vi.hoisted(() => ({ from: vi.fn(), detach: vi.fn(), remove: vi.fn() }))
vi.mock('../src/lib/supabase', () => ({ supabase: { from: database.from } }))

const project = { id: 'project', board_id: 'board', group_id: 'group', name: 'Shipping' }
const projectTask = {
  id: 'task', board_id: 'board', group_id: 'group', sub_group_id: 'project',
  title: 'Prepare shipment', notes: 'Handle carefully', position: 7,
}
let writes
let fetchSpy

function removeProject() {
  return useBoardStore.getState().deleteSubGroup(project.id)
}

function currentTask() {
  return useBoardStore.getState().tasks.find((task) => task.id === projectTask.id)
}

beforeEach(() => {
  writes = []
  database.from.mockReset()
  database.detach.mockReset()
  database.remove.mockReset()
  database.detach.mockImplementation(() => Promise.resolve({
    data: useBoardStore.getState().tasks.filter((task) => (
      task.board_id === project.board_id && task.sub_group_id === project.id
    )).map((task) => ({ id: task.id, sub_group_id: null })), error: null,
  }))
  database.remove.mockResolvedValue({ data: { id: project.id }, error: null })
  database.from.mockImplementation((table) => {
    let write
    const query = {
      update(payload) {
        write = { table, action: 'update', payload, filters: [] }
        writes.push(write)
        return query
      },
      delete() {
        write = { table, action: 'delete', filters: [] }
        writes.push(write)
        return query
      },
      eq(column, value) {
        write.filters.push({ column, value })
        return query
      },
      select(columns) {
        write.selected = columns
        return query
      },
      single() {
        if (table !== 'sub_groups') throw new Error(`Unexpected table: ${table}`)
        return database.remove()
      },
      then(resolve, reject) {
        if (table !== 'tasks') throw new Error(`Unexpected table: ${table}`)
        return database.detach().then(resolve, reject)
      },
    }
    return query
  })
  useBoardStore.setState({
    ...useBoardStore.getInitialState(),
    currentBoard: { id: 'board' },
    subGroups: [project, { id: 'other-project', board_id: 'board', group_id: 'group' }],
    tasks: [projectTask, { ...projectTask, id: 'other-task', sub_group_id: 'other-project' }],
    taskColumnValues: { task: { column: 'Saved value' } },
  }, true)
  fetchSpy = vi.fn(() => { throw new Error('Live network calls are forbidden in project deletion tests') })
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

describe('project deletion persistence', () => {
  it('detaches project tasks before deletion while preserving the group, content and custom fields', async () => {
    const columnValues = useBoardStore.getState().taskColumnValues
    const otherTask = useBoardStore.getState().tasks[1]

    await removeProject()

    expect(writes).toEqual([
      {
        table: 'tasks', action: 'update', payload: { sub_group_id: null },
        filters: [{ column: 'sub_group_id', value: 'project' }, { column: 'board_id', value: 'board' }],
        selected: 'id, sub_group_id',
      },
      {
        table: 'sub_groups', action: 'delete',
        filters: [{ column: 'id', value: 'project' }, { column: 'board_id', value: 'board' }],
        selected: 'id',
      },
    ])
    expect(currentTask()).toEqual({ ...projectTask, sub_group_id: null })
    expect(useBoardStore.getState().tasks[1]).toBe(otherTask)
    expect(useBoardStore.getState().tasks).toHaveLength(2)
    expect(useBoardStore.getState().subGroups.map((candidate) => candidate.id)).toEqual(['other-project'])
    expect(useBoardStore.getState().taskColumnValues).toBe(columnValues)
  })

  it('does not delete the project or alter local tasks when detachment returns an error', async () => {
    const error = { message: 'Task update denied', code: '42501' }
    database.detach.mockResolvedValueOnce({ data: null, error })
    const before = useBoardStore.getState()

    await expect(removeProject()).rejects.toBe(error)

    expect(database.remove).not.toHaveBeenCalled()
    expect(useBoardStore.getState().tasks).toBe(before.tasks)
    expect(useBoardStore.getState().subGroups).toBe(before.subGroups)
  })

  it('keeps confirmed detached tasks and the project after a failed delete, allowing retry', async () => {
    const error = { message: 'Project deletion denied', code: '42501' }
    database.remove.mockResolvedValueOnce({ data: null, error })
    const projects = useBoardStore.getState().subGroups

    await expect(removeProject()).rejects.toBe(error)

    expect(currentTask()).toEqual({ ...projectTask, sub_group_id: null })
    expect(useBoardStore.getState().subGroups).toBe(projects)

    await removeProject()

    expect(currentTask()).toEqual({ ...projectTask, sub_group_id: null })
    expect(useBoardStore.getState().subGroups).not.toContain(project)
    expect(database.remove).toHaveBeenCalledTimes(2)
  })

  it('retains the project when deletion returns no record', async () => {
    database.remove.mockResolvedValueOnce({ data: null, error: null })

    await expect(removeProject()).rejects.toThrow('The project could not be deleted.')

    expect(currentTask().sub_group_id).toBeNull()
    expect(useBoardStore.getState().subGroups).toContain(project)
  })

  it('does not attempt deletion when detachment has no verifiable response', async () => {
    database.detach.mockResolvedValueOnce({ data: null, error: null })

    await expect(removeProject()).rejects.toThrow('Project tasks could not be detached.')

    expect(database.remove).not.toHaveBeenCalled()
    expect(currentTask()).toBe(projectTask)
    expect(useBoardStore.getState().subGroups).toContain(project)
  })

  it('keeps partial confirmed changes but stops when some loaded tasks were not detached', async () => {
    const inaccessibleTask = { ...projectTask, id: 'inaccessible-task' }
    useBoardStore.setState((state) => ({ tasks: [...state.tasks, inaccessibleTask] }))
    database.detach.mockResolvedValueOnce({ data: [{ id: 'task', sub_group_id: null }], error: null })

    await expect(removeProject()).rejects.toThrow('Some project tasks could not be detached.')

    expect(currentTask().sub_group_id).toBeNull()
    expect(useBoardStore.getState().tasks).toContain(inaccessibleTask)
    expect(useBoardStore.getState().subGroups).toContain(project)
    expect(database.remove).not.toHaveBeenCalled()
  })

  it('rejects a project absent from the loaded store before issuing a query', async () => {
    await expect(useBoardStore.getState().deleteSubGroup('missing-project'))
      .rejects.toThrow('This project is no longer available.')

    expect(database.from).not.toHaveBeenCalled()
  })

  it('preserves unrelated edits and board tasks while detachment waits', async () => {
    let finishDetach
    database.detach.mockImplementationOnce(() => new Promise((resolve) => {
      finishDetach = () => resolve({ data: [{ id: 'task', sub_group_id: null }], error: null })
    }))
    const otherBoardTask = { ...projectTask, id: 'other-board-task', board_id: 'other-board' }
    useBoardStore.setState((state) => ({ tasks: [...state.tasks, otherBoardTask] }))
    const pending = removeProject()
    await vi.waitFor(() => expect(finishDetach).toBeTypeOf('function'))

    useBoardStore.getState().applyRealtimeEvent('tasks', 'UPDATE', { ...projectTask, title: 'Updated during deletion' })
    finishDetach()
    await pending

    expect(currentTask()).toMatchObject({ title: 'Updated during deletion', sub_group_id: null, group_id: 'group' })
    expect(useBoardStore.getState().tasks).toContain(otherBoardTask)
  })

  it('does not restore a task removed while detachment is pending', async () => {
    let finishDetach
    database.detach.mockImplementationOnce(() => new Promise((resolve) => {
      finishDetach = () => resolve({ data: [{ id: 'task', sub_group_id: null }], error: null })
    }))
    const pending = removeProject()
    await vi.waitFor(() => expect(finishDetach).toBeTypeOf('function'))

    useBoardStore.getState().applyRealtimeEvent('tasks', 'DELETE', null, { id: projectTask.id })
    finishDetach()
    await pending

    expect(currentTask()).toBeUndefined()
    expect(useBoardStore.getState().tasks).toHaveLength(1)
  })
})
