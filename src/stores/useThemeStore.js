import { create } from 'zustand'

const saved = localStorage.getItem('theme-preference')
const initDark = saved === 'dark'

if (initDark) document.documentElement.classList.add('dark')

export const useThemeStore = create((set) => ({
  dark: initDark,
  toggle: () =>
    set((s) => {
      const next = !s.dark
      document.documentElement.classList.toggle('dark', next)
      localStorage.setItem('theme-preference', next ? 'dark' : 'light')
      return { dark: next }
    }),
}))
