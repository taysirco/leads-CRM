module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        'cairo': ['Cairo', 'sans-serif'],
      }
    }
  },
  plugins: [
    require('@tailwindcss/forms'),
    // Add custom plugin for RTL support
    function({ addUtilities }) {
      const newUtilities = {
        '.rtl': {
          direction: 'rtl',
        },
        '.ltr': {
          direction: 'ltr',
        },
        '.mr-auto-rtl': {
          'margin-right': 'auto',
          'margin-left': '0',
        },
        '.ml-auto-rtl': {
          'margin-left': 'auto',
          'margin-right': '0',
        },
      }
      addUtilities(newUtilities)
    }
  ]
}; 