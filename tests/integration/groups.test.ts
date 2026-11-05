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

// Each group goes from one place on the list to another (0040).
const city = () => `IT ${w.tag} ${Math.random().toString(36).slice(2, 7)}`;
const DESTINATION = "Test, מרכז";
const twoPlaces = async () => ({
  origin_place_id: await w.place(`${city()}, מרכז`),
  destination_place_id: await w.place(DESTINATION),
});
const placeOf = async (groupId: string) =>
  (await w.service.from("ride_groups").select("origin_place_id").eq("id", groupId).single()).data!.origin_place_id as string;

describe("creating and changing (spec H1)", () => {
  it("an admin creates a group from two places, named after them", async () => {
    const row = await twoPlaces();
    const { data, error } = await admin.db.from("ride_groups").insert(row).select("id, is_active, origin, destination").single();
    expect(error).toBeNull();
    await w.service.from("ride_groups").delete().eq("id", data!.id);
    expect(data).toMatchObject({ is_active: true, destination: DESTINATION });
    expect(data!.origin).toMatch(/^IT .+, מרכז$/);
  });

  it("a regular user can't create one", async () => {
    const { error } = await user.db.from("ride_groups").insert(await twoPlaces());
    expect(error?.code).toBe(DENIED);
  });

  it("a duplicate is refused", async () => {
    const row = await twoPlaces();
    const { data } = await admin.db.from("ride_groups").insert(row).select("id").single();
    const { error } = await admin.db.from("ride_groups").insert(row);
    await w.service.from("ride_groups").delete().eq("id", data!.id);
    expect(error?.code).toBe(DUPLICATE);
  });

  it("the same place at both ends is refused, even sent directly", async () => {
    const id = await w.place(`${city()}, מרכז`);
    const { error } = await admin.db.from("ride_groups").insert({ origin_place_id: id, destination_place_id: id });
    expect(error?.code).toBe(CHECK_FAILED);
  });

  it("a name sent directly gives way to the places' names", async () => {
    const id = await w.group({ destination: DESTINATION });
    await admin.db.from("ride_groups").update({ destination: "Hacked, מרכז" }).eq("id", id);
    expect((await w.service.from("ride_groups").select("destination").eq("id", id).single()).data!.destination).toBe(DESTINATION);
  });

  it("an admin changes a group's place; a regular user can't", async () => {
    const id = await w.group();
    const other = await w.place(`${city()}, צפון`);
    const { data: byUser } = await user.db.from("ride_groups").update({ origin_place_id: other }).eq("id", id).select();
    expect(byUser ?? []).toEqual([]);
    expect((await admin.db.from("ride_groups").update({ origin_place_id: other }).eq("id", id)).error).toBeNull();
    expect(await placeOf(id)).toBe(other);
  });

  // A group shows its new place everywhere, including past bookings (spec H1).
  it("a change reaches the routes and bookings that use the group", async () => {
    const driver = await w.user("Driver");
    const passenger = await w.user("Passenger");
    const route = await w.route(driver);
    const date = (await w.service.from("routes").select("ride_date").eq("id", route.id).single()).data!.ride_date as string;
    await w.book(passenger, route, date);

    const name = `${city()}, צפון`;
    await admin.db.from("ride_groups").update({ origin_place_id: await w.place(name) }).eq("id", route.groupId);
    const { data: mine } = await passenger.db.rpc("my_bookings");
    expect((mine as { origin: string }[])[0].origin).toBe(name);
    const { data: found } = await passenger.db.rpc("search_rides", { p_group_id: route.groupId, p_date: date });
    expect((found as { origin: string }[])[0].origin).toBe(name);
  });
});

// The list of places (0040): a city and a neighborhood each; only admins manage it.
describe("places", () => {
  it("every signed-in user reads them; signed-out visitors read none", async () => {
    const id = await w.place(`${city()}, מרכז`);
    expect((await user.db.from("places").select("id").eq("id", id)).data).toHaveLength(1);
    expect((await w.anon.from("places").select("id").eq("id", id)).data ?? []).toEqual([]);
  });

  it("an admin adds a place, named “city, neighborhood”; a regular user can't", async () => {
    const name = city();
    expect((await user.db.from("places").insert({ city: name, neighborhood: "מרכז" })).error?.code).toBe(DENIED);
    const { data, error } = await admin.db.from("places").insert({ city: name, neighborhood: "מרכז" }).select("id, name").single();
    expect(error).toBeNull();
    await w.service.from("places").delete().eq("id", data!.id);
    expect(data!.name).toBe(`${name}, מרכז`);
  });

  it("a place already on the list is refused", async () => {
    const name = city();
    await w.place(`${name}, מרכז`);
    expect((await admin.db.from("places").insert({ city: name, neighborhood: "מרכז" })).error?.code).toBe(DUPLICATE);
  });

  it.each([
    ["a one-letter city", { city: "א", neighborhood: "מרכז" }],
    ["a city over 40 characters", { city: "א".repeat(41), neighborhood: "מרכז" }],
    ["a comma in the city", { city: "ירושלים, תלפיות", neighborhood: "מרכז" }],
    ["spaces around a name", { city: " ירושלים", neighborhood: "מרכז" }],
    ["an empty neighborhood", { city: "ירושלים", neighborhood: "" }],
    ["a one-letter neighborhood", { city: "ירושלים", neighborhood: "א" }],
  ])("%s is refused, even sent directly", async (_name, row) => {
    expect((await admin.db.from("places").insert(row)).error?.code).toBe(CHECK_FAILED);
  });

  it("renaming a place renames its groups, down to the passengers' bookings", async () => {
    const driver = await w.user("Driver");
    const passenger = await w.user("Passenger");
    const route = await w.route(driver);
    const date = (await w.service.from("routes").select("ride_date").eq("id", route.id).single()).data!.ride_date as string;
    await w.book(passenger, route, date);

    const name = city();
    const placeId = await placeOf(route.groupId);
    expect((await admin.db.from("places").update({ city: name, neighborhood: "דרום" }).eq("id", placeId)).error).toBeNull();
    const { data: group } = await w.service.from("ride_groups").select("origin, origin_city, origin_neighborhood").eq("id", route.groupId).single();
    expect(group).toEqual({ origin: `${name}, דרום`, origin_city: name, origin_neighborhood: "דרום" });
    const { data: mine } = await passenger.db.rpc("my_bookings");
    expect((mine as { origin: string }[])[0].origin).toBe(`${name}, דרום`);
  });

  it("a place a group uses can't be deleted; an unused one can", async () => {
    const used = await placeOf(await w.group());
    expect((await admin.db.from("places").delete().eq("id", used)).error?.code).toBe(IN_USE);
    const unused = await w.place(`${city()}, מרכז`);
    expect((await admin.db.from("places").delete().eq("id", unused)).error).toBeNull();
    expect((await w.service.from("places").select("id").eq("id", unused)).data).toEqual([]);
  });

  it("a regular user can't rename or delete one", async () => {
    const id = await w.place(`${city()}, מרכז`);
    expect((await user.db.from("places").update({ neighborhood: "Hacked" }).eq("id", id).select()).data ?? []).toEqual([]);
    await user.db.from("places").delete().eq("id", id);
    expect((await w.service.from("places").select("neighborhood").eq("id", id).single()).data!.neighborhood).toBe("מרכז");
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
    const { data } = await w.service.from("ride_groups").insert(await twoPlaces()).select("id").single();
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
