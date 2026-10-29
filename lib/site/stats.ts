import "server-only";
import { cacheLife } from "next/cache";
import { createClient } from "@supabase/supabase-js";

export type SiteStats = { members: number; routes: number };

// Site-wide totals for the login page (public_stats in 0017_public_stats_routes.sql).
// Returns null if the database can't be reached — the page then leaves the row out.
export async function getSiteStats(): Promise<SiteStats | null> {
  try {
    return await fetchSiteStats();
  } catch (error) {
    console.warn("public_stats failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

// Same for every visitor, so it's cached and needs no session cookies. It
// throws on failure rather than returning null, so a failure isn't cached.
async function fetchSiteStats(): Promise<SiteStats> {
  "use cache";
  cacheLife("hours");

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("public_stats").single<SiteStats>();
  if (error || !data) throw new Error(error?.message ?? "no data");
  const stats = { members: Number(data.members), routes: Number(data.routes) };
  // A database function of a different version may be missing a column.
  if (!Object.values(stats).every(Number.isFinite)) throw new Error(`unexpected result: ${JSON.stringify(data)}`);
  return stats;
}
