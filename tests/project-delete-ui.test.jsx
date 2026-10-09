import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import TaskGroup from '../src/components/board/TaskGroup'
import { COL_DEFAULTS } from '../src/components/board/columnWidths'
import { useBoardStore } from '../src/stores/useBoardStore'
import { useAuthStore } from '../src/stores/useAuthStore'

const database = vi.hoisted(() => ({ from: vi.fn() }))

// Keep the real project UI, task rows, and store, replacing database transport.
vi.mock('../src/lib/supabase', () => ({ supabase: { from: database.from } }))

const BOARD_ID = 'board-1'
const GROUP_ID = 'group-1'
const PROJECT_ID = 'project-1'
const PROJECT_NAME = 'Shipping Portal'
const TASK_TITLE = 'Prepare shipment'
let writes
let responseHandlers
let fetchSpy

function installDatabaseDouble() {
  database.from.mockImplementation((table) => {
    if (!['tasks', 'sub_groups'].includes(table)) throw new Error(`Unexpected database table: ${table}`)
    let operation
    const result = () => {
      const data = table === 'tasks'
        ? useBoardStore.getState().tasks.filter((task) => operation.filters.every((filter) => task[filter.column] === filter.value))
          .map((task) => ({ id: task.id, sub_group_id: null }))
        : { id: operation.filters.find((filter) => filter.column === 'id')?.value }
      return responseHandlers.shift()?.(data) ?? Promise.resolve({ data, error: null })
    }
    const query = {
      update(payload) {
        operation = { table, action: 'update', payload: structuredClone(payload), filters: [] }
        writes.push(operation)
        return query
      },
      delete() {
        operation = { table, action: 'delete', filters: [] }
        writes.push(operation)
        return query
      },
      eq(column, value) { operation.filters.push({ column, value }); return query },
      select() { return query },
      single: result,
      then(resolve, reject) { return result().then(resolve, reject) },
    }
    return query
  })
}

function LiveGroup(props) {
  const { groups, tasks, subGroups, profiles, deleteSubGroup, updateTask, deleteTask } = useBoardStore()
  return (
    <DndContext>
      <TaskGroup
        group={groups[0]}
        tasks={tasks.filter((task) => task.group_id === GROUP_ID)}
        subGroups={subGroups.filter((project) => project.group_id === GROUP_ID)}
        profiles={profiles}
        onDeleteSubGroup={deleteSubGroup}
        onUpdateTask={updateTask}
        onDeleteTask={deleteTask}
        colWidths={COL_DEFAULTS}
        {...props}
      />
    </DndContext>
  )
}

function seedBoard({ emptyProject = false } = {}) {
  const group = { id: GROUP_ID, board_id: BOARD_ID, name: 'To Do', color: '#0073ea', position: 0 }
  const project = { id: PROJECT_ID, board_id: BOARD_ID, group_id: GROUP_ID, name: PROJECT_NAME, position: 0 }
  const task = {
    id: 'task-1', board_id: BOARD_ID, group_id: GROUP_ID, sub_group_id: PROJECT_ID,
    title: TASK_TITLE, status: 'Not Started', status_color: '#c4c4c4',
    assignee_id: null, assignee_ids: [], due_date: null, priority: null, position: 0,
  }
  useBoardStore.setState({
    ...useBoardStore.getInitialState(), currentBoard: { id: BOARD_ID },
    groups: [group], subGroups: [project], tasks: emptyProject ? [] : [task],
  }, true)
  useAuthStore.setState({
    ...useAuthStore.getInitialState(), user: { id: 'user-1', email: 'member@example.test' }, loading: false,
  }, true)
  return { project, task }
}

function openDeletion() {
  fireEvent.click(screen.getByRole('button', { name: `Delete project ${PROJECT_NAME}` }))
  return screen.getByRole('dialog', { name: 'Delete project' })
}

