import { beforeEach, describe, expect, it, vi } from "vitest";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseMock } from "@/tests/supabase-mock";
import { runAction } from "@/tests/redirect";
import { requireUser } from "@/lib/auth";
import { bookRide, cancelBooking, setBookingPaid } from "@/app/(app)/(passenger)/actions";

const sb = createSupabaseMock();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sb.client }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn(async () => ({ id: "passenger" })) }));

const ROUTE = "11111111-1111-4111-8111-111111111111";
const PICKUP = "22222222-2222-4222-8222-222222222222";
const DROPOFF = "33333333-3333-4333-8333-333333333333";
const BOOKING = "44444444-4444-4444-8444-444444444444";

const booking = { routeId: ROUTE, dates: ["2026-11-02"], pickupStopId: PICKUP, dropoffStopId: DROPOFF };

beforeEach(() => sb.reset());

describe("signed out or not onboarded", () => {
  it.each([
    ["bookRide", () => bookRide(booking)],
    ["cancelBooking", () => cancelBooking(BOOKING)],
    ["setBookingPaid", () => setBookingPaid(BOOKING, true)],
  ])("%s redirects to login without calling the database", async (_name, action) => {
    vi.mocked(requireUser).mockImplementationOnce(async () => redirect("/login"));
    expect(await runAction(action)).toEqual({ redirectedTo: "/login" });
    expect(sb.client.rpc).not.toHaveBeenCalled();
    expect(sb.client.from).not.toHaveBeenCalled();
  });
});

describe("bookRide", () => {
  it("books through the RPC and redirects to my rides", async () => {
    expect(await runAction(() => bookRide(booking))).toEqual({ redirectedTo: "/my-rides?booked=1" });
    expect(sb.client.rpc).toHaveBeenCalledWith("book_ride", {
      p_route_id: ROUTE,
      p_date: "2026-11-02",
      p_pickup_stop_id: PICKUP,
      p_dropoff_stop_id: DROPOFF,
    });
  });

  it.each([
    ["route id", { routeId: "x" }],
    ["date", { dates: ["2.11.2026"] }],
    ["empty date list", { dates: [] }],
    ["pickup stop", { pickupStopId: "" }],
    ["dropoff stop", { dropoffStopId: "nope" }],
  ])("rejects an invalid %s without calling the database", async (_name, override) => {
    expect(await bookRide({ ...booking, ...override })).toEqual({ error: "יש לבחור תחנת איסוף ותחנת הורדה מהרשימה." });
    expect(sb.client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["RIDE_FULL", "הנסיעה התמלאה — אין יותר מקומות פנויים."],
    ["ALREADY_BOOKED", "את כבר רשומה לנסיעה הזו."],
    ["RIDE_UNAVAILABLE", "הנסיעה אינה זמינה יותר (בוטלה או שכבר יצאה)."],
    ["INVALID_STOP", "יש לבחור תחנת איסוף ותחנת הורדה מהרשימה."],
    ["OWN_RIDE", "אי אפשר להירשם לנסיעה שאת נוהגת בה."],
    ["something unexpected", "משהו השתבש. נסי שוב בעוד רגע."],
  ])("maps the database error %s to a message", async (code, message) => {
    sb.onRpc("book_ride", { error: { message: `P0001: ${code}` } });
    expect(await runAction(() => bookRide(booking))).toEqual({ error: message });
  });

  it("books every chosen day once and redirects", async () => {
    const dates = ["2026-11-02", "2026-11-04", "2026-11-02"];
    expect(await runAction(() => bookRide({ ...booking, dates }))).toEqual({ redirectedTo: "/my-rides?booked=1" });
    expect(sb.client.rpc).toHaveBeenCalledTimes(2);
    expect(sb.client.rpc).toHaveBeenLastCalledWith("book_ride", expect.objectContaining({ p_date: "2026-11-04" }));
  });

  it("lists the days that failed and refreshes when others were booked", async () => {
    sb.onRpc("book_ride", { data: null, error: null }, { error: { message: "P0001: RIDE_FULL" } });
    const result = await runAction(() => bookRide({ ...booking, dates: ["2026-11-02", "2026-11-04"] }));
    expect(result).toEqual({ error: "נרשמת ל־1 מתוך 2 הימים. לא נרשמת ל: ד׳ 4.11 — הנסיעה התמלאה — אין יותר מקומות פנויים." });
    expect(refresh).toHaveBeenCalledOnce();
  });
});

describe("cancelBooking", () => {
  it("reports a free cancellation", async () => {
    sb.onRpc("cancel_booking", { data: "cancelled" });
    expect(await cancelBooking(BOOKING)).toEqual({ late: false });
    expect(sb.client.rpc).toHaveBeenCalledWith("cancel_booking", { p_booking_id: BOOKING });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("reports a late cancellation", async () => {
    sb.onRpc("cancel_booking", { data: "late_cancelled" });
    expect(await cancelBooking(BOOKING)).toEqual({ late: true });
  });

  it("rejects a malformed booking id", async () => {
    expect(await cancelBooking("abc")).toEqual({ error: "ההרשמה לא נמצאה או שכבר בוטלה." });
    expect(sb.client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["BOOKING_NOT_FOUND", "ההרשמה לא נמצאה או שכבר בוטלה."],
    ["RIDE_DEPARTED", "הנסיעה כבר יצאה ולא ניתן לבטל אותה."],
  ])("maps %s and does not refresh", async (code, message) => {
    sb.onRpc("cancel_booking", { error: { message: code } });
    expect(await cancelBooking(BOOKING)).toEqual({ error: message });
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("setBookingPaid", () => {
  it.each([true, false])("sets is_paid=%s on the booking", async (isPaid) => {
    expect(await setBookingPaid(BOOKING, isPaid)).toEqual({});
    expect(sb.callsOn("bookings")).toEqual([
      ["update", [{ is_paid: isPaid }]],
      ["eq", ["id", BOOKING]],
    ]);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("rejects a malformed booking id", async () => {
    expect(await setBookingPaid("1", true)).toEqual({ error: "ההרשמה לא נמצאה או שכבר בוטלה." });
    expect(sb.client.from).not.toHaveBeenCalled();
  });

  it("returns a generic error when the update fails", async () => {
    sb.onTable("bookings", { error: { message: "permission denied" } });
    expect(await setBookingPaid(BOOKING, true)).toEqual({ error: "משהו השתבש. נסי שוב בעוד רגע." });
    expect(refresh).not.toHaveBeenCalled();
  });
});
