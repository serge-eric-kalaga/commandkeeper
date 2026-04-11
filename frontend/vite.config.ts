import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 2000,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/auth": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:2001",
        changeOrigin: true,
      },
      "/import": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:2001",
        changeOrigin: true,
      },
      "/groups": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:2001",
        changeOrigin: true,
      },
      "/commands": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:2001",
        changeOrigin: true,
      },
      "/search": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:2001",
        changeOrigin: true,
      },
      "/tags": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:2001",
        changeOrigin: true,
      },
      "/stats": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:2001",
        changeOrigin: true,
      },
      "/health": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:2001",
        changeOrigin: true,
      },
    },
  },
  plugins: [react()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
