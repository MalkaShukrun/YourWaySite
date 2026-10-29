import { expect, test } from "@playwright/test";

// The Supabase project in .env.local has the functions the code calls, with the
// same parameters — i.e. its migrations are up to date. A missing migration
// otherwise shows up only as "משהו השתבש" in the form that calls it.
// The calls are made signed out with made-up ids, so nothing is written.

for (const file of [".env.local", ".env.e2e.local"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Variables may come from the shell instead.
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const ID = "00000000-0000-4000-8000-000000000000";
const DATE = "2026-01-04";

// Each function with the parameters the code sends (lib/*, app/**/actions.ts).
const CALLS: [string, Record<string, unknown>][] = [
  ["search_rides", { p_group_id: null, p_date: null, p_kind: null, p_from_time: null, p_to_time: null }],
  ["get_ride", { p_route_id: ID, p_date: DATE }],
  ["my_bookings", {}],
  ["driver_rides", { p_date: DATE }],
  ["driver_passengers", { p_date: DATE }],
  ["save_route", { p_route_id: ID, p_route: {}, p_stops: [] }],
  ["add_passenger", { p_route_id: ID, p_date: DATE, p_name: "x", p_phone: "050-000-0000", p_pickup_stop_id: ID, p_dropoff_stop_id: ID }],
  ["remove_passenger", { p_booking_id: ID }],
  ["book_ride", { p_route_id: ID, p_date: DATE, p_pickup_stop_id: ID, p_dropoff_stop_id: ID }],
  ["cancel_booking", { p_booking_id: ID }],
  // Not called by the app, but added by the latest migration (0015).
  ["valid_weekdays", { p_days: [1] }],
];

test.describe("database migrations", () => {
  test.skip(!url || !key, "No Supabase settings in .env.local");

  for (const [fn, params] of CALLS) {
    test(`${fn}(${Object.keys(params).join(", ")}) exists`, async ({ request }) => {
      const response = await request.post(`${url}/rest/v1/rpc/${fn}`, { headers: { apikey: key! }, data: params });
      const body = await response.text();
      // PGRST202: no function with this name and these parameters.
      expect(body, `Run the missing migrations in supabase/migrations on ${url}`).not.toContain("PGRST202");
    });
  }
});
