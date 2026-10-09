import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import BoardPage from '../src/pages/BoardPage'
import LoginPage from '../src/pages/LoginPage'
import AppLayout from '../src/components/layout/AppLayout'
import { useAuthStore } from '../src/stores/useAuthStore'
import { useBoardStore } from '../src/stores/useBoardStore'
import { taskPath } from '../src/lib/taskLinks'
import { loginDestination } from '../src/lib/authRedirect'

vi.mock('../src/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../src/hooks/useBoard', () => ({ useBoard: () => ({ loading: useBoardStore((state) => state.loading) }) }))
vi.mock('../src/components/layout/Sidebar', () => ({ default: () => null }))
vi.mock('../src/components/ui/CommandPalette', () => ({ default: () => null }))
vi.mock('../src/components/ui/Toast', () => ({ default: () => null }))
vi.mock('../src/components/layout/TopBar', () => ({
  default: function ViewControls({ activeView, onViewChange, filters, onFiltersChange }) {
    return <>
      {['Main Table', 'Summary', 'Calendar', 'My Tasks'].map((view) => (
        <button key={view} onClick={() => onViewChange(view)}>{view}</button>
      ))}
      <button onClick={() => onFiltersChange({ ...filters, statuses: ['Done'] })}>Filter done</button>
      <output aria-label="Current view">{activeView}</output>
      <output aria-label="Current filter">{filters.statuses.join(',')}</output>
    </>
  },
}))
// Keep navigation and live store state real; isolate the table and editor so
// these regressions do not depend on unrelated menus, date pickers, or I/O.
vi.mock('../src/components/board/BoardTable', () => ({ default: TaskButtons }))
vi.mock('../src/components/board/KanbanView', () => ({ default: TaskButtons }))
vi.mock('../src/components/board/CalendarView', () => ({ default: TaskButtons }))
vi.mock('../src/components/board/AutomationsPanel', () => ({ default: () => null }))
vi.mock('../src/components/board/NewProjectDialog', () => ({ default: () => null }))
vi.mock('../src/components/board/TaskDetailPanel', () => ({
  default: ({ task, onClose }) => (
    <section role="dialog" aria-label={`Details ${task.title}`}>
      <button onClick={onClose}>Close details</button>
      <span>{task.description}</span>
    </section>
  ),
}))

function TaskButtons({ onOpenTask }) {
  const tasks = useBoardStore((state) => state.tasks)
  return tasks.map((task) => <button key={task.id} onClick={() => onOpenTask(task)}>Open {task.title}</button>)
}

const board = { id: 'board-1', name: 'Shipments', workspace_id: 'workspace-1' }
const first = { id: 'task-1', board_id: board.id, group_id: 'group-1', title: 'First shipment' }
const second = { ...first, id: 'task-2', title: 'Second shipment' }

function LocationControls() {
  const location = useLocation()
  const navigate = useNavigate()
  return <>
    <output aria-label="Current URL">{location.pathname}{location.search}{location.hash}</output>
    <output aria-label="Current route state">{JSON.stringify(location.state)}</output>
    <button onClick={() => navigate(-1)}>Go back</button>
    <button onClick={() => navigate(1)}>Go forward</button>
    <button onClick={() => navigate('/board/board-2?task=task-1')}>Go to other board</button>
  </>
}

function renderBoard(entry = '/board/board-1') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <LocationControls />
      <Routes><Route path="/board/:boardId" element={<BoardPage />} /></Routes>
    </MemoryRouter>,
  )
}

function currentUrl() { return screen.getByLabelText('Current URL').textContent }

beforeEach(() => {
  useAuthStore.setState({ ...useAuthStore.getInitialState(), loading: false, user: { id: 'user-1' }, profile: { id: 'user-1' } }, true)
  useBoardStore.setState({
    ...useBoardStore.getInitialState(), currentBoard: board, tasks: [first, second],
    groups: [{ id: 'group-1', board_id: board.id, name: 'To Do' }], loading: false,
  }, true)
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Live requests are forbidden in task link tests') }))
})

