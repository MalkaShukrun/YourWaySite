import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHECK_FAILED, check, createWorld, daysFromToday, DENIED, type User, type World } from "./support/world";

// Publishing routes (spec B1–B3) and the lock on booked routes (B4, §2): a
// route nobody has booked can be edited in full; once a passenger books it,
// only the note and new stops can change; and a removed route stays removed.

let w: World;
let driver: User;
let stranger: User;
let passenger: User;
let groupId: string;
let otherGroupId: string;

beforeAll(async () => {
  w = createWorld();
  [driver, stranger, passenger] = await Promise.all([w.user("Driver"), w.user("Stranger"), w.user("Passenger")]);
  [groupId, otherGroupId] = await Promise.all([w.group(), w.group()]);
});
afterAll(() => w?.cleanup());

const LOCKED = "ROUTE_LOCKED";
const IN_USE = "STOP_IN_USE";

// Publishes through save_route, as the route editor does.
async function publish(user: User, overrides: Record<string, unknown> = {}, stops?: object[]) {
  return user.db.rpc("save_route", {
    p_route_id: null,
    p_route: {
      group_id: groupId,
      kind: "recurring",
      weekdays: [4, 0, 2],
      ride_date: daysFromToday(1),
      out_time: "07:30",
      seats: "4",
      price: "15.5",
      notes: "  מחכה 5 דקות  ",
      ...overrides,
    },
    p_stops: stops ?? [
      { id: "", kind: "pickup", label: "קניון", lat: 31.75, lng: 35.0 },
      { id: "", kind: "pickup", label: "צומת", lat: null, lng: null },
      { id: "", kind: "dropoff", label: "תחנה מרכזית", lat: null, lng: null },
    ],
  });
}

const routeRow = async (id: string) => (await w.service.from("routes").select("*").eq("id", id).single()).data!;
const stopsOf = async (id: string) =>
  (await w.service.from("stops").select("kind, label, lat, lng, position").eq("route_id", id).order("kind").order("position")).data!;
const stopIdsOf = async (id: string) =>
  (await w.service.from("stops").select("id, kind").eq("route_id", id).order("kind").order("position")).data!;

// A passenger's booking on the route's first date, written directly.
async function bookOn(id: string, status: "active" | "cancelled" = "active") {
  const stops = await stopIdsOf(id);
  check(
    await w.service.from("bookings").insert({
      route_id: id,
      ride_date: daysFromToday(1),
      passenger_id: passenger.id,
      pickup_stop_id: stops.find((s) => s.kind === "pickup")!.id,
      dropoff_stop_id: stops.find((s) => s.kind === "dropoff")!.id,
      status,
    }),
  );
}

