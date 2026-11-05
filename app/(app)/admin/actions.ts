"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/session";
import { firstIssue, GENERIC_ERROR } from "@/lib/utils/action-errors";
import { groupSchema, type GroupValues } from "@/lib/validation/group";
import { placeSchema, type PlaceValues } from "@/lib/validation/place";
import { otpEmailSchema } from "@/lib/validation/otp-email";
import { generateCode, hashCode } from "@/lib/auth/personal-code";

// Group management (SRS §8). RLS also limits ride_groups and places writes to admins.

const GROUP_NOT_FOUND = "הקבוצה לא נמצאה.";
const PLACE_NOT_FOUND = "המקום לא נמצא.";
const GROUP_EXISTS = "הקבוצה הזו כבר קיימת.";
const PLACE_EXISTS = "המקום הזה כבר ברשימה.";
const GROUP_IN_USE = "יש מסלולים בקבוצה הזו — אפשר להסתיר אותה במקום למחוק.";
const PLACE_IN_USE = "יש קבוצות עם המקום הזה, ולכן אי אפשר למחוק אותו.";

// By Postgres error code: unique violation, then foreign-key violation — on a
// delete, rows still use it; on a group write, a picked place was deleted.
function messageFor(error: { code?: string }, duplicate: string, foreignKey: string) {
  if (error.code === "23505") return duplicate;
  if (error.code === "23503") return foreignKey;
  return GENERIC_ERROR;
}

const groupRow = ({ originId, destinationId }: GroupValues) => ({
  origin_place_id: originId,
  destination_place_id: destinationId,
});

export async function createGroup(values: GroupValues) {
  await requireAdmin();
  const parsed = groupSchema.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("ride_groups").insert(groupRow(parsed.data));
  if (error) return { error: messageFor(error, GROUP_EXISTS, PLACE_NOT_FOUND) };

  refresh();
  return {};
}

// Change a group's places. Routes keep pointing at it, so drivers and
// passengers see the new name everywhere.
export async function updateGroup(groupId: string, values: GroupValues) {
  await requireAdmin();
  if (!z.uuid().safeParse(groupId).success) return { error: GROUP_NOT_FOUND };
  const parsed = groupSchema.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("ride_groups").update(groupRow(parsed.data)).eq("id", groupId);
  if (error) return { error: messageFor(error, GROUP_EXISTS, PLACE_NOT_FOUND) };

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
  if (error) return { error: messageFor(error, GROUP_EXISTS, GROUP_IN_USE) };

  refresh();
  return {};
}

// Only groups no route ever used can be deleted (routes reference them).
export async function deleteGroup(groupId: string) {
  await requireAdmin();
  if (!z.uuid().safeParse(groupId).success) return { error: GROUP_NOT_FOUND };

  const supabase = await createClient();
  const { error } = await supabase.from("ride_groups").delete().eq("id", groupId);
  if (error) return { error: messageFor(error, GROUP_EXISTS, GROUP_IN_USE) };

  refresh();
  return {};
}

// The list of places groups go from and to (0040).
export async function createPlace(values: PlaceValues) {
  await requireAdmin();
  const parsed = placeSchema.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("places").insert(parsed.data);
  if (error) return { error: messageFor(error, PLACE_EXISTS, PLACE_IN_USE) };

  refresh();
  return {};
}

// Renaming a place renames every group that uses it.
export async function updatePlace(placeId: string, values: PlaceValues) {
  await requireAdmin();
  if (!z.uuid().safeParse(placeId).success) return { error: PLACE_NOT_FOUND };
  const parsed = placeSchema.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("places").update(parsed.data).eq("id", placeId);
  if (error) return { error: messageFor(error, PLACE_EXISTS, PLACE_IN_USE) };

  refresh();
  return {};
}

// Only places no group uses can be deleted.
export async function deletePlace(placeId: string) {
  await requireAdmin();
  if (!z.uuid().safeParse(placeId).success) return { error: PLACE_NOT_FOUND };

  const supabase = await createClient();
  const { error } = await supabase.from("places").delete().eq("id", placeId);
  if (error) return { error: messageFor(error, PLACE_EXISTS, PLACE_IN_USE) };

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
