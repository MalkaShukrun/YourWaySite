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
};

export type RideDetails = RideSummary & {
  driver_phone: string | null;
  driver_email: string;
  vehicle_model: string | null;
  vehicle_color: string | null;
  is_available: boolean;
  my_booking_id: string | null;
};

// lat/lng are null when the driver didn't mark the stop on the map.
export type Stop = { id: string; kind: "pickup" | "dropoff"; label: string; lat: number | null; lng: number | null };

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
  driver_phone: string | null;
  driver_email: string;
};

export const TIME_WINDOWS = {
  early: { label: "06:00–07:30", from: "06:00", to: "07:30" },
  morning: { label: "07:30–09:00", from: "07:30", to: "09:00" },
  later: { label: "אחרי 09:00", from: "09:00", to: null },
} as const;
export type TimeWindow = keyof typeof TIME_WINDOWS;
