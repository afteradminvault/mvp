import type { Config } from "@netlify/functions";

/**
 * Milestone 0 exit criteria: prove the Netlify Scheduled Function pattern
 * works end-to-end (deploy, schedule, invoke) before Milestone 2's real
 * background jobs (dead man's switch, stale-closure-request nudges — see
 * docs/DEVELOPMENT_ROADMAP.md) are built on top of it.
 */
const scheduledPlaceholder = async () => {
  console.log(`[scheduled-placeholder] invoked at ${new Date().toISOString()}`);
  return new Response("ok");
};

export default scheduledPlaceholder;

export const config: Config = {
  schedule: "@daily",
};
