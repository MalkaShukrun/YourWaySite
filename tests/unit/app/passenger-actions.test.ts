import { beforeEach, describe, expect, it, vi } from "vitest";
import { refresh } from "next/cache";
import { createSupabaseMock } from "../helpers/supabase-mock";
import { runAction } from "../helpers/run-action";
import { ID } from "../helpers/fixtures";

// The passenger's server actions (app/(app)/(passenger)/actions.ts): booking
// one or several dates (spec C3–C6), cancelling (E1–E2) and the paid mark (G2).

const sb = vi.hoisted(() => ({ mock: null as unknown as ReturnType<typeof createSupabaseMock> }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sb.mock.client }));
vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn(async () => ({ id: ID.user })) }));
sb.mock = createSupabaseMock();
const { bookRide, cancelBooking, cancelRideAlert, createRideAlert, setBookingPaid } = await import("@/app/(app)/(passenger)/actions");

const booking = (dates: string[]) => ({ routeId: ID.route, dates, pickupStopId: ID.pickup, dropoffStopId: ID.dropoff });
const bookedDates = () => sb.mock.client.rpc.mock.calls.map(([, args]) => (args as { p_date: string }).p_date);

const PASSENGER_MESSAGES: [string, string][] = [
  ["RIDE_FULL", "הנסיעה התמלאה — אין יותר מקומות פנויים."],
  ["ALREADY_BOOKED", "את כבר רשומה לנסיעה הזו."],
  ["RIDE_UNAVAILABLE", "הנסיעה אינה זמינה יותר (בוטלה או שכבר יצאה)."],
  ["INVALID_STOP", "יש לבחור תחנת איסוף ותחנת הורדה מהרשימה."],
  ["OWN_RIDE", "אי אפשר להירשם לנסיעה שאת נוהגת בה."],
  ["BOOKING_NOT_FOUND", "ההרשמה לא נמצאה או שכבר בוטלה."],
  ["RIDE_DEPARTED", "הנסיעה כבר יצאה — אי אפשר לבטל."],
];

beforeEach(() => sb.mock.reset());

