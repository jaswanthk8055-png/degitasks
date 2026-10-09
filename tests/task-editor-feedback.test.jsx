import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import TaskDetailPanel from '../src/components/board/TaskDetailPanel'
import TaskRow from '../src/components/board/TaskRow'
import RichTextEditor from '../src/components/ui/RichTextEditor'
import { useAuthStore } from '../src/stores/useAuthStore'
import { useBoardStore } from '../src/stores/useBoardStore'
import { useToastStore } from '../src/stores/useToastStore'

const database = vi.hoisted(() => ({ commentResult: null }))
vi.mock('../src/lib/supabase', () => ({ supabase: {
  from: () => {
    const query = {
      select() { return query }, eq() { return query },
      order: () => Promise.resolve({ data: [] }),
      insert() { return query }, single: () => database.commentResult,
    }
    return query
  },
  channel: () => ({ on() { return this }, subscribe() { return this } }),
  removeChannel: vi.fn(),
} }))

const task = { id: 'task-1', board_id: 'board-1', group_id: 'group-1', title: 'Shipping plan',
  description: 'Original description', status: 'Not Started', assignee_ids: [], created_by: 'user-1' }

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  useAuthStore.setState({ user: { id: 'user-1' }, profile: { id: 'user-1', full_name: 'Member' } })
  useBoardStore.setState({ ...useBoardStore.getInitialState(), tasks: [task],
    groups: [{ id: 'group-1', board_id: 'board-1' }], profiles: [], memberProfiles: [], logActivity: vi.fn() }, true)
  useToastStore.setState(useToastStore.getInitialState(), true)
  database.commentResult = Promise.resolve({ data: null, error: new Error('Posting denied') })
})

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

function editDescription(value) {
  const editor = screen.getByRole('textbox', { name: 'Description for "Shipping plan"' })
  editor.innerHTML = value
  fireEvent.input(editor)
  return editor
}

