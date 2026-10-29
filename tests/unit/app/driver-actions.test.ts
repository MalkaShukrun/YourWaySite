import { beforeEach, describe, expect, it, vi } from "vitest";
import { refresh } from "next/cache";
import type { RouteValues } from "@/lib/validation/route";
import { createSupabaseMock } from "../helpers/supabase-mock";
import { runAction } from "../helpers/run-action";
import { ID } from "../helpers/fixtures";

// The driver's server actions (app/(app)/(driver)/actions.ts): publishing and
// editing routes (spec B1–B5), removing them (F1–F2), cancelling a date (D2–D3)
// and passengers added by hand (D4–D6).

const sb = vi.hoisted(() => ({ mock: null as unknown as ReturnType<typeof createSupabaseMock>, user: { id: "" } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sb.mock.client }));
vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn(async () => sb.user) }));
sb.mock = createSupabaseMock();
const { addPassenger, archiveRoute, cancelRideForDate, removePassenger, saveRoute, updateRoute } = await import("@/app/(app)/(driver)/actions");
const { requireUser } = await import("@/lib/auth/session");

const values = (overrides: Partial<RouteValues> = {}): RouteValues => ({
  groupId: ID.group,
  kind: "recurring",
  weekdays: [0, 2, 4],
  rideDate: "2026-11-01",
  outTime: "07:30",
  seats: "4",
  price: "15",
  notes: "  מחכה 5 דקות ",
  stops: [
    { id: "", kind: "pickup", label: " קניון ", lat: 31.7, lng: 35 },
    { id: "", kind: "dropoff", label: "תחנה מרכזית", lat: null, lng: null },
  ],
  ...overrides,
});

const DATE = "2026-11-02";
const guest = { name: " שרה כהן ", phone: " 052-765-4321 ", pickupStopId: ID.pickup, dropoffStopId: ID.dropoff };

// Every database code the driver's actions can get back, with its message (spec §7).
const DRIVER_MESSAGES: [string, string][] = [
  ["STOPS_REQUIRED", "יש להגדיר לפחות תחנת איסוף אחת ותחנת הורדה אחת."],
  ["ROUTE_NOT_FOUND", "המסלול לא נמצא."],
  ["RIDE_UNAVAILABLE", "הנסיעה בוטלה או לא מתקיימת בתאריך הזה."],
  ["RIDE_FULL", "אין מקומות פנויים בנסיעה הזו."],
  ["ALREADY_BOOKED", "הטרמפיסטית כבר רשומה לנסיעה הזו."],
  ["OWN_RIDE", "אי אפשר להוסיף את עצמך כטרמפיסטית."],
  ["INVALID_PASSENGER", "יש להזין שם וטלפון."],
  ["INVALID_STOP", "התחנה שנבחרה אינה חלק מהמסלול."],
  ["BOOKING_NOT_FOUND", "ההרשמה לא נמצאה."],
  ["ROUTE_LOCKED", "אי אפשר לשנות מסלול שפורסם — אפשר רק לערוך את ההערה ולהוסיף תחנות."],
  ["RIDE_CANCELLED", "הנסיעה בוטלה לתאריך הזה, ואי אפשר להחזיר אותה."],
  ["RIDE_DEPARTED", "הנסיעה כבר יצאה ולא ניתן לבטל אותה."],
  ["RIDE_PAST", "הנסיעה כבר התקיימה ונשמרת בהיסטוריה — אי אפשר להסיר אותה."],
];

beforeEach(() => {
  sb.mock.reset();
  sb.user = { id: ID.driver };
});