describe("bookRide: one date (spec C3)", () => {
  it("books and opens my rides with the success notice", async () => {
    expect(await runAction(() => bookRide(booking(["2026-11-02"])))).toEqual({ redirectedTo: "/my-rides?booked=1" });
    expect(sb.mock.client.rpc).toHaveBeenCalledWith("book_ride", {
      p_route_id: ID.route,
      p_date: "2026-11-02",
      p_pickup_stop_id: ID.pickup,
      p_dropoff_stop_id: ID.dropoff,
    });
  });

  // Two passengers race for the last seat (spec C5): the second gets this.
  it("shows the reason when the date can't be booked", async () => {
    sb.mock.onRpc("book_ride", { error: { message: "P0001: RIDE_FULL" } });
    expect(await runAction(() => bookRide(booking(["2026-11-02"])))).toEqual({ error: "הנסיעה התמלאה — אין יותר מקומות פנויים." });
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each(PASSENGER_MESSAGES)("maps %s to its message (spec §7)", async (code, message) => {
    sb.mock.onRpc("book_ride", { error: { message: `P0001: ${code}` } });
    expect(await runAction(() => bookRide(booking(["2026-11-02"])))).toEqual({ error: message });
  });
});

describe("bookRide: several dates (spec C4)", () => {
  it("books every date with the same stops", async () => {
    expect(await runAction(() => bookRide(booking(["2026-11-02", "2026-11-03", "2026-11-04"])))).toEqual({
      redirectedTo: "/my-rides?booked=1",
    });
    expect(bookedDates()).toEqual(["2026-11-02", "2026-11-03", "2026-11-04"]);
    for (const [, args] of sb.mock.client.rpc.mock.calls) {
      expect(args).toMatchObject({ p_pickup_stop_id: ID.pickup, p_dropoff_stop_id: ID.dropoff });
    }
  });

  it("books a date picked twice only once", async () => {
    await runAction(() => bookRide(booking(["2026-11-02", "2026-11-02"])));
    expect(bookedDates()).toEqual(["2026-11-02"]);
  });

  it("keeps the dates that worked and lists each one that didn't, with why", async () => {
    sb.mock.onRpc("book_ride", { data: "b1" }, { error: { message: "RIDE_FULL" } }, { error: { message: "RIDE_UNAVAILABLE" } });
    expect(await runAction(() => bookRide(booking(["2026-11-01", "2026-11-04", "2026-11-05"])))).toEqual({
      error:
        "נרשמת ל־1 מתוך 3 הימים. לא נרשמת ל: ד 4.11 — הנסיעה התמלאה — אין יותר מקומות פנויים. ה 5.11 — הנסיעה אינה זמינה יותר (בוטלה או שכבר יצאה).",
    });
    expect(refresh).toHaveBeenCalledOnce(); // the page shows the dates that were booked
  });

  it("lists the reasons, without a count, when no date worked", async () => {
    sb.mock.onRpc("book_ride", { error: { message: "RIDE_FULL" } });
    expect(await runAction(() => bookRide(booking(["2026-11-04", "2026-11-05"])))).toEqual({
      error: "ד 4.11 — הנסיעה התמלאה — אין יותר מקומות פנויים. ה 5.11 — הנסיעה התמלאה — אין יותר מקומות פנויים.",
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  // Up to 6 dates per request: the ride days in the 7-day window (spec C4).
  it("accepts 6 dates and refuses 7", async () => {
    const six = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"];
    expect(await runAction(() => bookRide(booking(six)))).toEqual({ redirectedTo: "/my-rides?booked=1" });
    sb.mock.reset();
    expect(await runAction(() => bookRide(booking([...six, "2026-11-07"])))).toEqual({
      error: "יש לבחור תחנת איסוף ותחנת הורדה מהרשימה.",
    });
    expect(sb.mock.client.rpc).not.toHaveBeenCalled();
  });
});

describe("bookRide: malformed requests", () => {
  it.each([
    ["route id", { routeId: "x" }],
    ["date", { dates: ["2.11.2026"] }],
    ["empty date list", { dates: [] }],
    ["pickup stop", { pickupStopId: "" }],
    ["dropoff stop", { dropoffStopId: "nope" }],
  ])("refuses a bad %s without touching the database", async (_name, overrides) => {
    expect(await runAction(() => bookRide({ ...booking(["2026-11-02"]), ...overrides }))).toEqual({
      error: "יש לבחור תחנת איסוף ותחנת הורדה מהרשימה.",
    });
    expect(sb.mock.client.rpc).not.toHaveBeenCalled();
  });
});

describe("cancelBooking (spec E1, E2)", () => {
  // The page shows the notice: the cancelled ride's row is gone after the reload.
  it("cancels and returns to my rides with the cancelled notice", async () => {
    expect(await runAction(() => cancelBooking(ID.booking))).toEqual({ redirectedTo: "/my-rides?cancelled=1" });
    expect(sb.mock.client.rpc).toHaveBeenCalledWith("cancel_booking", { p_booking_id: ID.booking });
  });

  it("refuses after departure", async () => {
    sb.mock.onRpc("cancel_booking", { error: { message: "P0001: RIDE_DEPARTED" } });
    expect(await cancelBooking(ID.booking)).toEqual({ error: "הנסיעה כבר יצאה — אי אפשר לבטל." });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("explains a booking that isn't hers or is already cancelled", async () => {
    sb.mock.onRpc("cancel_booking", { error: { message: "P0001: BOOKING_NOT_FOUND" } });
    expect(await cancelBooking(ID.booking)).toEqual({ error: "ההרשמה לא נמצאה או שכבר בוטלה." });
  });

  it("refuses a malformed id", async () => {
    expect(await cancelBooking("x")).toEqual({ error: "ההרשמה לא נמצאה או שכבר בוטלה." });
    expect(sb.mock.client.rpc).not.toHaveBeenCalled();
  });
});

describe("setBookingPaid (spec G2)", () => {
  it.each([true, false])("saves paid = %s on the booking and refreshes", async (isPaid) => {
    expect(await setBookingPaid(ID.booking, isPaid)).toEqual({});
    expect(sb.mock.callsOn("bookings")).toEqual([
      ["update", [{ is_paid: isPaid }]],
      ["eq", ["id", ID.booking]],
    ]);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("refuses a malformed id or value", async () => {
    expect(await setBookingPaid("x", true)).toEqual({ error: "ההרשמה לא נמצאה או שכבר בוטלה." });
    expect(await setBookingPaid(ID.booking, "yes" as unknown as boolean)).toEqual({ error: "ההרשמה לא נמצאה או שכבר בוטלה." });
    expect(sb.mock.client.from).not.toHaveBeenCalled();
  });

  it("shows the general message when saving fails", async () => {
    sb.mock.onTable("bookings", { error: { message: "down" } });
    expect(await setBookingPaid(ID.booking, true)).toEqual({ error: "משהו השתבש. נסי שוב בעוד רגע." });
  });
});

describe("createRideAlert (spec C10)", () => {
  const PLACE = "11111111-1111-4111-8111-111111111111";
  const alert = (overrides: Record<string, unknown> = {}) => ({ origins: ["city:בית שמש"], destinations: [PLACE], ...overrides });

  it("saves the places and the ranges she set", async () => {
    expect(await createRideAlert(alert({ startDate: "2026-11-02", endDate: "2026-11-04", fromTime: "22:00", untilTime: "02:00" }))).toEqual({});
    expect(sb.mock.client.rpc).toHaveBeenCalledWith("create_ride_alert", {
      p_origins: ["city:בית שמש"],
      p_destinations: [PLACE],
      p_start_date: "2026-11-02",
      p_end_date: "2026-11-04",
      // Crossing midnight: kept as it is, not swapped like the search.
      p_from_time: "22:00",
      p_until_time: "02:00",
    });
  });

  it("sends no range she didn't set", async () => {
    expect(await createRideAlert(alert())).toEqual({});
    expect(sb.mock.client.rpc).toHaveBeenCalledWith("create_ride_alert", expect.objectContaining({
      p_start_date: null, p_end_date: null, p_from_time: null, p_until_time: null,
    }));
  });

  it.each([
    ["ALERT_LIMIT", "הגעת למגבלה של 3 התראות פעילות — בטלי התראה קיימת כדי להוסיף חדשה."],
    ["ALERT_DUPLICATE", "כבר יש לך התראה עם אותם מקומות, תאריכים ושעות."],
    ["INVALID_ALERT", "יש לבחור מקום יציאה, יעד ותאריכים תקינים."],
  ])("maps %s to its message", async (code, message) => {
    sb.mock.onRpc("create_ride_alert", { error: { message: code } });
    expect(await createRideAlert(alert())).toEqual({ error: message });
  });

  it.each([
    ["no origin", alert({ origins: [] })],
    ["no destination", alert({ destinations: [] })],
    ["a pick that isn't one", alert({ origins: ["Jerusalem"] })],
    ["a start after the end", alert({ startDate: "2026-11-05", endDate: "2026-11-04" })],
    ["a malformed time", alert({ fromTime: "7am" })],
  ])("refuses %s without calling the database", async (_, input) => {
    expect((await createRideAlert(input)).error).toBeTruthy();
    expect(sb.mock.client.rpc).not.toHaveBeenCalled();
  });
});

describe("cancelRideAlert (spec C11)", () => {
  it("deletes her alert and returns to the alerts tab with a notice", async () => {
    expect(await runAction(() => cancelRideAlert(ID.booking))).toEqual({ redirectedTo: "/alerts?cancelled=1" });
    expect(sb.mock.callsOn("ride_alerts")).toEqual([
      ["delete", []],
      ["eq", ["id", ID.booking]],
    ]);
  });

  it("refuses a malformed id", async () => {
    expect(await cancelRideAlert("x")).toEqual({ error: "ההתראה לא נמצאה." });
    expect(sb.mock.client.from).not.toHaveBeenCalled();
  });
});
