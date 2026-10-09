import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import BoardPage from '../src/pages/BoardPage'
import { useAuthStore } from '../src/stores/useAuthStore'
import { useBoardStore } from '../src/stores/useBoardStore'
import { useToastStore } from '../src/stores/useToastStore'

const database = vi.hoisted(() => ({ from: vi.fn() }))

// Keep the full page, details, status menu, and store; isolate only external I/O.
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: database.from,
    channel: () => ({ on() { return this }, subscribe() { return this } }),
    removeChannel: vi.fn(),
  },
}))
vi.mock('../src/hooks/useBoard', () => ({ useBoard: () => ({ loading: false }) }))
vi.mock('../src/components/layout/NotificationBell', () => ({ default: () => null }))

const BOARD_ID = 'completion-board'
const USER_ID = 'completion-user'
const TASK_ID = 'detail-task'
const TASK_TITLE = 'Check delivery documents'
let writes
let fetchSpy
let responseHandlers

function seedAndRender(status) {
  const profile = { id: USER_ID, full_name: 'Team Member', email: 'member@example.test', default_page: 'My Tasks' }
  const board = { id: BOARD_ID, workspace_id: 'workspace-1', name: 'Team Work' }
  const task = {
    id: TASK_ID, title: TASK_TITLE, board_id: BOARD_ID,
    group_id: status === 'Done' ? 'completed-group' : 'active-group',
    sub_group_id: status === 'Done' ? 'completed-project' : 'active-project',
    status, status_color: status === 'Done' ? '#00c875' : '#0086c0',
    completed_date: status === 'Done' ? '2025-01-02' : null,
    assignee_id: USER_ID, assignee_ids: [USER_ID], created_by: USER_ID,
    due_date: null, priority: null, position: 0,
  }
  useAuthStore.setState({ ...useAuthStore.getInitialState(), user: { id: USER_ID, email: profile.email }, profile, loading: false }, true)
  useBoardStore.setState({
    ...useBoardStore.getInitialState(),
    currentBoard: board, boards: [board], workspaceId: board.workspace_id,
    profiles: [profile], memberProfiles: [profile], tasks: [task],
    groups: [
      { id: 'active-group', board_id: BOARD_ID, name: 'To Do', color: '#0073ea', position: 0 },
      { id: 'completed-group', board_id: BOARD_ID, name: 'Completed Tasks', color: '#00c875', position: 1 },
    ],
    subGroups: [
      { id: 'active-project', board_id: BOARD_ID, group_id: 'active-group', name: 'Delivery', position: 0 },
      { id: 'completed-project', board_id: BOARD_ID, group_id: 'completed-group', name: 'Delivery', position: 0 },
    ],
    statusOptions: [{ label: 'Done', color: '#00c875' }, { label: 'In Review', color: '#0086c0' }],
  }, true)
  useToastStore.setState(useToastStore.getInitialState(), true)
  render(
    <MemoryRouter initialEntries={[`/board/${BOARD_ID}`]}>
      <Routes><Route path="/board/:boardId" element={<BoardPage />} /></Routes>
    </MemoryRouter>,
  )
}

async function changeStatusInDetails(previous, next) {
  fireEvent.click(screen.getByRole('button', { name: TASK_TITLE, exact: true }))
  const panel = screen.getByText('Task Details').parentElement.parentElement
  // Exercise actual portal interaction after the panel's outside-click handler exists.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)) })
  fireEvent.click(within(panel).getByRole('button', { name: `Edit status for "${TASK_TITLE}": ${previous}`, exact: true }))
  const option = screen.getByRole('menuitemradio', { name: next, exact: true })
  fireEvent.mouseDown(option)
  expect(screen.getByText('Task Details')).toBeTruthy()
  fireEvent.click(option)
  return panel
}

