import type { TestProject } from "vitest/node";
import { localSupabase, type LocalSupabase } from "../local-supabase";

// Runs once: finds the local Supabase and hands its URL and keys to the tests.
export default function setup(project: TestProject) {
  project.provide("supabase", localSupabase());
}

declare module "vitest" {
  export interface ProvidedContext {
    supabase: LocalSupabase;
  }
}
