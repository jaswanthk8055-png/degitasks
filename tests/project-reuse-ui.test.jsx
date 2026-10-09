import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import BoardPage from '../src/pages/BoardPage'
import { useAuthStore } from '../src/stores/useAuthStore'
import { useBoardStore } from '../src/stores/useBoardStore'
import { useToastStore } from '../src/stores/useToastStore'

const database = vi.hoisted(() => ({ from: vi.fn() }))

// Keep the real dialog, board, and activation action. Any attempt to write or
// fetch tasks through the transport fails, so project reuse cannot move history.
vi.mock('../src/lib/supabase', () => ({ supabase: { from: database.from } }))
vi.mock('../src/hooks/useBoard', () => ({ useBoard: () => ({ loading: false }) }))
vi.mock('../src/components/layout/NotificationBell', () => ({ default: () => null }))

const BOARD_ID = 'reuse-board'
const USER_ID = 'reuse-member'
const TO_DO = { id: 'to-do', board_id: BOARD_ID, name: 'To Do', color: '#0073ea', position: 0 }
const COMPLETED = { id: 'completed', board_id: BOARD_ID, name: 'Completed Tasks', color: '#00c875', position: 2 }
const PROJECT_NAME = 'Client Shipping Plan'
const completedProject = { id: 'completed-project', board_id: BOARD_ID, group_id: COMPLETED.id, name: PROJECT_NAME, position: 0 }
const completedTask = {
  id: 'completed-task', board_id: BOARD_ID, group_id: COMPLETED.id, sub_group_id: completedProject.id,
  title: 'Historic shipment', status: 'Done', status_color: '#00c875', completed_date: '2026-09-12',
  assignee_id: USER_ID, assignee_ids: [USER_ID], created_by: USER_ID, position: 0,
}

let writes
let responses
let sequence
let fetchSpy

function renderBoard({ groups = [TO_DO, COMPLETED], projects = [completedProject], tasks = [completedTask] } = {}) {
  const profile = { id: USER_ID, full_name: 'Team Member', email: 'reuse@example.test', default_page: 'My Tasks' }
  const board = { id: BOARD_ID, workspace_id: 'reuse-workspace', name: 'Project Reuse' }
  useAuthStore.setState({ ...useAuthStore.getInitialState(), user: { id: USER_ID, email: profile.email }, profile, loading: false }, true)
  useBoardStore.setState({
    ...useBoardStore.getInitialState(), boards: [board], currentBoard: board, workspaceId: board.workspace_id,
    groups, subGroups: projects, tasks, profiles: [profile], memberProfiles: [profile],
    statusOptions: [{ label: 'Done', color: '#00c875' }, { label: 'Not Started', color: '#c4c4c4' }],
  }, true)
  useToastStore.setState(useToastStore.getInitialState(), true)
  return render(
    <MemoryRouter initialEntries={[`/board/${BOARD_ID}`]}>
      <Routes><Route path="/board/:boardId" element={<BoardPage />} /></Routes>
    </MemoryRouter>,
  )
}

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Add Project', exact: true }))
  return screen.getByRole('dialog', { name: 'Add Project' })
}

function selectProject(dialog, group = 'Completed Tasks', name = PROJECT_NAME) {
  const button = within(dialog).getByRole('button', { name: `Select project ${name} in ${group}` })
  fireEvent.click(button)
  return button
}

async function expectReadyProject(projectId) {
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add Project' })).toBeNull())
  const section = document.querySelector(`[data-project-id="${projectId}"]`)
  expect(section).toBeTruthy()
  expect(within(section).getByText('+ Add task to this project', { exact: true })).toBeTruthy()
}

