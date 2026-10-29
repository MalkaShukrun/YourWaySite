import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ProfileValues } from "@/lib/validation/profile";

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

// The profile's vehicle columns; all null once the user removes the car.
export function vehicleColumns(v: Pick<ProfileValues, "hasVehicle" | "vehicleModel" | "vehicleColor" | "vehicleSeats">) {
  return {
    vehicle_model: v.hasVehicle ? v.vehicleModel : null,
    vehicle_color: v.hasVehicle ? v.vehicleColor : null,
    vehicle_seats: v.hasVehicle ? Number(v.vehicleSeats) : null,
  };
}
