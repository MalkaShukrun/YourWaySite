"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, homePathFor } from "@/lib/auth";
import { onboardingSchema, type OnboardingValues } from "@/lib/validation/profile";

export async function completeProfile(values: OnboardingValues) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = onboardingSchema.safeParse(values);
  if (!parsed.success) {
    return { error: "חלק מהפרטים אינם תקינים, נא לבדוק ולנסות שוב." };
  }

  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: v.fullName,
      email: v.email,
      phone: v.phone,
      vehicle_model: v.hasVehicle ? v.vehicleModel : null,
      vehicle_color: v.hasVehicle ? v.vehicleColor : null,
      vehicle_seats: v.hasVehicle ? Number(v.vehicleSeats) : null,
    })
    .eq("id", user.id);

  if (error) {
    return { error: "לא הצלחנו לשמור את הפרטים. נסי שוב בעוד רגע." };
  }

  redirect(homePathFor(user));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
