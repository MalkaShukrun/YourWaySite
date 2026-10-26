import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { inject } from "vitest";

// A small world for each test file: an admin, a driver with one ride, a
// passenger booked on it, and a stranger with no ties to either. Built with
// the secret key (bypasses RLS); each user then gets a client signed in as
// them with the public key, exactly what a browser has.

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const PASSWORD = "rls-test-password";

export type User = { id: string; db: SupabaseClient };

export type World = {
  admin: User;
  driver: User;
  passenger: User;
  stranger: User;
  anon: SupabaseClient;
  service: SupabaseClient;
  groupId: string;
  routeId: string;
  rideDate: string;
  bookingId: string;
  cleanup: () => Promise<void>;
};

function check<T>({ data, error }: { data: T; error: { message: string } | null }) {
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

export async function createWorld(): Promise<World> {
  const { url, anonKey, serviceKey } = inject("supabase");
  const service = createClient(url, serviceKey, options);
  const tag = randomUUID().slice(0, 8);
  const userIds: string[] = [];

  async function user(name: string): Promise<User> {
    const email = `rls-${name}-${tag}@example.test`;
    const created = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (created.error) throw created.error;
    userIds.push(created.data.user.id);
    const db = createClient(url, anonKey, options);
    const signedIn = await db.auth.signInWithPassword({ email, password: PASSWORD });
    if (signedIn.error) throw signedIn.error;
    return { id: created.data.user.id, db };
  }

  const [admin, driver, passenger, stranger] = await Promise.all(
    ["admin", "driver", "passenger", "stranger"].map(user),
  );
  check(await service.from("profiles").update({ is_admin: true }).eq("id", admin.id));
  check(
    await service
      .from("profiles")
      .update({ full_name: "Driver", phone: "050-0000000", bank_name: "Bank", bank_account: "12345" })
      .eq("id", driver.id),
  );

  const group = check(
    await service.from("ride_groups").insert({ origin: `RLS ${tag}`, destination: "Test" }).select("id").single(),
  );
  const rideDate = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const route = check(
    await service
      .from("routes")
      .insert({ driver_id: driver.id, group_id: group.id, kind: "one_time", ride_date: rideDate, out_time: "08:00", seats: 3, price: 20 })
      .select("id")
      .single(),
  );
  const stops = check(
    await service
      .from("stops")
      .insert([
        { route_id: route.id, kind: "pickup", label: "A" },
        { route_id: route.id, kind: "dropoff", label: "B" },
      ])
      .select("id, kind"),
  );
  const stop = (kind: string) => stops.find((s) => s.kind === kind)!.id;
  const bookingId = check(
    await passenger.db.rpc("book_ride", {
      p_route_id: route.id,
      p_date: rideDate,
      p_pickup_stop_id: stop("pickup"),
      p_dropoff_stop_id: stop("dropoff"),
    }),
  ) as string;

  return {
    admin,
    driver,
    passenger,
    stranger,
    anon: createClient(url, anonKey, options),
    service,
    groupId: group.id,
    routeId: route.id,
    rideDate,
    bookingId,
    // Deleting the users cascades to their profiles, routes, stops and bookings.
    cleanup: async () => {
      await Promise.all(userIds.map((id) => service.auth.admin.deleteUser(id)));
      await service.from("ride_groups").delete().eq("id", group.id);
    },
  };
}

// Postgres "insufficient privilege": a missing grant or a failed RLS check.
export const DENIED = "42501";
