/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#f0f0ff",
          100: "#e2e2ff",
          200: "#c4c5ff",
          300: "#a3a4ff",
          400: "#807aff",
          500: "#6c5ce7",
          600: "#5849d0",
          700: "#4338b3",
          800: "#312a8f",
          900: "#21196b",
        },
        accent: {
          cyan:   "#00cec9",
          violet: "#a29bfe",
          pink:   "#fd79a8",
          orange: "#e17055",
          green:  "#00b894",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      animation: {
        "fade-in":      "fadeIn 0.4s ease-out",
        "slide-up":     "slideUp 0.4s ease-out",
        "pulse-slow":   "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "spin-slow":    "spin 3s linear infinite",
        "bounce-light": "bounce 1.5s infinite",
      },
      keyframes: {
        fadeIn:  { from: { opacity: 0 },                 to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: "translateY(12px)" }, to: { opacity: 1, transform: "translateY(0)" } },
      },
      backdropBlur: { xs: "2px" },
      boxShadow: {
        glow:   "0 0 20px rgba(108, 92, 231, 0.35)",
        "glow-cyan": "0 0 20px rgba(0, 206, 201, 0.35)",
        glass:  "0 8px 32px rgba(0, 0, 0, 0.12)",
      },
    },
  },
  plugins: [],
};
