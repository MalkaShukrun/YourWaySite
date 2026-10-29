import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorld, daysFromToday, type User, type World } from "./support/world";

// What my rides and payments are built from, my_bookings (spec §6, G1, G2):
// each passenger's own bookings, their departure time in Israel, the price
// kept on the booking, and the driver-cancelled flag.

let w: World;
let driver: User;
let passenger: User;
let other: User;

beforeAll(async () => {
  w = createWorld();
  [driver, passenger, other] = await Promise.all([w.user("Driver", { fullName: "נהגת" }), w.user("Passenger"), w.user("Other")]);
});
afterAll(() => w?.cleanup());

type Mine = {
  booking_id: string;
  ride_date: string;
  status: string;
  is_paid: boolean;
  ride_cancelled: boolean;
  departure_at: string;
  price: number;
  pickup_label: string;
  dropoff_label: string;
  driver_name: string;
  driver_phone: string | null;
  origin: string;
};
const mine = async (user: User) => (await user.db.rpc("my_bookings")).data as Mine[];

describe("my_bookings", () => {
  it("lists only the passenger's own bookings", async () => {
    const date = daysFromToday(3);
    const route = await w.route(driver, { date });
    const { data: hers } = await w.book(passenger, route, date);
    const { data: theirs } = await w.book(other, route, date);
    const ids = (await mine(passenger)).map((b) => b.booking_id);
    expect(ids).toContain(hers);
    expect(ids).not.toContain(theirs);
  });

  it("shows the route, stops, driver and price of each booking", async () => {
    const date = daysFromToday(4);
    const route = await w.route(driver, { date, price: 12.5 });
    const { data: id } = await w.book(passenger, route, date);
    expect((await mine(passenger)).find((b) => b.booking_id === id)).toMatchObject({
      ride_date: date,
      status: "active",
      is_paid: false,
      ride_cancelled: false,
      price: 12.5,
      pickup_label: "Pickup A",
      dropoff_label: "Dropoff B",
      driver_name: "נהגת",
      driver_phone: driver.phone,
    });
  });

  // All times are Israel time (spec §2): 07:30 in Israel is 04:30 or 05:30 UTC.
  it("gives each ride's departure as its date and time in Israel", async () => {
    const date = daysFromToday(5);
    const route = await w.route(driver, { date, time: "07:30" });
    const { data: id } = await w.book(passenger, route, date);
    const departure = new Date((await mine(passenger)).find((b) => b.booking_id === id)!.departure_at);
    const inIsrael = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(departure);
    expect(inIsrael).toBe(`${date}, 07:30`);
  });

  it("sorts by date, then time", async () => {
    const rows = await mine(passenger);
    const keys = rows.map((b) => b.departure_at);
    expect(keys).toEqual([...keys].sort((a, b) => Date.parse(a) - Date.parse(b)));
  });

  it("keeps a cancelled booking, without the driver's contact details", async () => {
    const date = daysFromToday(3);
    const route = await w.route(driver, { date });
    const { data: id } = await w.book(passenger, route, date);
    await passenger.db.rpc("cancel_booking", { p_booking_id: id });
    expect((await mine(passenger)).find((b) => b.booking_id === id)).toMatchObject({ status: "cancelled", driver_phone: null });
  });

  it("is empty for a new user, and for signed-out visitors", async () => {
    const fresh = await w.user("Fresh");
    expect(await mine(fresh)).toEqual([]);
    const { data } = await w.anon.rpc("my_bookings");
    expect(data ?? []).toEqual([]);
  });
});

// Each ride is charged at the price saved on its booking (spec G2, §2 Bookings).
describe("the booking's price", () => {
  it("is copied from the route when the booking is made", async () => {
    const date = daysFromToday(3);
    const route = await w.route(driver, { date, price: 30 });
    const id = await w.bookDirectly(passenger, route, date);
    expect((await w.service.from("bookings").select("price").eq("id", id).single()).data!.price).toBe(30);
  });

  it("doesn't change for a ride that already departed, even if the route's price later does", async () => {
    const past = daysFromToday(-3);
    const route = await w.route(driver, { date: past, price: 20 });
    const id = await w.bookDirectly(passenger, route, past);
    await w.service.from("routes").update({ price: 45 }).eq("id", route.id);
    expect((await mine(passenger)).find((b) => b.booking_id === id)?.price).toBe(20);
  });

  it("a guest's booking never appears in anyone's payments", async () => {
    const date = daysFromToday(3);
    const route = await w.route(driver, { date });
    const { data: id } = await w.addGuest(driver, route, date);
    for (const user of [passenger, other]) {
      expect((await mine(user)).map((b) => b.booking_id)).not.toContain(id);
    }
  });
});

describe("history (spec G1)", () => {
  it("a past ride stays listed as active, so payments count it", async () => {
    const past = daysFromToday(-1);
    const route = await w.route(driver, { date: past });
    const id = await w.bookDirectly(passenger, route, past);
    const row = (await mine(passenger)).find((b) => b.booking_id === id)!;
    expect(row).toMatchObject({ status: "active", ride_cancelled: false });
    expect(Date.parse(row.departure_at)).toBeLessThan(Date.now());
  });

  it("a past ride the driver cancelled is marked, so payments skip it", async () => {
    const past = daysFromToday(-1);
    const route = await w.route(driver, { date: past });
    const id = await w.bookDirectly(passenger, route, past);
    await w.service.from("ride_exceptions").insert({ route_id: route.id, ride_date: past, cancelled: true });
    expect((await mine(passenger)).find((b) => b.booking_id === id)?.ride_cancelled).toBe(true);
  });
});
