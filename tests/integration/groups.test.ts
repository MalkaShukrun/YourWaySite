import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHECK_FAILED, createWorld, DENIED, DUPLICATE, IN_USE, rideDay, type User, type World } from "./support/world";

// Ride groups (spec §2, H1–H3): only admins manage them; everyone signed in reads them.

let w: World;
let admin: User;
let user: User;

beforeAll(async () => {
  w = createWorld();
  [admin, user] = await Promise.all([w.user("Admin", { admin: true }), w.user("User")]);
});
afterAll(() => w?.cleanup());

const origin = () => `IT ${w.tag} ${Math.random().toString(36).slice(2, 7)}`;

describe("creating and renaming (spec H1)", () => {
  it("an admin creates a group", async () => {
    const name = origin();
    const { data, error } = await admin.db.from("ride_groups").insert({ origin: name, destination: "Test" }).select("id, is_active").single();
    expect(error).toBeNull();
    expect(data!.is_active).toBe(true);
    await w.service.from("ride_groups").delete().eq("id", data!.id);
  });

  it("a regular user can't create one", async () => {
    const { error } = await user.db.from("ride_groups").insert({ origin: origin(), destination: "Test" });
    expect(error?.code).toBe(DENIED);
  });

  it("a duplicate is refused", async () => {
    const name = origin();
    const id = await w.group({ origin: name, destination: "Test" });
    const { error } = await admin.db.from("ride_groups").insert({ origin: name, destination: "Test" });
    expect(error?.code).toBe(DUPLICATE);
    expect(id).toBeTruthy();
  });

  it.each([
    ["the same origin and destination", { origin: "ירושלים", destination: "ירושלים" }],
    ["a one-letter name", { origin: "א", destination: "Test" }],
    ["a name over 40 characters", { origin: "א".repeat(41), destination: "Test" }],
  ])("%s is refused, even sent directly", async (_name, row) => {
    const { error } = await admin.db.from("ride_groups").insert(row);
    expect(error?.code).toBe(CHECK_FAILED);
  });

  it("an admin renames a group; a regular user can't", async () => {
    const id = await w.group();
    const renamed = origin();
    const { data: byUser } = await user.db.from("ride_groups").update({ origin: "Hacked" }).eq("id", id).select();
    expect(byUser ?? []).toEqual([]);
    expect((await admin.db.from("ride_groups").update({ origin: renamed }).eq("id", id)).error).toBeNull();
    const { data } = await w.service.from("ride_groups").select("origin").eq("id", id).single();
    expect(data!.origin).toBe(renamed);
  });

  // A renamed group shows its new name everywhere, including past bookings (spec H1).
  it("a rename reaches the routes and bookings that use the group", async () => {
    const driver = await w.user("Driver");
    const passenger = await w.user("Passenger");
    const route = await w.route(driver);
    const date = (await w.service.from("routes").select("ride_date").eq("id", route.id).single()).data!.ride_date as string;
    await w.book(passenger, route, date);

    const renamed = origin();
    await admin.db.from("ride_groups").update({ origin: renamed }).eq("id", route.groupId);
    const { data: mine } = await passenger.db.rpc("my_bookings");
    expect((mine as { origin: string }[])[0].origin).toBe(renamed);
    const { data: found } = await passenger.db.rpc("search_rides", { p_group_id: route.groupId, p_date: date });
    expect((found as { origin: string }[])[0].origin).toBe(renamed);
  });
});

describe("reading", () => {
  it("every signed-in user reads the groups", async () => {
    const id = await w.group();
    const { data } = await user.db.from("ride_groups").select("id").eq("id", id);
    expect(data).toHaveLength(1);
  });

  it("signed-out visitors read none", async () => {
    const id = await w.group();
    const { data } = await w.anon.from("ride_groups").select("id").eq("id", id);
    expect(data ?? []).toEqual([]);
  });
});

describe("hiding (spec H2)", () => {
  it("an admin hides and shows a group; a regular user can't", async () => {
    const id = await w.group();
    const { data: byUser } = await user.db.from("ride_groups").update({ is_active: false }).eq("id", id).select();
    expect(byUser ?? []).toEqual([]);

    expect((await admin.db.from("ride_groups").update({ is_active: false }).eq("id", id)).error).toBeNull();
    expect((await w.service.from("ride_groups").select("is_active").eq("id", id).single()).data!.is_active).toBe(false);
    expect((await admin.db.from("ride_groups").update({ is_active: true }).eq("id", id)).error).toBeNull();
  });

  it("the sign-in page's route total counts shown groups only", async () => {
    const total = async () => Number(((await w.anon.rpc("public_stats").single()).data as { routes: number }).routes);
    const id = await w.group();
    const before = await total();
    await admin.db.from("ride_groups").update({ is_active: false }).eq("id", id);
    expect(await total()).toBe(before - 1);
  });

  // Hidden groups stay in the database: their routes keep running for the driver.
  it("keeps the group's routes on the driver's dashboard", async () => {
    const driver = await w.user("Driver");
    const date = rideDay(2);
    const route = await w.route(driver, { date });
    await admin.db.from("ride_groups").update({ is_active: false }).eq("id", route.groupId);
    const { data } = await driver.db.rpc("driver_rides", { p_date: date });
    expect((data as { route_id: string }[]).map((r) => r.route_id)).toContain(route.id);
  });
});

describe("deleting (spec H3)", () => {
  it("an admin deletes an unused group", async () => {
    const { data } = await w.service.from("ride_groups").insert({ origin: origin(), destination: "Test" }).select("id").single();
    expect((await admin.db.from("ride_groups").delete().eq("id", data!.id)).error).toBeNull();
    expect((await w.service.from("ride_groups").select("id").eq("id", data!.id)).data).toEqual([]);
  });

  it("a group a route ever used can't be deleted", async () => {
    const driver = await w.user("Driver");
    const route = await w.route(driver, { isActive: false });
    const { error } = await admin.db.from("ride_groups").delete().eq("id", route.groupId);
    expect(error?.code).toBe(IN_USE);
  });

  it("a regular user can't delete a group", async () => {
    const id = await w.group();
    await user.db.from("ride_groups").delete().eq("id", id);
    expect((await w.service.from("ride_groups").select("id").eq("id", id)).data).toHaveLength(1);
  });
});
