import { z } from "zod";

// Israeli phone numbers: 050-123-4567, 0501234567, 02-123-4567
const PHONE_PATTERN = /^0\d{1,2}-?\d{3}-?\d{4}$/;

const detailsShape = z.object({
  fullName: z.string().trim().min(2, "יש להזין שם מלא"),
  phone: z.string().trim().regex(PHONE_PATTERN, "מספר טלפון לא תקין (לדוגמה 050-000-0000)"),
  hasVehicle: z.boolean(),
  vehicleModel: z.string().trim(),
  vehicleColor: z.string().trim(),
  vehicleSeats: z.string().trim(),
});

type VehicleFields = Pick<z.infer<typeof detailsShape>, "hasVehicle" | "vehicleModel" | "vehicleColor" | "vehicleSeats">;

// Vehicle details are optional, but complete once the user adds a car.
function checkVehicle(values: VehicleFields, ctx: z.RefinementCtx) {
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
}

export const onboardingSchema = detailsShape.superRefine(checkVehicle);

export type OnboardingValues = z.infer<typeof onboardingSchema>;

// The profile screen (SRS §1.3) adds the driver's account for receiving
// payment — optional, but all four fields together.
export const profileSchema = detailsShape
  .extend({
    bankAccountName: z.string().trim(),
    bankName: z.string().trim(),
    bankBranch: z.string().trim(),
    bankAccount: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    checkVehicle(values, ctx);
    const bank = [values.bankAccountName, values.bankName, values.bankBranch, values.bankAccount];
    if (bank.every((v) => !v)) return;
    if (!values.bankAccountName) ctx.addIssue({ code: "custom", path: ["bankAccountName"], message: "יש להזין שם" });
    if (!values.bankName) ctx.addIssue({ code: "custom", path: ["bankName"], message: "יש להזין שם בנק" });
    if (!/^\d{1,4}$/.test(values.bankBranch)) ctx.addIssue({ code: "custom", path: ["bankBranch"], message: "עד 4 ספרות" });
    if (!/^\d{2,12}$/.test(values.bankAccount)) ctx.addIssue({ code: "custom", path: ["bankAccount"], message: "מספר חשבון לא תקין" });
  });

export type ProfileValues = z.infer<typeof profileSchema>;
