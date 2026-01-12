/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./public/**/*.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Colores de Venus (dark theme)
        venus: {
          bg: '#0f0f0f',
          card: '#1a1a1a',
          border: '#2a2a2a',
          accent: '#d4af37',
          'accent-hover': '#e5c04b',
          text: '#ffffff',
          'text-muted': '#9ca3af',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