describe("publishing (spec B1, B2, B3)", () => {
  it("saves a recurring route with its days in order, a trimmed note and its stops", async () => {
    const id = check(await publish(driver)) as string;
    expect(await routeRow(id)).toMatchObject({
      driver_id: driver.id,
      kind: "recurring",
      weekdays: [0, 2, 4],
      out_time: "07:30:00",
      seats: 4,
      price: 15.5,
      notes: "מחכה 5 דקות",
      is_active: true,
    });
    expect(await stopsOf(id)).toEqual([
      { kind: "pickup", label: "קניון", lat: 31.75, lng: 35, position: 1 },
      { kind: "pickup", label: "צומת", lat: null, lng: null, position: 2 },
      { kind: "dropoff", label: "תחנה מרכזית", lat: null, lng: null, position: 1 },
    ]);
  });

  it("saves an empty note as none", async () => {
    const id = check(await publish(driver, { notes: "   " })) as string;
    expect((await routeRow(id)).notes).toBeNull();
  });

  it("saves a one-time ride on a single date, which may be a Saturday", async () => {
    let saturday = daysFromToday(1);
    for (let i = 1; new Date(`${saturday}T12:00:00Z`).getUTCDay() !== 6; i++) saturday = daysFromToday(i);
    const id = check(await publish(driver, { kind: "one_time", weekdays: [], ride_date: saturday })) as string;
    expect(await routeRow(id)).toMatchObject({ kind: "one_time", ride_date: saturday, weekdays: [] });
  });

  it.each([
    ["no pickup stop", [{ id: "", kind: "dropoff", label: "תחנה", lat: null, lng: null }]],
    ["no drop-off stop", [{ id: "", kind: "pickup", label: "צומת", lat: null, lng: null }]],
    ["no stops", []],
  ])("refuses a route with %s", async (_name, stops) => {
    const { error } = await publish(driver, {}, stops);
    expect(error?.message).toContain("STOPS_REQUIRED");
  });

  it.each([
    ["9 seats", { seats: "9" }],
    ["0 seats", { seats: "0" }],
    ["a negative price", { price: "-1" }],
    ["a recurring route without weekdays", { weekdays: [] }],
    ["a one-time ride without a date", { kind: "one_time", weekdays: [], ride_date: "" }],
    ["a note over 200 characters", { notes: "א".repeat(201) }],
    ["the same weekday twice", { weekdays: [1, 1] }],
  ])("the database refuses %s", async (_name, overrides) => {
    const { error } = await publish(driver, overrides);
    expect(error).not.toBeNull();
  });

  it("refuses a stop name of one letter, even sent directly", async () => {
    const { error } = await publish(driver, {}, [
      { id: "", kind: "pickup", label: "א", lat: null, lng: null },
      { id: "", kind: "dropoff", label: "תחנה", lat: null, lng: null },
    ]);
    expect(error?.code).toBe(CHECK_FAILED);
  });

  it("a user can't publish in someone else's name", async () => {
    const { error } = await stranger.db
      .from("routes")
      .insert({ driver_id: driver.id, group_id: groupId, kind: "one_time", ride_date: daysFromToday(2), out_time: "09:00", seats: 3 });
    expect(error?.code).toBe(DENIED);
  });

  // A vehicle isn't required to publish routes (spec A3, §8).
  it("a driver without car details can publish", async () => {
    const noCar = await w.user("NoCar");
    const { error } = await publish(noCar);
    expect(error).toBeNull();
  });

  it("signed-out visitors can't publish", async () => {
    const { error } = await w.anon.rpc("save_route", { p_route_id: null, p_route: {}, p_stops: [] });
    expect(error).not.toBeNull();
  });
});

describe("a route nobody has booked can be edited in full (spec B4)", () => {
  const edited = {
    kind: "one_time",
    weekdays: [],
    ride_date: daysFromToday(5),
    out_time: "09:45",
    seats: "6",
    price: "22",
    notes: "שונה",
  };

  it("the driver changes every detail and renames, moves, removes and adds stops through save_route", async () => {
    const id = check(await publish(driver)) as string;
    const [kenyon, , central] = await stopIdsOf(id); // קניון, צומת, תחנה מרכזית
    const { error } = await driver.db.rpc("save_route", {
      p_route_id: id,
      p_route: { ...edited, group_id: otherGroupId },
      p_stops: [
        { id: kenyon.id, kind: "pickup", label: "קניון חדש", lat: 31.7, lng: 35.1 },
        { id: central.id, kind: "dropoff", label: "תחנה מרכזית", lat: null, lng: null },
        { id: "", kind: "dropoff", label: "יעד נוסף", lat: null, lng: null },
      ],
    });
    expect(error).toBeNull();
    expect(await routeRow(id)).toMatchObject({
      group_id: otherGroupId,
      kind: "one_time",
      weekdays: [],
      ride_date: daysFromToday(5),
      out_time: "09:45:00",
      seats: 6,
      price: 22,
      notes: "שונה",
      is_active: true,
    });
    expect(await stopsOf(id)).toEqual([
      { kind: "pickup", label: "קניון חדש", lat: 31.7, lng: 35.1, position: 1 },
      { kind: "dropoff", label: "תחנה מרכזית", lat: null, lng: null, position: 1 },
      { kind: "dropoff", label: "יעד נוסף", lat: null, lng: null, position: 2 },
    ]);
  });

  it("the driver renames, moves and removes its stops directly", async () => {
    const id = check(await publish(driver)) as string;
    const [first, second] = (await stopIdsOf(id)).filter((s) => s.kind === "pickup");
    expect((await driver.db.from("stops").update({ label: "Renamed", lat: 31.7, lng: 35.2 }).eq("id", first.id)).error).toBeNull();
    expect((await driver.db.from("stops").delete().eq("id", second.id)).error).toBeNull();
  });

  it("another user can't edit it through save_route", async () => {
    const id = check(await publish(driver)) as string;
    const { error } = await stranger.db.rpc("save_route", {
      p_route_id: id,
      p_route: { ...edited, group_id: groupId },
      p_stops: [
        { id: "", kind: "pickup", label: "Fake", lat: null, lng: null },
        { id: "", kind: "dropoff", label: "Fake", lat: null, lng: null },
      ],
    });
    expect(error?.message).toContain("ROUTE_NOT_FOUND");
    expect((await routeRow(id)).seats).toBe(4);
  });

  it("a removed route still can't change", async () => {
    const id = check(await publish(driver)) as string;
    await driver.db.from("routes").update({ is_active: false }).eq("id", id);
    expect((await driver.db.from("routes").update({ seats: 5 }).eq("id", id)).error?.message).toContain(LOCKED);
  });

  it("a booking cancelled later still locks it: the passenger's history keeps the ride", async () => {
    const id = check(await publish(driver)) as string;
    await bookOn(id, "cancelled");
    expect((await driver.db.from("routes").update({ seats: 5 }).eq("id", id)).error?.message).toContain(LOCKED);
  });
});

