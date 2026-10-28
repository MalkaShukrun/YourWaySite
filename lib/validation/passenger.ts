import { z } from "zod";
import { PHONE_PATTERN } from "@/lib/validation/patterns";

// Matches the bookings_guest_details check in supabase/migrations/0013.
export const GUEST_NAME_MAX = 60;

// A passenger the driver adds to a ride by hand. Her details stay on the
// booking and are never linked to a user account.
export const addPassengerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "יש להזין שם מלא")
    .max(GUEST_NAME_MAX, `עד ${GUEST_NAME_MAX} תווים בשם`)
    .regex(/^[^\p{Cc}]*$/u, "השם מכיל תווים לא חוקיים"),
  phone: z.string().trim().regex(PHONE_PATTERN, "מספר טלפון לא תקין (לדוגמה 050-000-0000)"),
  pickupStopId: z.uuid("יש לבחור תחנת איסוף"),
  dropoffStopId: z.uuid("יש לבחור תחנת הורדה"),
});

export type AddPassengerValues = z.input<typeof addPassengerSchema>;