beforeEach(() => {
  localStorage.clear()
  writes = []
  responseHandlers = []
  database.from.mockReset()
  installDatabaseDouble()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  fetchSpy = vi.fn(() => { throw new Error('Live network calls are forbidden in project deletion tests') })
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  cleanup()
  expect(fetchSpy).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

describe('project deletion confirmation', () => {
  it('names the project, explains task retention, and supports Cancel and Escape without writes', () => {
    const { project, task } = seedBoard()
    render(<LiveGroup />)
    expect(screen.queryByText('+ Add Project')).toBeNull()
    expect(screen.queryByPlaceholderText('Project name…')).toBeNull()

    const dialog = openDeletion()
    expect(dialog.textContent).toContain(PROJECT_NAME)
    expect(dialog.textContent).toContain('Its tasks will be kept in their current groups without a project.')
    expect(writes).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Delete project' })).toBeNull()
    openDeletion()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Delete project' })).toBeNull()
    expect(writes).toHaveLength(0)
    expect(useBoardStore.getState().subGroups).toEqual([project])
    expect(useBoardStore.getState().tasks).toEqual([task])
  })

  it('deletes only after explicit confirmation and keeps project tasks in their groups', async () => {
    const { task } = seedBoard()
    render(<LiveGroup />)
    const dialog = openDeletion()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete project', exact: true }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete project' })).toBeNull())

    expect(useBoardStore.getState().subGroups).toEqual([])
    expect(useBoardStore.getState().tasks).toEqual([{ ...task, sub_group_id: null }])
    expect(screen.getByText(TASK_TITLE)).toBeTruthy()
    expect(screen.queryByText(PROJECT_NAME)).toBeNull()
    expect(writes).toEqual([
      { table: 'tasks', action: 'update', payload: { sub_group_id: null }, filters: [{ column: 'sub_group_id', value: PROJECT_ID }, { column: 'board_id', value: BOARD_ID }] },
      { table: 'sub_groups', action: 'delete', filters: [{ column: 'id', value: PROJECT_ID }, { column: 'board_id', value: BOARD_ID }] },
    ])
  })

  it('shows save errors, preserves the project, and allows retry', async () => {
    const { project, task } = seedBoard()
    responseHandlers.push(() => Promise.resolve({ error: new Error('Permission denied') }))
    render(<LiveGroup />)
    const dialog = openDeletion()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete project', exact: true }))
    expect((await screen.findByRole('alert')).textContent).toContain('Permission denied')
    expect(useBoardStore.getState().subGroups).toEqual([project])
    expect(useBoardStore.getState().tasks).toEqual([task])
    expect(within(dialog).getByRole('button', { name: 'Delete project', exact: true }).disabled).toBe(false)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete project', exact: true }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete project' })).toBeNull())
    expect(useBoardStore.getState().subGroups).toEqual([])
    expect(useBoardStore.getState().tasks).toEqual([{ ...task, sub_group_id: null }])
    expect(writes).toHaveLength(3)
  })

  it('blocks repeated submissions and dismissal while saving', async () => {
    const { project, task } = seedBoard()
    let resolveSave
    responseHandlers.push((data) => new Promise((resolve) => { resolveSave = () => resolve({ data, error: null }) }))
    render(<LiveGroup />)
    const dialog = openDeletion()
    fireEvent.submit(dialog.querySelector('form'))
    fireEvent.submit(dialog.querySelector('form'))
    await waitFor(() => expect(resolveSave).toBeTypeOf('function'))
    expect(writes).toHaveLength(1)
    expect(useBoardStore.getState().subGroups).toEqual([project])
    expect(useBoardStore.getState().tasks).toEqual([task])
    expect(within(dialog).getByRole('button', { name: 'Deleting…' }).disabled).toBe(true)
    expect(within(dialog).getByRole('button', { name: 'Cancel' }).disabled).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: 'Delete project' })).toBe(dialog)

    await act(async () => resolveSave())
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete project' })).toBeNull())
    expect(writes).toHaveLength(2)
  })
})

describe('revealing a project selected from the header', () => {
  it('expands the owning group and project again on repeated selection', () => {
    seedBoard()
    localStorage.setItem(`group-collapsed-${GROUP_ID}`, 'true')
    const { rerender } = render(<LiveGroup />)
    expect(screen.queryByText(PROJECT_NAME)).toBeNull()
    rerender(<LiveGroup focusProjectId={PROJECT_ID} focusProjectRequestId={1} />)
    expect(screen.getByText(PROJECT_NAME)).toBeTruthy()
    expect(screen.getByText(TASK_TITLE)).toBeTruthy()
    expect(localStorage.getItem(`group-collapsed-${GROUP_ID}`)).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: `Collapse project ${PROJECT_NAME}` }))
    expect(screen.queryByText(TASK_TITLE)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse group To Do' }))
    expect(screen.queryByText(PROJECT_NAME)).toBeNull()
    rerender(<LiveGroup focusProjectId={PROJECT_ID} focusProjectRequestId={2} />)
    expect(screen.getByText(TASK_TITLE)).toBeTruthy()
    expect(screen.getByRole('button', { name: `Collapse project ${PROJECT_NAME}` })).toBeTruthy()
    expect(writes).toHaveLength(0)
  })

  it('shows a selected empty project even when the current view hides empty projects', () => {
    seedBoard({ emptyProject: true })
    const { rerender } = render(<LiveGroup hideAddTask />)
    expect(screen.queryByText(PROJECT_NAME)).toBeNull()
    rerender(<LiveGroup hideAddTask focusProjectId={PROJECT_ID} focusProjectRequestId={1} />)
    expect(screen.getByText(PROJECT_NAME)).toBeTruthy()
    expect(writes).toHaveLength(0)
  })
})
