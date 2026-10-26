import { execSync } from "node:child_process";
import type { TestProject } from "vitest/node";

// Reads the local stack's URL and keys from `supabase status`. Refuses to run
// against anything but localhost: these tests create and delete users.
export default function setup(project: TestProject) {
  let out: string;
  try {
    out = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    throw new Error("Local Supabase isn't running. Start it with `npx supabase start` (needs Docker).");
  }

  const env = Object.fromEntries(
    out
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter((m) => m !== null)
      .map((m) => [m[1], m[2]]),
  );
  const url = env.API_URL;
  const anonKey = env.PUBLISHABLE_KEY || env.ANON_KEY;
  const serviceKey = env.SECRET_KEY || env.SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) throw new Error("Couldn't read the local Supabase URL and keys.");
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`Not a local Supabase: ${url}`);

  project.provide("supabase", { url, anonKey, serviceKey });
}

declare module "vitest" {
  export interface ProvidedContext {
    supabase: { url: string; anonKey: string; serviceKey: string };
  }
}
