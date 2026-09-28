import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { format } from 'date-fns'
import BoardPage from '../src/pages/BoardPage'
import { useAuthStore } from '../src/stores/useAuthStore'
import { useBoardStore } from '../src/stores/useBoardStore'
import { STATUS_OPTIONS } from '../src/lib/utils'

// Keep the actual controls, board, grouping, and filtering logic. These flows
// only read seeded data and must never reach a live database or network.
vi.mock('../src/lib/supabase', () => ({
  supabase: { from: () => { throw new Error('Unexpected database access in filter tests') } },
}))
vi.mock('../src/hooks/useBoard', () => ({ useBoard: () => ({ loading: false }) }))
vi.mock('../src/components/layout/NotificationBell', () => ({ default: () => null }))

const USER_ID = 'member-1'
const COLLEAGUE_ID = 'member-2'

function renderBoard(view = 'My Tasks') {
  const profile = { id: USER_ID, full_name: 'Team Member', default_page: view }
  const colleague = { id: COLLEAGUE_ID, full_name: 'Colleague' }
  const board = { id: 'board-1', name: 'Team Work', workspace_id: 'workspace-1' }
  const task = {
    board_id: board.id, group_id: 'group-1', sub_group_id: null,
    assignee_id: USER_ID, assignee_ids: [USER_ID], status: 'Following Up',
    status_color: '#9d50dd', priority: 'High', due_date: format(new Date(), 'yyyy-MM-dd'),
  }
  useAuthStore.setState({
    ...useAuthStore.getInitialState(), user: { id: USER_ID }, profile, loading: false,
  }, true)
  useBoardStore.setState({
    ...useBoardStore.getInitialState(), currentBoard: board, boards: [board],
    profiles: [profile, colleague], memberProfiles: [profile, colleague],
    groups: [{ id: 'group-1', board_id: board.id, name: 'Active Tasks', color: '#0073ea', position: 0 }],
    statusOptions: [...STATUS_OPTIONS, { label: 'Waiting for vendor', color: '#333333' }],
    tasks: [
      { ...task, id: 'mine-followup', title: 'My follow-up task', position: 0 },
      { ...task, id: 'mine-hold', title: 'My on-hold task', status: 'On Hold', priority: 'Low', position: 1 },
      { ...task, id: 'shared', title: 'Shared follow-up task', assignee_id: COLLEAGUE_ID, assignee_ids: [COLLEAGUE_ID, USER_ID], position: 2 },
      { ...task, id: 'colleague', title: 'Colleague-only task', assignee_id: COLLEAGUE_ID, assignee_ids: [COLLEAGUE_ID], position: 3 },
      { ...task, id: 'mine-undated', title: 'My undated task', due_date: null, position: 4 },
      { ...task, id: 'mine-low', title: 'My low-priority task', priority: 'Low', position: 5 },
    ],
  }, true)
  return render(
    <MemoryRouter initialEntries={['/board/board-1']}>
      <Routes><Route path="/board/:boardId" element={<BoardPage />} /></Routes>
    </MemoryRouter>,
  )
}

function filterSection(label) {
  return within(screen.getByText(`${label}:`, { exact: true }).parentElement)
}

function openFilters() {
  fireEvent.click(screen.getByRole('button', { name: /^Filter/ }))
}

