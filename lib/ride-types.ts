// Ride types — safe to import from Client Components.

export type RideKind = "recurring" | "one_time";

export type RideGroup = { id: string; origin: string; destination: string };

export type RideSummary = {
  route_id: string;
  ride_date: string;
  kind: RideKind;
  driver_id: string;
  driver_name: string;
  origin: string;
  destination: string;
  out_time: string;
  return_time: string | null;
  seats: number;
  seats_left: number;
  price: number;
  // The driver's free-text note; null = none.
  notes: string | null;
};

// The driver's phone and email are null unless the user is booked on the ride.
export type RideDetails = RideSummary & {
  driver_phone: string | null;
  driver_email: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  is_available: boolean;
  my_booking_id: string | null;
};

// lat/lng are null when the driver didn't mark the stop on the map.
export type Stop = { id: string; kind: "pickup" | "dropoff"; label: string; lat: number | null; lng: number | null };

// Marking a stop on the map is optional; stops without a location aren't drawn.
export function isPlaced<T extends { lat: number | null; lng: number | null }>(stop: T): stop is T & { lat: number; lng: number } {
  return stop.lat !== null && stop.lng !== null;
}

type BookingStatus = "active" | "cancelled" | "late_cancelled";

export type MyBooking = {
  booking_id: string;
  route_id: string;
  ride_date: string;
  status: BookingStatus;
  is_paid: boolean;
  ride_cancelled: boolean;
  kind: RideKind;
  origin: string;
  destination: string;
  out_time: string;
  departure_at: string;
  price: number;
  pickup_label: string;
  dropoff_label: string;
  driver_id: string;
  driver_name: string;
  // Null for a booking cancelled in time.
  driver_phone: string | null;
  driver_email: string | null;
};

