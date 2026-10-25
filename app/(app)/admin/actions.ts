"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { firstIssue, GENERIC_ERROR } from "@/lib/action-errors";
import { groupSchema, type GroupValues } from "@/lib/validation/group";

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
  if (!z.uuid().safeParse(groupId).success) return { error: GROUP_NOT_FOUND };

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
