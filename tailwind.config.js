/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx,html}', './src/renderer/index.html'],
  theme: {
    extend: {
      colors: {
        hardware: {
          bg: '#1C1C1F',
          panel: '#1C1C1F',
          inset: '#131316',
          border: '#2E2E34',
          label: '#9A9AA0',
          led: '#2DFF6A',
          vu: '#D9E3D0',
          badge: '#131316',
          lcd: '#D9E3D0',
          accent: '#2DFF6A',
        },
      },
    },
  },
  plugins: [],
};