describe("saveRoute (publish a route)", () => {
  it("publishes through save_route and opens my routes with the saved notice", async () => {
    expect(await runAction(() => saveRoute(values()))).toEqual({ redirectedTo: "/routes?saved=1" });
    expect(sb.mock.client.rpc).toHaveBeenCalledWith("save_route", {
      p_route_id: null,
      p_route: {
        group_id: ID.group,
        kind: "recurring",
        weekdays: [0, 2, 4],
        ride_date: "2026-11-01",
        out_time: "07:30",
        seats: "4",
        price: "15",
        notes: "מחכה 5 דקות",
      },
      p_stops: [
        { id: "", kind: "pickup", label: "קניון", lat: 31.7, lng: 35 },
        { id: "", kind: "dropoff", label: "תחנה מרכזית", lat: null, lng: null },
      ],
    });
  });

  it("checks the user is signed in first", async () => {
    await runAction(() => saveRoute(values()));
    expect(requireUser).toHaveBeenCalledOnce();
  });

  it.each([
    ["no weekdays", { weekdays: [] }, "יש לבחור לפחות יום אחד"],
    ["no pickup stop", { stops: [values().stops[1]] }, "יש להוסיף לפחות תחנת איסוף אחת"],
    ["9 seats", { seats: "9" }, "בין 1 ל־8 מקומות"],
    ["a bad price", { price: "abc" }, "מחיר לא תקין"],
    ["no group", { groupId: "" }, "יש לבחור קבוצת נסיעה"],
  ])("refuses %s without touching the database (spec B5)", async (_name, overrides, message) => {
    expect(await runAction(() => saveRoute(values(overrides as Partial<RouteValues>)))).toEqual({ error: message });
    expect(sb.mock.client.rpc).not.toHaveBeenCalled();
  });

  it("shows the database's refusal and stays on the form", async () => {
    sb.mock.onRpc("save_route", { error: { message: "P0001: STOPS_REQUIRED" } });
    expect(await runAction(() => saveRoute(values()))).toEqual({ error: "יש להגדיר לפחות תחנת איסוף אחת ותחנת הורדה אחת." });
  });

  it("shows the general message for an unknown failure", async () => {
    sb.mock.onRpc("save_route", { error: { message: "connection reset" } });
    expect(await runAction(() => saveRoute(values()))).toEqual({ error: "משהו השתבש. נסי שוב בעוד רגע." });
  });
});

// A published route takes only its note and new stops (spec B4).
describe("updateRoute (edit a published route)", () => {
  const newStop = { kind: "dropoff" as const, label: " צומת גומא ", lat: null, lng: null };

  it("saves the trimmed note and the new stops", async () => {
    expect(await runAction(() => updateRoute(ID.route, { notes: " מחכה 10 דקות ", stops: [newStop] }))).toEqual({
      redirectedTo: "/routes?saved=1",
    });
    expect(sb.mock.client.rpc).toHaveBeenCalledWith("update_route", {
      p_route_id: ID.route,
      p_notes: "מחכה 10 דקות",
      p_stops: [{ kind: "dropoff", label: "צומת גומא", lat: null, lng: null }],
    });
  });

  it("saves a note change alone, or clears the note", async () => {
    await runAction(() => updateRoute(ID.route, { notes: "", stops: [] }));
    expect(sb.mock.client.rpc).toHaveBeenCalledWith("update_route", { p_route_id: ID.route, p_notes: "", p_stops: [] });
  });

  it("never sends an existing stop's id, so saved stops can't change", async () => {
    await runAction(() => updateRoute(ID.route, { notes: "", stops: [{ ...newStop, id: ID.pickup } as typeof newStop] }));
    const [, args] = sb.mock.client.rpc.mock.calls[0] as [string, { p_stops: object[] }];
    expect(args.p_stops[0]).not.toHaveProperty("id");
  });

  it.each([
    ["a malformed route id", "nope", { notes: "", stops: [] }, "המסלול לא נמצא."],
    ["a note over 200 characters", ID.route, { notes: "א".repeat(201), stops: [] }, "עד 200 תווים בהערות"],
    ["a new stop without a name", ID.route, { notes: "", stops: [{ ...newStop, label: "" }] }, "יש לתת שם לתחנה"],
    ["a one-letter stop name", ID.route, { notes: "", stops: [{ ...newStop, label: "א" }] }, "שם התחנה צריך להכיל לפחות 2 תווים"],
  ])("refuses %s without touching the database", async (_name, routeId, update, message) => {
    expect(await runAction(() => updateRoute(routeId, update))).toEqual({ error: message });
    expect(sb.mock.client.rpc).not.toHaveBeenCalled();
  });

  it("explains a removed or someone else's route", async () => {
    sb.mock.onRpc("update_route", { error: { message: "P0001: ROUTE_NOT_FOUND" } });
    expect(await runAction(() => updateRoute(ID.route, { notes: "", stops: [] }))).toEqual({ error: "המסלול לא נמצא." });
  });
});

