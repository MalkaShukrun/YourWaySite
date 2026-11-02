"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/session";
import { firstIssue, GENERIC_ERROR } from "@/lib/utils/action-errors";
import { groupSchema, type GroupValues } from "@/lib/validation/group";
import { otpEmailSchema } from "@/lib/validation/otp-email";
import { generateCode, hashCode } from "@/lib/auth/personal-code";

// Group management (SRS §8). RLS also limits ride_groups writes to admins.

const GROUP_NOT_FOUND = "הקבוצה לא נמצאה.";

// By Postgres error code: unique violation, then foreign-key violation.
function messageFor(error: { code?: string }) {
  if (error.code === "23505") return "הקבוצה הזו כבר קיימת.";
  if (error.code === "23503") return "יש מסלולים בקבוצה הזו — אפשר להסתיר אותה במקום למחוק.";
  return GENERIC_ERROR;
}

export async function createGroup(values: GroupValues) {
  await requireAdmin();
  const parsed = groupSchema.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("ride_groups").insert(parsed.data);
  if (error) return { error: messageFor(error) };

  refresh();
  return {};
}

// Rename a group. Routes keep pointing at it, so drivers and passengers see
// the new name everywhere.
export async function updateGroup(groupId: string, values: GroupValues) {
  await requireAdmin();
  if (!z.uuid().safeParse(groupId).success) return { error: GROUP_NOT_FOUND };
  const parsed = groupSchema.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("ride_groups").update(parsed.data).eq("id", groupId);
  if (error) return { error: messageFor(error) };

  refresh();
  return {};
}

// Hidden groups disappear from search and from the driver's group list;
// existing routes and bookings stay.
export async function setGroupActive(groupId: string, active: boolean) {
  await requireAdmin();
  if (!z.uuid().safeParse(groupId).success || !z.boolean().safeParse(active).success) {
    return { error: GROUP_NOT_FOUND };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("ride_groups").update({ is_active: active }).eq("id", groupId);
  if (error) return { error: messageFor(error) };

  refresh();
  return {};
}

// Only groups no route ever used can be deleted (routes reference them).
export async function deleteGroup(groupId: string) {
  await requireAdmin();
  if (!z.uuid().safeParse(groupId).success) return { error: GROUP_NOT_FOUND };

  const supabase = await createClient();
  const { error } = await supabase.from("ride_groups").delete().eq("id", groupId);
  if (error) return { error: messageFor(error) };

  refresh();
  return {};
}

// Approves an address for sign-in with a personal code. She gets an account now
// (or keeps the one she has). The code is returned once and only its hash is kept.
export async function addOtpEmail(value: string): Promise<{ error?: string; code?: string }> {
  await requireAdmin();
  const parsed = otpEmailSchema.safeParse(value);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const email = parsed.data;

  const admin = createAdminClient();
  if (!admin) return { error: GENERIC_ERROR };
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error && created.error.code !== "email_exists") {
    console.error("addOtpEmail: createUser failed", created.error.message);
    return { error: GENERIC_ERROR };
  }

  const code = generateCode();
  const { error } = await admin.from("otp_emails").insert({ email, code_hash: hashCode(code) });
  if (error) return { error: error.code === "23505" ? "הכתובת הזו כבר ברשימה." : GENERIC_ERROR };

  refresh();
  return { code };
}

// Replaces a lost or leaked code. The old one stops working at once.
export async function newOtpCode(email: string): Promise<{ error?: string; code?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  if (!admin) return { error: GENERIC_ERROR };

  const code = generateCode();
  const { data, error } = await admin
    .from("otp_emails")
    .update({ code_hash: hashCode(code), attempt_count: 0, attempts_from: null })
    .eq("email", email)
    .select("email");
  if (error || !data?.length) return { error: GENERIC_ERROR };

  return { code };
}

// Stops sign-in with the code. The account, its rides and any open session stay.
export async function removeOtpEmail(email: string): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("otp_emails").delete().eq("email", email);
  if (error) return { error: GENERIC_ERROR };

  refresh();
  return {};
}
