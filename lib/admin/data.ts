import "server-only";
import { createClient } from "@/lib/supabase/server";

// Data Access Layer for group management (SRS §8). RLS limits ride_groups
// writes to admins; callers check with requireAdmin before reading.

export type AdminGroup = {
  id: string;
  origin: string;
  destination: string;
  is_active: boolean;
  routes: { driver_id: string; is_active: boolean }[];
};

// Every group, hidden ones included, with the routes that use it.
export async function getAdminGroups(): Promise<AdminGroup[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ride_groups")
    .select("id, origin, destination, is_active, routes(driver_id, is_active)")
    .order("origin")
    .order("destination");
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminGroup[];
}

export type AdminStats = {
  users: number;
  rides_today: number;
  passengers_today: number;
  rides_departed: number;
  passengers_departed: number;
};

// Site-wide totals (0033_admin_stats.sql). The function returns them to admins only.
export async function getAdminStats(): Promise<AdminStats> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_stats").single<AdminStats>();
  if (error) throw new Error(error.message);
  return data;
}

// The addresses approved for sign-in with a personal code. RLS: admins only.
export async function getOtpEmails(): Promise<{ email: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("otp_emails").select("email").order("email");
  if (error) throw new Error(error.message);
  return data ?? [];
}
