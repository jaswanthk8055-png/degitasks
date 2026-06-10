import { useEffect } from 'react'
import { useBoardStore } from '../stores/useBoardStore'
import { useRealtime } from './useRealtime'

export function useBoard(boardId) {
  const { fetchBoardData, loading } = useBoardStore()

  useEffect(() => {
    if (boardId) fetchBoardData(boardId)
  }, [boardId])

  useRealtime(boardId)

  return { loading }
}
