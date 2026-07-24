import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Separate config for tests that hit the real Supabase project (currently:
 * the RLS-denial test — docs/DEVELOPMENT_ROADMAP.md Milestone 0 exit
 * criteria). Deliberately does NOT stub env vars like vitest.config.ts does
 * for unit tests — these tests need real credentials, loaded from a local
 * .env (see vitest.integration.setup.ts) or from CI secrets.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    setupFiles: ["./vitest.integration.setup.ts"],
    // Integration tests do real network calls (Supabase Auth signup, Postgres
    // queries) — one worker avoids racing shared fixture setup/teardown.
    fileParallelism: false,
    testTimeout: 20_000,
    // beforeAll/afterAll hooks in these files provision/tear down several
    // real users plus RPC round trips — vitest's 10s default has proven too
    // tight under real network latency (observed timing out across several
    // files, not any specific one), rather than raising it per-file.
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
