/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Material Design 3 Color System
        primary: '#6750a4',
        'primary-container': '#eaddff',
        secondary: '#625b71',
        'secondary-container': '#e8def8',
        tertiary: '#7d5260',
        'tertiary-container': '#ffd8e4',
        
        // Neutral colors
        surface: '#fffbfe',
        'surface-dim': '#f4eff4',
        'surface-container': '#f3eff3',
        'surface-container-high': '#ede7f0',
        
        outline: '#79747e',
        'outline-variant': '#cac7d0',
        
        // Semantic colors
        error: '#b3261e',
        'error-container': '#f9dedc',
        success: '#1b6e1f',
        warning: '#f57c00',
      },
      fontSize: {
        'headline-lg': ['32px', { lineHeight: '40px' }],
        'headline-md': ['28px', { lineHeight: '36px' }],
        'headline-sm': ['24px', { lineHeight: '32px' }],
        'title-lg': ['22px', { lineHeight: '28px' }],
        'title-md': ['16px', { lineHeight: '24px' }],
        'body-lg': ['16px', { lineHeight: '24px' }],
        'body-md': ['14px', { lineHeight: '20px' }],
      },
      boxShadow: {
        'md3-1': '0px 1px 3px rgba(0, 0, 0, 0.12)',
        'md3-2': '0px 3px 6px rgba(0, 0, 0, 0.16)',
        'md3-3': '0px 10px 20px rgba(0, 0, 0, 0.19)',
      },
      borderRadius: {
        'md3': '12px',
        'md3-lg': '16px',
      },
    },
  },
  plugins: [],
}
