import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBoardStore } from '../src/stores/useBoardStore'

const database = vi.hoisted(() => ({ from: vi.fn(), save: vi.fn() }))
vi.mock('../src/lib/supabase', () => ({ supabase: { from: database.from } }))

const BOARD_ID = 'board-1'
const TO_DO_ID = 'to-do'
const COMPLETED_ID = 'completed'
const SOURCE_ID = 'completed-project'
const PROJECT_NAME = 'Shipping Portal'
let writes
let rowSequence
let fetchSpy

function seed({ withToDo = true, sourceName = PROJECT_NAME, extraProjects = [] } = {}) {
  const completedGroup = { id: COMPLETED_ID, board_id: BOARD_ID, name: 'Completed Tasks', color: '#00c875', position: 1 }
  const toDoGroup = { id: TO_DO_ID, board_id: BOARD_ID, name: 'To Do', color: '#0073ea', position: 0 }
  const project = { id: SOURCE_ID, board_id: BOARD_ID, group_id: COMPLETED_ID, name: sourceName, position: 0 }
  const task = {
    id: 'completed-task', board_id: BOARD_ID, group_id: COMPLETED_ID, sub_group_id: SOURCE_ID,
    title: 'Prior shipment', status: 'Done', completed_date: '2026-10-08', position: 0,
  }
  useBoardStore.setState({
    ...useBoardStore.getInitialState(),
    currentBoard: { id: BOARD_ID }, groups: withToDo ? [toDoGroup, completedGroup] : [completedGroup],
    subGroups: [project, ...extraProjects], tasks: [task],
    taskColumnValues: { [task.id]: { notes: 'Retain history' } },
  }, true)
  return { project, task, toDoGroup, completedGroup }
}

function activate(projectId = SOURCE_ID) {
  return useBoardStore.getState().activateProjectForNewTask(projectId)
}

beforeEach(() => {
  writes = []
  rowSequence = 0
  database.from.mockReset()
  database.save.mockReset()
  database.save.mockImplementation((row) => Promise.resolve({ data: row, error: null }))
  database.from.mockImplementation((table) => {
    if (!['groups', 'sub_groups'].includes(table)) throw new Error(`Unexpected database access: ${table}`)
    let row
    const query = {
      insert(payload) {
        writes.push({ table, payload: structuredClone(payload) })
        row = { id: `created-${table}-${++rowSequence}`, ...payload }
        return query
      },
      select() { return query },
      single() { return database.save(row) },
    }
    return query
  })
  fetchSpy = vi.fn(() => { throw new Error('Live network calls are forbidden in project reuse tests') })
  vi.stubGlobal('fetch', fetchSpy)
  seed()
})

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

