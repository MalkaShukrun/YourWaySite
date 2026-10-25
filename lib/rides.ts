import { createClient } from "@/lib/supabase/server";
import { TIME_WINDOWS, type MyBooking, type RideDetails, type RideGroup, type RideKind, type RideSummary, type Stop, type TimeWindow } from "@/lib/ride-types";

// Data Access Layer for rides. All reads go through Postgres functions
// (supabase/migrations/0002_rides.sql) that check auth.uid() themselves.

export async function getRideGroups(): Promise<RideGroup[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ride_groups")
    .select("id, origin, destination")
    .eq("is_active", true)
    .order("origin")
    .order("destination");
  return data ?? [];
}

export async function searchRides(filters: {
  groupId?: string;
  date?: string;
  kind?: RideKind;
  time?: TimeWindow;
}): Promise<RideSummary[]> {
  const supabase = await createClient();
  const window = filters.time ? TIME_WINDOWS[filters.time] : null;
  const { data, error } = await supabase.rpc("search_rides", {
    p_group_id: filters.groupId ?? null,
    p_date: filters.date ?? null,
    p_kind: filters.kind ?? null,
    p_from_time: window?.from ?? null,
    p_to_time: window?.to ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as RideSummary[];
}

export async function getRide(routeId: string, date: string) {
  const supabase = await createClient();
  const [{ data: rows }, { data: stops }] = await Promise.all([
    supabase.rpc("get_ride", { p_route_id: routeId, p_date: date }),
    supabase
      .from("stops")
      .select("id, kind, label, lat, lng")
      .eq("route_id", routeId)
      .eq("is_active", true)
      .order("position"),
  ]);
  const ride = (rows as RideDetails[] | null)?.[0];
  if (!ride) return null;
  return { ride, stops: (stops ?? []) as Stop[] };
}

export type DriverBank = { holder: string; details: string };

// Payment accounts of the drivers the passenger rode with, by driver id:
// the account holder and one line ("בנק הפועלים · סניף 538 · חשבון 4821").
// Empty until migration 0004 has run.
export async function getMyDriversBank(): Promise<Map<string, DriverBank>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_drivers_bank");
  const rows = (data ?? []) as { driver_id: string; bank_account_name: string; bank_name: string; bank_branch: string; bank_account: string }[];
  return new Map(
    rows.map((r) => [
      r.driver_id,
      { holder: r.bank_account_name, details: `${r.bank_name} · סניף ${r.bank_branch} · חשבון ${r.bank_account}` },
    ]),
  );
}

export async function getMyBookings(): Promise<MyBooking[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_bookings");
  if (error) throw new Error(error.message);
  return (data ?? []) as MyBooking[];
}
