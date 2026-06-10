import type { Config } from "tailwindcss";

const TAILWIND_CONFIG: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: "#0a0a0a",
          grid: "#1a1a1a",
          amber: "#ffb000",
          green: "#00c853",
          red: "#ff1744",
          dim: "#6b7280"
        }
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"]
      }
    }
  },
  plugins: []
};

export default TAILWIND_CONFIG;
