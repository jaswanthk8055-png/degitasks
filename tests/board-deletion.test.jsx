import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBoardStore } from '../src/stores/useBoardStore'

const database = vi.hoisted(() => ({ from: vi.fn(), remove: vi.fn(), list: vi.fn() }))
vi.mock('../src/lib/supabase', () => ({ supabase: { from: database.from } }))

const board = { id: 'personal-board', workspace_id: 'workspace-1', name: 'Personal Tasks' }
const otherBoard = { id: 'other-board', workspace_id: 'workspace-1', name: 'Shared Tasks' }
const task = { id: 'task-1', board_id: board.id, group_id: 'group-1', title: 'Private draft' }
let writes
let fetchSpy

function pending() {
  let resolve
  const promise = new Promise((finish) => { resolve = finish })
  return { promise, resolve }
}

beforeEach(() => {
  writes = []
  database.from.mockReset()
  database.remove.mockReset().mockResolvedValue({ data: { id: board.id }, error: null })
  database.list.mockReset().mockResolvedValue({ data: [board, otherBoard], error: null })
  database.from.mockImplementation((table) => {
    if (table !== 'boards') throw new Error(`Unexpected table: ${table}`)
    let operation
    const query = {
      delete() { operation = { table, action: 'delete', filters: [] }; writes.push(operation); return query },
      eq(column, value) { operation?.filters.push({ column, value }); return query },
      select(columns) { if (operation) operation.columns = columns; return query },
      single: () => database.remove(),
      order: () => database.list(),
    }
    return query
  })
  useBoardStore.getState().clearBoardState()
  useBoardStore.setState({
    ...useBoardStore.getInitialState(), workspaceId: board.workspace_id,
    boards: [board, otherBoard], currentBoard: board, tasks: [task],
    groups: [{ id: task.group_id, board_id: board.id }],
    taskColumnValues: { [task.id]: { notes: 'Saved value' } },
  }, true)
  fetchSpy = vi.fn(() => { throw new Error('Live network calls are forbidden in board deletion tests') })
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

describe('verified board deletion', () => {
  it('waits for a confirmed server deletion before removing the board and its displayed data', async () => {
    const response = pending()
    database.remove.mockReturnValueOnce(response.promise)
    const before = useBoardStore.getState()
    const deletion = before.deleteBoard(board.id)
    expect(useBoardStore.getState()).toBe(before)
    expect(writes).toEqual([{
      table: 'boards', action: 'delete', columns: 'id',
      filters: [{ column: 'id', value: board.id }, { column: 'workspace_id', value: board.workspace_id }],
    }])

    response.resolve({ data: { id: board.id }, error: null })
    await expect(deletion).resolves.toEqual({ id: board.id })
    expect(useBoardStore.getState()).toMatchObject({
      boards: [otherBoard], currentBoard: null, tasks: [], groups: [], taskColumnValues: {},
      workspaceId: board.workspace_id,
    })
  })

  it.each([
    [{ data: null, error: { code: '42501', message: 'permission denied for table boards' } }, 'You do not have permission to delete this board'],
    [{ data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }, 'The board could not be deleted'],
    [{ data: null, error: null }, 'The board could not be deleted'],
    [{ data: { id: otherBoard.id }, error: null }, 'The board could not be deleted'],
  ])('retains every local record when deletion is denied or unverified', async (response, message) => {
    database.remove.mockResolvedValueOnce(response)
    const before = useBoardStore.getState()
    await expect(before.deleteBoard(board.id)).rejects.toThrow(message)
    expect(useBoardStore.getState()).toBe(before)
  })

  it('retains the board on a network failure and permits a later successful retry', async () => {
    database.remove.mockRejectedValueOnce(new Error('Network unavailable'))
    const before = useBoardStore.getState()
    await expect(before.deleteBoard(board.id)).rejects.toThrow('Network unavailable')
    expect(useBoardStore.getState()).toBe(before)
    await expect(before.deleteBoard(board.id)).resolves.toEqual({ id: board.id })
    expect(useBoardStore.getState().boards).toEqual([otherBoard])
  })

  it('leaves another currently displayed board and its task data intact', async () => {
    const otherTask = { ...task, board_id: otherBoard.id }
    useBoardStore.setState({ currentBoard: otherBoard, tasks: [otherTask] })
    const before = useBoardStore.getState()
    await before.deleteBoard(board.id)
    expect(useBoardStore.getState().boards).toEqual([otherBoard])
    expect(useBoardStore.getState().currentBoard).toBe(otherBoard)
    expect(useBoardStore.getState().tasks).toBe(before.tasks)
    expect(useBoardStore.getState().taskColumnValues).toBe(before.taskColumnValues)
  })

  it('does not change the replacement account state when an old deletion finishes', async () => {
    const response = pending()
    database.remove.mockReturnValueOnce(response.promise)
    const deletion = useBoardStore.getState().deleteBoard(board.id)
    useBoardStore.getState().clearBoardState()
    // Both accounts may belong to the same workspace, so ID equality alone
    // cannot identify a response from the previous session.
    useBoardStore.setState({ workspaceId: board.workspace_id, boards: [otherBoard], currentBoard: otherBoard })
    const replacement = useBoardStore.getState()
    response.resolve({ data: { id: board.id }, error: null })
    await expect(deletion).resolves.toEqual({ id: board.id })
    expect(useBoardStore.getState()).toBe(replacement)
  })

  it('prevents a previously started board-list fetch from restoring the deleted board', async () => {
    const response = pending()
    database.list.mockReturnValueOnce(response.promise)
    const refresh = useBoardStore.getState().fetchBoards(board.workspace_id)
    await useBoardStore.getState().deleteBoard(board.id)
    response.resolve({ data: [board, otherBoard], error: null })
    await refresh
    expect(useBoardStore.getState().boards).toEqual([otherBoard])
  })

  it('removes the confirmed-deleted board when a stale list refresh starts during deletion', async () => {
    const deletionResponse = pending()
    const refreshResponse = pending()
    database.remove.mockReturnValueOnce(deletionResponse.promise)
    database.list.mockReturnValueOnce(refreshResponse.promise)
    const deletion = useBoardStore.getState().deleteBoard(board.id)
    const refresh = useBoardStore.getState().fetchBoards(board.workspace_id)

    deletionResponse.resolve({ data: { id: board.id }, error: null })
    await deletion
    expect(useBoardStore.getState().boards).toEqual([otherBoard])
    expect(useBoardStore.getState().currentBoard).toBeNull()
    refreshResponse.resolve({ data: [board, otherBoard], error: null })
    await refresh
    expect(useBoardStore.getState().boards).toEqual([otherBoard])
  })

  it('rejects missing or foreign-workspace boards before issuing a delete', async () => {
    await expect(useBoardStore.getState().deleteBoard('missing-board')).rejects.toThrow('This board is no longer available')
    useBoardStore.setState({ workspaceId: 'another-workspace' })
    await expect(useBoardStore.getState().deleteBoard(board.id)).rejects.toThrow('This board is no longer available')
    expect(database.from).not.toHaveBeenCalled()
  })
})
