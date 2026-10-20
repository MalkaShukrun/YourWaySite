import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Data Access Layer: the only place that reads the session and the profile.
// Call these from components rendered behind <Suspense> (they read cookies).

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  isAdmin: boolean;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, phone, is_admin")
    .eq("id", userId)
    .single();

  return {
    id: userId,
    email: profile?.email || (claimsData.claims.email as string | undefined) || "",
    fullName: profile?.full_name ?? "",
    phone: profile?.phone ?? null,
    isAdmin: profile?.is_admin ?? false,
  };
}

export function needsOnboarding(user: CurrentUser) {
  return !user.phone;
}

// Where each role lands after login.
export function homePathFor(user: CurrentUser) {
  return user.isAdmin ? "/admin/groups" : "/";
}

// Signed in with a completed profile, or redirected to /login.
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user || needsOnboarding(user)) redirect("/login");
  return user;
}

// Admins only; regular users are sent back to the passenger home.
export async function requireAdmin() {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/");
  return user;
}
