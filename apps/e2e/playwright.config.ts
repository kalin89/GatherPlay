import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Los comandos de los servidores usan `npm run --workspace`, que necesita
// correr desde la raíz del monorepo, no desde apps/e2e.
const repoRoot = path.resolve(__dirname, "../..");

const FRONTEND_PORT = 3100;
const BACKEND_PORT = 3101;

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "npm run build --workspace apps/backend && npm run start --workspace apps/backend",
      cwd: repoRoot,
      port: BACKEND_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { PORT: String(BACKEND_PORT) },
    },
    {
      command:
        "npm run build --workspace apps/frontend && npx --workspace apps/frontend next start -p " +
        FRONTEND_PORT,
      cwd: repoRoot,
      port: FRONTEND_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        NEXT_DIST_DIR: ".next-e2e",
        NEXT_PUBLIC_WS_URL: `http://localhost:${BACKEND_PORT}`,
        NEXT_PUBLIC_APP_URL: `http://localhost:${FRONTEND_PORT}`,
      },
    },
  ],
});