beforeEach(() => {
  localStorage.clear()
  writes = []
  responses = []
  sequence = 0
  database.from.mockReset()
  database.from.mockImplementation((table) => {
    if (!['groups', 'sub_groups'].includes(table)) throw new Error(`Project reuse accessed unexpected table: ${table}`)
    let row
    const result = () => responses.shift()?.(row) ?? Promise.resolve({ data: row, error: null })
    const query = {
      insert(payload) {
        writes.push({ table, payload: structuredClone(payload) })
        row = { id: `created-${table}-${++sequence}`, ...payload }
        return query
      },
      select() { return query },
      single: result,
      then(resolve, reject) { return result().then(resolve, reject) },
    }
    return query
  })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  fetchSpy = vi.fn(() => { throw new Error('Live requests are forbidden in project reuse tests') })
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  cleanup()
  expect(fetchSpy).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

describe('selecting an existing project for new tasks', () => {
  it('shows one normalized name across active and completed groups and reuses an empty To Do project', async () => {
    const activeProject = { ...completedProject, id: 'active-project', group_id: TO_DO.id }
    const progress = { id: 'progress', board_id: BOARD_ID, name: 'In Progress', color: '#fdab3d', position: 1 }
    renderBoard({
      groups: [TO_DO, progress, COMPLETED],
      projects: [
        { ...completedProject, name: '  CLIENT   SHIPPING PLAN  ' },
        activeProject,
        { ...completedProject, id: 'progress-project', group_id: progress.id, name: 'client shipping plan' },
        { ...completedProject, id: 'billing-project', name: 'Client Billing' },
      ],
    })
    const dialog = openDialog()
    expect(within(dialog).getAllByRole('button', { name: /^Select project/ })).toHaveLength(2)
    const name = within(dialog).getByRole('textbox', { name: 'Project name' })
    fireEvent.change(name, { target: { value: 'sHiP' } })
    expect(within(dialog).getAllByRole('button', { name: /^Select project/ })).toHaveLength(1)
    expect(within(dialog).getByRole('button', { name: `Select project ${PROJECT_NAME} in To Do` })).toBeTruthy()
    fireEvent.change(name, { target: { value: '  CLIENT   shipping plan  ' } })
    expect(within(dialog).getByRole('button', { name: 'Create project' }).disabled).toBe(true)

    selectProject(dialog, 'To Do')
    await expectReadyProject(activeProject.id)
    expect(writes).toEqual([])
    expect(useBoardStore.getState().tasks).toEqual([completedTask])
    expect(useBoardStore.getState().subGroups).toHaveLength(4)
  })

  it('creates a To Do counterpart for a completed-only name while preserving completed tasks and projects', async () => {
    renderBoard()
    selectProject(openDialog())
    await expectReadyProject('created-sub_groups-1')

    expect(writes).toEqual([{ table: 'sub_groups', payload: {
      board_id: BOARD_ID, group_id: TO_DO.id, name: PROJECT_NAME, position: 0,
    } }])
    expect(useBoardStore.getState().subGroups).toEqual(expect.arrayContaining([
      completedProject,
      expect.objectContaining({ id: 'created-sub_groups-1', group_id: TO_DO.id, name: PROJECT_NAME }),
    ]))
    expect(useBoardStore.getState().tasks).toEqual([completedTask])
  })

  it('creates To Do when absent and keeps the original active and completed project rows', async () => {
    const progress = { id: 'progress', board_id: BOARD_ID, name: 'In Progress', color: '#fdab3d', position: 0 }
    const progressProject = { ...completedProject, id: 'progress-project', group_id: progress.id }
    renderBoard({ groups: [progress, COMPLETED], projects: [completedProject, progressProject] })
    const dialog = openDialog()
    expect(within(dialog).getAllByRole('button', { name: /^Select project/ })).toHaveLength(1)
    selectProject(dialog, 'In Progress')
    await expectReadyProject('created-sub_groups-2')

    expect(writes[0]).toMatchObject({ table: 'groups', payload: { board_id: BOARD_ID, name: 'To Do' } })
    expect(writes[1]).toMatchObject({ table: 'sub_groups', payload: { board_id: BOARD_ID, group_id: 'created-groups-1', name: PROJECT_NAME } })
    expect(useBoardStore.getState().subGroups).toEqual(expect.arrayContaining([completedProject, progressProject]))
    expect(useBoardStore.getState().tasks).toEqual([completedTask])
  })

  it('keeps errors visible and allows retry, while blocking repeated selection and closing during save', async () => {
    renderBoard()
    responses.push(() => Promise.resolve({ data: null, error: new Error('Project permission denied') }))
    const dialog = openDialog()
    selectProject(dialog)
    expect((await within(dialog).findByRole('alert')).textContent).toContain('Project permission denied')
    expect(screen.getByRole('dialog', { name: 'Add Project' })).toBe(dialog)
    expect(useBoardStore.getState().subGroups).toEqual([completedProject])
    expect(useBoardStore.getState().tasks).toEqual([completedTask])

    let finishSave
    responses.push((row) => new Promise((resolve) => { finishSave = () => resolve({ data: row, error: null }) }))
    const button = selectProject(dialog)
    fireEvent.click(button)
    fireEvent.submit(dialog.querySelector('form'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(writes).toHaveLength(2)
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(within(dialog).getByRole('button', { name: 'Cancel' }).disabled).toBe(true)
    expect(useBoardStore.getState().tasks).toEqual([completedTask])

    await act(async () => finishSave())
    await expectReadyProject('created-sub_groups-2')
    expect(writes).toHaveLength(2)
    expect(useBoardStore.getState().tasks).toEqual([completedTask])
    expect(useBoardStore.getState().subGroups).toContainEqual(completedProject)
  })
})
