/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: '#244B38',
        primary: '#315D45',
        sage: '#8BAE91',
        mint: '#EAF2E9',
        cream: '#FAF8F2',
        charcoal: '#303B35',
      },
      boxShadow: {
        soft: '0 18px 44px rgba(36, 75, 56, 0.12)',
      },
    },
  },
  plugins: [],
}