describe('task editor accessibility and confirmed save feedback', () => {
  it('flushes the final description draft once when closing before autosave fires', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    const { unmount } = render(<TaskDetailPanel task={task} onUpdate={onUpdate} onClose={() => {}} />)
    editDescription('Last changes')
    expect(onUpdate).not.toHaveBeenCalled()
    await act(async () => unmount())
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith(task.id, { description: 'Last changes' })
    await act(async () => vi.advanceTimersByTime(1000))
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('keeps a failed description visible, announces the failure, and permits retry', async () => {
    const onUpdate = vi.fn().mockRejectedValueOnce(new Error('Save denied')).mockResolvedValue(undefined)
    render(<TaskDetailPanel task={task} onUpdate={onUpdate} onClose={() => {}} />)
    editDescription('Keep this draft')
    await act(async () => vi.advanceTimersByTime(800))
    expect(screen.getByText('Save failed: Save denied')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: /Description for/ }).innerHTML).toBe('Keep this draft')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry saving description' })))
    expect(onUpdate).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Saved')).toBeTruthy()
  })

  it('serializes description requests so a slow earlier save cannot overwrite a later one', async () => {
    let resolveFirst
    const onUpdate = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockResolvedValue(undefined)
    render(<TaskDetailPanel task={task} onUpdate={onUpdate} onClose={() => {}} />)
    editDescription('First draft')
    await act(async () => vi.advanceTimersByTime(800))
    editDescription('Latest draft')
    await act(async () => vi.advanceTimersByTime(800))
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Saving…')).toBeTruthy()
    await act(async () => resolveFirst())
    expect(onUpdate).toHaveBeenNthCalledWith(2, task.id, { description: 'Latest draft' })
    expect(screen.getByText('Saved')).toBeTruthy()
  })

  it('cancels title editing with Escape without saving or closing the panel', async () => {
    const onUpdate = vi.fn()
    const onClose = vi.fn()
    render(<TaskDetailPanel task={task} onUpdate={onUpdate} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit task name: Shipping plan' }))
    const input = screen.getByRole('textbox', { name: 'Task name' })
    fireEvent.change(input, { target: { value: 'Discard this' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    await act(async () => vi.advanceTimersByTime(20))
    expect(onUpdate).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Shipping plan' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit task name: Shipping plan' }))
  })

  it('allows title typing during description autosave and returns focus after keyboard save', async () => {
    let finishDescription
    const onUpdate = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finishDescription = resolve }))
      .mockResolvedValue(undefined)
    render(<TaskDetailPanel task={task} onUpdate={onUpdate} onClose={() => {}} />)
    editDescription('Autosaving')
    expect(screen.getByRole('dialog').getAttribute('data-save-state')).toBe('unsaved')
    await act(async () => vi.advanceTimersByTime(800))
    fireEvent.click(screen.getByRole('button', { name: 'Edit task name: Shipping plan' }))
    const input = screen.getByRole('textbox', { name: 'Task name' })
    expect(input.readOnly).toBe(false)
    expect(input.disabled).toBe(false)
    fireEvent.change(input, { target: { value: 'New name' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(document.activeElement).toBe(input)
    await act(async () => finishDescription())
    await act(async () => vi.advanceTimersByTime(20))
    expect(onUpdate).toHaveBeenNthCalledWith(2, task.id, { title: 'New name' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit task name: Shipping plan' }))
  })

  it('copies the direct task URL with a visible success message', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<TaskDetailPanel task={task} onUpdate={vi.fn()} onClose={() => {}} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy task link' })))
    expect(writeText).toHaveBeenCalledExactlyOnceWith(new URL('/board/board-1?task=task-1', window.location.origin).href)
    expect(useToastStore.getState().toasts.at(-1).message).toBe('Task link copied')
  })

  it('reflects remote description changes while retaining an unsaved local draft', () => {
    const onUpdate = vi.fn()
    const { rerender } = render(<TaskDetailPanel task={task} onUpdate={onUpdate} onClose={() => {}} />)
    rerender(<TaskDetailPanel task={{ ...task, description: 'Remote edit' }} onUpdate={onUpdate} onClose={() => {}} />)
    expect(screen.getByRole('textbox', { name: /Description for/ }).innerHTML).toBe('Remote edit')
    editDescription('Local draft')
    rerender(<TaskDetailPanel task={{ ...task, description: 'Another edit' }} onUpdate={onUpdate} onClose={() => {}} />)
    expect(screen.getByRole('textbox', { name: /Description for/ }).innerHTML).toBe('Local draft')
  })

  it('retains comment text on database rejection and blocks duplicate keyboard submissions', async () => {
    let finish
    database.commentResult = new Promise((resolve) => { finish = resolve })
    render(<TaskDetailPanel task={task} onUpdate={vi.fn()} onClose={() => {}} />)
    const input = screen.getByRole('textbox', { name: /Write an update/ })
    fireEvent.change(input, { target: { value: 'Keep my comment' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    expect(screen.getByRole('button', { name: 'Posting…' }).disabled).toBe(true)
    await act(async () => finish({ data: null, error: new Error('Posting denied') }))
    expect(screen.getByRole('alert').textContent).toBe('Posting denied')
    expect(input.value).toBe('Keep my comment')
    expect(screen.getByRole('button', { name: 'Post update' }).disabled).toBe(false)
  })

  it('exposes stable task identity and keyboard-reachable delete/custom field controls', () => {
    const { container } = render(<TaskRow task={task} profiles={[]} onUpdate={vi.fn()} onDelete={vi.fn()}
      extraColumns={[{ id: 'reference', label: 'Reference', type: 'text' }]} />)
    expect(container.querySelector('[data-task-id="task-1"]')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete "Shipping plan"' }).tabIndex).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Reference for "Shipping plan": Empty' }))
    expect(screen.getByRole('textbox', { name: 'Reference for "Shipping plan"' })).toBeTruthy()
  })

  it('supports accessible formatting button activation and emits the formatted value', () => {
    const onChange = vi.fn()
    document.execCommand = vi.fn(() => {
      screen.getByRole('textbox', { name: 'Description' }).innerHTML = '<b>Formatted</b>'
      return true
    })
    render(<RichTextEditor value="Formatted" onChange={onChange} />)
    const bold = screen.getByRole('button', { name: 'Bold (Ctrl+B)' })
    bold.focus()
    fireEvent.click(bold, { detail: 0 })
    expect(document.execCommand).toHaveBeenCalledWith('bold', false, null)
    expect(onChange).toHaveBeenCalledWith('<b>Formatted</b>')
    expect(screen.getByRole('textbox', { name: 'Description' }).getAttribute('aria-multiline')).toBe('true')
  })
})