describe("a booked route is locked (spec B4)", () => {
  let id: string;
  beforeAll(async () => {
    id = check(await publish(driver)) as string;
    await bookOn(id);
  });

  it.each([
    ["seats", { seats: 5 }],
    ["departure time", { out_time: "09:30" }],
    ["price", { price: 30 }],
    ["start date", { ride_date: daysFromToday(10) }],
    ["weekdays", { weekdays: [1] }],
    ["kind", { kind: "one_time" }],
    ["note together with the seats", { notes: "changed", seats: 5 }],
  ])("even the driver can't change its %s", async (_field, patch) => {
    const { error } = await driver.db.from("routes").update(patch).eq("id", id);
    expect(error?.message).toContain(LOCKED);
  });

  it("even the driver can't move it to another group", async () => {
    const { error } = await driver.db.from("routes").update({ group_id: otherGroupId }).eq("id", id);
    expect(error?.message).toContain(LOCKED);
  });

  it("can't be changed through save_route either", async () => {
    const { error } = await driver.db.rpc("save_route", {
      p_route_id: id,
      p_route: { group_id: groupId, kind: "recurring", weekdays: [1], ride_date: daysFromToday(1), out_time: "08:00", seats: "3", price: "20", notes: "" },
      p_stops: [],
    });
    expect(error?.message).toContain(LOCKED);
  });

  it("the stops its booking uses can't be renamed, moved, removed or archived", async () => {
    const [kenyon] = await stopIdsOf(id); // the booked pickup
    expect((await driver.db.from("stops").update({ label: "Renamed" }).eq("id", kenyon.id)).error?.message).toContain(IN_USE);
    expect((await driver.db.from("stops").update({ lat: 31.7, lng: 35.2 }).eq("id", kenyon.id)).error?.message).toContain(IN_USE);
    expect((await driver.db.from("stops").update({ is_active: false }).eq("id", kenyon.id)).error?.message).toContain(IN_USE);
    expect((await driver.db.from("stops").delete().eq("id", kenyon.id)).error?.message).toContain(IN_USE);
  });

  it("even the driver can't delete it (it's removed by archiving)", async () => {
    const { error } = await driver.db.from("routes").delete().eq("id", id);
    expect(error?.code).toBe(DENIED);
  });

  it("another user can't edit it", async () => {
    const { data } = await stranger.db.from("routes").update({ seats: 8 }).eq("id", id).select();
    expect(data ?? []).toEqual([]);
  });
});

