import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: ".",
  server: {
    proxy: {
      "/api": {
        target: process.env.SALARY_API_URL || "http://127.0.0.1:8000",
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("error", (err, req, res) => {
            if (res.writeHead && !res.headersSent) {
              res.writeHead(503, {
                "Content-Type": "application/json; charset=utf-8",
              });
              res.end(
                JSON.stringify({
                  error: "Cannot connect to the salary backend API on http://127.0.0.1:8000. Ensure the backend server is running ('npm run api' or 'npm run dev:all').",
                })
              );
            }
          });
        },
      },
    },
  },
  build: {
    outDir: "frontend/dist",
    emptyOutDir: true,
  },
});