describe("archiveRoute (remove a route, spec F1)", () => {
  it("takes the driver's own route off the schedule and refreshes", async () => {
    expect(await archiveRoute(ID.route)).toEqual({});
    expect(sb.mock.callsOn("routes")).toEqual([
      ["update", [{ is_active: false }]],
      ["eq", ["id", ID.route]],
      ["eq", ["driver_id", ID.driver]],
    ]);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("refuses a one-time ride that already took place (spec F2)", async () => {
    sb.mock.onTable("routes", { error: { message: "P0001: RIDE_PAST" } });
    expect(await archiveRoute(ID.route)).toEqual({ error: "הנסיעה כבר התקיימה ונשמרת בהיסטוריה — אי אפשר להסיר אותה." });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refuses a malformed id", async () => {
    expect(await archiveRoute("x")).toEqual({ error: "המסלול לא נמצא." });
    expect(sb.mock.client.from).not.toHaveBeenCalled();
  });
});

describe("cancelRideForDate (spec D2)", () => {
  it("marks that date cancelled and refreshes", async () => {
    expect(await cancelRideForDate(ID.route, DATE)).toEqual({});
    expect(sb.mock.argsOf("ride_exceptions", "upsert")).toEqual([
      { route_id: ID.route, ride_date: DATE, cancelled: true },
      { onConflict: "route_id,ride_date" },
    ]);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("refuses after departure (spec D3)", async () => {
    sb.mock.onTable("ride_exceptions", { error: { message: "P0001: RIDE_DEPARTED" } });
    expect(await cancelRideForDate(ID.route, DATE)).toEqual({ error: "הנסיעה כבר יצאה ולא ניתן לבטל אותה." });
  });

  it.each([
    ["route id", "x", DATE],
    ["date", ID.route, "2.11.2026"],
  ])("refuses a malformed %s", async (_name, routeId, date) => {
    expect(await cancelRideForDate(routeId, date)).toEqual({ error: "המסלול לא נמצא." });
    expect(sb.mock.client.from).not.toHaveBeenCalled();
  });
});

describe("addPassenger (spec D4, D5)", () => {
  it("adds the passenger with trimmed details, not replacing anyone", async () => {
    expect(await addPassenger(ID.route, DATE, guest)).toEqual({});
    expect(sb.mock.client.rpc).toHaveBeenCalledWith("add_passenger", {
      p_route_id: ID.route,
      p_date: DATE,
      p_name: "שרה כהן",
      p_phone: "052-765-4321",
      p_pickup_stop_id: ID.pickup,
      p_dropoff_stop_id: ID.dropoff,
      p_replace: false,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("asks first when the phone already has a guest seat on the ride, naming her", async () => {
    sb.mock.onRpc("add_passenger", { error: { message: "GUEST_EXISTS", details: "שרה הקודמת" } });
    expect(await addPassenger(ID.route, DATE, guest)).toEqual({ existingGuest: "שרה הקודמת" });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("asks even if the database sent no name", async () => {
    sb.mock.onRpc("add_passenger", { error: { message: "GUEST_EXISTS" } });
    expect(await addPassenger(ID.route, DATE, guest)).toEqual({ existingGuest: "" });
  });

  it("replaces her once the driver confirms", async () => {
    expect(await addPassenger(ID.route, DATE, guest, true)).toEqual({});
    expect(sb.mock.client.rpc).toHaveBeenCalledWith("add_passenger", expect.objectContaining({ p_replace: true }));
  });

  it.each([
    ["no name", { name: "" }, "יש להזין שם מלא"],
    ["a bad phone", { phone: "123" }, "מספר טלפון לא תקין (לדוגמה 050-000-0000)"],
    ["no pickup", { pickupStopId: "" }, "יש לבחור תחנת איסוף"],
  ])("refuses %s without touching the database", async (_name, overrides, message) => {
    expect(await addPassenger(ID.route, DATE, { ...guest, ...overrides })).toEqual({ error: message });
    expect(sb.mock.client.rpc).not.toHaveBeenCalled();
  });

  it("refuses a malformed ride", async () => {
    expect(await addPassenger("x", DATE, guest)).toEqual({ error: "המסלול לא נמצא." });
    expect(await addPassenger(ID.route, "tomorrow", guest)).toEqual({ error: "המסלול לא נמצא." });
  });
});

describe("removePassenger (spec D6)", () => {
  it("removes a passenger the driver added and refreshes", async () => {
    expect(await removePassenger(ID.booking)).toEqual({});
    expect(sb.mock.client.rpc).toHaveBeenCalledWith("remove_passenger", { p_booking_id: ID.booking });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("explains a booking that can't be removed", async () => {
    sb.mock.onRpc("remove_passenger", { error: { message: "P0001: BOOKING_NOT_FOUND" } });
    expect(await removePassenger(ID.booking)).toEqual({ error: "ההרשמה לא נמצאה." });
  });

  it("refuses a malformed id", async () => {
    expect(await removePassenger("x")).toEqual({ error: "ההרשמה לא נמצאה." });
  });
});

describe("database messages for the driver (spec §7)", () => {
  it.each(DRIVER_MESSAGES)("%s → %s", async (code, message) => {
    sb.mock.onRpc("add_passenger", { error: { message: `P0001: ${code}` } });
    expect(await addPassenger(ID.route, DATE, guest)).toEqual({ error: message });
  });
});
