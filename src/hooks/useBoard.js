import { useEffect, useRef, useState } from 'react'
import { useBoardStore } from '../stores/useBoardStore'
import { useRealtime } from './useRealtime'

const POLL_INTERVAL_MS = 30_000

export function useBoard(boardId) {
  const { fetchBoardData, loading, realtimeConnected } = useBoardStore()
  const [request, setRequest] = useState({ boardId, complete: false, error: null })
  if (request.boardId !== boardId) {
    setRequest({ boardId, complete: false, error: null })
  }
  const realtimeRef = useRef(realtimeConnected)
  useEffect(() => {
    realtimeRef.current = realtimeConnected
  }, [realtimeConnected])

  useEffect(() => {
    if (!boardId) return
    let cancelled = false
    const load = async () => {
      try {
        await fetchBoardData(boardId)
        if (!cancelled) setRequest({ boardId, complete: true, error: null })
      } catch (error) {
        if (!cancelled) setRequest({ boardId, complete: true, error })
      }
    }
    load()
    return () => { cancelled = true }
  }, [boardId, fetchBoardData])

  // Re-fetch silently when the user returns to the tab
  useEffect(() => {
    if (!boardId) return
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchBoardData(boardId, true)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [boardId, fetchBoardData])

  // Polling fallback — only fires when realtime is not connected
  useEffect(() => {
    if (!boardId) return
    const id = setInterval(() => {
      if (!realtimeRef.current) fetchBoardData(boardId, true)
    }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [boardId, fetchBoardData])

  useRealtime(boardId)

  // The store starts with loading=false before its first fetch effect runs.
  // Track this request explicitly so task links cannot show a missing-task
  // warning before loading begins, or remain stuck after a rejected request.
  return {
    loading: Boolean(boardId) && (!request.complete || (!request.error && loading)),
    error: request.error,
  }
}
