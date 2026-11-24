import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorld, daysFromToday, DENIED, type User, type World } from "./support/world";

// Recent searches (search_history, record_search — 0050): kept when she runs
// a search, her 4 latest, none with a past date, her own only.

let w: World;

beforeAll(() => {
  w = createWorld();
});
afterAll(() => w?.cleanup());

type Filters = { origins?: string[]; destinations?: string[]; date?: string | null; from?: string | null; to?: string | null; kind?: string | null };

function record(user: User, f: Filters) {
  return user.db.rpc("record_search", {
    p_origins: f.origins ?? [],
    p_destinations: f.destinations ?? [],
    p_date: f.date ?? null,
    p_from: f.from ?? null,
    p_to: f.to ?? null,
    p_kind: f.kind ?? null,
  });
}

async function mine(user: User) {
  const { data, error } = await user.db
    .from("search_history")
    .select("origins, destinations, ride_date, depart_from, depart_to, kind")
    .order("searched_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

describe("record_search", () => {
  it("keeps the filters, the places in a fixed order", async () => {
    const me = await w.user("Passenger");
    expect((await record(me, { origins: ["city:ב", "city:א"], destinations: ["city:ג"], date: daysFromToday(2), from: "07:00", to: "09:00", kind: "one_time" })).error).toBeNull();
    expect(await mine(me)).toEqual([
      { origins: ["city:א", "city:ב"], destinations: ["city:ג"], ride_date: daysFromToday(2), depart_from: "07:00:00", depart_to: "09:00:00", kind: "one_time" },
    ]);
  });

  it("moves the same filters up instead of keeping them twice, in any order", async () => {
    const me = await w.user("Passenger");
    await record(me, { origins: ["city:א", "city:ב"] });
    await record(me, { origins: ["city:ג"] });
    await record(me, { origins: ["city:ב", "city:א"] });
    expect((await mine(me)).map((r) => r.origins)).toEqual([["city:א", "city:ב"], ["city:ג"]]);
  });

  it("keeps her 4 latest", async () => {
    const me = await w.user("Passenger");
    for (const city of ["1", "2", "3", "4", "5", "6"]) await record(me, { origins: [`city:${city}`] });
    expect((await mine(me)).map((r) => r.origins[0])).toEqual(["city:6", "city:5", "city:4", "city:3"]);
  });

  it("keeps no search for a past date, nor one with no filter", async () => {
    const me = await w.user("Passenger");
    await record(me, { origins: ["city:א"], date: daysFromToday(-1) });
    await record(me, {});
    expect(await mine(me)).toEqual([]);
  });

  it("drops a kept search once its date has passed, when she runs the next", async () => {
    const me = await w.user("Passenger");
    const { error } = await w.service.from("search_history").insert({ user_id: me.id, origins: ["city:ישן"], ride_date: daysFromToday(-2) });
    expect(error).toBeNull();
    await record(me, { origins: ["city:חדש"] });
    expect((await mine(me)).map((r) => r.origins)).toEqual([["city:חדש"]]);
  });

  it("refuses anyone not signed in", async () => {
    const { error } = await w.anon.rpc("record_search", { p_origins: [], p_destinations: [], p_date: null, p_from: null, p_to: null, p_kind: null });
    expect(error?.code).toBe(DENIED);
  });
});

describe("the table's rules", () => {
  it("shows her her own searches only, and lets her clear them", async () => {
    const [me, other] = await Promise.all([w.user("Passenger"), w.user("Other")]);
    await record(me, { origins: ["city:שלי"] });
    await record(other, { origins: ["city:שלה"] });
    expect((await mine(me)).map((r) => r.origins)).toEqual([["city:שלי"]]);

    // Deleting someone else's does nothing; her own goes.
    await me.db.from("search_history").delete().eq("user_id", other.id);
    expect(await mine(other)).toHaveLength(1);
    await me.db.from("search_history").delete().eq("user_id", me.id);
    expect(await mine(me)).toEqual([]);
  });

  it("can't be written directly, only through record_search", async () => {
    const me = await w.user("Passenger");
    const { error } = await me.db.from("search_history").insert({ user_id: me.id, origins: ["city:א"] });
    expect(error?.code).toBe(DENIED);
  });
});
