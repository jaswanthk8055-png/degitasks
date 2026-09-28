import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import TaskGroup from '../src/components/board/TaskGroup'
import BoardTable from '../src/components/board/BoardTable'
import { COL_DEFAULTS } from '../src/components/board/columnWidths'
import { useAuthStore } from '../src/stores/useAuthStore'
import { useBoardStore } from '../src/stores/useBoardStore'

vi.mock('../src/lib/supabase', () => ({ supabase: { from: vi.fn(() => { throw new Error('Unexpected database access') }) } }))

const group = { id: 'completed-group', board_id: 'board-1', name: 'Completed Tasks', color: '#00c875' }
const subGroup = { id: 'project-1', group_id: group.id, board_id: group.board_id, name: 'Project one' }
const tasks = [
  { id: 'loose-task', board_id: group.board_id, group_id: group.id, title: 'Completed standalone task', status: 'Done', completed_date: '2020-05-09' },
  { id: 'project-task', board_id: group.board_id, group_id: group.id, sub_group_id: subGroup.id, title: 'Completed project task', status: 'Done', completed_date: '2020-05-10' },
]

function renderGroup(options = {}) {
  const onUpdateTask = vi.fn()
  const onWidthChange = vi.fn()
  const result = render(
    <DndContext>
      <TaskGroup
        group={group}
        tasks={tasks}
        subGroups={[subGroup]}
        profiles={[]}
        colWidths={COL_DEFAULTS}
        onWidthChange={onWidthChange}
        onUpdateTask={onUpdateTask}
        hideAddTask
        {...options}
      />
    </DndContext>,
  )
  return { ...result, onUpdateTask, onWidthChange }
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState({ ...useAuthStore.getInitialState(), user: { id: 'member-1', email: 'member@example.test' } }, true)
  useBoardStore.setState({
    ...useBoardStore.getInitialState(),
    currentBoard: { id: group.board_id },
    groups: [group],
    subGroups: [subGroup],
    tasks,
  }, true)
})

afterEach(cleanup)

describe('Completed Date column', () => {
  it('is opt-in so active task tables retain their existing columns', () => {
    renderGroup()
    expect(screen.queryByText('Completed Date')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit completed date' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Edit due date' })).toHaveLength(2)
  })

  it('renders the editable date for standalone and project tasks without overdue styling', () => {
    const { onUpdateTask } = renderGroup({ showCompletedDate: true })
    expect(screen.getByText('Completed Date')).toBeTruthy()
    const editors = screen.getAllByRole('button', { name: 'Edit completed date' })
    expect(editors.map((editor) => editor.textContent)).toEqual(['May 9', 'May 10'])
    for (const editor of editors) expect(editor.className).not.toContain('text-status-red')

    fireEvent.click(editors[1])
    const input = screen.getByLabelText('Completed date')
    expect(input.value).toBe('2020-05-10')
    fireEvent.change(input, { target: { value: '2020-05-07' } })
    expect(onUpdateTask).toHaveBeenCalledExactlyOnceWith('project-task', { completed_date: '2020-05-07' })
    expect(screen.queryByLabelText('Completed date')).toBeNull()

    const dateCell = editors[0].parentElement
    fireEvent.click(within(dateCell).getByTitle('Clear date'))
    expect(onUpdateTask).toHaveBeenLastCalledWith('loose-task', { completed_date: null })
  })

  it('keeps header and project date cell widths aligned and supports resizing', () => {
    const { onWidthChange } = renderGroup({ showCompletedDate: true, colWidths: { ...COL_DEFAULTS, completedDate: 180 } })
    const header = screen.getByText('Completed Date')
    expect(header.style.width).toBe('180px')
    for (const editor of screen.getAllByRole('button', { name: 'Edit completed date' })) {
      expect(editor.parentElement.parentElement.style.width).toBe('180px')
    }
    fireEvent.mouseDown(header.lastElementChild, { button: 0, clientX: 100 })
    fireEvent.mouseMove(document, { clientX: 130 })
    fireEvent.mouseUp(document)
    expect(onWidthChange).toHaveBeenCalledWith('completedDate', 210)
  })

  it('preserves editing and overdue highlighting for due dates', () => {
    const { onUpdateTask } = renderGroup({ tasks: [{ ...tasks[0], due_date: '2020-05-01' }], showCompletedDate: true })
    const dueDate = screen.getByRole('button', { name: 'Edit due date' })
    expect(dueDate.className).toContain('text-status-red')
    fireEvent.click(dueDate)
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2020-05-02' } })
    expect(onUpdateTask).toHaveBeenCalledExactlyOnceWith('loose-task', { due_date: '2020-05-02' })
  })

  it.each(['In Review', 'Following Up', 'On Hold', 'Working on it'])('keeps a stale %s row outside Completed Tasks without hiding it', (status) => {
    useBoardStore.setState({ tasks: [...tasks, { ...tasks[1], id: 'reopened-task', title: 'Needs more work', status }] })
    render(<BoardTable />)
    const completedSection = screen.getByText('Completed Tasks').closest('.mb-2')
    expect(within(completedSection).getByText('Completed standalone task')).toBeTruthy()
    expect(within(completedSection).getByText('Completed project task')).toBeTruthy()
    expect(within(completedSection).queryByText('Needs more work')).toBeNull()
    expect(within(completedSection).getAllByRole('button', { name: 'Edit completed date' })).toHaveLength(2)
    const activeSection = screen.getByText('Active Tasks').closest('.mb-2')
    expect(within(activeSection).getByText('Needs more work')).toBeTruthy()
    expect(within(activeSection).getByText(status)).toBeTruthy()
    expect(within(activeSection).queryByRole('button', { name: 'Edit completed date' })).toBeNull()
  })

  it('keeps completed project dates visible when grouped by status', () => {
    render(<BoardTable groupBy="status" />)
    expect(screen.getByText('Completed Date')).toBeTruthy()
    expect(screen.getByText('Completed project task')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Edit completed date' })).toHaveLength(2)
  })
})
