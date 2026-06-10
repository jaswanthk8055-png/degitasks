import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { avatarColorFromName } from '../lib/utils'

export const SUPER_USER_EMAIL = 'jaswanth.k@degitrans.com'

export const useAuthStore = create((set, get) => ({
  user: null,
  profile: null,
  loading: true,

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      await get().fetchProfile(session.user)
    }
    set({ loading: false })

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await get().fetchProfile(session.user)
      } else {
        set({ user: null, profile: null })
      }
    })
  },

  fetchProfile: async (user) => {
    set({ user })
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    set({ profile: data })
  },

  signUp: async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    })
    if (error) throw error

    if (data.user) {
      const color = avatarColorFromName(fullName)
      await supabase
        .from('profiles')
        .upsert({ id: data.user.id, full_name: fullName, avatar_color: color })

      await get().createDefaultWorkspace(data.user.id, fullName)
    }
    return data
  },

  createDefaultWorkspace: async (userId, fullName) => {
    const workspaceName = `${fullName}'s Workspace`
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .insert({ name: workspaceName, owner_id: userId })
      .select()
      .single()
    if (wsError) return

    await supabase
      .from('workspace_members')
      .insert({ workspace_id: workspace.id, user_id: userId, role: 'owner' })

    const { data: board, error: boardError } = await supabase
      .from('boards')
      .insert({
        workspace_id: workspace.id,
        name: 'My First Board',
        icon: '📋',
        color: '#0073ea',
        created_by: userId,
      })
      .select()
      .single()
    if (boardError) return

    const { data: groups } = await supabase
      .from('groups')
      .insert([
        { board_id: board.id, name: 'To Do', color: '#0073ea', position: 0 },
        { board_id: board.id, name: 'In Progress', color: '#fdab3d', position: 1 },
      ])
      .select()

    if (groups && groups.length >= 2) {
      await supabase.from('tasks').insert([
        {
          board_id: board.id,
          group_id: groups[0].id,
          title: 'Welcome to DegiTasks! 👋',
          status: 'Not Started',
          status_color: '#c4c4c4',
          priority: 'Low',
          position: 0,
          created_by: userId,
        },
        {
          board_id: board.id,
          group_id: groups[0].id,
          title: 'Invite your team members',
          status: 'Not Started',
          status_color: '#c4c4c4',
          priority: 'Medium',
          position: 1,
          created_by: userId,
        },
        {
          board_id: board.id,
          group_id: groups[1].id,
          title: 'Set up your first project',
          status: 'Working on it',
          status_color: '#fdab3d',
          priority: 'High',
          position: 0,
          created_by: userId,
        },
      ])
    }

    return board
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  },

  sendPasswordResetEmail: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
  },

  updatePassword: async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null })
  },
}))
