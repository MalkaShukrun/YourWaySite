// Ride types and display helpers — safe to import from Client Components.

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

export type Stop = { id: string; kind: "pickup" | "dropoff"; label: string; lat: number; lng: number };

export type BookingStatus = "active" | "cancelled" | "late_cancelled";

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

// Upcoming = departure still ahead of `now`; history = already departed.
export function splitByDeparture(bookings: MyBooking[], now: number) {
  return {
    upcoming: bookings.filter((b) => Date.parse(b.departure_at) > now),
    history: bookings.filter((b) => Date.parse(b.departure_at) <= now),
  };
}

// Display helpers shared by the passenger screens.
export function groupLabel(origin: string, destination: string) {
  return `${origin} ← ${destination}`;
}

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
}

const AVATAR_COLORS = ["coral", "lavender", "mint", "sand"] as const;
export function avatarColorFor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function kindLabel(kind: RideKind) {
  return kind === "recurring" ? "קבועה" : "חד־פעמית";
}

export function formatPrice(price: number) {
  return `₪${Number(price).toLocaleString("he-IL", { maximumFractionDigits: 2 })}`;
}
