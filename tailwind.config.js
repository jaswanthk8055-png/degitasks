/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'primary-blue': '#0073ea',
        'sidebar-bg': '#1f1f1f',
        'sidebar-text': '#d5d8df',
        'sidebar-hover': '#292929',
        'border-color': '#e6e9ef',
        'status-green': '#00c875',
        'status-orange': '#fdab3d',
        'status-red': '#e2445c',
        'status-blue': '#0086c0',
        'row-hover': '#f5f6f8',
        // Dark mode board tokens (used as CSS vars below too)
        'board-bg-dark': '#1a1a1a',
        'row-hover-dark': '#252525',
        'border-dark': '#333333',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      keyframes: {
        'toast-in': {
          from: { transform: 'translateY(8px) scale(0.97)', opacity: '0' },
          to:   { transform: 'translateY(0) scale(1)',      opacity: '1' },
        },
        'palette-in': {
          from: { transform: 'translateY(-6px) scale(0.98)', opacity: '0' },
          to:   { transform: 'translateY(0) scale(1)',        opacity: '1' },
        },
        'slide-down': {
          from: { maxHeight: '0', opacity: '0' },
          to:   { maxHeight: '500px', opacity: '1' },
        },
      },
      animation: {
        'toast-in':   'toast-in 0.18s cubic-bezier(0.16,1,0.3,1)',
        'palette-in': 'palette-in 0.15s cubic-bezier(0.16,1,0.3,1)',
        'slide-down': 'slide-down 0.2s ease-out',
      },
    },
  },
  plugins: [],
}
