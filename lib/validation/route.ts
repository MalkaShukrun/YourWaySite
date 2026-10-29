import { z } from "zod";
import { ISO_DATE_PATTERN, TIME_PATTERN } from "@/lib/validation/patterns";

// Matches the stops_label check in supabase/migrations/0015.
export const STOP_LABEL_MAX = 60;
export const STOP_LABEL_EMPTY = "יש לתת שם לתחנה";

const routeStopSchema = z.object({
  // "" for a stop added in the editor, not saved yet.
  id: z.union([z.literal(""), z.uuid()]),
  kind: z.enum(["pickup", "dropoff"]),
  label: z
    .string()
    .trim()
    .min(1, { error: STOP_LABEL_EMPTY, abort: true })
    .min(2, "שם התחנה צריך להכיל לפחות 2 תווים")
    .max(STOP_LABEL_MAX, `עד ${STOP_LABEL_MAX} תווים בשם התחנה`),
  // Marking the stop on the map is optional.
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
});

// Matches the routes_notes_length check in the database.
export const NOTES_MAX = 200;

// Optional free text for passengers.
const notesSchema = z.string().trim().max(NOTES_MAX, `עד ${NOTES_MAX} תווים בהערות`);

// Route & recurring ride setup (SRS §5.1).
export const routeSchema = z
  .object({
    groupId: z.uuid("יש לבחור קבוצת נסיעה"),
    kind: z.enum(["recurring", "one_time"]),
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .refine((days) => new Set(days).size === days.length, "יום נבחר פעמיים"),
    rideDate: z.string(),
    outTime: z.string().regex(TIME_PATTERN, "שעה לא תקינה"),
    seats: z.string().regex(/^[1-8]$/, "בין 1 ל־8 מקומות"),
    price: z.string().regex(/^\d{1,4}(\.\d{1,2})?$/, "מחיר לא תקין"),
    notes: notesSchema,
    stops: z.array(routeStopSchema),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "recurring" && v.weekdays.length === 0) {
      ctx.addIssue({ code: "custom", path: ["weekdays"], message: "יש לבחור לפחות יום אחד" });
    }
    // One-time: the ride's date. Recurring: the first date it runs.
    if (!ISO_DATE_PATTERN.test(v.rideDate)) {
      ctx.addIssue({
        code: "custom",
        path: ["rideDate"],
        message: v.kind === "recurring" ? "יש לבחור תאריך התחלה" : "יש לבחור תאריך",
      });
    }
    if (!v.stops.some((s) => s.kind === "pickup")) {
      ctx.addIssue({ code: "custom", path: ["stops"], message: "יש להוסיף לפחות תחנת איסוף אחת" });
    } else if (!v.stops.some((s) => s.kind === "dropoff")) {
      ctx.addIssue({ code: "custom", path: ["stops"], message: "יש להוסיף לפחות תחנת הורדה אחת" });
    }
  });

export type RouteValues = z.infer<typeof routeSchema>;

// The only changes a published route takes: its note, and stops added to it.
export const routeUpdateSchema = z.object({
  notes: notesSchema,
  stops: z.array(routeStopSchema.omit({ id: true })),
});

export type RouteUpdateValues = z.infer<typeof routeUpdateSchema>;
