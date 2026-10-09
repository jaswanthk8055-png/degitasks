import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBoard } from '../src/hooks/useBoard'

const state = vi.hoisted(() => ({ fetchBoardData: vi.fn(), loading: false, realtimeConnected: true }))
vi.mock('../src/stores/useBoardStore', () => ({ useBoardStore: () => state }))
vi.mock('../src/hooks/useRealtime', () => ({ useRealtime: vi.fn() }))

function pending() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

beforeEach(() => { state.loading = false; state.fetchBoardData.mockReset() })
afterEach(cleanup)

describe('board loading for task links', () => {
  it('starts loading before the store marks the request pending', async () => {
    const request = pending()
    state.fetchBoardData.mockReturnValue(request.promise)
    const { result } = renderHook(() => useBoard('board-1'))
    expect(result.current.loading).toBe(true)
    await act(async () => request.resolve())
    expect(result.current).toEqual({ loading: false, error: null })
  })

  it('waits for each board and ignores completion from an abandoned request', async () => {
    const first = pending()
    const second = pending()
    state.fetchBoardData.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result, rerender } = renderHook(({ boardId }) => useBoard(boardId), { initialProps: { boardId: 'board-1' } })
    rerender({ boardId: 'board-2' })
    await act(async () => first.resolve())
    expect(result.current.loading).toBe(true)
    await act(async () => second.resolve())
    expect(result.current).toEqual({ loading: false, error: null })
  })

  it('settles a failed fetch even when the store leaves loading set', async () => {
    const request = pending()
    state.fetchBoardData.mockImplementation(() => { state.loading = true; return request.promise })
    const { result } = renderHook(() => useBoard('board-1'))
    const error = new Error('Network unavailable')
    await act(async () => request.reject(error))
    expect(result.current).toEqual({ loading: false, error })
  })
})
