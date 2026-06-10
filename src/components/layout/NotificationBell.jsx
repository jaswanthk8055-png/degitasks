import { useState, useEffect, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/useAuthStore'
import { useNotificationStore } from '../../stores/useNotificationStore'

export default function NotificationBell() {
  const { profile } = useAuthStore()
  const { notifications, unreadCount, fetchNotifications, markAllRead, addNotification } =
    useNotificationStore()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Initial load + realtime subscription
  useEffect(() => {
    if (!profile?.id) return
    fetchNotifications(profile.id)

    const channel = supabase
      .channel(`notifications:${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        (payload) => {
          addNotification(payload.new)
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [profile?.id])

  // Click outside to close
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition text-gray-500 dark:text-gray-400"
        title="Notifications"
      >
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-[300px] bg-white dark:bg-[#252525] border border-border-color dark:border-[#3a3a3a] rounded-xl shadow-xl z-50 overflow-hidden animate-dropdown">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-color dark:border-[#333]">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead(profile?.id)}
                className="text-xs text-primary-blue hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto scrollbar-thin">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                No notifications yet
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-border-color last:border-0 transition-colors ${
                    !n.read ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && (
                      <div className="w-2 h-2 rounded-full bg-primary-blue mt-1.5 flex-shrink-0" />
                    )}
                    <div className={!n.read ? '' : 'pl-4'}>
                      <p className="text-sm text-gray-800 leading-snug">{n.message}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {format(parseISO(n.created_at), 'MMM d, h:mm a')}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