function chooseGroupBy(label) {
  fireEvent.click(screen.getByRole('button', { name: /^Group by/ }))
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label} (Your|By)`) }))
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Live network calls are forbidden in filter tests') }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('task filter controls', () => {
  it.each(['Main Table', 'My Tasks', 'Summary', 'Calendar'])('offers active status filters in %s', (view) => {
    renderBoard(view)
    openFilters()
    const statuses = filterSection('Status')
    expect(statuses.getByRole('button', { name: 'Following Up' })).toBeTruthy()
    expect(statuses.getByRole('button', { name: 'On Hold' })).toBeTruthy()
    expect(statuses.getByRole('button', { name: 'Waiting for vendor' })).toBeTruthy()
    expect(statuses.queryByRole('button', { name: 'Done' })).toBeNull()
    expect(!!screen.queryByText('Assignee:', { exact: true })).toBe(view !== 'My Tasks')
  })

  it('combines My Tasks filters and keeps self-assignment when clearing them', () => {
    renderBoard()
    openFilters()
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull()
    expect(screen.getByRole('button', { name: /^Filter/ }).textContent).toBe('Filter')

    fireEvent.click(filterSection('Status').getByRole('button', { name: 'Following Up' }))
    fireEvent.click(filterSection('Priority').getByRole('button', { name: 'High' }))
    fireEvent.click(screen.getByRole('button', { name: 'Due this week' }))
    expect(screen.getByText('My follow-up task')).toBeTruthy()
    expect(screen.getByText('Shared follow-up task')).toBeTruthy()
    expect(screen.queryByText('Colleague-only task')).toBeNull()
    expect(screen.queryByText('My on-hold task')).toBeNull()
    expect(screen.queryByText('My undated task')).toBeNull()
    expect(screen.queryByText('My low-priority task')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(screen.getByText('My on-hold task')).toBeTruthy()
    expect(screen.getByText('My undated task')).toBeTruthy()
    expect(screen.getByText('My low-priority task')).toBeTruthy()
    expect(screen.queryByText('Colleague-only task')).toBeNull()
    fireEvent.click(filterSection('Status').getByRole('button', { name: 'On Hold' }))
    expect(screen.getByText('My on-hold task')).toBeTruthy()
    expect(screen.queryByText('My follow-up task')).toBeNull()
  })

  it.each(['Status', 'Priority', 'Assignee'])('preserves My Tasks assignment and selected filters when grouping by %s', (groupBy) => {
    renderBoard()
    openFilters()
    fireEvent.click(filterSection('Status').getByRole('button', { name: 'Following Up' }))
    chooseGroupBy(groupBy)
    expect(screen.getByText('My follow-up task')).toBeTruthy()
    expect(screen.getByText('Shared follow-up task')).toBeTruthy()
    expect(screen.queryByText('Colleague-only task')).toBeNull()
    expect(screen.queryByText('My on-hold task')).toBeNull()
  })

  it('keeps each table’s filters and grouping when switching views', () => {
    renderBoard('Main Table')
    openFilters()
    fireEvent.click(filterSection('Assignee').getByRole('button', { name: /Colleague/ }))
    chooseGroupBy('Priority')
    expect(screen.getByText('Colleague-only task')).toBeTruthy()
    expect(screen.queryByText('My follow-up task')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'My Tasks' }))
    expect(screen.queryByText('Assignee:', { exact: true })).toBeNull()
    expect(screen.getByRole('button', { name: /^Filter/ }).textContent).toBe('Filter')
    expect(screen.getByRole('button', { name: /^Group by/ }).textContent).toBe('Group by')
    expect(screen.getByText('My follow-up task')).toBeTruthy()
    expect(screen.queryByText('Colleague-only task')).toBeNull()
    fireEvent.click(filterSection('Status').getByRole('button', { name: 'On Hold' }))
    chooseGroupBy('Status')

    fireEvent.click(screen.getByRole('button', { name: 'Main Table' }))
    expect(screen.getByRole('button', { name: /^Group by/ }).textContent).toBe('Group byPriority')
    expect(screen.getByText('Colleague-only task')).toBeTruthy()
    expect(screen.queryByText('My on-hold task')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'My Tasks' }))
    expect(screen.getByRole('button', { name: /^Group by/ }).textContent).toBe('Group byStatus')
    expect(screen.getByText('My on-hold task')).toBeTruthy()
    expect(screen.queryByText('My follow-up task')).toBeNull()
    expect(screen.queryByText('Colleague-only task')).toBeNull()
  })
})
