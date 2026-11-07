import "server-only";
import { createClient } from "@/lib/supabase/server";
import { formatTime } from "@/lib/utils/dates";
import type { DailyEmailValues, ProfileValues, RideEmailsValues } from "@/lib/validation/profile";

// Data Access Layer for the profile screen (SRS §1.3). RLS limits the row
// to its owner.

const PROFILE_COLUMNS = "full_name, phone, vehicle_model, vehicle_color, vehicle_seats";

// The user's saved details as profile form values; empty fields for
// anything not filled in yet.
export async function getProfileValues(userId: string, fallbackName: string): Promise<ProfileValues> {
  const supabase = await createClient();
  const { data: p } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle();

  return {
    fullName: p?.full_name ?? fallbackName,
    phone: p?.phone ?? "",
    hasVehicle: Boolean(p?.vehicle_model),
    vehicleModel: p?.vehicle_model ?? "",
    vehicleColor: p?.vehicle_color ?? "",
    vehicleSeats: p?.vehicle_seats ? String(p.vehicle_seats) : "4",
  };
}

// The driver's daily email settings, for the profile screen.
export async function getDailyEmailValues(userId: string): Promise<DailyEmailValues> {
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("profiles")
    .select("daily_email_enabled, daily_email_updates_enabled, daily_email_time")
    .eq("id", userId)
    .maybeSingle();

  return {
    enabled: Boolean(p?.daily_email_enabled),
    updates: Boolean(p?.daily_email_updates_enabled),
    time: formatTime(p?.daily_email_time ?? "20:00"),
  };
}

// The emails about her own rides, for the profile screen.
export async function getRideEmailsValues(userId: string): Promise<RideEmailsValues> {
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("profiles")
    .select("ride_emails_enabled")
    .eq("id", userId)
    .maybeSingle();

  return { enabled: p?.ride_emails_enabled ?? true };
}

// The profile's vehicle columns; all null once the user removes the car.
export function vehicleColumns(v: Pick<ProfileValues, "hasVehicle" | "vehicleModel" | "vehicleColor" | "vehicleSeats">) {
  return {
    vehicle_model: v.hasVehicle ? v.vehicleModel : null,
    vehicle_color: v.hasVehicle ? v.vehicleColor : null,
    vehicle_seats: v.hasVehicle ? Number(v.vehicleSeats) : null,
  };
}
