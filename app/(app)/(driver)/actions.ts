"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { firstIssue, messageForCode } from "@/lib/utils/action-errors";
import { addPassengerSchema, type AddPassengerValues } from "@/lib/validation/passenger";
import { routeSchema, routeUpdateSchema, type RouteUpdateValues, type RouteValues } from "@/lib/validation/route";

const ERRORS: Record<string, string> = {
  STOPS_REQUIRED: "יש להגדיר לפחות תחנת איסוף אחת ותחנת הורדה אחת.",
  ROUTE_NOT_FOUND: "המסלול לא נמצא.",
  RIDE_UNAVAILABLE: "הנסיעה בוטלה או לא מתקיימת בתאריך הזה.",
  RIDE_FULL: "אין מקומות פנויים בנסיעה הזו.",
  ALREADY_BOOKED: "הטרמפיסטית כבר רשומה לנסיעה הזו.",
  OWN_RIDE: "אי אפשר להוסיף את עצמך כטרמפיסטית.",
  INVALID_PASSENGER: "יש להזין שם וטלפון.",
  INVALID_STOP: "התחנה שנבחרה אינה חלק מהמסלול.",
  BOOKING_NOT_FOUND: "ההרשמה לא נמצאה.",
  ROUTE_LOCKED: "אי אפשר לשנות מסלול שפורסם — אפשר רק לערוך את ההערה ולהוסיף תחנות.",
  RIDE_CANCELLED: "הנסיעה בוטלה לתאריך הזה, ואי אפשר להחזיר אותה.",
  RIDE_DEPARTED: "הנסיעה כבר יצאה ולא ניתן לבטל אותה.",
  RIDE_PAST: "הנסיעה כבר התקיימה ונשמרת בהיסטוריה — אי אפשר להסיר אותה.",
};

const messageFor = (error: { message: string }) => messageForCode(error, ERRORS);

const rideRef = z.object({ routeId: z.uuid(), date: z.iso.date() });

// Create a route with its stops (SRS §5.1). Once published it can't be
// changed, only given a new note and more stops (updateRoute) or removed.
export async function saveRoute(values: RouteValues) {
  await requireUser();
  const parsed = routeSchema.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_route", {
    p_route_id: null,
    p_route: {
      group_id: v.groupId,
      kind: v.kind,
      weekdays: v.weekdays,
      ride_date: v.rideDate,
      out_time: v.outTime,
      seats: v.seats,
      price: v.price,
      notes: v.notes,
    },
    p_stops: v.stops.map((s) => ({ id: s.id, kind: s.kind, label: s.label, lat: s.lat, lng: s.lng })),
  });
  if (error) return { error: messageFor(error) };

  redirect("/routes?saved=1");
}

// The only changes a published route takes: its note, and more stops after its
// existing ones (0022_lock_routes.sql, 0028_editable_route_notes.sql).
export async function updateRoute(routeId: string, values: RouteUpdateValues) {
  await requireUser();
  if (!z.uuid().safeParse(routeId).success) return { error: ERRORS.ROUTE_NOT_FOUND };
  const parsed = routeUpdateSchema.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_route", {
    p_route_id: routeId,
    p_notes: parsed.data.notes,
    p_stops: parsed.data.stops.map((s) => ({ kind: s.kind, label: s.label, lat: s.lat, lng: s.lng })),
  });
  if (error) return { error: messageFor(error) };

  redirect("/routes?saved=1");
}

// Stop offering a route. Past bookings stay in passengers' history; upcoming
// ones are cancelled by the database (0018_cancel_off_schedule_bookings.sql).
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

// "Cancel ride for this date only" (SRS §6.1). Passengers see the ride as
// cancelled, and it can't be restored (0022_lock_routes.sql). The recurring
// schedule for other dates is untouched.
export async function cancelRideForDate(routeId: string, date: string) {
  await requireUser();
  if (!rideRef.safeParse({ routeId, date }).success) return { error: ERRORS.ROUTE_NOT_FOUND };

  const supabase = await createClient();
  const { error } = await supabase
    .from("ride_exceptions")
    .upsert({ route_id: routeId, ride_date: date, cancelled: true }, { onConflict: "route_id,ride_date" });
  if (error) return { error: messageFor(error) };

  refresh();
  return {};
}

// Add a passenger to a ride by hand. The booking keeps her name and phone and
// isn't linked to any user account (supabase/migrations/0013). A phone that
// already holds a guest seat on this ride is replaced only with `replace`;
// without it the answer is `existingGuest`, her name, so the driver can be
// asked first (0029_confirm_guest_replace.sql).
export async function addPassenger(routeId: string, date: string, values: AddPassengerValues, replace = false) {
  await requireUser();
  if (!rideRef.safeParse({ routeId, date }).success) return { error: ERRORS.ROUTE_NOT_FOUND };
  const parsed = addPassengerSchema.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_passenger", {
    p_route_id: routeId,
    p_date: date,
    p_name: v.name,
    p_phone: v.phone,
    p_pickup_stop_id: v.pickupStopId,
    p_dropoff_stop_id: v.dropoffStopId,
    p_replace: replace,
  });
  if (error?.message.includes("GUEST_EXISTS")) return { existingGuest: error.details ?? "" };
  if (error) return { error: messageFor(error) };

  refresh();
  return {};
}

// Take a passenger the driver added off the ride.
export async function removePassenger(bookingId: string) {
  await requireUser();
  if (!z.uuid().safeParse(bookingId).success) return { error: ERRORS.BOOKING_NOT_FOUND };

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_passenger", { p_booking_id: bookingId });
  if (error) return { error: messageFor(error) };

  refresh();
  return {};
}
