// Booking rules shared by the passenger screens — safe to import from Client Components.
import type { MyBooking } from "@/lib/rides/types";

// Upcoming = departure still ahead of `now`; history = already departed.
export function splitByDeparture(bookings: MyBooking[], now: number) {
  return {
    upcoming: bookings.filter((b) => Date.parse(b.departure_at) > now),
    history: bookings.filter((b) => Date.parse(b.departure_at) <= now),
  };
}

// A booking counts toward payment once the ride has departed with the passenger
// still booked, and the driver didn't cancel it.
export function isCharged(b: MyBooking, now: number) {
  return b.status === "active" && !b.ride_cancelled && Date.parse(b.departure_at) <= now;
}
