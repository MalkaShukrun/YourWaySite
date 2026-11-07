"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { firstIssue } from "@/lib/utils/action-errors";
import { vehicleColumns } from "@/lib/profile/data";
import {
  dailyEmailSchema,
  profileSchema,
  rideEmailsSchema,
  type DailyEmailValues,
  type ProfileValues,
  type RideEmailsValues,
} from "@/lib/validation/profile";

// Save the profile screen (SRS §1.3). The email comes from the sign-in and isn't
// editable; column grants stop users from touching their admin flag.
export async function saveProfile(values: ProfileValues) {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: v.fullName,
      phone: v.phone,
      ...vehicleColumns(v),
    })
    .eq("id", user.id);

  if (error) return { error: "לא הצלחנו לשמור את הפרטים. נסי שוב בעוד רגע." };

  refresh();
  return {};
}

// Save when the driver gets her daily email of tomorrow's passengers (spec D7).
export async function saveDailyEmail(values: DailyEmailValues) {
  const user = await requireUser();
  const parsed = dailyEmailSchema.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      daily_email_enabled: parsed.data.enabled,
      daily_email_updates_enabled: parsed.data.updates,
      daily_email_time: parsed.data.time,
    })
    .eq("id", user.id);

  if (error) return { error: "לא הצלחנו לשמור את ההגדרות. נסי שוב בעוד רגע." };

  refresh();
  return {};
}

// Save which emails she gets about her own rides (spec A7).
export async function saveRideEmails(values: RideEmailsValues) {
  const user = await requireUser();
  const parsed = rideEmailsSchema.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ ride_emails_enabled: parsed.data.enabled })
    .eq("id", user.id);

  if (error) return { error: "לא הצלחנו לשמור את ההגדרות. נסי שוב בעוד רגע." };

  refresh();
  return {};
}