describe("editing the note and adding stops (spec B4)", () => {
  let id: string;
  beforeAll(async () => {
    id = check(await publish(driver)) as string;
  });

  it("the driver changes the note and adds stops after the existing ones", async () => {
    const { error } = await driver.db.rpc("update_route", {
      p_route_id: id,
      p_notes: "  מחכה 10 דקות ",
      p_stops: [
        { kind: "pickup", label: "תחנה נוספת", lat: null, lng: null },
        { kind: "dropoff", label: "יעד נוסף", lat: 31.78, lng: 35.21 },
      ],
    });
    expect(error).toBeNull();
    expect(await routeRow(id)).toMatchObject({ notes: "מחכה 10 דקות", seats: 4, out_time: "07:30:00" });
    const stops = await stopsOf(id);
    expect(stops.filter((s) => s.kind === "pickup").map((s) => [s.label, s.position])).toEqual([
      ["קניון", 1],
      ["צומת", 2],
      ["תחנה נוספת", 3],
    ]);
    expect(stops.filter((s) => s.kind === "dropoff").map((s) => [s.label, s.position])).toEqual([
      ["תחנה מרכזית", 1],
      ["יעד נוסף", 2],
    ]);
  });

  it("the driver clears the note without adding stops", async () => {
    expect((await driver.db.rpc("update_route", { p_route_id: id, p_notes: " ", p_stops: [] })).error).toBeNull();
    expect((await routeRow(id)).notes).toBeNull();
  });

  it("the driver can change the note directly, alone", async () => {
    expect((await driver.db.from("routes").update({ notes: "ישיר" }).eq("id", id)).error).toBeNull();
  });

  it("a note over 200 characters is refused", async () => {
    const { error } = await driver.db.rpc("update_route", { p_route_id: id, p_notes: "א".repeat(201), p_stops: [] });
    expect(error?.code).toBe(CHECK_FAILED);
  });

  it("another user can't change the note or add stops", async () => {
    expect((await stranger.db.rpc("update_route", { p_route_id: id, p_notes: "Fake", p_stops: [] })).error?.message).toContain("ROUTE_NOT_FOUND");
    const { error } = await stranger.db.rpc("add_route_stops", { p_route_id: id, p_stops: [{ kind: "pickup", label: "Fake", lat: null, lng: null }] });
    expect(error?.message).toContain("ROUTE_NOT_FOUND");
  });

  it("another user can't insert stops into the route", async () => {
    const { error } = await stranger.db.from("stops").insert({ route_id: id, kind: "pickup", label: "Fake" });
    expect(error?.code).toBe(DENIED);
  });
});

