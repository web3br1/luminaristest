/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // Enable dark mode using the 'class' strategy
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './features/**/*.{js,ts,jsx,tsx}',
    './lib/**/*.{js,ts,jsx,tsx}',
    './app/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Custom Luminaris palette - Clean & Professional
        lumi: {
          // Primary accent - Classic Blue (universal & professional)
          primary: {
            50: '#EFF6FF',
            100: '#DBEAFE',
            200: '#BFDBFE',
            300: '#93C5FD',
            400: '#60A5FA',
            500: '#3B82F6',
            600: '#2563EB',
            700: '#1D4ED8',
            800: '#1E40AF',
            900: '#1E3A8A',
          },
          // Secondary accent - Teal (complementary)
          accent: {
            50: '#F0FDFA',
            100: '#CCFBF1',
            200: '#99F6E4',
            300: '#5EEAD4',
            400: '#2DD4BF',
            500: '#14B8A6',
            600: '#0D9488',
            700: '#0F766E',
            800: '#115E59',
            900: '#134E4A',
          },
          // Dark theme - Pure Charcoal (NO blue undertones)
          dark: {
            50: '#262626',   // Elevated surfaces (zinc-800)
            100: '#1F1F1F',  // Cards/modals 
            200: '#1A1A1A',  // Sidebar
            300: '#171717',  // Main content (neutral-900)
            400: '#141414',  // Deep background
            500: '#0F0F0F',  // Deepest
            600: '#0A0A0A',  // Near black
            700: '#070707',  // Almost black
            800: '#050505',  // Very dark
            900: '#000000',  // True black
          },
          // Light theme surfaces
          light: {
            50: '#FFFFFF',   // Pure white
            100: '#FAFAFA',  // Off-white (zinc-50)
            200: '#F5F5F5',  // Very light (neutral-100)
            300: '#E5E5E5',  // Light gray (neutral-200)
            400: '#D4D4D4',  // Gray (neutral-300)
            500: '#A3A3A3',  // Medium gray (neutral-400)
          },
        },
      },
      backgroundColor: {
        // Semantic background colors
        'surface-light': '#FFFFFF',
        'surface-dark': '#171717',
      },
    },
  },
  plugins: [
    // Add any Tailwind plugins here
  ],
};
