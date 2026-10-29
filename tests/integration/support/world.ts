import { inject } from "vitest";
import { createWorld as createWorldFor } from "./seed";

// The integration tests' world, on the local Supabase found by global-setup.ts.
export function createWorld() {
  return createWorldFor(inject("supabase"));
}

export type World = ReturnType<typeof createWorld>;
export { check, CHECK_FAILED, daysFromToday, DENIED, DUPLICATE, IN_USE, rideDay, rideDayAfter, uniquePhone, weekdayOf } from "./seed";
export type { Route, User } from "./seed";
