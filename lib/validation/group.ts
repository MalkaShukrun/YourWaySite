import { z } from "zod";

// Matches the ride_groups_names check in supabase/migrations/0015.
export const PLACE_MAX = 40;

const place = z.string().trim().min(2, "לפחות 2 תווים").max(PLACE_MAX, `עד ${PLACE_MAX} תווים`);

// A ride group: from one city/area to another (SRS §8, admins only).
export const groupSchema = z
  .object({ origin: place, destination: place })
  .refine((v) => v.origin !== v.destination, { path: ["destination"], message: "היעד חייב להיות שונה מנקודת המוצא" });

export type GroupValues = z.infer<typeof groupSchema>;
