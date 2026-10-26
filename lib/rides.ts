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

// The dates a route runs in the coming week, as search lists them (departed
// and cancelled dates left out) — for switching days on the ride page.
export async function getRouteDates(routeId: string): Promise<RideSummary[]> {
  return (await searchRides({})).filter((ride) => ride.route_id === routeId);
}

// A route's current stops, in the order the driver set.
export async function getRouteStops(routeId: string): Promise<Stop[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stops")
    .select("id, kind, label, lat, lng")
    .eq("route_id", routeId)
    .eq("is_active", true)
    .order("position");
  return (data ?? []) as Stop[];
}

export async function getRide(routeId: string, date: string) {
  const supabase = await createClient();
  const [{ data: rows }, stops] = await Promise.all([
    supabase.rpc("get_ride", { p_route_id: routeId, p_date: date }),
    getRouteStops(routeId),
  ]);
  const ride = (rows as RideDetails[] | null)?.[0];
  if (!ride) return null;
  return { ride, stops };
}

export type DriverBankAccount = { holder: string; details: string };

// Payment accounts of the drivers the passenger rode with, by driver id:
// the account holder and one line ("בנק הפועלים · סניף 538 · חשבון 4821").
// Empty until migration 0004 has run.
export async function getMyDriversBankAccounts(): Promise<Map<string, DriverBankAccount>> {
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
