import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useBoardStore } from '../stores/useBoardStore'

export function useRealtime(boardId) {
  const { applyRealtimeEvent, setRealtimeConnected } = useBoardStore()
  const channelRef = useRef(null)

  useEffect(() => {
    if (!boardId) return

    const channel = supabase
      .channel(`board:${boardId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `board_id=eq.${boardId}` },
        (payload) => {
          applyRealtimeEvent('tasks', payload.eventType, payload.new, payload.old)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'groups', filter: `board_id=eq.${boardId}` },
        (payload) => {
          applyRealtimeEvent('groups', payload.eventType, payload.new, payload.old)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sub_groups', filter: `board_id=eq.${boardId}` },
        (payload) => {
          applyRealtimeEvent('sub_groups', payload.eventType, payload.new, payload.old)
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'boards', filter: `id=eq.${boardId}` },
        (payload) => {
          applyRealtimeEvent('boards', 'UPDATE', payload.new, payload.old)
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === 'SUBSCRIBED')
      })

    channelRef.current = channel

    return () => {
      setRealtimeConnected(false)
      supabase.removeChannel(channel)
    }
  }, [boardId, applyRealtimeEvent, setRealtimeConnected])
}
