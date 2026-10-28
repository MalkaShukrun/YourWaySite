"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { firstIssue, messageForCode } from "@/lib/action-errors";
import { addPassengerSchema, type AddPassengerValues } from "@/lib/validation/passenger";
import { TIME_PATTERN } from "@/lib/validation/patterns";
import { routeSchema, type RouteValues } from "@/lib/validation/route";

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
      notes: v.notes,
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

// Add a passenger to a ride by hand. The booking keeps her name and phone and
// isn't linked to any user account (supabase/migrations/0013).
export async function addPassenger(routeId: string, date: string, values: AddPassengerValues) {
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
  });
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