describe('activating an existing logical project for a new task', () => {
  it('reuses an empty To Do counterpart across case, Unicode, and whitespace variants without writes', async () => {
    const active = { id: 'active-project', board_id: BOARD_ID, group_id: TO_DO_ID, name: '  shipping   portal  ', position: 0 }
    const { project, task } = seed({ sourceName: 'ＳＨＩＰＰＩＮＧ　ＰＯＲＴＡＬ', extraProjects: [active] })
    const before = useBoardStore.getState()

    expect(await activate()).toBe(active)
    expect(await activate(active.id)).toBe(active)

    expect(database.from).not.toHaveBeenCalled()
    expect(useBoardStore.getState().groups).toBe(before.groups)
    expect(useBoardStore.getState().subGroups).toBe(before.subGroups)
    expect(useBoardStore.getState().tasks).toEqual([task])
    expect(useBoardStore.getState().subGroups).toContain(project)
  })

  it('creates a To Do counterpart while preserving completed projects, tasks, and custom data', async () => {
    const { project, task } = seed()
    const before = useBoardStore.getState()

    const active = await activate()

    expect(writes).toEqual([{ table: 'sub_groups', payload: { board_id: BOARD_ID, group_id: TO_DO_ID, name: PROJECT_NAME, position: 0 } }])
    expect(active).toMatchObject({ id: 'created-sub_groups-1', board_id: BOARD_ID, group_id: TO_DO_ID, name: PROJECT_NAME })
    expect(useBoardStore.getState().subGroups).toEqual([project, active])
    expect(useBoardStore.getState().tasks).toBe(before.tasks)
    expect(useBoardStore.getState().tasks[0]).toBe(task)
    expect(useBoardStore.getState().taskColumnValues).toBe(before.taskColumnValues)
    expect(await activate()).toBe(active)
    expect(writes).toHaveLength(1)
  })

  it('creates the exact To Do group when the project is in another active group', async () => {
    seed({ withToDo: false })
    useBoardStore.setState((state) => ({
      groups: [...state.groups, { id: 'working', board_id: BOARD_ID, name: 'In Progress', position: 2 }],
      subGroups: [...state.subGroups, { id: 'working-project', board_id: BOARD_ID, group_id: 'working', name: PROJECT_NAME, position: 0 }],
    }))
    const before = useBoardStore.getState()

    const active = await activate('working-project')

    expect(writes).toHaveLength(2)
    expect(writes[0]).toMatchObject({ table: 'groups', payload: { board_id: BOARD_ID, name: 'To Do', position: 2 } })
    expect(writes[1]).toMatchObject({ table: 'sub_groups', payload: { board_id: BOARD_ID, group_id: 'created-groups-1', name: PROJECT_NAME, position: 0 } })
    expect(active.group_id).toBe('created-groups-1')
    expect(useBoardStore.getState().subGroups.slice(0, 2)).toEqual(before.subGroups)
    expect(useBoardStore.getState().tasks).toBe(before.tasks)
  })

  it('uses an existing normalized To Do group and ignores groups and projects from other boards', async () => {
    seed({ withToDo: false })
    useBoardStore.setState((state) => ({
      groups: [
        ...state.groups,
        { id: 'foreign-to-do', board_id: 'other-board', name: 'To Do' },
        { id: 'to-do-later', board_id: BOARD_ID, name: 'To Do Later' },
        { id: 'normalized-to-do', board_id: BOARD_ID, name: ' Ｔｏ　 Ｄｏ ' },
      ],
      subGroups: [...state.subGroups, { id: 'foreign-project', board_id: 'other-board', group_id: 'foreign-to-do', name: PROJECT_NAME }],
    }))

    const active = await activate()

    expect(writes).toHaveLength(1)
    expect(active.group_id).toBe('normalized-to-do')
    expect(writes[0].payload.board_id).toBe(BOARD_ID)
    expect(useBoardStore.getState().subGroups.find((project) => project.id === 'foreign-project')).toBeTruthy()
  })

  it('serializes simultaneous selections of the same logical name into one counterpart', async () => {
    seed({ withToDo: false, extraProjects: [{ id: 'equivalent-source', board_id: BOARD_ID, group_id: COMPLETED_ID, name: 'shipping   PORTAL', position: 1 }] })
    let finishGroup
    database.save.mockImplementationOnce((row) => new Promise((resolve) => { finishGroup = () => resolve({ data: row, error: null }) }))

    const first = activate()
    const second = activate('equivalent-source')
    await vi.waitFor(() => expect(finishGroup).toBeTypeOf('function'))
    expect(writes).toHaveLength(1)
    finishGroup()
    const [firstProject, secondProject] = await Promise.all([first, second])

    expect(secondProject).toBe(firstProject)
    expect(writes.map((write) => write.table)).toEqual(['groups', 'sub_groups'])
    expect(useBoardStore.getState().subGroups.filter((project) => project.group_id === firstProject.group_id)).toEqual([firstProject])
  })

  it('shares To Do group creation across simultaneous activations of different names', async () => {
    seed({ withToDo: false, extraProjects: [{ id: 'other-source', board_id: BOARD_ID, group_id: COMPLETED_ID, name: 'Accounts Portal', position: 1 }] })
    let finishGroup
    database.save.mockImplementationOnce((row) => new Promise((resolve) => { finishGroup = () => resolve({ data: row, error: null }) }))

    const first = activate()
    const second = activate('other-source')
    await vi.waitFor(() => expect(finishGroup).toBeTypeOf('function'))
    expect(writes).toHaveLength(1)
    finishGroup()
    const projects = await Promise.all([first, second])

    expect(projects.map((project) => project.group_id)).toEqual(['created-groups-1', 'created-groups-1'])
    expect(writes.filter((write) => write.table === 'groups')).toHaveLength(1)
    expect(writes.filter((write) => write.table === 'sub_groups')).toHaveLength(2)
  })

  it('rechecks projects after group creation and reuses a realtime counterpart', async () => {
    seed({ withToDo: false })
    let finishGroup
    let savedGroup
    database.save.mockImplementationOnce((row) => new Promise((resolve) => {
      savedGroup = row
      finishGroup = () => resolve({ data: row, error: null })
    }))
    const pending = activate()
    await vi.waitFor(() => expect(finishGroup).toBeTypeOf('function'))
    const counterpart = { id: 'realtime-project', board_id: BOARD_ID, group_id: savedGroup.id, name: PROJECT_NAME, position: 0 }
    useBoardStore.getState().applyRealtimeEvent('groups', 'INSERT', savedGroup)
    useBoardStore.getState().applyRealtimeEvent('sub_groups', 'INSERT', counterpart)
    finishGroup()

    expect(await pending).toBe(counterpart)
    expect(writes.map((write) => write.table)).toEqual(['groups'])
    expect(useBoardStore.getState().groups.filter((group) => group.id === savedGroup.id)).toHaveLength(1)
  })

  it.each([false, true])('propagates save errors and clears serialization for retry (create group: %s)', async (withGroupCreation) => {
    const { project } = seed({ withToDo: !withGroupCreation })
    const error = { message: 'Project write denied', code: '42501' }
    database.save.mockResolvedValueOnce({ data: null, error })
    const before = useBoardStore.getState()

    await expect(activate()).rejects.toBe(error)
    expect(useBoardStore.getState().groups).toBe(before.groups)
    expect(useBoardStore.getState().subGroups).toBe(before.subGroups)
    expect(useBoardStore.getState().tasks).toBe(before.tasks)

    const active = await activate()
    expect(active.board_id).toBe(BOARD_ID)
    expect(useBoardStore.getState().subGroups).toContain(project)
  })

  it.each([false, true])('rejects an unverifiable insert result (create group: %s)', async (withGroupCreation) => {
    seed({ withToDo: !withGroupCreation })
    const before = useBoardStore.getState()
    database.save.mockResolvedValueOnce({ data: null, error: null })

    await expect(activate()).rejects.toThrow(withGroupCreation ? 'The To Do group could not be created.' : 'The project could not be added to To Do.')
    expect(useBoardStore.getState().groups).toBe(before.groups)
    expect(useBoardStore.getState().subGroups).toBe(before.subGroups)
    expect(useBoardStore.getState().tasks).toBe(before.tasks)
  })

  it('rejects absent board, absent or foreign project, orphan project, and blank names before writes', async () => {
    useBoardStore.setState({ currentBoard: null })
    await expect(activate()).rejects.toThrow('Open a board')
    seed()
    await expect(activate('missing-project')).rejects.toThrow('This project is no longer available.')
    useBoardStore.setState((state) => ({ subGroups: [...state.subGroups, { id: 'foreign-project', board_id: 'other-board', group_id: COMPLETED_ID, name: PROJECT_NAME }] }))
    await expect(activate('foreign-project')).rejects.toThrow('This project is no longer available.')
    useBoardStore.setState((state) => ({ groups: state.groups.filter((group) => group.id !== COMPLETED_ID) }))
    await expect(activate()).rejects.toThrow('This project is no longer available.')
    seed({ sourceName: '　\t　' })
    await expect(activate()).rejects.toThrow('This project needs a name')
    expect(database.from).not.toHaveBeenCalled()
  })

  it.each([false, true])('does not add saved rows to a different board after navigation (create group: %s)', async (withGroupCreation) => {
    seed({ withToDo: !withGroupCreation })
    let finishSave
    database.save.mockImplementationOnce((row) => new Promise((resolve) => { finishSave = () => resolve({ data: row, error: null }) }))
    const pending = activate()
    const rejection = expect(pending).rejects.toThrow('The board changed.')
    await vi.waitFor(() => expect(finishSave).toBeTypeOf('function'))
    useBoardStore.setState({ currentBoard: { id: 'other-board' }, groups: [], subGroups: [], tasks: [] })
    finishSave()
    await rejection

    expect(useBoardStore.getState().groups).toEqual([])
    expect(useBoardStore.getState().subGroups).toEqual([])
    expect(useBoardStore.getState().tasks).toEqual([])
    expect(writes).toHaveLength(1)
  })

  it('does not create a counterpart when the selected project changes while the group is saved', async () => {
    seed({ withToDo: false })
    let finishGroup
    database.save.mockImplementationOnce((row) => new Promise((resolve) => { finishGroup = () => resolve({ data: row, error: null }) }))
    const pending = activate()
    const rejection = expect(pending).rejects.toThrow('The selected project changed.')
    await vi.waitFor(() => expect(finishGroup).toBeTypeOf('function'))
    useBoardStore.setState((state) => ({ subGroups: state.subGroups.map((project) => ({ ...project, name: 'Renamed Project' })) }))
    finishGroup()
    await rejection

    expect(writes.map((write) => write.table)).toEqual(['groups'])
    expect(useBoardStore.getState().subGroups).toHaveLength(1)
  })
})
