import { randomInt, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { LocalSupabase } from "../../local-supabase";

// Builds the data the integration and e2e tests need in the local database,
// and removes it afterwards. Set-up goes through the secret key (it bypasses the rules being
// tested); every user then gets a client signed in as her with the public
// key — exactly what her browser has.

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const PASSWORD = "integration-test-password";

// Postgres codes the tests check for.
export const DENIED = "42501"; // missing grant or failed access rule
export const CHECK_FAILED = "23514"; // a check constraint
export const DUPLICATE = "23505";
export const IN_USE = "23503"; // a foreign key still points at the row

export type User = { id: string; email: string; password: string; phone: string | null; name: string; db: SupabaseClient };

export type Route = { id: string; pickup: string; dropoff: string; groupId: string };

type RouteOptions = {
  kind?: "recurring" | "one_time";
  weekdays?: number[];
  date?: string | null; // a one-time ride's date, or a recurring route's start date
  time?: string;
  seats?: number;
  price?: number;
  notes?: string | null;
  groupId?: string;
  isActive?: boolean;
};

// A phone no other test user has.
export function uniquePhone() {
  const digits = String(randomInt(10_000_000)).padStart(7, "0");
  return `059-${digits.slice(0, 3)}-${digits.slice(3)}`;
}

export function check<T>({ data, error }: { data: T; error: { message: string } | null }) {
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

export function createWorld({ url, anonKey, serviceKey }: LocalSupabase) {
  const service = createClient(url, serviceKey, options);
  const tag = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const groupIds: string[] = [];

  return {
    service,
    tag,
    anon: createClient(url, anonKey, options),

    // A signed-in user who finished onboarding (has a phone), unless phone: null.
    async user(name: string, { phone = uniquePhone() as string | null, admin = false, fullName = name } = {}): Promise<User> {
      const email = `it-${name.toLowerCase()}-${tag}-${randomUUID().slice(0, 4)}@example.test`;
      const created = await service.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (created.error) throw created.error;
      const id = created.data.user.id;
      userIds.push(id);
      check(await service.from("profiles").update({ phone, is_admin: admin }).eq("id", id));

      const db = createClient(url, anonKey, options);
      const signedIn = await db.auth.signInWithPassword({ email, password: PASSWORD });
      if (signedIn.error) throw signedIn.error;
      return { id, email, password: PASSWORD, phone, name: fullName, db };
    },

    // A user straight out of Google sign-up: profile made by the database trigger, no phone.
    async signUp(metadata: Record<string, unknown>) {
      const email = `it-signup-${tag}-${randomUUID().slice(0, 4)}@example.test`;
      const created = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: metadata });
      if (created.error) throw created.error;
      userIds.push(created.data.user.id);
      return { id: created.data.user.id, email };
    },

    async group({ origin = `IT ${tag} ${randomUUID().slice(0, 4)}`, destination = "Test", active = true } = {}) {
      const { id } = check(
        await service.from("ride_groups").insert({ origin, destination, is_active: active }).select("id").single(),
      );
      groupIds.push(id);
      return id as string;
    },

    // A route made directly in the database, so it can also be in the past.
    async route(driver: User, opts: RouteOptions = {}): Promise<Route> {
      const kind = opts.kind ?? "one_time";
      const groupId = opts.groupId ?? (await this.group());
      const row = check(
        await service
          .from("routes")
          .insert({
            driver_id: driver.id,
            group_id: groupId,
            kind,
            weekdays: kind === "recurring" ? (opts.weekdays ?? [0, 1, 2, 3, 4, 5]) : [],
            ride_date: opts.date === undefined ? (kind === "one_time" ? daysFromToday(3) : null) : opts.date,
            out_time: opts.time ?? "08:00",
            seats: opts.seats ?? 3,
            price: opts.price ?? 20,
            notes: opts.notes ?? null,
            is_active: opts.isActive ?? true,
          })
          .select("id")
          .single(),
      );
      const stops = check(
        await service
          .from("stops")
          .insert([
            { route_id: row.id, kind: "pickup", label: "Pickup A", position: 1 },
            { route_id: row.id, kind: "dropoff", label: "Dropoff B", position: 1 },
          ])
          .select("id, kind"),
      );
      const stop = (k: string) => stops.find((s: { kind: string }) => s.kind === k)!.id as string;
      return { id: row.id, pickup: stop("pickup"), dropoff: stop("dropoff"), groupId };
    },

    book(user: User, route: Route, date: string) {
      return user.db.rpc("book_ride", {
        p_route_id: route.id,
        p_date: date,
        p_pickup_stop_id: route.pickup,
        p_dropoff_stop_id: route.dropoff,
      });
    },

    // A booking made directly in the database — e.g. on a ride that already left.
    async bookDirectly(user: User, route: Route, date: string) {
      const { id } = check(
        await service
          .from("bookings")
          .insert({ route_id: route.id, ride_date: date, passenger_id: user.id, pickup_stop_id: route.pickup, dropoff_stop_id: route.dropoff })
          .select("id")
          .single(),
      );
      return id as string;
    },

    addGuest(driver: User, route: Route, date: string, { name = "Guest", phone = uniquePhone(), replace = false } = {}) {
      return driver.db.rpc("add_passenger", {
        p_route_id: route.id,
        p_date: date,
        p_name: name,
        p_phone: phone,
        p_pickup_stop_id: route.pickup,
        p_dropoff_stop_id: route.dropoff,
        p_replace: replace,
      });
    },

    // Free seats as passengers see them.
    async seatsLeft(viewer: User, route: Route, date: string) {
      const { data } = await viewer.db.rpc("get_ride", { p_route_id: route.id, p_date: date });
      return (data as { seats_left: number }[])[0].seats_left;
    },

    async cleanup() {
      // Deleting the users removes their profiles, routes, stops and bookings with them.
      await Promise.all(userIds.map((id) => service.auth.admin.deleteUser(id)));
      if (groupIds.length) await service.from("ride_groups").delete().in("id", groupIds);
    },
  };
}

export type Seed = ReturnType<typeof createWorld>;

// ─── Dates, in Israel time like the database ─────────────────────────────────

export function daysFromToday(days: number) {
  const date = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(date);
}

export const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

// The first date from `fromDays` on that isn't a Saturday (recurring routes run Sunday–Friday).
export function rideDay(fromDays = 1) {
  for (let i = fromDays; ; i++) {
    const date = daysFromToday(i);
    if (weekdayOf(date) !== 6) return date;
  }
}

// The first date after `date` that isn't a Saturday.
export function rideDayAfter(date: string) {
  for (let i = 1; ; i++) {
    const next = new Date(Date.parse(`${date}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    if (weekdayOf(next) !== 6) return next;
  }
}