afterEach(() => {
  cleanup()
  expect(fetch).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

describe('task links', () => {
  it('encodes immutable board and task IDs and rejects incomplete tasks', () => {
    expect(taskPath({ board_id: 'board /?#', id: 'task &?#' })).toBe('/board/board%20%2F%3F%23?task=task%20%26%3F%23')
    expect(() => taskPath({ id: first.id })).toThrow('board ID and task ID')
  })

  it('restores details from a shared or reloaded URL only after board data loads', () => {
    useBoardStore.setState({ loading: true, currentBoard: null, tasks: [] })
    renderBoard('/board/board-1?task=task-1')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    act(() => useBoardStore.setState({ loading: false, currentBoard: board, tasks: [first] }))
    expect(screen.getByRole('dialog', { name: 'Details First shipment' })).toBeTruthy()
  })

  it.each(['Main Table', 'Summary', 'Calendar', 'My Tasks'])('preserves %s and filters when opening and closing task links', (view) => {
    renderBoard('/board/board-1?teams=true&sort=due#board')
    fireEvent.click(screen.getByRole('button', { name: view, exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Filter done' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open First shipment' }))
    expect(currentUrl()).toBe('/board/board-1?teams=true&sort=due&task=task-1#board')
    expect(screen.getByRole('dialog', { name: 'Details First shipment' })).toBeTruthy()
    expect(screen.getByLabelText('Current view').textContent).toBe(view)
    expect(screen.getByLabelText('Current filter').textContent).toBe('Done')
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }))
    expect(currentUrl()).toBe('/board/board-1?teams=true&sort=due#board')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByLabelText('Current view').textContent).toBe(view)
    expect(screen.getByLabelText('Current filter').textContent).toBe('Done')
  })

  it('restores task selections and closed panels through browser history', () => {
    renderBoard()
    fireEvent.click(screen.getByRole('button', { name: 'Open First shipment' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Second shipment' }))
    expect(screen.getByRole('dialog', { name: 'Details Second shipment' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))
    expect(screen.getByRole('dialog', { name: 'Details First shipment' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Go forward' }))
    expect(screen.getByRole('dialog', { name: 'Details First shipment' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }))
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))
    expect(screen.getByRole('dialog', { name: 'Details First shipment' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Go forward' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('converts legacy notification state into a shareable URL and consumes it on close', () => {
    renderBoard({ pathname: '/board/board-1', search: '?teams=true', state: { openTaskId: first.id, source: 'inbox' } })
    expect(currentUrl()).toBe('/board/board-1?teams=true&task=task-1')
    expect(screen.getByRole('dialog', { name: 'Details First shipment' })).toBeTruthy()
    expect(JSON.parse(screen.getByLabelText('Current route state').textContent)).toEqual({ source: 'inbox' })
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }))
    expect(currentUrl()).toBe('/board/board-1?teams=true')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('prefers an explicit task URL over old notification state', () => {
    renderBoard({ pathname: '/board/board-1', search: '?task=task-2', state: { openTaskId: first.id } })
    expect(screen.getByRole('dialog', { name: 'Details Second shipment' })).toBeTruthy()
  })

  it.each(['missing', '', 'task-1&task=task-2', 'foreign-task'])('explains an unavailable or invalid task request (%s) without exposing another board', (request) => {
    useBoardStore.setState({ tasks: [first, { ...second, id: 'foreign-task', board_id: 'board-2' }] })
    renderBoard(`/board/board-1?teams=true&task=${request}`)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('This task is unavailable on this board')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss task message' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(currentUrl()).toBe('/board/board-1?teams=true')
  })

  it('uses live updates and closes a deleted task instead of retaining a stale copy', () => {
    renderBoard('/board/board-1?task=task-1')
    act(() => useBoardStore.setState({ tasks: [{ ...first, title: 'Updated shipment' }] }))
    expect(screen.getByRole('dialog', { name: 'Details Updated shipment' })).toBeTruthy()
    act(() => useBoardStore.setState({ tasks: [] }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('does not display a task moved to a different board', () => {
    renderBoard('/board/board-1?task=task-1')
    act(() => useBoardStore.setState({ tasks: [{ ...first, board_id: 'board-2' }] }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('does not show stale board data while a different board is loading', () => {
    renderBoard('/board/board-1?task=task-1')
    fireEvent.click(screen.getByRole('button', { name: 'Go to other board' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    act(() => useBoardStore.setState({ currentBoard: { ...board, id: 'board-2' }, tasks: [] }))
    expect(screen.getByRole('alert')).toBeTruthy()
  })
})

describe('task link sign-in redirects', () => {
  it.each(['https://elsewhere.test/', '//elsewhere.test/', '/\\elsewhere.test/', '/\n/elsewhere.test/', undefined])('rejects unsafe return locations (%s)', (returnTo) => {
    expect(loginDestination({ search: '', state: { returnTo } })).toBe('/')
  })

  it('retains the complete task URL when authentication is required', async () => {
    useAuthStore.setState({ user: null, profile: null })
    render(
      <MemoryRouter initialEntries={['/board/board-1?task=task-1&teams=true#details']}>
        <LocationControls />
        <Routes>
          <Route element={<AppLayout />}><Route path="/board/:boardId" element={<p>Protected board</p>} /></Route>
          <Route path="/login" element={<p>Login route</p>} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(currentUrl()).toBe('/login'))
    expect(JSON.parse(screen.getByLabelText('Current route state').textContent)).toEqual({ returnTo: '/board/board-1?task=task-1&teams=true#details' })
    expect(screen.queryByText('Protected board')).toBeNull()
  })

  it.each([false, true])('returns to the task after sign-in (already authenticated: %s)', async (alreadyAuthenticated) => {
    const signIn = vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
    if (!alreadyAuthenticated) useAuthStore.setState({ user: null, profile: null, signIn })
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { returnTo: '/board/board-1?task=task-1#details' } }]}>
        <LocationControls />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/board/:boardId" element={<p>Requested task</p>} />
        </Routes>
      </MemoryRouter>,
    )
    if (!alreadyAuthenticated) {
      fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'user@example.test' } })
      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'test-password' } })
      fireEvent.submit(screen.getByRole('button', { name: 'Sign in', exact: true }).closest('form'))
      await waitFor(() => expect(signIn).toHaveBeenCalledWith('user@example.test', 'test-password'))
    }
    await waitFor(() => expect(currentUrl()).toBe('/board/board-1?task=task-1#details'))
    expect(screen.getByText('Requested task')).toBeTruthy()
  })

  it('preserves the Teams popup completion destination', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', search: '?teams_popup=true', state: { returnTo: '/board/board-1?task=task-1' } }]}>
        <LocationControls />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/teams-auth-success" element={<p>Teams authentication complete</p>} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(currentUrl()).toBe('/teams-auth-success'))
  })
})
