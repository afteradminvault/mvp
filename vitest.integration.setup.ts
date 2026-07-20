import "dotenv/config";

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(
    `Integration tests require real Supabase credentials. Missing: ${missing.join(", ")}. ` +
      "Set them in a local .env (see .env.example) or as CI secrets.",
  );
}
