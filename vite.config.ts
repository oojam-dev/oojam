import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  // Pre-bundle every dependency when the dev server starts rather than on first
  // request, so a fresh dev server doesn't reload mid-page with two copies of React.
  optimizeDeps: {
    entries: ["./app/**/*.{ts,tsx}", "!./app/**/*.test.{ts,tsx}"],
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
  },
});
