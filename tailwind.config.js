module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#2f9cfe",    // blue from the LaunchWing logo
        secondary: "#00bcd4",  // complementary cyan/teal
        darkbg: "#0a192f",     // optional dark‑mode background
      },
    },
  },
  plugins: [],
};