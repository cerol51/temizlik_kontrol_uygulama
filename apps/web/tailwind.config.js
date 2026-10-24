/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#e8f3ee',
          100: '#dff0e8',
          500: '#176b52',
          600: '#12513f',
          900: '#154e3d',
        }
      }
    },
  },
  plugins: [],
}