// A booked route's stops that no booking uses can still change; the ones a
// booking uses stay as they are (0048_edit_unused_stops.sql).
describe("a booked route's stops nobody chose (spec B4)", () => {
  // The editor's list for update_booked_route: every stop, with its id.
  const savedStops = async (id: string) =>
    (await w.service.from("stops").select("id, kind, label, lat, lng").eq("route_id", id).eq("is_active", true).order("kind").order("position")).data!;

  async function bookedRoute() {
    const id = check(await publish(driver)) as string;
    await bookOn(id); // קניון → תחנה מרכזית; צומת stays unused
    const [kenyon, junction, central] = await savedStops(id);
    return { id, kenyon, junction, central };
  }

  it("the driver renames, moves and removes an unused stop directly", async () => {
    const { junction } = await bookedRoute();
    expect((await driver.db.from("stops").update({ label: "צומת חדש", lat: 31.7, lng: 35.2 }).eq("id", junction.id)).error).toBeNull();
    expect((await driver.db.from("stops").delete().eq("id", junction.id)).error).toBeNull();
  });

  it("update_booked_route renames an unused stop, removes another and adds new ones, keeping the booked ones", async () => {
    const { id, kenyon, junction, central } = await bookedRoute();
    check(await driver.db.rpc("update_booked_route", { p_route_id: id, p_notes: "", p_stops: [kenyon, junction, central, { id: "", kind: "dropoff", label: "יעד", lat: null, lng: null }] }));
    const [, , , extra] = await savedStops(id);

    const { error } = await driver.db.rpc("update_booked_route", {
      p_route_id: id,
      p_notes: " הערה ",
      p_stops: [
        kenyon,
        { ...junction, label: "צומת חדש", lat: 31.7, lng: 35.2 },
        central,
        { id: "", kind: "pickup", label: "תחנה נוספת", lat: null, lng: null },
        // `extra` is left out: removed.
      ],
    });
    expect(error).toBeNull();
    expect(extra.label).toBe("יעד");
    expect(await stopsOf(id)).toEqual([
      { kind: "pickup", label: "קניון", lat: 31.75, lng: 35, position: 1 },
      { kind: "pickup", label: "צומת חדש", lat: 31.7, lng: 35.2, position: 2 },
      { kind: "pickup", label: "תחנה נוספת", lat: null, lng: null, position: 3 },
      { kind: "dropoff", label: "תחנה מרכזית", lat: null, lng: null, position: 1 },
    ]);
    expect((await routeRow(id)).notes).toBe("הערה");
  });

  it.each([
    ["renamed", (s: { label: string }) => ({ ...s, label: "שונה" })],
    ["moved", (s: object) => ({ ...s, lat: 31.7, lng: 35.2 })],
  ])("refuses a booked stop %s through update_booked_route, and saves nothing", async (_name, change) => {
    const { id, kenyon, junction, central } = await bookedRoute();
    const { error } = await driver.db.rpc("update_booked_route", {
      p_route_id: id,
      p_notes: "לא נשמר",
      p_stops: [change(kenyon), { ...junction, label: "גם לא" }, central],
    });
    expect(error?.message).toContain(IN_USE);
    expect((await routeRow(id)).notes).toBe("מחכה 5 דקות");
    expect((await savedStops(id)).map((s) => s.label)).toEqual(["קניון", "צומת", "תחנה מרכזית"]);
  });

  it("refuses a booked stop left out of the list", async () => {
    const { id, junction, central } = await bookedRoute();
    const { error } = await driver.db.rpc("update_booked_route", { p_route_id: id, p_notes: "", p_stops: [junction, central] });
    expect(error?.message).toContain(IN_USE);
  });

  it("a stop whose only booking was cancelled stays fixed: the passenger's history keeps it", async () => {
    const id = check(await publish(driver)) as string;
    await bookOn(id, "cancelled");
    const [kenyon] = await savedStops(id);
    expect((await driver.db.from("stops").update({ label: "שונה" }).eq("id", kenyon.id)).error?.message).toContain(IN_USE);
  });

  it("refuses a stop of another route, and moving a stop to another route", async () => {
    const { id, kenyon, central } = await bookedRoute();
    const other = check(await publish(driver)) as string;
    const [foreign] = await savedStops(other);
    const { error } = await driver.db.rpc("update_booked_route", { p_route_id: id, p_notes: "", p_stops: [kenyon, central, foreign] });
    expect(error?.message).toContain("STOP_NOT_FOUND");
    expect((await driver.db.from("stops").update({ route_id: id }).eq("id", foreign.id)).error?.message).toContain(LOCKED);
  });

  it("route_stops_in_use lists the booked stops to the driver only", async () => {
    const { id, kenyon, central } = await bookedRoute();
    expect(new Set(check(await driver.db.rpc("route_stops_in_use", { p_route_id: id })) as string[])).toEqual(new Set([kenyon.id, central.id]));
    expect(check(await stranger.db.rpc("route_stops_in_use", { p_route_id: id }))).toEqual([]);
  });

  it("another user can't change its stops", async () => {
    const { id, kenyon, junction, central } = await bookedRoute();
    const { error } = await stranger.db.rpc("update_booked_route", { p_route_id: id, p_notes: "", p_stops: [kenyon, central] });
    expect(error?.message).toContain("ROUTE_NOT_FOUND");
    const { data } = await stranger.db.from("stops").update({ label: "Fake" }).eq("id", junction.id).select();
    expect(data ?? []).toEqual([]);
  });

  it("a removed route's unused stops can't change", async () => {
    const { id, junction } = await bookedRoute();
    await driver.db.from("routes").update({ is_active: false }).eq("id", id);
    expect((await driver.db.from("stops").update({ label: "Late" }).eq("id", junction.id)).error?.message).toContain(LOCKED);
  });
});

// A removed route can't be restored (spec §2, F1).
describe("removing", () => {
  it("the driver removes her route, and it stays removed", async () => {
    const id = check(await publish(driver)) as string;
    expect((await driver.db.from("routes").update({ is_active: false }).eq("id", id)).error).toBeNull();
    expect((await driver.db.from("routes").update({ is_active: true }).eq("id", id)).error?.message).toContain(LOCKED);
  });

  it("a removed route's note and stops can't change", async () => {
    const id = check(await publish(driver)) as string;
    await driver.db.from("routes").update({ is_active: false }).eq("id", id);
    expect((await driver.db.rpc("update_route", { p_route_id: id, p_notes: "Late", p_stops: [] })).error?.message).toContain("ROUTE_NOT_FOUND");
    expect((await driver.db.from("routes").update({ notes: "Late" }).eq("id", id)).error?.message).toContain(LOCKED);
  });

  it("another user can't remove it", async () => {
    const id = check(await publish(driver)) as string;
    await stranger.db.from("routes").update({ is_active: false }).eq("id", id);
    expect((await routeRow(id)).is_active).toBe(true);
  });
});
