import { useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import StatusPill from '../src/components/board/StatusPill'
import PriorityPill from '../src/components/board/PriorityPill'
import AssigneePicker from '../src/components/board/AssigneePicker'
import DatePicker from '../src/components/board/DatePicker'
import Dropdown from '../src/components/ui/Dropdown'
import { useAuthStore } from '../src/stores/useAuthStore'
import { useBoardStore } from '../src/stores/useBoardStore'
import { useToastStore } from '../src/stores/useToastStore'

vi.mock('../src/lib/supabase', () => ({ supabase: {} }))

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  useAuthStore.setState({ user: { id: 'member', email: 'member@example.test' } })
  useBoardStore.setState({ statusOptions: [{ label: 'Not Started', color: '#777' }, { label: 'Done', color: '#080' }] })
  useToastStore.setState(useToastStore.getInitialState(), true)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('accessible task field controls', () => {
  it('opens status with the keyboard, navigates options, and returns focus while saving', async () => {
    let finishSave
    const onUpdate = vi.fn(() => new Promise((resolve) => { finishSave = resolve }))
    render(<StatusPill taskId="task-1" taskTitle="Delivery" status="Not Started" onUpdate={onUpdate} />)
    const trigger = screen.getByRole('button', { name: 'Edit status for "Delivery": Not Started' })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const menu = screen.getByRole('menu', { name: 'Status for "Delivery"' })
    expect(trigger.getAttribute('aria-controls')).toBe(menu.id)
    const first = screen.getByRole('menuitemradio', { name: 'Not Started', checked: true })
    const done = screen.getByRole('menuitemradio', { name: 'Done', checked: false })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(done)
    fireEvent.click(done, { detail: 0 })
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith('task-1', { status: 'Done', status_color: '#080' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(trigger.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(trigger)
    expect(screen.queryByRole('menu')).toBeNull()
    await act(async () => finishSave())
    expect(trigger.getAttribute('aria-disabled')).toBe('false')
  })

  it('closes a priority menu with Escape without closing the surrounding task panel', () => {
    const onEscape = vi.fn()
    render(<div onKeyDown={onEscape}><PriorityPill taskId="task-1" taskTitle="Delivery" priority="High" onUpdate={vi.fn()} /></div>)
    const trigger = screen.getByRole('button', { name: 'Edit priority for "Delivery": High' })
    fireEvent.click(trigger, { detail: 0 })
    const none = screen.getByRole('menuitemradio', { name: /None/, checked: false })
    expect(document.activeElement).toBe(none)
    expect(screen.getByRole('menuitemradio', { name: 'High', checked: true })).toBeTruthy()
    fireEvent.keyDown(none, { key: 'End' })
    expect(document.activeElement).toBe(screen.getAllByRole('menuitemradio').at(-1))
    onEscape.mockClear()
    fireEvent.keyDown(document.activeElement, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(onEscape).not.toHaveBeenCalled()
  })

  it('exposes multiple assignees as checked choices and keeps focus while toggling', async () => {
    const profiles = [{ id: 'a', full_name: 'Asha' }, { id: 'b', full_name: 'Bala' }]
    const onUpdate = vi.fn()
    function AssigneeHarness() {
      const [ids, setIds] = useState(['a'])
      return <AssigneePicker taskId="task-1" taskTitle="Delivery" assigneeIds={ids} profiles={profiles} onUpdate={(id, patch) => { setIds(patch.assignee_ids); onUpdate(id, patch) }} />
    }
    render(<AssigneeHarness />)
    const trigger = screen.getByRole('button', { name: 'Edit assignees for "Delivery": Asha' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const first = screen.getByRole('menuitemcheckbox', { name: 'Asha', checked: true })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    const second = screen.getByRole('menuitemcheckbox', { name: 'Bala', checked: false })
    expect(document.activeElement).toBe(second)
    await act(async () => fireEvent.click(second, { detail: 0 }))
    expect(onUpdate).toHaveBeenLastCalledWith('task-1', { assignee_ids: ['a', 'b'], assignee_id: 'a' })
    expect(screen.getByRole('menuitemcheckbox', { name: 'Bala', checked: true })).toBe(second)
    expect(document.activeElement).toBe(second)
    expect(trigger.getAttribute('aria-label')).toBe('Edit assignees for "Delivery": Asha, Bala')
    fireEvent.keyDown(second, { key: 'End' })
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Clear all assignees' }), { detail: 0 }))
    expect(onUpdate).toHaveBeenLastCalledWith('task-1', { assignee_ids: [], assignee_id: null })
    expect(document.activeElement).toBe(trigger)
    expect(trigger.getAttribute('aria-label')).toBe('Edit assignees for "Delivery": Unassigned')
  })

  it('guards rapid assignee changes until persistence completes and allows retry after rejection', async () => {
    const profiles = [{ id: 'a', full_name: 'Asha' }, { id: 'b', full_name: 'Bala' }]
    let rejectSave
    const persist = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve, reject) => { rejectSave = reject }))
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true)
    function AssigneeHarness() {
      const [ids, setIds] = useState(['a'])
      return <AssigneePicker taskId="task-1" taskTitle="Delivery" assigneeIds={ids} profiles={profiles} onUpdate={async (id, patch) => {
        const result = await persist(id, patch)
        if (result !== false) setIds(patch.assignee_ids)
        return result
      }} />
    }
    render(<AssigneeHarness />)
    const trigger = screen.getByRole('button', { name: 'Edit assignees for "Delivery": Asha' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const first = screen.getByRole('menuitemcheckbox', { name: 'Asha', checked: true })
    const second = screen.getByRole('menuitemcheckbox', { name: 'Bala', checked: false })
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    fireEvent.click(second)
    expect(trigger.getAttribute('aria-busy')).toBe('true')
    expect(second.getAttribute('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(second)
    fireEvent.click(first)
    fireEvent.click(second)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear all assignees' }))
    fireEvent.click(trigger)
    expect(persist).toHaveBeenCalledExactlyOnceWith('task-1', { assignee_ids: ['a', 'b'], assignee_id: 'a' })
    await act(async () => rejectSave(new Error('Assignment denied')))
    expect(trigger.getAttribute('aria-busy')).toBe('false')
    expect(second.getAttribute('aria-disabled')).toBe('false')
    expect(second.getAttribute('aria-checked')).toBe('false')
    expect(useToastStore.getState().toasts).toHaveLength(1)
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'error', message: 'Assignment denied' })
    // Parent feedback returns false after already reporting its error.
    await act(async () => fireEvent.click(second))
    expect(second.getAttribute('aria-checked')).toBe('false')
    expect(useToastStore.getState().toasts).toHaveLength(1)
    await act(async () => fireEvent.click(second))
    expect(second.getAttribute('aria-checked')).toBe('true')
    expect(persist).toHaveBeenCalledTimes(3)
    expect(persist).toHaveBeenLastCalledWith('task-1', { assignee_ids: ['a', 'b'], assignee_id: 'a' })
  })

  it('blocks reopening priority while pending and reports raw failures without duplicating handled errors', async () => {
    let rejectSave
    const onUpdate = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve, reject) => { rejectSave = reject }))
      .mockResolvedValue(false)
    render(<PriorityPill taskId="task-1" taskTitle="Delivery" priority="High" onUpdate={onUpdate} />)
    const trigger = screen.getByRole('button', { name: 'Edit priority for "Delivery": High' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Low' }))
    expect(trigger.getAttribute('aria-busy')).toBe('true')
    expect(trigger.getAttribute('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(trigger)
    fireEvent.click(trigger)
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith('task-1', { priority: 'Low' })
    await act(async () => rejectSave(new Error('Priority denied')))
    expect(trigger.getAttribute('aria-busy')).toBe('false')
    expect(trigger.getAttribute('aria-disabled')).toBe('false')
    expect(useToastStore.getState().toasts).toHaveLength(1)
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'error', message: 'Priority denied' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    await act(async () => fireEvent.click(screen.getByRole('menuitemradio', { name: 'Low' })))
    expect(onUpdate).toHaveBeenCalledTimes(2)
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })

  it('exposes the full date and allows Escape cancellation and keyboard-reachable clearing', async () => {
    const onUpdate = vi.fn()
    const onEscape = vi.fn()
    render(<div onKeyDown={onEscape}><DatePicker taskId="task-1" taskTitle="Delivery" dueDate="2026-10-09" onUpdate={onUpdate} /></div>)
    const trigger = screen.getByRole('button', { name: 'Edit due date for "Delivery": 2026-10-09' })
    fireEvent.click(trigger)
    const input = screen.getByLabelText('Due date for "Delivery"')
    expect(document.activeElement).toBe(input)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onUpdate).not.toHaveBeenCalled()
    expect(onEscape).not.toHaveBeenCalled()
    const restored = screen.getByRole('button', { name: 'Edit due date for "Delivery": 2026-10-09' })
    expect(document.activeElement).toBe(restored)
    const clear = screen.getByRole('button', { name: 'Clear due date for "Delivery"' })
    expect(clear.tabIndex).toBe(0)
    clear.focus()
    await act(async () => fireEvent.click(clear))
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith('task-1', { due_date: null })
    expect(document.activeElement).toBe(restored)
  })

  it('returns focus after selecting a date and saves the configured field', async () => {
    const onUpdate = vi.fn()
    render(<DatePicker taskId="task-1" taskTitle="Delivery" dueDate={null} field="completed_date" label="Completed date" onUpdate={onUpdate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit completed date for "Delivery": Not set' }))
    await act(async () => fireEvent.change(screen.getByLabelText('Completed date for "Delivery"'), { target: { value: '2026-10-08' } }))
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith('task-1', { completed_date: '2026-10-08' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Edit completed date/ }))
  })

  it('keeps generic dropdown forms neutral and preserves native field keyboard behavior', () => {
    const onClose = vi.fn()
    function FormHarness() {
      const anchor = useRef(null)
      return <><button ref={anchor}>Open form</button><Dropdown open onClose={onClose} anchorRef={anchor}><form aria-label="Project"><select aria-label="Destination"><option>A</option><option>B</option></select></form></Dropdown></>
    }
    render(<FormHarness />)
    expect(screen.queryByRole('menu')).toBeNull()
    const select = screen.getByRole('combobox', { name: 'Destination' })
    select.focus()
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    fireEvent(select, event)
    expect(event.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(select)
    expect(onClose).not.toHaveBeenCalled()
  })
})
