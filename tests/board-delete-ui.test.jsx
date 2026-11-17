import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import Sidebar from '../src/components/layout/Sidebar'
import { useAuthStore } from '../src/stores/useAuthStore'
import { useBoardStore } from '../src/stores/useBoardStore'

const state = vi.hoisted(() => ({ deleteBoard: vi.fn(), updateBoard: vi.fn(), from: vi.fn() }))
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

const BOARD_ID = 'personal-board'
const OWNER_ID = 'board-owner'
const BOARD_NAME = 'Personal Tasks'

function SidebarPage() {
  const location = useLocation()
  return <><Sidebar workspace={{ id: 'workspace-1' }} /><output aria-label="Current path">{location.pathname}</output></>
}

function renderSidebar({ userId = OWNER_ID, profileId = userId, visibility = 'public', path = `/board/${BOARD_ID}` } = {}) {
  const board = { id: BOARD_ID, name: BOARD_NAME, visibility, created_by: OWNER_ID, workspace_id: 'workspace-1' }
  useAuthStore.setState({
    user: userId ? { id: userId } : null,
    profile: { id: profileId, full_name: 'Test User' },
    signOut: vi.fn(),
  }, true)
  useBoardStore.setState({ boards: [board], currentBoard: board, deleteBoard: state.deleteBoard, updateBoard: state.updateBoard }, true)
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/board/:boardId" element={<SidebarPage />} />
        <Route path="/" element={<SidebarPage />} />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByTitle('Board settings'))
  return screen.getByRole('dialog', { name: `Board: ${BOARD_NAME}` })
}

function confirmDeletion(dialog) {
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete board' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete board' }))
}

beforeEach(() => {
  localStorage.clear()
  state.deleteBoard.mockReset().mockImplementation(async (boardId) => {
    useBoardStore.setState((store) => ({ boards: store.boards.filter((board) => board.id !== boardId) }))
  })
  state.updateBoard.mockReset().mockResolvedValue(undefined)
  state.from.mockReset().mockImplementation(() => { throw new Error('Live database calls are forbidden in sidebar tests') })
})

afterEach(() => {
  cleanup()
  expect(state.from).not.toHaveBeenCalled()
})

describe('sidebar board deletion', () => {
  it.each(['public', 'private'])('offers deletion to the authenticated creator of a %s board', (visibility) => {
    const dialog = renderSidebar({ visibility, profileId: 'stale-other-profile' })
    expect(within(dialog).getByRole('button', { name: 'Delete board' })).toBeTruthy()
    expect(within(dialog).queryByText('Only the board creator can delete this board.')).toBeNull()
  })

  it.each(['public', 'private'])('hides deletion for a non-creator of a %s board even if the profile identifies its creator', (visibility) => {
    const dialog = renderSidebar({ visibility, userId: 'colleague', profileId: OWNER_ID })
    expect(within(dialog).queryByRole('button', { name: 'Delete board' })).toBeNull()
    expect(within(dialog).getByText('Only the board creator can delete this board.')).toBeTruthy()
    expect(state.deleteBoard).not.toHaveBeenCalled()
  })

  it('does not grant deletion without an authenticated user', () => {
    const dialog = renderSidebar({ userId: null, profileId: OWNER_ID })
    expect(within(dialog).queryByRole('button', { name: 'Delete board' })).toBeNull()
    expect(within(dialog).getByText('Only the board creator can delete this board.')).toBeTruthy()
  })

  it('preserves public-board rename for a non-creator', async () => {
    const dialog = renderSidebar({ userId: 'colleague' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Board name' }), { target: { value: 'Team Tasks' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(state.updateBoard).toHaveBeenCalledExactlyOnceWith(BOARD_ID, { name: 'Team Tasks' })
    expect(state.deleteBoard).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Current path').textContent).toBe(`/board/${BOARD_ID}`)
  })

  it('keeps the board, route, and confirmation on failed deletion and clears errors on retry, cancel, and reopen', async () => {
    let rejectDelete
    state.deleteBoard.mockImplementation(() => new Promise((resolve, reject) => { rejectDelete = reject }))
    const dialog = renderSidebar()
    confirmDeletion(dialog)
    expect(state.deleteBoard).toHaveBeenCalledExactlyOnceWith(BOARD_ID)
    expect(within(dialog).getByRole('button', { name: 'Deleting…' }).disabled).toBe(true)
    expect(dialog.getAttribute('aria-busy')).toBe('true')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBe(dialog)
    expect(screen.getByRole('link', { name: /Personal Tasks/ })).toBeTruthy()
    await act(async () => rejectDelete(new Error('Only the board creator can delete this board.')))
    expect(within(dialog).getByRole('alert').textContent).toBe('Only the board creator can delete this board.')
    expect(within(dialog).getByRole('button', { name: 'Delete board' }).disabled).toBe(false)
    expect(dialog.getAttribute('aria-busy')).toBe('false')
    expect(screen.getByLabelText('Current path').textContent).toBe(`/board/${BOARD_ID}`)
    expect(screen.getByRole('link', { name: /Personal Tasks/ })).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete board' }))
    expect(within(dialog).queryByRole('alert')).toBeNull()
    expect(state.deleteBoard).toHaveBeenCalledTimes(2)
    await act(async () => rejectDelete(new Error('Network unavailable')))
    expect(within(dialog).getByRole('alert').textContent).toBe('Network unavailable')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(within(dialog).queryByRole('alert')).toBeNull()
    expect(within(dialog).getByRole('textbox', { name: 'Board name' })).toBeTruthy()

    confirmDeletion(dialog)
    await act(async () => rejectDelete(new Error('Try again later')))
    expect(within(dialog).getByRole('alert').textContent).toBe('Try again later')
    fireEvent.click(within(dialog).getByRole('button', { name: `Close Board: ${BOARD_NAME}` }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByTitle('Board settings'))
    const reopened = screen.getByRole('dialog')
    expect(within(reopened).queryByRole('alert')).toBeNull()
    expect(within(reopened).getByRole('textbox', { name: 'Board name' })).toBeTruthy()
    expect(screen.getByLabelText('Current path').textContent).toBe(`/board/${BOARD_ID}`)
  })

  it('closes the settings and navigates home only after deleting the active board succeeds', async () => {
    let finishDelete
    state.deleteBoard.mockImplementationOnce(() => new Promise((resolve) => { finishDelete = resolve }))
    const dialog = renderSidebar()
    confirmDeletion(dialog)
    expect(screen.getByLabelText('Current path').textContent).toBe(`/board/${BOARD_ID}`)
    expect(screen.getByRole('dialog')).toBe(dialog)
    await act(async () => {
      useBoardStore.setState({ boards: [] })
      finishDelete()
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('link', { name: /Personal Tasks/ })).toBeNull()
    expect(screen.getByLabelText('Current path').textContent).toBe('/')
  })

  it('keeps the current route when a different board is deleted successfully', async () => {
    const dialog = renderSidebar({ path: '/board/another-board' })
    confirmDeletion(dialog)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByLabelText('Current path').textContent).toBe('/board/another-board')
  })
})
