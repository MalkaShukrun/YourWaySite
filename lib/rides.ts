import { createClient } from "@/lib/supabase/server";
import type { MyBooking, RideDetails, RideGroup, RideKind, RideSummary, Stop } from "@/lib/ride-types";

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
  from?: string; // "HH:MM": rides leaving at or after this time…
  to?: string; //  …and at or before this one
}): Promise<RideSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_rides", {
    p_group_id: filters.groupId ?? null,
    p_date: filters.date ?? null,
    p_kind: filters.kind ?? null,
    p_from_time: filters.from ?? null,
    p_to_time: filters.to ? minuteAfter(filters.to) : null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as RideSummary[];
}

// The minute after "HH:MM" (search_rides' upper bound is exclusive); null after 23:59.
function minuteAfter(time: string) {
  const minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + 1;
  if (minutes >= 24 * 60) return null;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
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

export async function getMyBookings(): Promise<MyBooking[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_bookings");
  if (error) throw new Error(error.message);
  return (data ?? []) as MyBooking[];
}
