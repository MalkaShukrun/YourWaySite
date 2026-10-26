"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { firstIssue } from "@/lib/action-errors";
import { vehicleColumns } from "@/lib/profile";
import { profileSchema, type ProfileValues } from "@/lib/validation/profile";

// Save the profile screen (SRS §1.3). The email comes from Google and isn't
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
