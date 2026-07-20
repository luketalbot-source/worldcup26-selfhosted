import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execSync } from "child_process";

// Build identifier baked into the bundle at compile time — shown in the
// profile page's Bridge-diagnostics panel so support can tell from a
// screenshot whether a device is running the latest deploy or a stale
// cached bundle (recurring question while debugging field reports).
// Prefer the git SHA; Docker build contexts without .git fall back to a
// Northflank-style env or "unknown". The UTC timestamp alone is enough
// to validate freshness.
function buildId(): string {
  let sha = process.env.NF_GIT_SHA ?? process.env.GIT_SHA ?? "";
  if (!sha) {
    try {
      sha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
    } catch {
      sha = "unknown";
    }
  }
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ") + "Z";
  return `${sha.slice(0, 12)} · ${stamp}`;
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    // Dev-only: proxy /api to a real backend (e.g. prod, read-only QA)
    // without CORS friction. Enabled by DEV_API_PROXY=<https://host>;
    // absent in CI/prod builds, so this never affects deployments.
    ...(process.env.DEV_API_PROXY
      ? {
          proxy: {
            "/api": {
              target: process.env.DEV_API_PROXY,
              changeOrigin: true,
            },
          },
        }
      : {}),
  },
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
  },
}));
