/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        dm: {
          bg: 'var(--dm-bg)',
          surface: 'var(--dm-surface)',
          card: 'var(--dm-card)',
          elevated: 'var(--dm-elevated)',
          border: 'var(--dm-border)',
          text: 'var(--dm-text)',
          'text-muted': 'var(--dm-text-muted)',
          'text-subtle': 'var(--dm-text-subtle)',
          accent: 'var(--dm-accent)',
          'accent-hover': 'var(--dm-accent-hover)',
          'accent-muted': 'var(--dm-accent-muted)',
          error: 'var(--dm-error)',
          'error-bg': 'var(--dm-error-bg)',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
}
