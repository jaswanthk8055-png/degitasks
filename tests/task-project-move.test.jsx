import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import BoardPage from '../src/pages/BoardPage'
import { useAuthStore } from '../src/stores/useAuthStore'
import { useBoardStore } from '../src/stores/useBoardStore'
import { useToastStore } from '../src/stores/useToastStore'

const database = vi.hoisted(() => ({ from: vi.fn() }))

// Render the real board, rows, detail panel, picker, and store. Replace only
// database transport and background subscriptions so these tests stay offline.
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: database.from,
    channel: () => ({ on() { return this }, subscribe() { return this } }),
    removeChannel: vi.fn(),
  },
}))
vi.mock('../src/hooks/useBoard', () => ({ useBoard: () => ({ loading: false }) }))
vi.mock('../src/components/layout/NotificationBell', () => ({ default: () => null }))

const USER_ID = 'member-1'
const BOARD_ID = 'board-1'
const TASK_ID = 'task-to-move'
const TASK_TITLE = 'Prepare shipping plan'
let writes
let responseHandlers
let fetchSpy

function installDatabaseDouble() {
  database.from.mockImplementation((table) => {
    if (!['tasks', 'comments', 'activity_log'].includes(table)) {
      throw new Error(`Unexpected database access in project move test: ${table}`)
    }
    let operation
    const result = () => {
      if (table === 'comments') return Promise.resolve({ data: [], error: null })
      const original = useBoardStore.getState().tasks.find((task) => (
        task.id === operation?.filters.find((filter) => filter.column === 'id')?.value
      ))
      const data = { ...original, ...operation?.payload }
      return responseHandlers.shift()?.(data) ?? Promise.resolve({ data, error: null })
    }
    const query = {
      update(payload) {
        operation = { table, payload: structuredClone(payload), filters: [] }
        writes.push(operation)
        return query
      },
      insert() { return query },
      select() { return query },
      eq(column, value) { operation?.filters.push({ column, value }); return query },
      order() { return query },
      single: result,
      then(resolve, reject) { return result().then(resolve, reject) },
    }
    return query
  })
}

function renderBoard({ projectId = null, view = 'My Tasks' } = {}) {
  const profile = { id: USER_ID, full_name: 'Team Member', email: 'member@example.test', default_page: view }
  const colleague = { id: 'member-2', full_name: 'Colleague' }
  const board = { id: BOARD_ID, workspace_id: 'workspace-1', name: 'Team Work', icon: '📋' }
  const task = {
    id: TASK_ID,
    board_id: BOARD_ID,
    group_id: 'group-1',
    sub_group_id: projectId,
    title: TASK_TITLE,
    description: 'Keep these shipment details',
    assignee_id: USER_ID,
    assignee_ids: [USER_ID],
    created_by: USER_ID,
    status: 'Not Started',
    status_color: '#c4c4c4',
    due_date: null,
    priority: null,
    position: 1,
  }
  useAuthStore.setState({
    ...useAuthStore.getInitialState(), user: { id: USER_ID, email: profile.email }, profile, loading: false,
  }, true)
  useBoardStore.setState({
    ...useBoardStore.getInitialState(),
    boards: [board], currentBoard: board, workspaceId: board.workspace_id,
    profiles: [profile, colleague], memberProfiles: [profile, colleague],
    statusOptions: [{ label: 'Not Started', color: '#c4c4c4' }],
    groups: [
      { id: 'group-1', board_id: BOARD_ID, name: 'To Do', color: '#0073ea', position: 0 },
      { id: 'group-2', board_id: BOARD_ID, name: 'In Progress', color: '#00c875', position: 1 },
    ],
    subGroups: [
      { id: 'source-project', board_id: BOARD_ID, group_id: 'group-1', name: 'Source Project', position: 0 },
      { id: 'empty-project', board_id: BOARD_ID, group_id: 'group-2', name: 'Empty Project', position: 0 },
      { id: 'colleague-project', board_id: BOARD_ID, group_id: 'group-2', name: 'Colleague Project', position: 1 },
      { id: 'foreign-project', board_id: 'other-board', group_id: 'other-group', name: 'Other Board Project', position: 0 },
    ],
    tasks: [task, {
      ...task, id: 'colleague-task', title: 'Colleague-only task', assignee_id: colleague.id,
      assignee_ids: [colleague.id], group_id: 'group-2', sub_group_id: 'colleague-project', position: 4,
    }],
  }, true)
  useToastStore.setState(useToastStore.getInitialState(), true)
  const rendered = render(
    <MemoryRouter initialEntries={[`/board/${BOARD_ID}`]}>
      <Routes><Route path="/board/:boardId" element={<BoardPage />} /></Routes>
    </MemoryRouter>,
  )
  return { ...rendered, task }
}

