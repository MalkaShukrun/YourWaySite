"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, homePathFor } from "@/lib/auth";
import { vehicleColumns } from "@/lib/profile";
import { profileSchema, type ProfileValues } from "@/lib/validation/profile";

export async function completeProfile(values: ProfileValues) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) {
    return { error: "חלק מהפרטים אינם תקינים, נא לבדוק ולנסות שוב." };
  }

  const v = parsed.data;
  // No email: the database copies it from the sign-in (Google or email link).
  const details = {
    full_name: v.fullName,
    phone: v.phone,
    ...vehicleColumns(v),
  };
  const supabase = await createClient();
  const updated = await supabase.from("profiles").update(details).eq("id", user.id).select("id");
  // No row yet (account created before the profiles table existed) — create it.
  const { error } =
    updated.error || updated.data?.length
      ? updated
      : await supabase.from("profiles").insert({ id: user.id, ...details });

  if (error) {
    // Missing table: a setup hint for the developer, the generic message in production.
    if (process.env.NODE_ENV === "development" && (error.code === "PGRST205" || error.code === "42P01")) {
      return { error: "בסיס הנתונים עדיין לא הוגדר — יש להריץ את supabase/setup.sql ב־Supabase." };
    }
    return { error: "לא הצלחנו לשמור את הפרטים. נסי שוב בעוד רגע." };
  }

  redirect(homePathFor(user));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // signOut() keeps the cookies when Supabase rejects the call (e.g. an
  // already-used refresh token), and /login would send us straight back.
  const cookieStore = await cookies();
  for (const { name } of cookieStore.getAll()) {
    if (/^sb-.+-auth-token/.test(name)) cookieStore.delete(name);
  }
  redirect("/login");
}
