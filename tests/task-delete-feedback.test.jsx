import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import BoardTable from '../src/components/board/BoardTable'
import Modal from '../src/components/ui/Modal'
import { useBoardStore } from '../src/stores/useBoardStore'
import { useAuthStore } from '../src/stores/useAuthStore'
import { useToastStore } from '../src/stores/useToastStore'

const database = vi.hoisted(() => ({ from: vi.fn(), result: vi.fn() }))
vi.mock('../src/lib/supabase', () => ({ supabase: { from: database.from } }))
// The table owns confirmation and persistence; row editing has separate tests.
vi.mock('../src/components/board/TaskGroup', () => ({
  default: ({ tasks, onDeleteTask }) => tasks.map((task) => (
    <button key={task.id} onClick={() => onDeleteTask(task.id)}>Request delete {task.title}</button>
  )),
}))

const task = { id: 'task-1', board_id: 'board-1', group_id: 'group-1', title: 'Prepare shipment', status: 'Not Started' }
let writes
let fetchSpy

function openDeletion() {
  const opener = screen.getByRole('button', { name: `Request delete ${task.title}` })
  opener.focus()
  fireEvent.click(opener)
  return { opener, dialog: screen.getByRole('dialog', { name: 'Delete task' }) }
}

beforeEach(() => {
  localStorage.clear()
  writes = []
  database.result.mockReset()
  database.result.mockImplementation((data) => Promise.resolve({ data, error: null }))
  database.from.mockImplementation((table) => {
    if (!['tasks', 'task_column_values'].includes(table)) throw new Error(`Unexpected table: ${table}`)
    let operation
    const result = () => database.result(table === 'tasks' ? { id: task.id } : null)
    const query = {
      delete() { operation = { table, action: 'delete', filters: [] }; writes.push(operation); return query },
      upsert(payload) { operation = { table, action: 'upsert', payload }; writes.push(operation); return query },
      eq(column, value) { operation.filters.push({ column, value }); return query },
      select(columns) { operation.columns = columns; return query },
      single: result,
      then(resolve, reject) { return result().then(resolve, reject) },
    }
    return query
  })
  useBoardStore.setState({
    ...useBoardStore.getInitialState(),
    currentBoard: { id: task.board_id },
    groups: [{ id: task.group_id, board_id: task.board_id, name: 'To Do', position: 0 }],
    tasks: [task],
    taskColumnValues: { [task.id]: { notes: 'Original value' } },
  }, true)
  useAuthStore.setState({ ...useAuthStore.getInitialState(), user: { id: 'member', email: 'member@example.test' } }, true)
  useToastStore.setState(useToastStore.getInitialState(), true)
  fetchSpy = vi.fn(() => { throw new Error('Live network calls are forbidden in deletion tests') })
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  cleanup()
  expect(fetchSpy).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

describe('task deletion feedback', () => {
  it('names the task, traps keyboard focus, and restores the opener on cancellation', () => {
    render(<BoardTable />)
    const { opener, dialog } = openDeletion()
    expect(dialog.textContent).toContain(task.title)
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const close = within(dialog).getByRole('button', { name: 'Close Delete task' })
    const confirm = within(dialog).getByRole('button', { name: 'Delete task', exact: true })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(confirm)
    fireEvent.keyDown(confirm, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(close, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
    expect(writes).toEqual([])
  })

  it('waits for confirmed deletion and blocks repeat submissions and dismissal while pending', async () => {
    let finishDelete
    database.result.mockImplementationOnce((data) => new Promise((resolve) => { finishDelete = () => resolve({ data, error: null }) }))
    render(<BoardTable />)
    const { dialog } = openDeletion()
    const confirm = within(dialog).getByRole('button', { name: 'Delete task', exact: true })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(writes).toHaveLength(1)
    expect(confirm.disabled).toBe(true)
    expect(confirm.getAttribute('aria-busy')).toBe('true')
    expect(dialog.getAttribute('aria-busy')).toBe('true')
    expect(within(dialog).getByRole('button', { name: 'Cancel' }).disabled).toBe(true)
    expect(within(dialog).getByRole('button', { name: 'Close Delete task' }).disabled).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(dialog.parentElement)
    expect(screen.getByRole('dialog', { name: 'Delete task' })).toBe(dialog)
    expect(useBoardStore.getState().tasks).toEqual([task])
    expect(useToastStore.getState().toasts).toEqual([])

    await act(async () => finishDelete())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useBoardStore.getState().tasks).toEqual([])
    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({ message: 'Task deleted', type: 'success' })
    expect(writes).toEqual([{
      table: 'tasks', action: 'delete', columns: 'id',
      filters: [{ column: 'id', value: task.id }, { column: 'board_id', value: task.board_id }],
    }])
  })

  it.each([
    [{ data: null, error: new Error('Delete permission denied') }, 'Delete permission denied'],
    [{ data: null, error: null }, 'The task could not be deleted'],
    [{ data: { id: 'different-task' }, error: null }, 'The task could not be deleted'],
  ])('keeps the task and dialog on an unconfirmed deletion, and allows retry', async (response, message) => {
    database.result.mockResolvedValueOnce(response)
    render(<BoardTable />)
    const { dialog } = openDeletion()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete task', exact: true }))
    expect((await within(dialog).findByRole('alert')).textContent).toContain(message)
    expect(useBoardStore.getState().tasks).toEqual([task])
    expect(useToastStore.getState().toasts).toEqual([])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete task', exact: true }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(writes).toHaveLength(2)
    expect(useBoardStore.getState().tasks).toEqual([])
  })

  it('returns the confirmed record, and rejects unavailable tasks before issuing writes', async () => {
    await expect(useBoardStore.getState().deleteTask('missing-task')).rejects.toThrow('This task is no longer available')
    expect(writes).toEqual([])
    await expect(useBoardStore.getState().deleteTask(task.id)).resolves.toEqual({ id: task.id })
  })
})

describe('custom value save errors', () => {
  it('retains the persisted value on failure, then updates after a successful retry', async () => {
    database.result.mockResolvedValueOnce({ error: new Error('Column update denied') })
    await expect(useBoardStore.getState().updateColumnValue(task.id, 'notes', 'New value')).rejects.toThrow('Column update denied')
    expect(useBoardStore.getState().taskColumnValues[task.id].notes).toBe('Original value')
    await useBoardStore.getState().updateColumnValue(task.id, 'notes', 'New value')
    expect(useBoardStore.getState().taskColumnValues[task.id].notes).toBe('New value')
  })
})

function AutofocusModal() {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  return <>
    <button onClick={() => setOpen(true)}>Open editor</button>
    <Modal open={open} onClose={() => setOpen(false)} title="Example editor">
      <input autoFocus aria-label="Draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
    </Modal>
  </>
}

describe('modal form focus', () => {
  it('respects autofocus and retains typing focus across rerenders before restoring its opener', () => {
    render(<AutofocusModal />)
    const opener = screen.getByRole('button', { name: 'Open editor' })
    opener.focus()
    fireEvent.click(opener)
    const input = screen.getByRole('textbox', { name: 'Draft' })
    expect(document.activeElement).toBe(input)
    fireEvent.change(input, { target: { value: 'Keep typing' } })
    expect(document.activeElement).toBe(input)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
})