beforeEach(() => {
  localStorage.clear()
  writes = []
  responseHandlers = []
  database.from.mockImplementation((table) => {
    if (!['tasks', 'comments', 'activity_log'].includes(table)) throw new Error(`Unexpected database access: ${table}`)
    let operation
    const result = () => {
      if (table !== 'tasks') return Promise.resolve({ data: table === 'comments' ? [] : null, error: null })
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
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  fetchSpy = vi.fn(() => { throw new Error('Live network calls are forbidden in completion tests') })
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  cleanup()
  expect(fetchSpy).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

describe('completion changes through task details', () => {
  it('reopens a completed project task and clears its completion date in a single task write', async () => {
    seedAndRender('Done')
    const panel = await changeStatusInDetails('Done', 'In Review')
    await waitFor(() => expect(useBoardStore.getState().tasks[0]).toMatchObject({
      status: 'In Review', completed_date: null, group_id: 'active-group', sub_group_id: 'active-project',
    }))
    expect(writes).toEqual([{
      table: 'tasks',
      payload: { status: 'In Review', status_color: '#0086c0', completed_date: null, group_id: 'active-group', sub_group_id: 'active-project' },
      filters: [{ column: 'id', value: TASK_ID }, { column: 'board_id', value: BOARD_ID }],
    }])
    expect(within(panel).getByRole('button', { name: `Edit status for "${TASK_TITLE}": In Review`, exact: true })).toBeTruthy()
    const activeSection = screen.getByText('To Do').closest('.mb-2')
    expect(within(activeSection).getByText(TASK_TITLE)).toBeTruthy()
    expect(within(activeSection).queryByRole('button', { name: /^Edit completed date/ })).toBeNull()
    expect(screen.queryByText('Completed Tasks')).toBeNull()
  })

  it('completes a project task with today’s date and moves it in the same task write', async () => {
    seedAndRender('In Review')
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
    const panel = await changeStatusInDetails('In Review', 'Done')
    await waitFor(() => expect(useBoardStore.getState().tasks[0]).toMatchObject({
      status: 'Done', completed_date: today, group_id: 'completed-group', sub_group_id: 'completed-project',
    }))
    expect(writes).toEqual([{
      table: 'tasks',
      payload: { status: 'Done', status_color: '#00c875', completed_date: today, group_id: 'completed-group', sub_group_id: 'completed-project' },
      filters: [{ column: 'id', value: TASK_ID }, { column: 'board_id', value: BOARD_ID }],
    }])
    expect(within(panel).getByRole('button', { name: `Edit status for "${TASK_TITLE}": Done`, exact: true })).toBeTruthy()
    const completedSection = screen.getByText('Completed Tasks').closest('.mb-2')
    expect(within(completedSection).getByText(TASK_TITLE)).toBeTruthy()
    expect(within(completedSection).getByRole('button', { name: /^Edit completed date/ })).toBeTruthy()
  })

  it('keeps the previous status and completion date when saving fails, then allows retry', async () => {
    seedAndRender('Done')
    responseHandlers.push(() => Promise.resolve({ data: null, error: new Error('Status update denied') }))
    const panel = await changeStatusInDetails('Done', 'In Review')
    await waitFor(() => expect(useToastStore.getState().toasts.at(-1)).toMatchObject({ type: 'error', message: 'Status update denied' }))
    expect(useBoardStore.getState().tasks[0]).toMatchObject({
      status: 'Done', completed_date: '2025-01-02', group_id: 'completed-group', sub_group_id: 'completed-project',
    })
    const status = within(panel).getByRole('button', { name: `Edit status for "${TASK_TITLE}": Done`, exact: true })
    expect(status.getAttribute('aria-disabled')).toBe('false')
    fireEvent.click(status)
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'In Review', exact: true }))
    await waitFor(() => expect(useBoardStore.getState().tasks[0].status).toBe('In Review'))
    expect(writes).toHaveLength(2)
  })

  it('prevents repeated status submissions and waits for the persisted result before moving the row', async () => {
    seedAndRender('Done')
    let resolveSave
    responseHandlers.push((data) => new Promise((resolve) => { resolveSave = () => resolve({ data, error: null }) }))
    const panel = await changeStatusInDetails('Done', 'In Review')
    await waitFor(() => expect(writes).toHaveLength(1))
    const status = within(panel).getByRole('button', { name: `Edit status for "${TASK_TITLE}": Done`, exact: true })
    expect(status.getAttribute('aria-disabled')).toBe('true')
    expect(status.getAttribute('aria-busy')).toBe('true')
    fireEvent.click(status)
    expect(screen.queryByRole('menuitemradio', { name: 'In Review', exact: true })).toBeNull()
    expect(useBoardStore.getState().tasks[0]).toMatchObject({ status: 'Done', completed_date: '2025-01-02', group_id: 'completed-group' })
    await act(async () => resolveSave())
    expect(within(panel).getByRole('button', { name: `Edit status for "${TASK_TITLE}": In Review`, exact: true }).getAttribute('aria-disabled')).toBe('false')
    expect(useBoardStore.getState().tasks[0]).toMatchObject({ status: 'In Review', completed_date: null, group_id: 'active-group' })
    expect(writes).toHaveLength(1)
  })
})
