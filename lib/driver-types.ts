// Driver Hub types and helpers — safe to import from Client Components.
import type { RideKind, Stop } from "@/lib/ride-types";

export type DriverRide = {
  route_id: string;
  kind: RideKind;
  origin: string;
  destination: string;
  out_time: string;
  scheduled_out_time: string;
  return_time: string | null;
  seats: number;
  price: number;
  cancelled: boolean;
  booked: number;
};

export type DriverPassenger = {
  booking_id: string;
  route_id: string;
  passenger_id: string;
  passenger_name: string;
  passenger_phone: string | null;
  passenger_email: string;
  pickup_stop_id: string;
  pickup_label: string;
  pickup_lat: number;
  pickup_lng: number;
  pickup_position: number;
  dropoff_stop_id: string;
  dropoff_label: string;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_position: number;
};

export type DriverRoute = {
  id: string;
  kind: RideKind;
  group_id: string;
  weekdays: number[];
  ride_date: string | null;
  out_time: string;
  return_time: string | null;
  seats: number;
  price: number;
  origin: string;
  destination: string;
};

export type EditableRoute = DriverRoute & { stops: Stop[] };

export const WEEKDAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳"]; // Sunday … Friday

export function weekdaysLabel(days: number[]) {
  return days.map((d) => WEEKDAYS[d] ?? "ש׳").join(" · ");
}

// Turn-by-turn navigation links for a stop (SRS §5.2).
export function wazeUrl(lat: number, lng: number) {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}
export function googleMapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
