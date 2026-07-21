import sodium from "libsodium-wrappers-sumo";

/**
 * CLIENT-ONLY. Everything under src/crypto/ implements the zero-knowledge
 * vault design (docs/SECURITY_ARCHITECTURE.md §1) and must run exclusively
 * in the browser. Never import anything from this directory into a Server
 * Component, Route Handler, Server Action, or Netlify Function — the server
 * must never see plaintext vault content or unwrapped key material. Never
 * log a value that passes through these modules.
 *
 * libsodium-wrappers-sumo loads its WASM binary asynchronously; every
 * consumer must await getSodium() before calling any primitive.
 */
export async function getSodium(): Promise<typeof sodium> {
  await sodium.ready;
  return sodium;
}
