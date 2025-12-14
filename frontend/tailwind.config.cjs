/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx,jsx,js}"],
  theme: {
    extend: {
      fontFamily: {
        sarabun: ["Sarabun", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
