"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { firstIssue, messageForCode } from "@/lib/action-errors";
import { TIME_PATTERN } from "@/lib/validation/patterns";
import { routeSchema, type RouteValues } from "@/lib/validation/route";

const ERRORS: Record<string, string> = {
  STOPS_REQUIRED: "יש להגדיר לפחות תחנת איסוף אחת ותחנת הורדה אחת.",
  ROUTE_NOT_FOUND: "המסלול לא נמצא.",
};

const messageFor = (error: { message: string }) => messageForCode(error, ERRORS);

const rideRef = z.object({ routeId: z.uuid(), date: z.iso.date() });

// Create or edit a route with its stops (SRS §5.1).
export async function saveRoute(values: RouteValues, routeId: string | null) {
  await requireUser();
  const parsed = routeSchema.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (routeId !== null && !z.uuid().safeParse(routeId).success) return { error: ERRORS.ROUTE_NOT_FOUND };

  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_route", {
    p_route_id: routeId,
    p_route: {
      group_id: v.groupId,
      kind: v.kind,
      weekdays: v.weekdays,
      ride_date: v.rideDate,
      out_time: v.outTime,
      seats: v.seats,
      price: v.price,
    },
    p_stops: v.stops.map((s) => ({ id: s.id, kind: s.kind, label: s.label, lat: s.lat, lng: s.lng })),
  });
  if (error) return { error: messageFor(error) };

  redirect("/routes?saved=1");
}

// Stop offering a route. Past bookings stay in passengers' history.
export async function archiveRoute(routeId: string) {
  const user = await requireUser();
  if (!z.uuid().safeParse(routeId).success) return { error: ERRORS.ROUTE_NOT_FOUND };

  const supabase = await createClient();
  const { error } = await supabase
    .from("routes")
    .update({ is_active: false })
    .eq("id", routeId)
    .eq("driver_id", user.id);
  if (error) return { error: messageFor(error) };

  refresh();
  return {};
}

// Real-time departure update for one date (SRS §5.2).
export async function updateRideTime(routeId: string, date: string, time: string) {
  await requireUser();
  if (!rideRef.safeParse({ routeId, date }).success || !TIME_PATTERN.test(time)) {
    return { error: "שעה לא תקינה" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("ride_exceptions")
    .upsert({ route_id: routeId, ride_date: date, out_time: time }, { onConflict: "route_id,ride_date" });
  if (error) return { error: messageFor(error) };

  refresh();
  return {};
}

// "Cancel ride for this date only" — and undo (SRS §6.1). The recurring
// schedule for other dates is untouched.
export async function setRideCancelled(routeId: string, date: string, cancelled: boolean) {
  await requireUser();
  if (!rideRef.safeParse({ routeId, date }).success) return { error: ERRORS.ROUTE_NOT_FOUND };

  const supabase = await createClient();
  const { error } = await supabase
    .from("ride_exceptions")
    .upsert({ route_id: routeId, ride_date: date, cancelled }, { onConflict: "route_id,ride_date" });
  if (error) return { error: messageFor(error) };

  refresh();
  return {};
}
