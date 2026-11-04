import "server-only";
import { createClient } from "@/lib/supabase/server";
import { formatTime } from "@/lib/utils/dates";
import { getRouteStops } from "@/lib/rides/data";
import type { Stop } from "@/lib/rides/types";
import type { DriverPassenger, DriverRide, DriverRoute, EditableRoute } from "@/lib/driver/types";

// Data Access Layer for the Driver Hub. The Postgres functions and RLS
// (supabase/migrations/0003_driver.sql) limit everything to the signed-in driver.

export async function getDriverDay(date: string) {
  const supabase = await createClient();
  const [ridesRes, passengersRes] = await Promise.all([
    supabase.rpc("driver_rides", { p_date: date }),
    supabase.rpc("driver_passengers", { p_date: date }),
  ]);
  if (ridesRes.error) throw new Error(ridesRes.error.message);
  if (passengersRes.error) throw new Error(passengersRes.error.message);

  const rides = (ridesRes.data ?? []) as DriverRide[];
  const passengers = (passengersRes.data ?? []) as DriverPassenger[];

  const { data: stops } = rides.length
    ? await supabase
        .from("stops")
        .select("id, route_id, kind, label, lat, lng")
        .in("route_id", rides.map((r) => r.route_id))
        .eq("is_active", true)
        .order("position")
    : { data: [] };

  return {
    rides: rides.map((ride) => ({
      ...ride,
      passengers: passengers.filter((p) => p.route_id === ride.route_id),
      stops: ((stops ?? []) as (Stop & { route_id: string })[]).filter((s) => s.route_id === ride.route_id),
    })),
  };
}

type RideExceptions = { ride_date: string; cancelled: boolean }[] | null;

type RouteRow = Omit<DriverRoute, "origin" | "destination" | "ride_cancelled"> & {
  ride_groups: { origin: string; destination: string } | null;
  ride_exceptions: RideExceptions;
};

// A one-time ride the driver cancelled for its date ("cancel for this date only").
export function isCancelledOneTimeRide(route: Pick<DriverRoute, "kind" | "ride_date">, exceptions: RideExceptions) {
  return route.kind === "one_time" && !!exceptions?.find((x) => x.ride_date === route.ride_date)?.cancelled;
}

function flatten(row: RouteRow): DriverRoute {
  const { ride_groups, ride_exceptions, ...route } = row;
  return {
    ...route,
    ride_cancelled: isCancelledOneTimeRide(route, ride_exceptions),
    origin: ride_groups?.origin ?? "",
    destination: ride_groups?.destination ?? "",
  };
}

const ROUTE_COLUMNS =
  "id, kind, group_id, weekdays, ride_date, out_time, return_time, seats, price, notes, ride_groups(origin, destination), ride_exceptions(ride_date, cancelled)";

// A one-time ride whose date and departure time have gone by. It stays in the
// history: it can't be removed or given more stops. `now` is "YYYY-MM-DD HH:mm" in Israel.
export function isPastOneTimeRide(route: Pick<DriverRoute, "kind" | "ride_date" | "out_time">, now: string) {
  return route.kind === "one_time" && !!route.ride_date && `${route.ride_date} ${formatTime(route.out_time)}` <= now;
}

// The tab of my routes a route is listed under (spec F2, F3): a one-time ride
// cancelled for its date, or one that took place, leaves the active tab.
export function routeTab(route: Pick<DriverRoute, "kind" | "ride_date" | "out_time" | "ride_cancelled">, now: string) {
  return route.ride_cancelled ? "cancelled" : isPastOneTimeRide(route, now) ? "history" : "active";
}

export async function getMyRoutes(driverId: string): Promise<DriverRoute[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("routes")
    .select(ROUTE_COLUMNS)
    .eq("driver_id", driverId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RouteRow[]).map(flatten);
}

// `has_bookings` counts any booking on any date, cancelled ones included: only
// a route nobody has booked can be edited in full (0037_edit_unbooked_routes.sql).
export async function getRouteForEdit(driverId: string, routeId: string): Promise<EditableRoute | null> {
  const supabase = await createClient();
  const [{ data: route }, stops, bookings] = await Promise.all([
    supabase
      .from("routes")
      .select(ROUTE_COLUMNS)
      .eq("id", routeId)
      .eq("driver_id", driverId)
      .eq("is_active", true)
      .maybeSingle(),
    getRouteStops(routeId),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("route_id", routeId),
  ]);
  if (bookings.error) throw new Error(bookings.error.message);
  if (!route) return null;
  return { ...flatten(route as unknown as RouteRow), stops, has_bookings: (bookings.count ?? 0) > 0 };
}
