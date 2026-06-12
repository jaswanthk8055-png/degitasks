import { useEffect, useRef } from 'react'
import { useBoardStore } from '../stores/useBoardStore'
import { useRealtime } from './useRealtime'

const POLL_INTERVAL_MS = 30_000

export function useBoard(boardId) {
  const { fetchBoardData, loading, realtimeConnected } = useBoardStore()
  const realtimeRef = useRef(realtimeConnected)
  realtimeRef.current = realtimeConnected

  useEffect(() => {
    if (boardId) fetchBoardData(boardId)
  }, [boardId])

  // Re-fetch silently when the user returns to the tab
  useEffect(() => {
    if (!boardId) return
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchBoardData(boardId, true)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [boardId])

  // Polling fallback — only fires when realtime is not connected
  useEffect(() => {
    if (!boardId) return
    const id = setInterval(() => {
      if (!realtimeRef.current) fetchBoardData(boardId, true)
    }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [boardId])

  useRealtime(boardId)

  return { loading }
}
