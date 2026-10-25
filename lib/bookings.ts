// Booking rules shared by the passenger screens — safe to import from Client Components.
import type { MyBooking } from "@/lib/ride-types";

// Upcoming = departure still ahead of `now`; history = already departed.
export function splitByDeparture(bookings: MyBooking[], now: number) {
  return {
    upcoming: bookings.filter((b) => Date.parse(b.departure_at) > now),
    history: bookings.filter((b) => Date.parse(b.departure_at) <= now),
  };
}

// A booking counts toward payment once the ride has departed: still booked
// (and not cancelled by the driver), or cancelled late.
export function isCharged(b: MyBooking, now: number) {
  const booked = (b.status === "active" && !b.ride_cancelled) || b.status === "late_cancelled";
  return booked && Date.parse(b.departure_at) <= now;
}
