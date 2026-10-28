import { z } from "zod";
import { PHONE_PATTERN } from "@/lib/validation/patterns";

// Match the profiles_details check in supabase/migrations/0015.
export const FULL_NAME_MAX = 60;
export const VEHICLE_MODEL_MAX = 40;
export const VEHICLE_COLOR_MAX = 20;

// The user's details, asked at onboarding and edited on the profile screen
// (SRS §1.3). Vehicle details are optional, but complete once the user adds a car.
export const profileSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "יש להזין שם מלא")
      .max(FULL_NAME_MAX, `עד ${FULL_NAME_MAX} תווים בשם`)
      .regex(/^[^\p{Cc}]*$/u, "השם מכיל תווים לא חוקיים"),
    phone: z.string().trim().regex(PHONE_PATTERN, "מספר טלפון לא תקין (לדוגמה 050-000-0000)"),
    hasVehicle: z.boolean(),
    vehicleModel: z.string().trim().max(VEHICLE_MODEL_MAX, `עד ${VEHICLE_MODEL_MAX} תווים`),
    vehicleColor: z.string().trim().max(VEHICLE_COLOR_MAX, `עד ${VEHICLE_COLOR_MAX} תווים`),
    vehicleSeats: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    if (!values.hasVehicle) return;
    if (!values.vehicleModel) {
      ctx.addIssue({ code: "custom", path: ["vehicleModel"], message: "יש להזין סוג רכב" });
    }
    if (!values.vehicleColor) {
      ctx.addIssue({ code: "custom", path: ["vehicleColor"], message: "יש להזין צבע" });
    }
    if (!/^[1-8]$/.test(values.vehicleSeats)) {
      ctx.addIssue({ code: "custom", path: ["vehicleSeats"], message: "בין 1 ל־8 מקומות" });
    }
  });

export type ProfileValues = z.infer<typeof profileSchema>;
