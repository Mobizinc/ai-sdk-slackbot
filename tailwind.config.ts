import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',

        // Mobiz Elite Brand Colors
        mobiz: {
          primary: '#D8242A',      // Mobiz Red
          'primary-dark': '#B01E23',
          secondary: '#613BFE',    // Innovation Purple
          tertiary: '#EE4266',     // Pink accent
        },

        primary: {
          DEFAULT: '#D8242A', // Mobiz Red
          foreground: '#FFFFFF',
          50: '#FEF2F2',
          100: '#FEE2E2',
          200: '#FECACA',
          300: '#FCA5A5',
          400: '#F87171',
          500: '#D8242A',
          600: '#B91C1C',
          700: '#991B1B',
          800: '#7F1D1D',
          900: '#450A0A',
        },
        secondary: {
          DEFAULT: '#613BFE', // Innovation Purple
          foreground: '#FFFFFF',
          50: '#F5F3FF',
          100: '#EDE9FE',
          200: '#DDD6FE',
          300: '#C4B5FD',
          400: '#A78BFA',
          500: '#613BFE',
          600: '#7C3AED',
          700: '#6D28D9',
          800: '#5B21B6',
          900: '#4C1D95',
        },

        // Neutral Palette - Mobiz Elite Gray Scale
        neutral: {
          white: '#FFFFFF',
          50: '#FAFAFA',
          100: '#F4F4F4',
          200: '#E0E0E0',
          300: '#C4C4C4',
          400: '#A1A1A1',
          500: '#737373',
          600: '#525252',
          700: '#303030',
          800: '#1A1A1A',
          900: '#0A0A0A',
        },

        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },

      // Mobiz Elite Border Radius (Sharp, Professional)
      borderRadius: {
        'none': '0',
        'sm': '2px',
        DEFAULT: '4px',
        'md': '6px',
        'lg': '8px',
        'xl': '12px',
        'full': '9999px',
      },
      fontFamily: {
        sans: ['Libre Franklin', 'system-ui', 'sans-serif'],
      },
      fontWeight: {
        light: '200',
        normal: '300',
        medium: '400',
        semibold: '500',
        bold: '600',
      },
      boxShadow: {
        'executive-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'executive': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'executive-md': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'executive-lg': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        'executive-xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
