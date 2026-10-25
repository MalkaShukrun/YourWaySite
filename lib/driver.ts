import { createClient } from "@/lib/supabase/server";
import { getRouteStops } from "@/lib/rides";
import type { Stop } from "@/lib/ride-types";
import type { DriverPassenger, DriverRide, DriverRoute, EditableRoute } from "@/lib/driver-types";

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

type RouteRow = Omit<DriverRoute, "origin" | "destination"> & {
  ride_groups: { origin: string; destination: string } | null;
};

function flatten(row: RouteRow): DriverRoute {
  const { ride_groups, ...route } = row;
  return { ...route, origin: ride_groups?.origin ?? "", destination: ride_groups?.destination ?? "" };
}

const ROUTE_COLUMNS =
  "id, kind, group_id, weekdays, ride_date, out_time, return_time, seats, price, ride_groups(origin, destination)";

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

export async function getRouteForEdit(driverId: string, routeId: string): Promise<EditableRoute | null> {
  const supabase = await createClient();
  const [{ data: route }, stops] = await Promise.all([
    supabase
      .from("routes")
      .select(ROUTE_COLUMNS)
      .eq("id", routeId)
      .eq("driver_id", driverId)
      .eq("is_active", true)
      .maybeSingle(),
    getRouteStops(routeId),
  ]);
  if (!route) return null;
  return { ...flatten(route as unknown as RouteRow), stops };
}
