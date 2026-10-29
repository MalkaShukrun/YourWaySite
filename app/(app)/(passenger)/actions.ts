"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { messageForCode } from "@/lib/utils/action-errors";
import { formatShortRideDate } from "@/lib/utils/dates";

const ERRORS: Record<string, string> = {
  RIDE_FULL: "הנסיעה התמלאה — אין יותר מקומות פנויים.",
  ALREADY_BOOKED: "את כבר רשומה לנסיעה הזו.",
  RIDE_UNAVAILABLE: "הנסיעה אינה זמינה יותר (בוטלה או שכבר יצאה).",
  INVALID_STOP: "יש לבחור תחנת איסוף ותחנת הורדה מהרשימה.",
  OWN_RIDE: "אי אפשר להירשם לנסיעה שאת נוהגת בה.",
  BOOKING_NOT_FOUND: "ההרשמה לא נמצאה או שכבר בוטלה.",
  RIDE_DEPARTED: "הנסיעה כבר יצאה ולא ניתן לבטל אותה.",
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
