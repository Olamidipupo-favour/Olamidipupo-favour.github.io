/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        raised: "rgb(var(--raised) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-2": "rgb(var(--accent-2) / <alpha-value>)",
        "accent-3": "rgb(var(--accent-3) / <alpha-value>)",
        "accent-ink": "rgb(var(--accent-ink) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Inter Variable", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono Variable", "JetBrains Mono", "ui-monospace", "monospace"],
        display: ["Newsreader Variable", "Newsreader", "Georgia", "serif"],
      },
      maxWidth: {
        prose: "68ch",
        shell: "76rem",
      },
      borderWidth: {
        3: "3px",
      },
      boxShadow: {
        panel: "0 24px 60px -48px rgb(0 0 0 / 0.9)",
        "panel-sm": "0 1px 2px rgb(0 0 0 / 0.3)",
        glow: "0 0 40px 0 rgb(var(--accent) / 0.18)",
      },
      keyframes: {
        blink: { "0%,49%": { opacity: "1" }, "50%,100%": { opacity: "0" } },
        flicker: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.72" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
      },
      animation: {
        blink: "blink 1s steps(1) infinite",
        flicker: "flicker 4s ease-in-out infinite",
        float: "float 5s ease-in-out infinite",
        scan: "scan 8s linear infinite",
      },
    },
  },
  plugins: [],
};
