"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { messageForCode } from "@/lib/utils/action-errors";
import { formatShortRideDate } from "@/lib/utils/dates";
import { TIME_PATTERN } from "@/lib/validation/patterns";
import { placePicksFrom } from "@/lib/rides/search";
import { asRecentSearch } from "@/lib/rides/recentSearches";

const ERRORS: Record<string, string> = {
  RIDE_FULL: "הנסיעה התמלאה — אין יותר מקומות פנויים.",
  ALREADY_BOOKED: "את כבר רשומה לנסיעה הזו.",
  RIDE_UNAVAILABLE: "הנסיעה אינה זמינה יותר (בוטלה או שכבר יצאה).",
  INVALID_STOP: "יש לבחור תחנת איסוף ותחנת הורדה מהרשימה.",
  OWN_RIDE: "אי אפשר להירשם לנסיעה שאת נוהגת בה.",
  BOOKING_NOT_FOUND: "ההרשמה לא נמצאה או שכבר בוטלה.",
  RIDE_DEPARTED: "הנסיעה כבר יצאה — אי אפשר לבטל.",
};

const messageFor = (error: { message: string }) => messageForCode(error, ERRORS);

const bookingSchema = z.object({
  routeId: z.uuid(),
  // The 7-day search window holds at most 6 ride days (no rides on Saturday).
  dates: z.array(z.iso.date()).min(1).max(6),
  pickupStopId: z.uuid(),
  dropoffStopId: z.uuid(),
});

// Books the same stops on each chosen date of the route. When only some dates
// go through, the others are listed with their reason.
export async function bookRide(input: z.infer<typeof bookingSchema>) {
  await requireUser();
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) return { error: ERRORS.INVALID_STOP };

  const { routeId, pickupStopId, dropoffStopId } = parsed.data;
  const dates = [...new Set(parsed.data.dates)];
  const supabase = await createClient();
  const failures: { date: string; message: string }[] = [];
  for (const date of dates) {
    const { error } = await supabase.rpc("book_ride", {
      p_route_id: routeId,
      p_date: date,
      p_pickup_stop_id: pickupStopId,
      p_dropoff_stop_id: dropoffStopId,
    });
    if (error) failures.push({ date, message: messageFor(error) });
  }

  if (failures.length === 0) redirect("/my-rides?booked=1");
  if (dates.length === 1) return { error: failures[0].message };

  const booked = dates.length - failures.length;
  if (booked > 0) refresh();
  const details = failures.map((f) => `${formatShortRideDate(f.date)} — ${f.message}`).join(" ");
  return { error: booked > 0 ? `נרשמת ל־${booked} מתוך ${dates.length} הימים. לא נרשמת ל: ${details}` : details };
}

// Cancels the passenger's own booking until the ride leaves (SRS §6.2). The
// notice is shown by the page: the cancelled ride's row, and anything in it,
// is gone once the list reloads.
export async function cancelBooking(bookingId: string) {
  await requireUser();
  if (!z.uuid().safeParse(bookingId).success) return { error: ERRORS.BOOKING_NOT_FOUND };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_booking", { p_booking_id: bookingId });
  if (error) return { error: messageFor(error) };

  redirect("/my-rides?cancelled=1");
}

// The personal "Paid / Unpaid" toggle (SRS §4.3).
export async function setBookingPaid(bookingId: string, isPaid: boolean) {
  await requireUser();
  if (!z.uuid().safeParse(bookingId).success || !z.boolean().safeParse(isPaid).success) {
    return { error: ERRORS.BOOKING_NOT_FOUND };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("bookings").update({ is_paid: isPaid }).eq("id", bookingId);
  if (error) return { error: messageFor(error) };

  refresh();
  return {};
}

// ─── Recent searches (search_history, 0050) ─────────────────────────────────

const timeSchema = z.string().regex(TIME_PATTERN);
const picksSchema = z.array(z.string().max(60)).max(30).refine((picks) => picks.length === 0 || placePicksFrom(picks)?.length === new Set(picks).size);
const recentSearchSchema = z.object({
  origins: picksSchema,
  destinations: picksSchema,
  date: z.iso.date().optional(),
  from: timeSchema.optional(),
  to: timeSchema.optional(),
  kind: z.enum(["recurring", "one_time"]).optional(),
});

// Keeps the search she just ran ("חיפוש", or smart search's arrow): its
// filters, never smart search's text. record_search moves the same filters
// up, skips a past date, and keeps her 4 latest. A failed save never stops
// the search itself, so it says nothing.
export async function saveRecentSearch(input: z.infer<typeof recentSearchSchema>) {
  await requireUser();
  const parsed = recentSearchSchema.safeParse(input);
  if (!parsed.success) return;
  const s = asRecentSearch(parsed.data);
  const supabase = await createClient();
  await supabase.rpc("record_search", {
    p_origins: s.origins,
    p_destinations: s.destinations,
    p_date: s.date ?? null,
    p_from: s.from ?? null,
    p_to: s.to ?? null,
    p_kind: s.kind ?? null,
  });
}

// ─── Ride alerts (ride_alerts, 0051) ─────────────────────────────────────────

const ALERT_ERRORS: Record<string, string> = {
  ALERT_LIMIT: "הגעת למגבלה של 3 התראות פעילות — בטלי התראה קיימת כדי להוסיף חדשה.",
  ALERT_DUPLICATE: "כבר יש לך התראה עם אותם מקומות, תאריכים ושעות.",
  INVALID_ALERT: "יש לבחור מקום יציאה, יעד ותאריכים תקינים.",
};

const alertSchema = z
  .object({
    origins: picksSchema.refine((picks) => picks.length > 0),
    destinations: picksSchema.refine((picks) => picks.length > 0),
    startDate: z.iso.date().optional(),
    endDate: z.iso.date().optional(),
    fromTime: timeSchema.optional(),
    untilTime: timeSchema.optional(),
  })
  .refine((a) => !a.startDate || !a.endDate || a.startDate <= a.endDate);

// "עדכנו אותי כשתהיה נסיעה": saves an alert from the form on the search page.
// The database checks the limit of 3, duplicates and past dates. A time range
// may cross midnight, so "from" after "until" is kept as it is.
export async function createRideAlert(input: z.infer<typeof alertSchema>) {
  await requireUser();
  const parsed = alertSchema.safeParse(input);
  if (!parsed.success) return { error: ALERT_ERRORS.INVALID_ALERT };

  const a = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_ride_alert", {
    p_origins: a.origins,
    p_destinations: a.destinations,
    p_start_date: a.startDate ?? null,
    p_end_date: a.endDate ?? null,
    p_from_time: a.fromTime ?? null,
    p_until_time: a.untilTime ?? null,
  });
  if (error) return { error: messageForCode(error, ALERT_ERRORS) };
  return {};
}

// "ביטול" on one of her alerts in "ההתראות שלי" (/alerts). Her own only (the table's rules).
export async function cancelRideAlert(alertId: string) {
  await requireUser();
  if (!z.uuid().safeParse(alertId).success) return { error: "ההתראה לא נמצאה." };

  const supabase = await createClient();
  const { error } = await supabase.from("ride_alerts").delete().eq("id", alertId);
  if (error) return { error: messageForCode(error, {}) };

  redirect("/alerts?cancelled=1");
}

// "ניקוי החיפושים האחרונים": all of hers.
export async function clearRecentSearches() {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("search_history").delete().eq("user_id", user.id);
}
