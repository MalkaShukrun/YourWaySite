import "server-only";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { israelNow } from "@/lib/utils/dates";
import { isCancelledOneTimeRide, routeTab } from "@/lib/driver/data";
import type { DriverRoute } from "@/lib/driver/types";

// Data Access Layer for group management (SRS §8). RLS limits ride_groups
// writes to admins; callers check with requireAdmin before reading.

export type AdminGroup = {
  id: string;
  origin: string;
  destination: string;
  origin_place_id: string;
  destination_place_id: string;
  is_active: boolean;
  // `is_active`: listed under its driver's active routes — not removed, and
  // not a one-time ride that took place or was cancelled for its date.
  routes: { driver_id: string; is_active: boolean }[];
};

type GroupRow = Omit<AdminGroup, "routes"> & {
  routes: (Pick<DriverRoute, "kind" | "ride_date" | "out_time"> & {
    driver_id: string;
    is_active: boolean;
    ride_exceptions: { ride_date: string; cancelled: boolean }[] | null;
  })[];
};

// Every group, hidden ones included, with the routes that use it.
export async function getAdminGroups(): Promise<AdminGroup[]> {
  const supabase = await createClient();
  const [{ data, error }, israel] = await Promise.all([
    supabase
      .from("ride_groups")
      .select("id, origin, destination, origin_place_id, destination_place_id, is_active, routes(driver_id, is_active, kind, ride_date, out_time, ride_exceptions(ride_date, cancelled))")
      .order("origin")
      .order("destination"),
    israelNow(),
  ]);
  if (error) throw new Error(error.message);
  const now = format(israel, "yyyy-MM-dd HH:mm");
  return ((data ?? []) as GroupRow[]).map(({ routes, ...group }) => ({
    ...group,
    routes: routes.map(({ ride_exceptions, ...route }) => ({
      driver_id: route.driver_id,
      is_active:
        route.is_active && routeTab({ ...route, ride_cancelled: isCancelledOneTimeRide(route, ride_exceptions) }, now) === "active",
    })),
  }));
}

export type Place = { id: string; city: string; neighborhood: string; name: string };

// The places groups go from and to (0040), by city and then neighborhood.
export async function getPlaces(): Promise<Place[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("places")
    .select("id, city, neighborhood, name")
    .order("city")
    .order("neighborhood");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type AdminStats = {
  users: number;
  rides_today: number;
  passengers_today: number;
  rides_departed: number;
  passengers_departed: number;
};

// The active routes, and the drivers who have one. A hidden group's routes
// can't be booked, so they aren't counted.
export function activeRouteTotals(groups: AdminGroup[]) {
  const routes = groups.filter((g) => g.is_active).flatMap((g) => g.routes.filter((r) => r.is_active));
  return { routes: routes.length, drivers: new Set(routes.map((r) => r.driver_id)).size };
}

// Site-wide totals (0033_admin_stats.sql). The function returns them to admins only.
export async function getAdminStats(): Promise<AdminStats> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_stats").single<AdminStats>();
  if (error) throw new Error(error.message);
  return data;
}

// The addresses approved for sign-in with a personal code. RLS: admins only.
export async function getOtpEmails(): Promise<{ email: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("otp_emails").select("email").order("email");
  if (error) throw new Error(error.message);
  return data ?? [];
}
