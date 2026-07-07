/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic tokens driven by CSS variables in src/index.css (light + dark)
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        content: 'rgb(var(--text) / <alpha-value>)',
        muted: 'rgb(var(--text-muted) / <alpha-value>)',
        subtle: 'rgb(var(--text-subtle) / <alpha-value>)',
        // Datta Able-style palette
        primary: 'rgb(var(--primary) / <alpha-value>)',
        accent: 'rgb(var(--primary) / <alpha-value>)',
        'accent-fg': 'rgb(var(--primary-fg) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',
        // Sidebar (always dark navy for the signature admin look)
        sidebar: 'rgb(var(--sidebar) / <alpha-value>)',
        'sidebar-2': 'rgb(var(--sidebar-2) / <alpha-value>)',
        'sidebar-text': 'rgb(var(--sidebar-text) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 20px 0 rgb(69 90 100 / 0.08)',
        'card-hover': '0 8px 24px 0 rgb(69 90 100 / 0.14)',
        widget: '0 1px 4px 0 rgb(69 90 100 / 0.10)',
        drawer: '-8px 0 32px rgb(15 23 42 / 0.22)',
        sidebar: '1px 0 20px 0 rgb(27 34 45 / 0.10)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--primary) / 0.5)' },
          '70%': { boxShadow: '0 0 0 8px rgb(var(--primary) / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(var(--primary) / 0)' },
        },
        'pulse-ring-success': {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--success) / 0.5)' },
          '70%': { boxShadow: '0 0 0 6px rgb(var(--success) / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(var(--success) / 0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'slide-in': 'slide-in 0.28s ease-out',
        'pulse-ring': 'pulse-ring 1.8s ease-out infinite',
        'pulse-ring-success': 'pulse-ring-success 1.8s ease-out infinite',
      },
    },
  },
  plugins: [],
}
