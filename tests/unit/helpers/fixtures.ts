import type { MyBooking, RideSummary } from "@/lib/rides/types";

// Valid ids and records for the unit tests; override what a test is about.

export const ID = {
  user: "11111111-1111-4111-8111-111111111111",
  driver: "22222222-2222-4222-8222-222222222222",
  group: "33333333-3333-4333-8333-333333333333",
  group2: "33333333-3333-4333-8333-333333333334",
  route: "44444444-4444-4444-8444-444444444444",
  route2: "44444444-4444-4444-8444-444444444445",
  pickup: "55555555-5555-4555-8555-555555555551",
  dropoff: "55555555-5555-4555-8555-555555555552",
  booking: "66666666-6666-4666-8666-666666666666",
};

export function ride(overrides: Partial<RideSummary> = {}): RideSummary {
  return {
    route_id: ID.route,
    ride_date: "2026-11-01",
    kind: "recurring",
    driver_id: ID.driver,
    driver_name: "רחל לוי",
    origin: "בית שמש",
    destination: "ירושלים",
    out_time: "07:30:00",
    return_time: null,
    seats: 4,
    seats_left: 4,
    price: 15,
    notes: null,
    ...overrides,
  };
}

export function booking(overrides: Partial<MyBooking> = {}): MyBooking {
  return {
    booking_id: ID.booking,
    route_id: ID.route,
    ride_date: "2026-11-01",
    status: "active",
    is_paid: false,
    ride_cancelled: false,
    kind: "recurring",
    origin: "בית שמש",
    destination: "ירושלים",
    out_time: "07:30:00",
    departure_at: "2026-11-01T05:30:00+00:00",
    price: 15,
    pickup_label: "צומת",
    dropoff_label: "תחנה מרכזית",
    driver_id: ID.driver,
    driver_name: "רחל לוי",
    driver_phone: "050-123-4567",
    driver_email: "driver@example.test",
    ...overrides,
  };
}
