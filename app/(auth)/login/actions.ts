"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, homePathFor } from "@/lib/auth/session";
import { vehicleColumns } from "@/lib/profile/data";
import { profileSchema, type ProfileValues } from "@/lib/validation/profile";
import { otpEmailSchema, personalCodeSchema } from "@/lib/validation/otp-email";
import { checkCode } from "@/lib/auth/personal-code";

export async function completeProfile(values: ProfileValues) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) {
    return { error: "חלק מהפרטים אינם תקינים, נא לבדוק ולנסות שוב." };
  }

  const v = parsed.data;
  // No email: the database copies it from the sign-in (Google or personal code).
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

// Signs in with a personal code from the admin. Supabase's Email provider is off
// and its codes are single-use, so the server checks the permanent code itself
// and then makes a one-time Supabase code to open the session. Every failure
// gets the same reply, so the form doesn't show who is on the list.
export async function signInWithCode(emailValue: string, codeValue: string): Promise<{ error?: string }> {
  const wrong = { error: "המייל או הקוד שגויים." };
  const email = otpEmailSchema.safeParse(emailValue);
  const code = personalCodeSchema.safeParse(codeValue);
  if (!email.success || !code.success) return wrong;

  const admin = createAdminClient();
  if (!admin) return wrong;

  const { data: hash, error: claimError } = await admin.rpc("claim_code_attempt", { p_email: email.data });
  if (claimError) console.error("signInWithCode: claim failed", claimError.message);
  if (!checkCode(code.data, hash)) return wrong;

  const { data, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: email.data });
  if (linkError) {
    console.error("signInWithCode: generateLink failed", linkError.message);
    return wrong;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: email.data, token: data.properties.email_otp, type: "email" });
  if (error) {
    console.error("signInWithCode: verifyOtp failed", error.message);
    return wrong;
  }
  return {};
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
