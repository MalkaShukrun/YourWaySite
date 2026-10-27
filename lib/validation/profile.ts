import { z } from "zod";

// Israeli phone numbers: 050-123-4567, 0501234567, 02-123-4567
const PHONE_PATTERN = /^0\d{1,2}-?\d{3}-?\d{4}$/;

// The user's details, asked at onboarding and edited on the profile screen
// (SRS §1.3). Vehicle details are optional, but complete once the user adds a car.
export const profileSchema = z
  .object({
    fullName: z.string().trim().min(2, "יש להזין שם מלא"),
    phone: z.string().trim().regex(PHONE_PATTERN, "מספר טלפון לא תקין (לדוגמה 050-000-0000)"),
    hasVehicle: z.boolean(),
    vehicleModel: z.string().trim(),
    vehicleColor: z.string().trim(),
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

// Onboarding also asks the new user to accept the privacy policy.
export const onboardingSchema = profileSchema.safeExtend({
  acceptPrivacy: z.boolean().refine((v) => v, "יש לאשר את מדיניות הפרטיות"),
});

export type OnboardingValues = z.infer<typeof onboardingSchema>;
