import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Dummy-but-valid values so importing src/config/env.ts doesn't throw at
    // module-load time (its eager, fail-fast-at-startup validation is
    // intentional for the real app — see env.ts). env.test.ts itself never
    // reads these; it calls parseClientEnv/parseServerEnv directly with its
    // own fixtures, which is what actually exercises the validation logic.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://test-project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
