import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        bg2: "var(--bg2)",
        surface: "var(--surface)",
        surface2: "var(--surface2)",
        elev: "var(--elev)",
        ink: "var(--ink)",
        dim: "var(--dim)",
        faint: "var(--faint)",
        line: "var(--line)",
        line2: "var(--line2)",
        signal: "var(--signal)",
        grn: "var(--grn)",
        cyan: "var(--cyan)",
        amber: "var(--amber)",
        red: "var(--red)",
        violet: "var(--violet)",
      },
      fontFamily: {
        pixel: ["'Press Start 2P'", "monospace"],
        mono: ["'JetBrains Mono'", "monospace"],
        body: ["'Space Grotesk'", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
