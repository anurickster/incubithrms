import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: ".",
  server: {
    proxy: {
      "/api": process.env.SALARY_API_URL || "http://127.0.0.1:8000",
    },
  },
  build: {
    outDir: "frontend/dist",
    emptyOutDir: true,
  },
});
