import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,

  fetchNotifications: async (userId) => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) {
      set({
        notifications: data,
        unreadCount: data.filter((n) => !n.read).length,
      })
    }
  },

  markAllRead: async (userId) => {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false)
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }))
  },

  addNotification: (notification) => {
    set((s) => ({
      notifications: [notification, ...s.notifications].slice(0, 20),
      unreadCount: s.unreadCount + (notification.read ? 0 : 1),
    }))
  },
}))
