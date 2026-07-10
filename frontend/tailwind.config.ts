import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        charcoal: {
          DEFAULT: '#2C2A28',
          50: '#F5F3F0',
          100: '#EDEAE4',
          200: '#D9D4CB',
          300: '#B8B0A3',
          400: '#8A8278',
          500: '#6B645C',
          600: '#524C46',
          700: '#3D3833',
          800: '#2C2A28',
          900: '#1A1917',
        },
        copper: {
          DEFAULT: '#B87333',
          light: '#D4956A',
          dark: '#8F5A28',
        },
        bronze: '#A67C52',
        gold: {
          muted: '#C4A962',
        },
        terracotta: '#9B4D32',
        ochre: '#C9952A',
        olive: '#6B705C',
        limestone: '#E8E4DC',
        steel: {
          DEFAULT: '#5A7289',
          light: '#7A94A8',
          dark: '#455A6E',
        },
        rust: {
          DEFAULT: '#C2410C',
          light: '#E05A24',
        },
        forest: {
          DEFAULT: '#2D5A45',
          light: '#3D7A5C',
        },
      },
      boxShadow: {
        card: '0 1px 3px rgba(44, 42, 40, 0.08), 0 4px 12px rgba(44, 42, 40, 0.06)',
        'card-hover': '0 4px 16px rgba(44, 42, 40, 0.12)',
      },
      maxWidth: {
        content: '1440px',
      },
    },
  },
}

export default config
