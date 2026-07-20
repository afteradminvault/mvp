import { z } from "zod";

/**
 * Validated at import time so a missing/malformed env var fails fast at
 * startup instead of surfacing as an obscure runtime error deep in a
 * Supabase client call.
 */
const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
});

const serverOnlyEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Scaffolded per docs/DEVELOPMENT_ROADMAP.md Milestone 0 / docs/TECH_STACK.md —
  // optional because no feature reads either yet: RESEND_API_KEY is used only by
  // the manual test-send script until Milestone 1's notification templates land,
  // and OPENAI_API_KEY is config-only for Phase 2 (PRD §3.2), not wired to any
  // route. Neither should block server startup for developers who haven't set
  // them, unlike SUPABASE_SERVICE_ROLE_KEY, which every server code path needs.
  RESEND_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = ClientEnv & z.infer<typeof serverOnlyEnvSchema>;

type EnvSource = Record<string, string | undefined>;

function parseClientEnv(source: EnvSource): ClientEnv {
  const result = clientEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(
      `Invalid client environment configuration:\n${result.error.issues
        .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
        .join("\n")}`,
    );
  }
  return result.data;
}

function parseServerEnv(source: EnvSource): ServerEnv {
  const client = parseClientEnv(source);
  const server = serverOnlyEnvSchema.safeParse(source);
  if (!server.success) {
    throw new Error(
      `Invalid server environment configuration:\n${server.error.issues
        .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
        .join("\n")}`,
    );
  }
  return { ...client, ...server.data };
}

/** Safe to import from Client Components — contains no secrets. */
export const clientEnv: ClientEnv = parseClientEnv(process.env);

/**
 * Server-only. Importing this from a Client Component is a bug: Next.js will
 * inline `process.env.SUPABASE_SERVICE_ROLE_KEY` into the client bundle if it
 * ever ends up in client code, since only NEXT_PUBLIC_-prefixed vars are
 * meant to cross that boundary. Keep this import confined to server-side files.
 */
export function getServerEnv(): ServerEnv {
  return parseServerEnv(process.env);
}

export { parseClientEnv, parseServerEnv };
