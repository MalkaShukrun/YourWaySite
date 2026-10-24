import { z } from "zod";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const routeStopSchema = z.object({
  id: z.string(),
  kind: z.enum(["pickup", "dropoff"]),
  label: z.string().trim().min(2, "יש לתת שם לתחנה"),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

// Route & recurring ride setup (SRS §5.1).
export const routeSchema = z
  .object({
    groupId: z.uuid("יש לבחור קבוצת נסיעה"),
    kind: z.enum(["recurring", "one_time"]),
    weekdays: z.array(z.number().int().min(0).max(6)),
    rideDate: z.string(),
    outTime: z.string().regex(TIME, "שעה לא תקינה"),
    seats: z.string().regex(/^[1-8]$/, "בין 1 ל־8 מקומות"),
    price: z.string().regex(/^\d{1,4}(\.\d{1,2})?$/, "מחיר לא תקין"),
    stops: z.array(routeStopSchema),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "recurring" && v.weekdays.length === 0) {
      ctx.addIssue({ code: "custom", path: ["weekdays"], message: "יש לבחור לפחות יום אחד" });
    }
    if (v.kind === "one_time" && !/^\d{4}-\d{2}-\d{2}$/.test(v.rideDate)) {
      ctx.addIssue({ code: "custom", path: ["rideDate"], message: "יש לבחור תאריך" });
    }
    if (!v.stops.some((s) => s.kind === "pickup")) {
      ctx.addIssue({ code: "custom", path: ["stops"], message: "יש להוסיף לפחות תחנת איסוף אחת" });
    } else if (!v.stops.some((s) => s.kind === "dropoff")) {
      ctx.addIssue({ code: "custom", path: ["stops"], message: "יש להוסיף לפחות תחנת הורדה אחת" });
    }
  });

export type RouteValues = z.infer<typeof routeSchema>;
