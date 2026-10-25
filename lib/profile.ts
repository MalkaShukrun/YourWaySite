import { createClient } from "@/lib/supabase/server";
import type { OnboardingValues, ProfileValues } from "@/lib/validation/profile";

// Data Access Layer for the profile screen (SRS §1.3). RLS limits the row
// to its owner.

const PROFILE_COLUMNS =
  "full_name, phone, vehicle_model, vehicle_color, vehicle_seats, bank_account_name, bank_name, bank_branch, bank_account";

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
    bankAccountName: p?.bank_account_name ?? "",
    bankName: p?.bank_name ?? "",
    bankBranch: p?.bank_branch ?? "",
    bankAccount: p?.bank_account ?? "",
  };
}

// The profile's vehicle columns; all null once the user removes the car.
export function vehicleColumns(v: Pick<OnboardingValues, "hasVehicle" | "vehicleModel" | "vehicleColor" | "vehicleSeats">) {
  return {
    vehicle_model: v.hasVehicle ? v.vehicleModel : null,
    vehicle_color: v.hasVehicle ? v.vehicleColor : null,
    vehicle_seats: v.hasVehicle ? Number(v.vehicleSeats) : null,
  };
}