function openRowPicker() {
  fireEvent.click(screen.getByRole('button', { name: `Move "${TASK_TITLE}" to project` }))
  return screen.getByRole('combobox', { name: 'Destination project' })
}

function chooseDestination(select, projectId) {
  fireEvent.change(select, { target: { value: projectId } })
}

function movedTask() {
  return useBoardStore.getState().tasks.find((task) => task.id === TASK_ID)
}

beforeEach(() => {
  localStorage.clear()
  writes = []
  responseHandlers = []
  database.from.mockReset()
  installDatabaseDouble()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  fetchSpy = vi.fn(() => { throw new Error('Live network calls are forbidden in project move tests') })
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  cleanup()
  expect(fetchSpy).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

describe('moving tasks between projects through the board UI', () => {
  it('lets My Tasks move an unprojected task into an empty project hidden by the view', async () => {
    const { container, task } = renderBoard()
    expect(screen.queryByText('Empty Project')).toBeNull()
    expect(screen.queryByText('Colleague Project')).toBeNull()

    const select = openRowPicker()
    expect(container.contains(select)).toBe(false)
    expect(document.activeElement).toBe(select)
    expect(select.value).toBe('')
    expect(screen.getByRole('button', { name: 'Move task' }).disabled).toBe(true)
    expect(within(select).getByRole('option', { name: 'No project' })).toBeTruthy()
    expect(within(select).getByRole('option', { name: 'Empty Project' })).toBeTruthy()
    expect(within(select).getByRole('option', { name: 'Colleague Project' })).toBeTruthy()
    expect(within(select).queryByRole('option', { name: 'Other Board Project' })).toBeNull()

    chooseDestination(select, 'empty-project')
    fireEvent.click(screen.getByRole('button', { name: 'Move task' }))
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Destination project' })).toBeNull())

    expect(movedTask()).toEqual({ ...task, group_id: 'group-2', sub_group_id: 'empty-project', position: 5 })
    expect(screen.getByText('Empty Project')).toBeTruthy()
    expect(screen.getByText(TASK_TITLE)).toBeTruthy()
    expect(screen.queryByText('Colleague-only task')).toBeNull()
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({
      table: 'tasks', payload: { group_id: 'group-2', sub_group_id: 'empty-project', position: 5 },
      filters: expect.arrayContaining([{ column: 'id', value: TASK_ID }, { column: 'board_id', value: BOARD_ID }]),
    })
    expect(useToastStore.getState().toasts.at(-1).type).toBe('success')
  })

  it('moves between projects across groups and can remove the project afterward', async () => {
    const { task } = renderBoard({ projectId: 'source-project' })
    let select = openRowPicker()
    expect(select.value).toBe('source-project')
    expect(screen.getByRole('button', { name: 'Move task' }).disabled).toBe(true)
    chooseDestination(select, 'colleague-project')
    fireEvent.click(screen.getByRole('button', { name: 'Move task' }))

    await waitFor(() => expect(movedTask()?.sub_group_id).toBe('colleague-project'))
    expect(screen.getByText('Colleague Project')).toBeTruthy()
    expect(screen.queryByText('Source Project')).toBeNull()
    expect(screen.getByText(TASK_TITLE)).toBeTruthy()
    expect(screen.queryByText('Colleague-only task')).toBeNull()

    select = openRowPicker()
    expect(select.value).toBe('colleague-project')
    chooseDestination(select, '')
    fireEvent.click(screen.getByRole('button', { name: 'Move task' }))
    await waitFor(() => expect(movedTask()?.sub_group_id).toBeNull())

    expect(movedTask()).toEqual({ ...task, group_id: 'group-2', sub_group_id: null, position: 5 })
    expect(screen.getByText(TASK_TITLE)).toBeTruthy()
    expect(screen.queryByText('Colleague Project')).toBeNull()
    expect(writes).toHaveLength(2)
    expect(writes[1].payload).toMatchObject({ group_id: 'group-2', sub_group_id: null })
  })

  it('keeps a task visible after moving into a project while grouped by status', async () => {
    renderBoard({ view: 'Main Table' })
    fireEvent.click(screen.getByRole('button', { name: 'Group by', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Status By task status' }))
    expect(screen.getByText(TASK_TITLE)).toBeTruthy()

    const select = openRowPicker()
    chooseDestination(select, 'empty-project')
    fireEvent.click(screen.getByRole('button', { name: 'Move task' }))
    await waitFor(() => expect(movedTask()?.sub_group_id).toBe('empty-project'))

    expect(screen.getByText(TASK_TITLE)).toBeTruthy()
    expect(screen.getByRole('button', { name: `Move "${TASK_TITLE}" to project` })).toBeTruthy()
    expect(movedTask()?.status).toBe('Not Started')
  })

  it('preserves task placement on save failure, shows the error, and lets the user retry', async () => {
    const { task } = renderBoard({ projectId: 'source-project' })
    responseHandlers.push(() => Promise.resolve({ data: null, error: new Error('Move permission denied') }))
    const select = openRowPicker()
    chooseDestination(select, 'empty-project')
    fireEvent.click(screen.getByRole('button', { name: 'Move task' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(movedTask()).toEqual(task)
    expect(select.value).toBe('empty-project')
    expect(screen.getByRole('button', { name: 'Move task' }).disabled).toBe(false)
    expect(useToastStore.getState().toasts.at(-1).type).toBe('error')

    fireEvent.click(screen.getByRole('button', { name: 'Move task' }))
    await waitFor(() => expect(movedTask()?.sub_group_id).toBe('empty-project'))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Destination project' })).toBeNull()
    expect(writes).toHaveLength(2)
    expect(useToastStore.getState().toasts.at(-1).type).toBe('success')
  })

  it('blocks repeated submission while saving and applies placement only after confirmation', async () => {
    const { task } = renderBoard()
    let resolveSave
    responseHandlers.push((data) => new Promise((resolve) => {
      resolveSave = () => resolve({ data, error: null })
    }))
    const select = openRowPicker()
    chooseDestination(select, 'empty-project')
    const form = select.closest('form')
    fireEvent.submit(form)
    fireEvent.submit(form)

    expect(writes).toHaveLength(1)
    expect(movedTask()).toEqual(task)
    expect(select.disabled).toBe(true)
    expect(form.querySelector('button[type="submit"]').disabled).toBe(true)

    await act(async () => resolveSave())
    await waitFor(() => expect(movedTask()?.sub_group_id).toBe('empty-project'))
    expect(writes).toHaveLength(1)
    expect(screen.queryByRole('combobox', { name: 'Destination project' })).toBeNull()
  })

  it('supports the detail panel without portal clicks or menu Escape closing the panel', async () => {
    renderBoard({ projectId: 'source-project' })
    fireEvent.click(screen.getByTitle('Open details'))
    expect(screen.getByText('Task Details')).toBeTruthy()
    // The panel delays its outside-click listener to ignore the opening click.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)) })

    const trigger = screen.getByRole('button', { name: 'Move to project', exact: true })
    fireEvent.click(trigger)
    let select = screen.getByRole('combobox', { name: 'Destination project' })
    fireEvent.mouseDown(select)
    expect(screen.getByText('Task Details')).toBeTruthy()
    fireEvent.keyDown(select, { key: 'Escape' })
    expect(screen.queryByRole('combobox', { name: 'Destination project' })).toBeNull()
    expect(screen.getByText('Task Details')).toBeTruthy()
    expect(document.activeElement).toBe(trigger)

    fireEvent.click(trigger)
    select = screen.getByRole('combobox', { name: 'Destination project' })
    chooseDestination(select, 'empty-project')
    const submit = screen.getByRole('button', { name: 'Move task' })
    fireEvent.mouseDown(submit)
    fireEvent.click(submit)
    await waitFor(() => expect(movedTask()?.sub_group_id).toBe('empty-project'))

    expect(screen.getByText('Task Details')).toBeTruthy()
    expect(screen.getByRole('heading', { name: TASK_TITLE })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Move to project', exact: true }).textContent).toContain('Empty Project')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Task Details')).toBeNull()
  })
})
