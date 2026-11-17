import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Sidebar from '../src/components/layout/Sidebar'
import AppLayout from '../src/components/layout/AppLayout'
import { useAuthStore } from '../src/stores/useAuthStore'
import { useBoardStore } from '../src/stores/useBoardStore'

const state = vi.hoisted(() => ({ createBoard: vi.fn(), fetchBoards: vi.fn(), clearBoardState: vi.fn(), from: vi.fn() }))
vi.mock('../src/stores/useAuthStore', async () => {
  const { create } = await import('zustand')
  return { useAuthStore: create(() => ({})) }
})
vi.mock('../src/stores/useBoardStore', async () => {
  const { create } = await import('zustand')
  return { useBoardStore: create(() => ({})) }
})
vi.mock('../src/stores/useThemeStore', () => ({ useThemeStore: () => ({ dark: false, toggle: vi.fn() }) }))
vi.mock('../src/lib/supabase', () => ({ supabase: { from: state.from } }))

beforeEach(() => {
  localStorage.clear()
  state.createBoard.mockReset().mockResolvedValue({ id: 'new-board' })
  state.fetchBoards.mockReset().mockImplementation(async (workspaceId) => useBoardStore.setState({ workspaceId }))
  state.clearBoardState.mockReset().mockImplementation(() => useBoardStore.setState({ boards: [], tasks: [], currentBoard: null, workspaceId: null }))
  useAuthStore.setState({
    user: { id: 'user-1', email: 'first@example.test' },
    profile: { id: 'user-1', full_name: 'Me' }, loading: false, signOut: vi.fn(),
  }, true)
  useBoardStore.setState({
    boards: [], tasks: [], currentBoard: null, workspaceId: null,
    createBoard: state.createBoard, fetchBoards: state.fetchBoards, clearBoardState: state.clearBoardState,
    updateBoard: vi.fn(), deleteBoard: vi.fn(),
  }, true)
  state.from.mockReset().mockImplementation((table) => {
    if (table === 'workspaces') return {
      select() { return this }, order() { return this }, limit() { return this },
      maybeSingle: async () => ({ data: { id: 'workspace-1', name: 'Shared workspace' }, error: null }),
    }
    if (table === 'workspace_members') return { select() { return this }, eq: async () => ({ data: [] }) }
    throw new Error(`Unexpected database request: ${table}`)
  })
})
afterEach(cleanup)

describe('board visibility', () => {
  it('creates a private board when selected and resets the next board to public', async () => {
    render(<MemoryRouter><Sidebar workspace={{ id: 'workspace-1' }} /></MemoryRouter>)
    fireEvent.click(screen.getByTitle('New board'))
    expect(screen.getByRole('radio', { name: /public/i }).checked).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('Board name'), { target: { value: 'Personal' } })
    fireEvent.click(screen.getByRole('radio', { name: /private/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Create board' }))
    await waitFor(() => expect(state.createBoard).toHaveBeenCalledWith('workspace-1', 'user-1', 'Personal', '📋', '#0073ea', 'private'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(screen.getByTitle('New board'))
    expect(screen.getByRole('radio', { name: /public/i }).checked).toBe(true)
  })

  it('preserves the open board after a same-user token refresh but clears it when accounts change', async () => {
    function BoardContents() {
      const tasks = useBoardStore((store) => store.tasks)
      return <output aria-label="Loaded task titles">{tasks.map((task) => task.title).join(', ')}</output>
    }
    render(
      <MemoryRouter initialEntries={['/board/board-1?task=task-1']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/board/:boardId" element={<BoardContents />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByLabelText('Loaded task titles')
    const board = { id: 'board-1', name: 'Personal', visibility: 'private', created_by: 'user-1' }
    act(() => useBoardStore.setState({ currentBoard: board, tasks: [{ id: 'task-1', board_id: board.id, title: 'Private draft' }] }))
    expect(screen.getByLabelText('Loaded task titles').textContent).toBe('Private draft')
    expect(state.clearBoardState).toHaveBeenCalledTimes(1)

    // Supabase supplies a new user object even when the account is unchanged.
    await act(async () => useAuthStore.setState({ user: { id: 'user-1', email: 'first@example.test' } }))
    expect(screen.getByLabelText('Loaded task titles').textContent).toBe('Private draft')
    expect(useBoardStore.getState().currentBoard).toBe(board)
    expect(state.clearBoardState).toHaveBeenCalledTimes(1)
    expect(state.fetchBoards).toHaveBeenCalledTimes(1)

    await act(async () => useAuthStore.setState({
      user: { id: 'user-2', email: 'second@example.test' }, profile: { id: 'user-2', full_name: 'Another user' },
    }))
    await waitFor(() => expect(screen.getByLabelText('Loaded task titles').textContent).toBe(''))
    expect(useBoardStore.getState().currentBoard).toBeNull()
    expect(state.clearBoardState).toHaveBeenCalledTimes(2)
    expect(state.fetchBoards).toHaveBeenCalledTimes(2)
  })
})
