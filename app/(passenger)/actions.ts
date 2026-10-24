"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const ERRORS: Record<string, string> = {
  RIDE_FULL: "הנסיעה התמלאה — אין יותר מקומות פנויים.",
  ALREADY_BOOKED: "את כבר רשומה לנסיעה הזו.",
  RIDE_UNAVAILABLE: "הנסיעה אינה זמינה יותר (בוטלה או שכבר יצאה).",
  INVALID_STOP: "יש לבחור תחנת איסוף ותחנת הורדה מהרשימה.",
  OWN_RIDE: "אי אפשר להירשם לנסיעה שאת נוהגת בה.",
  BOOKING_NOT_FOUND: "ההרשמה לא נמצאה או שכבר בוטלה.",
  RIDE_DEPARTED: "הנסיעה כבר יצאה ולא ניתן לבטל אותה.",
};

function messageFor(error: { message: string }) {
  const code = Object.keys(ERRORS).find((key) => error.message.includes(key));
  return code ? ERRORS[code] : "משהו השתבש. נסי שוב בעוד רגע.";
}

const bookingSchema = z.object({
  routeId: z.uuid(),
  date: z.iso.date(),
  pickupStopId: z.uuid(),
  dropoffStopId: z.uuid(),
});

export async function bookRide(input: z.infer<typeof bookingSchema>) {
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) return { error: ERRORS.INVALID_STOP };

  const supabase = await createClient();
  const { error } = await supabase.rpc("book_ride", {
    p_route_id: parsed.data.routeId,
    p_date: parsed.data.date,
    p_pickup_stop_id: parsed.data.pickupStopId,
    p_dropoff_stop_id: parsed.data.dropoffStopId,
  });
  if (error) return { error: messageFor(error) };

  redirect("/my-rides?booked=1");
}

// Returns whether the cancellation was inside the free window (SRS §6.2).
export async function cancelBooking(bookingId: string) {
  if (!z.uuid().safeParse(bookingId).success) return { error: ERRORS.BOOKING_NOT_FOUND };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_booking", { p_booking_id: bookingId });
  if (error) return { error: messageFor(error) };

  refresh();
  return { late: data === "late_cancelled" };
}

// The personal "Paid / Unpaid" toggle (SRS §4.3).
export async function setBookingPaid(bookingId: string, isPaid: boolean) {
  if (!z.uuid().safeParse(bookingId).success) return { error: ERRORS.BOOKING_NOT_FOUND };

  const supabase = await createClient();
  const { error } = await supabase.from("bookings").update({ is_paid: isPaid }).eq("id", bookingId);
  if (error) return { error: messageFor(error) };

  refresh();
  return {};
}
